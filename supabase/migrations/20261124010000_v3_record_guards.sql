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
  v_ids text[] := array(
    select jsonb_array_elements_text(
      coalesce(p_payload->'ids', p_payload->'scheduleIds', '[]'::jsonb)
    )
  );
begin
  delete from schedules where id = any(v_ids);
  return jsonb_build_object('success', true, 'message', '일정들이 일괄 삭제되었습니다.');
end;
$$;

revoke all on function fn_merge_members__impl(jsonb) from public, anon, authenticated;
revoke all on function fn_batch_delete_schedules__impl(jsonb) from public, anon, authenticated;
