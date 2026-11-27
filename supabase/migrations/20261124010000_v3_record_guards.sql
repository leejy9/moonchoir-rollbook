do $$
declare
  v_function_name text;
begin
  foreach v_function_name in array array[
    'public.fn_delete_schedule__impl(jsonb)',
    'public.fn_batch_delete_schedules__impl(jsonb)',
    'public.fn_delete_member__impl(jsonb)',
    'public.fn_merge_members__impl(jsonb)'
  ] loop
    if to_regprocedure(v_function_name) is null then
      raise exception 'Required implementation function % is missing', v_function_name;
    end if;
  end loop;
end
$$;

create or replace function fn_merge_members__impl(p_payload jsonb)
returns jsonb
security definer
set search_path = public, extensions
language plpgsql as $$
declare
  v_rep_id text := coalesce(
    nullif(btrim(p_payload->>'canonicalId'), ''),
    nullif(btrim(p_payload->>'representativeId'), '')
  );
  v_dup_ids text[];
  v_rep_status text;
  v_rep_merged_into_id text;
  v_missing_target_id text;
  v_would_cycle boolean;
begin
  perform pg_advisory_xact_lock(hashtext('moonchoir.fn_merge_members'));

  if v_rep_id is null then
    return jsonb_build_object(
      'success', false,
      'code', 'INVALID_MERGE',
      'message', '대표 단원 ID가 필요합니다.'
    );
  end if;

  if p_payload ? 'secondaryId' then
    if jsonb_typeof(p_payload->'secondaryId') is distinct from 'string' then
      return jsonb_build_object(
        'success', false,
        'code', 'INVALID_MERGE',
        'message', '병합 대상 단원 ID가 올바르지 않습니다.'
      );
    end if;
    v_dup_ids := array[nullif(btrim(p_payload->>'secondaryId'), '')];
  elsif p_payload ? 'mergedMemberIds' then
    if jsonb_typeof(p_payload->'mergedMemberIds') is distinct from 'array' then
      return jsonb_build_object(
        'success', false,
        'code', 'INVALID_MERGE',
        'message', '병합 대상 단원 목록이 올바르지 않습니다.'
      );
    end if;
    if exists (
      select 1
        from jsonb_array_elements(p_payload->'mergedMemberIds') target(value)
       where jsonb_typeof(target.value) is distinct from 'string'
    ) then
      return jsonb_build_object(
        'success', false,
        'code', 'INVALID_MERGE',
        'message', '병합 대상 단원 목록이 올바르지 않습니다.'
      );
    end if;
    select array_agg(distinct nullif(btrim(target_id.id), '') order by nullif(btrim(target_id.id), ''))
      into v_dup_ids
      from jsonb_array_elements_text(p_payload->'mergedMemberIds') as target_id(id);
  else
    return jsonb_build_object(
      'success', false,
      'code', 'INVALID_MERGE',
      'message', '병합 대상 단원 ID가 필요합니다.'
    );
  end if;

  if coalesce(cardinality(v_dup_ids), 0) = 0
     or exists (select 1 from unnest(v_dup_ids) target_id(id) where target_id.id is null) then
    return jsonb_build_object(
      'success', false,
      'code', 'INVALID_MERGE',
      'message', '병합 대상 단원 ID가 필요합니다.'
    );
  end if;

  select status, merged_into_id
    into v_rep_status, v_rep_merged_into_id
    from members
   where id = v_rep_id;
  if not found then
    return jsonb_build_object(
      'success', false,
      'code', 'INVALID_MERGE',
      'message', '대표 단원을 찾을 수 없습니다.'
    );
  end if;
  if v_rep_status = 'MERGED' then
    return jsonb_build_object(
      'success', false,
      'code', 'INVALID_MERGE',
      'message', '이미 병합된 단원은 대표로 선택할 수 없습니다.'
    );
  end if;
  if v_rep_status is distinct from 'ACTIVE' then
    return jsonb_build_object(
      'success', false,
      'code', 'INVALID_MERGE',
      'message', '대표 단원은 ACTIVE 상태여야 합니다.'
    );
  end if;
  if v_rep_id = any(v_dup_ids) then
    return jsonb_build_object(
      'success', false,
      'code', 'INVALID_MERGE',
      'message', '대표 단원은 병합 대상에 포함할 수 없습니다.'
    );
  end if;

  select requested.id
    into v_missing_target_id
    from unnest(v_dup_ids) requested(id)
    left join members m on m.id = requested.id
   where m.id is null
   order by requested.id
   limit 1;
  if v_missing_target_id is not null then
    return jsonb_build_object(
      'success', false,
      'code', 'INVALID_MERGE',
      'message', format('병합 대상 단원을 찾을 수 없습니다: %s', v_missing_target_id)
    );
  end if;

  with recursive canonical_path(id, merged_into_id) as (
    select m.id, m.merged_into_id
      from members m
     where m.id = v_rep_id
    union
    select m.id, m.merged_into_id
      from members m
      join canonical_path path on m.id = path.merged_into_id
  )
  select exists (
    select 1 from canonical_path where id = any(v_dup_ids)
  )
    into v_would_cycle;
  if v_would_cycle then
    return jsonb_build_object(
      'success', false,
      'code', 'INVALID_MERGE',
      'message', '병합하면 회원 연결에 순환이 생깁니다.'
    );
  end if;
  if v_rep_merged_into_id is not null then
    return jsonb_build_object(
      'success', false,
      'code', 'INVALID_MERGE',
      'message', '이미 병합된 단원은 대표로 선택할 수 없습니다.'
    );
  end if;

  update members
     set status = 'MERGED',
         merged_into_id = v_rep_id,
         updated_at = now()
   where id = any(v_dup_ids)
     and id != v_rep_id;

  return jsonb_build_object('success', true, 'message', '단원이 성공적으로 병합되었습니다.');
end;
$$;

create or replace function fn_batch_delete_schedules__impl(p_payload jsonb)
returns jsonb
security definer
set search_path = public, extensions
language plpgsql as $$
declare
  v_requested_ids jsonb;
  v_ids text[];
  v_blocked_count integer;
begin
  if p_payload ? 'ids' then
    v_requested_ids := p_payload->'ids';
  elsif p_payload ? 'scheduleIds' then
    v_requested_ids := p_payload->'scheduleIds';
  else
    v_requested_ids := '[]'::jsonb;
  end if;

  if jsonb_typeof(v_requested_ids) is distinct from 'array' then
    return jsonb_build_object(
      'success', false,
      'code', 'INVALID_IDS',
      'message', '일정 ID 목록이 올바르지 않습니다.'
    );
  end if;
  if exists (
    select 1
      from jsonb_array_elements(v_requested_ids) requested_id(value)
     where jsonb_typeof(requested_id.value) is distinct from 'string'
  ) then
    return jsonb_build_object(
      'success', false,
      'code', 'INVALID_IDS',
      'message', '일정 ID 목록이 올바르지 않습니다.'
    );
  end if;

  select array_agg(distinct requested_ids.id)
    into v_ids
    from jsonb_array_elements_text(v_requested_ids) as requested_ids(id);
  v_ids := coalesce(v_ids, '{}'::text[]);

  select count(*)
    into v_blocked_count
    from schedules s
   where s.id = any(v_ids)
     and (
       exists (select 1 from attendance_logs l where l.schedule_id = s.id)
       or exists (select 1 from rsvp_votes v where v.schedule_id = s.id)
       or exists (select 1 from rsvp_events e where e.schedule_id = s.id)
       or exists (select 1 from schedule_comment_events c where c.schedule_id = s.id)
     );

  if v_blocked_count > 0 then
    return jsonb_build_object(
      'success', false,
      'code', 'SCHEDULE_HAS_RECORDS',
      'message', format(
        '기록이 있는 일정 %s개가 있어 삭제하지 않았어요. 보관하거나 취소해 주세요.',
        v_blocked_count
      )
    );
  end if;

  delete from schedules where id = any(v_ids);
  return jsonb_build_object('success', true, 'message', '일정들이 일괄 삭제되었습니다.');
end;
$$;

create or replace function fn_delete_schedule__impl(p_payload jsonb)
returns jsonb
security definer
set search_path = public, extensions
language plpgsql as $$
declare
  v_schedule_id text := p_payload->>'id';
begin
  if exists (select 1 from attendance_logs where schedule_id = v_schedule_id)
     or exists (select 1 from rsvp_votes where schedule_id = v_schedule_id)
     or exists (select 1 from rsvp_events where schedule_id = v_schedule_id)
     or exists (select 1 from schedule_comment_events where schedule_id = v_schedule_id) then
    return jsonb_build_object(
      'success', false,
      'code', 'SCHEDULE_HAS_RECORDS',
      'message', '출석·투표 기록이 있는 일정은 삭제할 수 없어요. 보관하거나 취소해 주세요.'
    );
  end if;

  delete from schedules where id = v_schedule_id;
  return jsonb_build_object('success', true, 'message', '일정이 삭제되었습니다.');
end;
$$;

create or replace function fn_delete_member__impl(p_payload jsonb)
returns jsonb
security definer
set search_path = public, extensions
language plpgsql as $$
declare
  v_member_id text := p_payload->>'id';
  v_is_merged boolean;
begin
  select (status = 'MERGED' or exists(select 1 from members where merged_into_id = v_member_id))
    into v_is_merged
    from members
   where id = v_member_id;

  if v_is_merged then
    return jsonb_build_object('success', false, 'message', '병합 이력이 연결된 단원은 물리 삭제할 수 없습니다.');
  end if;

  if exists (select 1 from attendance_logs where member_id = v_member_id)
     or exists (select 1 from rsvp_votes where member_id = v_member_id)
     or exists (select 1 from rsvp_events where member_id = v_member_id)
     or exists (select 1 from schedule_comment_events where member_id = v_member_id)
     or exists (select 1 from member_status_history where member_id = v_member_id)
     or exists (select 1 from practice_listen_sessions where member_id = v_member_id)
     or exists (
       select 1 from schedules
        where v_member_id = any(target_member_ids)
     ) then
    update members
       set status = 'DELETED',
           updated_at = now()
     where id = v_member_id;
    return jsonb_build_object('success', true, 'message', '기록이 있어 비활성화(삭제) 처리되었습니다.');
  end if;

  delete from members where id = v_member_id;
  return jsonb_build_object('success', true, 'message', '단원이 삭제되었습니다.');
end;
$$;

revoke all on function fn_merge_members__impl(jsonb) from public, anon, authenticated;
revoke all on function fn_batch_delete_schedules__impl(jsonb) from public, anon, authenticated;
revoke all on function fn_delete_schedule__impl(jsonb) from public, anon, authenticated;
revoke all on function fn_delete_member__impl(jsonb) from public, anon, authenticated;
