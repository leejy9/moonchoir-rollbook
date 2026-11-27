-- ==============================================================================
-- Moonchoir Rollbook — Migration Function (02_migration_function.sql)
-- One-time atomic bulk data migration from Google Sheets snapshot to Supabase
-- Security: SECURITY DEFINER allows bulk data insertion bypassing RLS in 1 transaction
-- ==============================================================================

create or replace function fn_import_sheets_snapshot(p_snapshot jsonb)
returns jsonb
security definer
language plpgsql as $$
declare
  v_data jsonb := coalesce(p_snapshot->'data', p_snapshot);
  v_item jsonb;
  v_members_count int := 0;
  v_schedules_count int := 0;
  v_logs_count int := 0;
  v_rsvp_count int := 0;
  v_locations_count int := 0;
  v_cards_count int := 0;
  v_comments_count int := 0;
  v_history_count int := 0;
  v_config_count int := 0;
  v_key text;
  v_val text;
begin
  -- 0. Ensure foreign key constraint is removed to allow safe arbitrary merge link import without circular dependency
  execute 'alter table members drop constraint if exists members_merged_into_id_fkey';

  -- 1. Reset tables for clean migration
  -- Note: Truncate with restart identity to reset sequence for logs & comments
  truncate table rsvp_votes cascade;
  truncate table attendance_logs restart identity cascade;
  truncate table schedule_comment_events restart identity cascade;
  truncate table member_status_history cascade;
  truncate table schedules cascade;
  truncate table program_cards cascade;
  truncate table locations cascade;
  truncate table members cascade;
  truncate table app_config cascade;
  truncate table app_secrets cascade;

  -- 2. Import Members
  if v_data ? 'members' and jsonb_typeof(v_data->'members') = 'array' then
    for v_item in select * from jsonb_array_elements(v_data->'members') loop
      insert into members (
        id, name, part, phone_last4, phone, role, status,
        joined_at, member_status, note, bound_device_id, bound_device_at, merged_into_id
      ) values (
        v_item->>'id',
        coalesce(v_item->>'name', ''),
        coalesce(v_item->>'part', '소프라노'),
        coalesce(v_item->>'phoneLast4', ''),
        coalesce(v_item->>'phone', ''),
        coalesce(v_item->>'role', 'MEMBER'),
        coalesce(v_item->>'status', 'ACTIVE'),
        coalesce(v_item->>'joinedAt', ''),
        coalesce(v_item->>'memberStatus', '정단원'),
        coalesce(v_item->>'note', ''),
        coalesce(v_item->>'boundDeviceId', ''),
        coalesce(v_item->>'boundDeviceAt', ''),
        nullif(v_item->>'mergedIntoId', '')
      );
      v_members_count := v_members_count + 1;
    end loop;
  end if;

  -- 3. Import Member Status History
  if v_data ? 'memberHistory' and jsonb_typeof(v_data->'memberHistory') = 'array' then
    for v_item in select * from jsonb_array_elements(v_data->'memberHistory') loop
      insert into member_status_history (
        id, member_id, name, status, part, start_date, end_date, reason, created_at
      ) values (
        v_item->>'id',
        v_item->>'memberId',
        coalesce(v_item->>'name', ''),
        coalesce(v_item->>'status', ''),
        coalesce(v_item->>'part', ''),
        coalesce(v_item->>'startDate', ''),
        coalesce(v_item->>'endDate', '2999-12-31'),
        coalesce(v_item->>'reason', ''),
        coalesce(v_item->>'createdAt', '')
      );
      v_history_count := v_history_count + 1;
    end loop;
  end if;

  -- 4. Import Locations
  if v_data ? 'locations' and jsonb_typeof(v_data->'locations') = 'array' then
    for v_item in select * from jsonb_array_elements(v_data->'locations') loop
      insert into locations (
        id, name, address, detail_address, entrance_note,
        latitude, longitude, radius_meters, is_default
      ) values (
        v_item->>'id',
        coalesce(v_item->>'name', ''),
        coalesce(v_item->>'address', ''),
        coalesce(v_item->>'detailAddress', ''),
        coalesce(v_item->>'entranceNote', ''),
        coalesce((v_item->>'latitude')::double precision, 0.0),
        coalesce((v_item->>'longitude')::double precision, 0.0),
        coalesce((v_item->>'radiusMeters')::integer, 100),
        coalesce((v_item->>'isDefault')::boolean, false)
      );
      v_locations_count := v_locations_count + 1;
    end loop;
  end if;

  -- 5. Import Program Cards
  if v_data ? 'programCards' and jsonb_typeof(v_data->'programCards') = 'array' then
    for v_item in select * from jsonb_array_elements(v_data->'programCards') loop
      insert into program_cards (
        id, title, description, category, default_location_id,
        default_start_time, default_end_time, is_archived, created_at,
        target_audience_type, target_parts, target_member_ids
      ) values (
        v_item->>'id',
        coalesce(v_item->>'title', ''),
        coalesce(v_item->>'description', ''),
        coalesce(v_item->>'category', ''),
        v_item->>'defaultLocationId',
        v_item->>'defaultStartTime',
        v_item->>'defaultEndTime',
        coalesce((v_item->>'isArchived')::boolean, false),
        coalesce(v_item->>'createdAt', ''),
        coalesce(v_item->>'targetAudienceType', 'ALL'),
        array(select jsonb_array_elements_text(coalesce(v_item->'targetParts', '[]'::jsonb))),
        array(select jsonb_array_elements_text(coalesce(v_item->'targetMemberIds', '[]'::jsonb)))
      );
      v_cards_count := v_cards_count + 1;
    end loop;
  end if;

  -- 6. Import Schedules
  if v_data ? 'schedules' and jsonb_typeof(v_data->'schedules') = 'array' then
    for v_item in select * from jsonb_array_elements(v_data->'schedules') loop
      insert into schedules (
        id, title, date, start_time, end_time, location_name, location_id,
        latitude, longitude, radius_meters, category, check_in_pin, description,
        program_id, series_id, series_index, series_total, is_archived, is_cancelled,
        target_audience_type, target_parts, target_member_ids, visibility
      ) values (
        v_item->>'id',
        coalesce(v_item->>'title', ''),
        coalesce(v_item->>'date', ''),
        coalesce(v_item->>'startTime', ''),
        coalesce(v_item->>'endTime', ''),
        coalesce(v_item->>'locationName', ''),
        v_item->>'locationId',
        (v_item->>'latitude')::double precision,
        (v_item->>'longitude')::double precision,
        (v_item->>'radiusMeters')::integer,
        coalesce(v_item->>'category', '정기연습'),
        coalesce(v_item->>'checkInPin', ''),
        coalesce(v_item->>'description', ''),
        v_item->>'programId',
        v_item->>'seriesId',
        (v_item->>'seriesIndex')::integer,
        (v_item->>'seriesTotal')::integer,
        coalesce((v_item->>'isArchived')::boolean, false),
        coalesce((v_item->>'isCancelled')::boolean, false),
        coalesce(v_item->>'targetAudienceType', 'ALL'),
        array(select jsonb_array_elements_text(coalesce(v_item->'targetParts', '[]'::jsonb))),
        array(select jsonb_array_elements_text(coalesce(v_item->'targetMemberIds', '[]'::jsonb))),
        coalesce(v_item->>'visibility', 'ALL')
      );
      v_schedules_count := v_schedules_count + 1;
    end loop;
  end if;

  -- 7. Import RSVP Votes (Deduplicating by scheduleId + memberId)
  if v_data ? 'rsvpVotes' and jsonb_typeof(v_data->'rsvpVotes') = 'array' then
    for v_item in select * from jsonb_array_elements(v_data->'rsvpVotes') loop
      insert into rsvp_votes (
        id, schedule_id, member_id, member_name, part, status, reason, timestamp
      ) values (
        v_item->>'id',
        v_item->>'scheduleId',
        v_item->>'memberId',
        coalesce(v_item->>'memberName', ''),
        coalesce(v_item->>'part', ''),
        coalesce(v_item->>'status', 'ATTEND'),
        coalesce(v_item->>'reason', ''),
        coalesce(v_item->>'timestamp', '')
      )
      on conflict (schedule_id, member_id) do update set
        status = excluded.status,
        reason = excluded.reason,
        timestamp = excluded.timestamp;
      v_rsvp_count := v_rsvp_count + 1;
    end loop;
  end if;

  -- 8. Import Attendance Logs (Preserve order into seq identity)
  if v_data ? 'logs' and jsonb_typeof(v_data->'logs') = 'array' then
    for v_item in select * from jsonb_array_elements(v_data->'logs') loop
      insert into attendance_logs (
        id, timestamp, schedule_id, member_id, member_name, part,
        auth_method, is_verified_location, admin_note, distance_meters, device_id
      ) values (
        v_item->>'id',
        coalesce(v_item->>'timestamp', ''),
        v_item->>'scheduleId',
        v_item->>'memberId',
        coalesce(v_item->>'memberName', ''),
        coalesce(v_item->>'part', ''),
        coalesce(v_item->>'authMethod', 'MANUAL_BY_ADMIN'),
        coalesce((v_item->>'isVerifiedLocation')::boolean, false),
        coalesce(v_item->>'adminNote', ''),
        (v_item->>'distanceMeters')::numeric,
        coalesce(v_item->>'deviceId', '')
      );
      v_logs_count := v_logs_count + 1;
    end loop;
  end if;

  -- 9. Import Comments
  if v_data ? 'comments' and jsonb_typeof(v_data->'comments') = 'array' then
    for v_item in select * from jsonb_array_elements(v_data->'comments') loop
      insert into schedule_comment_events (
        id, schedule_id, member_id, member_name, part,
        action, target_id, text, timestamp, device_id
      ) values (
        v_item->>'id',
        v_item->>'scheduleId',
        v_item->>'memberId',
        coalesce(v_item->>'memberName', ''),
        coalesce(v_item->>'part', ''),
        coalesce(v_item->>'action', 'CREATE'),
        coalesce(v_item->>'targetId', ''),
        coalesce(v_item->>'text', ''),
        coalesce(v_item->>'timestamp', ''),
        coalesce(v_item->>'deviceId', '')
      );
      v_comments_count := v_comments_count + 1;
    end loop;
  end if;

  -- 10. Import Config & Secrets
  if v_data ? 'config' and jsonb_typeof(v_data->'config') = 'object' then
    for v_key, v_val in select * from jsonb_each_text(v_data->'config') loop
      if v_key in ('adminPin', 'activeOnSitePin', 'masterQrToken') then
        insert into app_secrets (key, value) values (v_key, v_val)
        on conflict (key) do update set value = excluded.value;
      else
        insert into app_config (key, value) values (v_key, v_val)
        on conflict (key) do update set value = excluded.value;
      end if;
      v_config_count := v_config_count + 1;
    end loop;
  end if;

  return jsonb_build_object(
    'success', true,
    'imported', jsonb_build_object(
      'members', v_members_count,
      'schedules', v_schedules_count,
      'logs', v_logs_count,
      'rsvpVotes', v_rsvp_count,
      'locations', v_locations_count,
      'programCards', v_cards_count,
      'comments', v_comments_count,
      'memberHistory', v_history_count,
      'config', v_config_count
    )
  );
end;
$$;

grant execute on function fn_import_sheets_snapshot to anon, authenticated;
