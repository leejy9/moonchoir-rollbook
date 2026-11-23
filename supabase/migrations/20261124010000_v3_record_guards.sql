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
  v_rep_id text := coalesce(nullif(p_payload->>'canonicalId', ''), p_payload->>'representativeId');
  v_dup_ids text[] := case
    when nullif(p_payload->>'secondaryId', '') is not null
      then array[p_payload->>'secondaryId']
    else array(
      select jsonb_array_elements_text(coalesce(p_payload->'mergedMemberIds', '[]'::jsonb))
    )
  end;
begin
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
