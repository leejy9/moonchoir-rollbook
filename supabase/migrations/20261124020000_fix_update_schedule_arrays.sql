-- ==============================================================================
-- Fix fn_update_schedule to safely handle targetParts & targetMemberIds
-- as either JSON arrays or comma-separated strings without scalar extraction error.
-- Also guards against casting empty strings to double precision / integer.
-- 복사 원본: supabase/migrations/20261119000001_rpc_functions.sql:720-753
-- ==============================================================================

create or replace function fn_update_schedule__body(p_payload jsonb)
returns jsonb
security definer
set search_path = public, extensions
language plpgsql as $$
begin
  update schedules
     set title = coalesce(p_payload->>'title', title),
         date = coalesce(p_payload->>'date', date),
         start_time = coalesce(p_payload->>'startTime', start_time),
         end_time = coalesce(p_payload->>'endTime', end_time),
         location_name = coalesce(p_payload->>'locationName', location_name),
         location_id = coalesce(p_payload->>'locationId', location_id),
         latitude = coalesce(nullif(p_payload->>'targetLat', '')::double precision, latitude),
         longitude = coalesce(nullif(p_payload->>'targetLon', '')::double precision, longitude),
         radius_meters = coalesce(nullif(p_payload->>'radiusMeters', '')::integer, radius_meters),
         category = coalesce(p_payload->>'category', category),
         check_in_pin = coalesce(p_payload->>'checkInPin', check_in_pin),
         description = coalesce(p_payload->>'description', description),
         program_id = coalesce(p_payload->>'programId', program_id),
         series_id = coalesce(p_payload->>'seriesId', series_id),
         series_index = coalesce(nullif(p_payload->>'seriesIndex', '')::integer, series_index),
         series_total = coalesce(nullif(p_payload->>'seriesTotal', '')::integer, series_total),
         is_archived = coalesce(nullif(p_payload->>'isArchived', '')::boolean, is_archived),
         is_cancelled = coalesce(nullif(p_payload->>'isCancelled', '')::boolean, is_cancelled),
         target_audience_type = coalesce(p_payload->>'targetAudienceType', target_audience_type),
         target_parts = case
           when not (p_payload ? 'targetParts') then target_parts
           when jsonb_typeof(p_payload->'targetParts') = 'array' then
             array(select jsonb_array_elements_text(p_payload->'targetParts'))
           when jsonb_typeof(p_payload->'targetParts') = 'string' and (p_payload->>'targetParts') != '' then
             string_to_array(p_payload->>'targetParts', ',')
           else '{}'::text[]
         end,
         target_member_ids = case
           when not (p_payload ? 'targetMemberIds') then target_member_ids
           when jsonb_typeof(p_payload->'targetMemberIds') = 'array' then
             array(select jsonb_array_elements_text(p_payload->'targetMemberIds'))
           when jsonb_typeof(p_payload->'targetMemberIds') = 'string' and (p_payload->>'targetMemberIds') != '' then
             string_to_array(p_payload->>'targetMemberIds', ',')
           else '{}'::text[]
         end,
         visibility = coalesce(p_payload->>'visibility', visibility),
         updated_at = now()
   where id = p_payload->>'id';

  return jsonb_build_object('success', true, 'message', '일정이 수정되었습니다.');
end;
$$;

-- Apply to fn_update_schedule__impl (when security hardening is present)
create or replace function fn_update_schedule__impl(p_payload jsonb)
returns jsonb
security definer
set search_path = public, extensions
language plpgsql as $$
begin
  return fn_update_schedule__body(p_payload);
end;
$$;

revoke all on function fn_update_schedule__impl(jsonb) from public, anon, authenticated;

-- Also support fn_batch_update_schedules to accept either { ids, updates } or { schedules: [...] }
create or replace function fn_batch_update_schedules__impl(p_payload jsonb)
returns jsonb
security definer
set search_path = public, extensions
language plpgsql as $$
declare
  v_sched jsonb;
  v_id text;
  v_ids text[];
  v_updates jsonb;
begin
  if (p_payload ? 'schedules') and jsonb_typeof(p_payload->'schedules') = 'array' then
    for v_sched in select * from jsonb_array_elements(p_payload->'schedules') loop
      perform fn_update_schedule__body(v_sched);
    end loop;
  elsif (p_payload ? 'ids') and (p_payload ? 'updates') then
    v_ids := array(select jsonb_array_elements_text(p_payload->'ids'));
    v_updates := p_payload->'updates';
    foreach v_id in array v_ids loop
      perform fn_update_schedule__body(jsonb_set(v_updates, '{id}', to_jsonb(v_id)));
    end loop;
  end if;

  return jsonb_build_object('success', true, 'message', '일정들이 일괄 수정되었습니다.');
end;
$$;

revoke all on function fn_batch_update_schedules__impl(jsonb) from public, anon, authenticated;
