-- Verify V3-21 record-preserving delete guards in an isolated transaction.
begin;

do $$
begin
  if to_regprocedure('public.fn_delete_schedule__impl(jsonb)') is null
     or to_regprocedure('public.fn_batch_delete_schedules__impl(jsonb)') is null
     or to_regprocedure('public.fn_delete_member__impl(jsonb)') is null
     or to_regprocedure('public.fn_merge_members__impl(jsonb)') is null then
    raise exception 'FAIL: V3-21 implementation functions are missing';
  end if;

  if has_function_privilege('anon', 'public.fn_delete_schedule__impl(jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.fn_delete_schedule__impl(jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.fn_batch_delete_schedules__impl(jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.fn_batch_delete_schedules__impl(jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.fn_delete_member__impl(jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.fn_delete_member__impl(jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.fn_merge_members__impl(jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.fn_merge_members__impl(jsonb)', 'EXECUTE') then
    raise exception 'FAIL: a private implementation function is executable by a client role';
  end if;
end
$$;

do $$
declare
  v_result jsonb;
  v_token text;
  v_schedule_id text;
  v_member_id text;
  v_schedule_ids text[] := array[
    'test_v3_rg_single_attendance',
    'test_v3_rg_single_vote',
    'test_v3_rg_single_rsvp_event',
    'test_v3_rg_single_comment'
  ];
  v_batch_ids text[] := array[
    'test_v3_rg_batch_attendance',
    'test_v3_rg_batch_vote',
    'test_v3_rg_batch_rsvp_event',
    'test_v3_rg_batch_comment'
  ];
  v_free_id text := 'test_v3_rg_free';
  v_partial_free_id text := 'test_v3_rg_partial_free';
  v_partial_record_id text := 'test_v3_rg_partial_record';
  v_piece_id text := 'test_v3_rg_piece';
  v_track_id text := 'test_v3_rg_track';
  v_member_ids text[] := array[
    'test_v3_rg_member_rsvp',
    'test_v3_rg_member_comment',
    'test_v3_rg_member_status_history',
    'test_v3_rg_member_listen',
    'test_v3_rg_member_target'
  ];
  v_missing_count integer;
begin
  v_result := fn_delete_schedule(jsonb_build_object('id', 'test_v3_rg_no_token'));
  if v_result->>'code' is distinct from 'ADMIN_AUTH_REQUIRED' then
    raise exception 'FAIL: schedule delete wrapper accepted a missing token: %', v_result;
  end if;
  v_result := fn_batch_delete_schedules(jsonb_build_object('ids', '[]'::jsonb));
  if v_result->>'code' is distinct from 'ADMIN_AUTH_REQUIRED' then
    raise exception 'FAIL: batch delete wrapper accepted a missing token: %', v_result;
  end if;
  v_result := fn_delete_member(jsonb_build_object('id', 'test_v3_rg_no_token'));
  if v_result->>'code' is distinct from 'ADMIN_AUTH_REQUIRED' then
    raise exception 'FAIL: member delete wrapper accepted a missing token: %', v_result;
  end if;
  v_result := fn_merge_members(jsonb_build_object('representativeId', 'test_v3_rg_no_token'));
  if v_result->>'code' is distinct from 'ADMIN_AUTH_REQUIRED' then
    raise exception 'FAIL: member merge wrapper accepted a missing token: %', v_result;
  end if;

  v_token := fn_issue_admin_session('admin')->>'token';
  if v_token is null or length(v_token) < 32 then
    raise exception 'FAIL: could not issue a test admin session';
  end if;

  foreach v_schedule_id in array v_schedule_ids loop
    insert into schedules (id, title, date, start_time, end_time)
    values (v_schedule_id, v_schedule_id, '2026-11-24', '19:00', '21:00');
  end loop;
  insert into attendance_logs (id, timestamp, schedule_id, member_id, auth_method)
  values ('test_v3_rg_single_log', '2026-11-24 19:01:00', v_schedule_ids[1], 'no_member_fk', 'MANUAL_BY_ADMIN');
  alter table rsvp_votes disable trigger trg_rsvp_votes_log;
  insert into rsvp_votes (id, schedule_id, member_id, status, timestamp)
  values ('test_v3_rg_single_vote_row', v_schedule_ids[2], 'no_member_fk', 'ATTEND', '2026-11-24 19:01:00');
  alter table rsvp_votes enable trigger trg_rsvp_votes_log;
  insert into rsvp_events (schedule_id, member_id, action, status)
  values (v_schedule_ids[3], 'no_member_fk', 'backfill', 'ATTEND');
  insert into schedule_comment_events (id, schedule_id, member_id, action, timestamp)
  values ('test_v3_rg_single_comment_row', v_schedule_ids[4], 'no_member_fk', 'CREATE', '2026-11-24 19:01:00');
  if exists (
    select 1 from rsvp_events where schedule_id = v_schedule_ids[2]
  ) then
    raise exception 'FAIL: single vote-only test setup unexpectedly has RSVP history';
  end if;

  foreach v_schedule_id in array v_schedule_ids loop
    v_result := fn_delete_schedule(jsonb_build_object(
      'id', v_schedule_id,
      'forceHardDelete', true,
      'adminToken', v_token
    ));
    if v_result->>'success' is distinct from 'false'
       or v_result->>'code' is distinct from 'SCHEDULE_HAS_RECORDS' then
      raise exception 'FAIL: single deletion did not protect recorded schedule %: %', v_schedule_id, v_result;
    end if;
    if not exists (select 1 from schedules where id = v_schedule_id) then
      raise exception 'FAIL: single deletion removed recorded schedule %', v_schedule_id;
    end if;
  end loop;

  insert into schedules (id, title, date, start_time, end_time)
  values ('test_v3_rg_single_free', 'record-free schedule', '2026-11-24', '19:00', '21:00');
  v_result := fn_delete_schedule(jsonb_build_object(
    'id', 'test_v3_rg_single_free',
    'adminToken', v_token
  ));
  if v_result->>'success' is distinct from 'true'
     or exists (select 1 from schedules where id = 'test_v3_rg_single_free') then
    raise exception 'FAIL: record-free single schedule should be deleted: %', v_result;
  end if;

  foreach v_schedule_id in array v_batch_ids loop
    insert into schedules (id, title, date, start_time, end_time)
    values (v_schedule_id, v_schedule_id, '2026-11-24', '19:00', '21:00');
  end loop;
  insert into attendance_logs (id, timestamp, schedule_id, member_id, auth_method)
  values ('test_v3_rg_batch_log', '2026-11-24 19:01:00', v_batch_ids[1], 'no_member_fk', 'MANUAL_BY_ADMIN');
  alter table rsvp_votes disable trigger trg_rsvp_votes_log;
  insert into rsvp_votes (id, schedule_id, member_id, status, timestamp)
  values ('test_v3_rg_batch_vote_row', v_batch_ids[2], 'no_member_fk', 'ATTEND', '2026-11-24 19:01:00');
  alter table rsvp_votes enable trigger trg_rsvp_votes_log;
  insert into rsvp_events (schedule_id, member_id, action, status)
  values (v_batch_ids[3], 'no_member_fk', 'backfill', 'ATTEND');
  insert into schedule_comment_events (id, schedule_id, member_id, action, timestamp)
  values ('test_v3_rg_batch_comment_row', v_batch_ids[4], 'no_member_fk', 'CREATE', '2026-11-24 19:01:00');
  if exists (
    select 1 from rsvp_events where schedule_id = v_batch_ids[2]
  ) then
    raise exception 'FAIL: batch vote-only test setup unexpectedly has RSVP history';
  end if;

  v_result := fn_batch_delete_schedules(jsonb_build_object(
    'ids', to_jsonb(v_batch_ids),
    'adminToken', v_token
  ));
  if v_result->>'success' is distinct from 'false'
     or v_result->>'code' is distinct from 'SCHEDULE_HAS_RECORDS' then
    raise exception 'FAIL: batch deletion did not reject recorded schedules: %', v_result;
  end if;
  select count(*) into v_missing_count
    from unnest(v_batch_ids) as requested(schedule_id)
   where not exists (select 1 from schedules s where s.id = requested.schedule_id);
  if v_missing_count <> 0 then
    raise exception 'FAIL: batch deletion was not atomic; % recorded schedules were removed', v_missing_count;
  end if;
  v_result := fn_batch_delete_schedules(jsonb_build_object(
    'ids', jsonb_build_array(v_batch_ids[1], v_batch_ids[1]),
    'adminToken', v_token
  ));
  if v_result->>'success' is distinct from 'false'
     or v_result->>'message' not like '%1개%'
     or not exists (select 1 from schedules where id = v_batch_ids[1]) then
    raise exception 'FAIL: duplicate recorded IDs should count once and remain: %', v_result;
  end if;

  v_result := fn_batch_delete_schedules(jsonb_build_object('ids', '[]'::jsonb, 'adminToken', v_token));
  if v_result->>'success' is distinct from 'true' then
    raise exception 'FAIL: empty batch should succeed: %', v_result;
  end if;
  v_result := fn_batch_delete_schedules(jsonb_build_object(
    'ids', jsonb_build_array('test_v3_rg_missing'),
    'adminToken', v_token
  ));
  if v_result->>'success' is distinct from 'true' then
    raise exception 'FAIL: batch with only missing IDs should succeed: %', v_result;
  end if;
  v_result := fn_batch_delete_schedules(jsonb_build_object('adminToken', v_token));
  if v_result->>'success' is distinct from 'true' then
    raise exception 'FAIL: batch with no ID key should be an empty no-op: %', v_result;
  end if;
  v_result := fn_batch_delete_schedules(jsonb_build_object(
    'ids', to_jsonb('invalid'::text),
    'adminToken', v_token
  ));
  if v_result->>'success' is distinct from 'false'
     or v_result->>'code' is distinct from 'INVALID_IDS'
     or not exists (select 1 from schedules where id = v_batch_ids[1]) then
    raise exception 'FAIL: malformed IDs must be rejected without deleting schedules: %', v_result;
  end if;

  insert into attendance_logs (id, timestamp, schedule_id, member_id, auth_method)
  values (
    'test_v3_rg_orphan_log',
    '2026-11-24 19:01:00',
    'test_v3_rg_orphan_schedule',
    'no_member_fk',
    'MANUAL_BY_ADMIN'
  );
  v_result := fn_delete_schedule(jsonb_build_object(
    'id', 'test_v3_rg_orphan_schedule',
    'adminToken', v_token
  ));
  if v_result->>'success' is distinct from 'false'
     or v_result->>'code' is distinct from 'SCHEDULE_HAS_RECORDS'
     or not exists (select 1 from attendance_logs where id = 'test_v3_rg_orphan_log') then
    raise exception 'FAIL: an orphan log must be retained and block deletion: %', v_result;
  end if;

  insert into schedules (id, title, date, start_time, end_time)
  values (v_free_id, v_free_id, '2026-11-24', '19:00', '21:00');
  v_result := fn_batch_delete_schedules(jsonb_build_object(
    'ids', jsonb_build_array(v_free_id, v_free_id),
    'adminToken', v_token
  ));
  if v_result->>'success' is distinct from 'true'
     or exists (select 1 from schedules where id = v_free_id) then
    raise exception 'FAIL: duplicate batch IDs should delete the schedule once: %', v_result;
  end if;

  insert into schedules (id, title, date, start_time, end_time)
  values ('test_v3_rg_legacy_alias', 'legacy alias', '2026-11-24', '19:00', '21:00');
  v_result := fn_batch_delete_schedules(jsonb_build_object(
    'scheduleIds', jsonb_build_array('test_v3_rg_legacy_alias'),
    'adminToken', v_token
  ));
  if v_result->>'success' is distinct from 'true'
     or exists (select 1 from schedules where id = 'test_v3_rg_legacy_alias') then
    raise exception 'FAIL: legacy scheduleIds payload was not accepted: %', v_result;
  end if;

  insert into schedules (id, title, date, start_time, end_time)
  values
    (v_partial_free_id, v_partial_free_id, '2026-11-24', '19:00', '21:00'),
    (v_partial_record_id, v_partial_record_id, '2026-11-24', '19:00', '21:00');
  insert into attendance_logs (id, timestamp, schedule_id, member_id, auth_method)
  values ('test_v3_rg_partial_log', '2026-11-24 19:01:00', v_partial_record_id, 'no_member_fk', 'MANUAL_BY_ADMIN');
  v_result := fn_batch_delete_schedules(jsonb_build_object(
    'ids', jsonb_build_array(v_partial_free_id, v_partial_record_id),
    'adminToken', v_token
  ));
  if v_result->>'success' is distinct from 'false'
     or not exists (select 1 from schedules where id = v_partial_free_id)
     or not exists (select 1 from schedules where id = v_partial_record_id) then
    raise exception 'FAIL: mixed batch deletion was not atomic: %', v_result;
  end if;

  foreach v_member_id in array v_member_ids loop
    insert into members (id, name) values (v_member_id, v_member_id);
  end loop;
  insert into rsvp_events (schedule_id, member_id, action, status)
  values ('missing_schedule', v_member_ids[1], 'backfill', 'ATTEND');
  insert into schedule_comment_events (id, schedule_id, member_id, action, timestamp)
  values ('test_v3_rg_member_comment_row', 'missing_schedule', v_member_ids[2], 'CREATE', '2026-11-24 19:01:00');
  insert into member_status_history (id, member_id, start_date)
  values ('test_v3_rg_member_history_row', v_member_ids[3], '2026-11-24');
  insert into practice_pieces (id, title) values (v_piece_id, 'record guard test piece');
  insert into practice_tracks (id, piece_id, label)
  values (v_track_id, v_piece_id, 'record guard test track');
  insert into practice_listen_sessions (chunk_id, member_id, piece_id, track_id, started_at, listened_seconds)
  values ('test_v3_rg_member_listen_row', v_member_ids[4], v_piece_id, v_track_id, now(), 10);
  insert into schedules (id, title, date, start_time, end_time, target_member_ids)
  values ('test_v3_rg_member_target_schedule', 'target ref', '2026-11-24', '19:00', '21:00', array[v_member_ids[5]]);

  foreach v_member_id in array v_member_ids loop
    v_result := fn_delete_member(jsonb_build_object('id', v_member_id, 'adminToken', v_token));
    if v_result->>'success' is distinct from 'true'
       or not exists (select 1 from members where id = v_member_id and status = 'DELETED') then
      raise exception 'FAIL: member with retained history was not soft-deleted (%): %', v_member_id, v_result;
    end if;
  end loop;

  insert into members (id, name) values ('test_v3_rg_member_empty', 'record-free member');
  v_result := fn_delete_member(jsonb_build_object('id', 'test_v3_rg_member_empty', 'adminToken', v_token));
  if v_result->>'success' is distinct from 'true'
     or exists (select 1 from members where id = 'test_v3_rg_member_empty') then
    raise exception 'FAIL: record-free member should be physically deleted: %', v_result;
  end if;

  insert into members (id, name, status) values ('test_v3_rg_member_merged', 'merged member', 'MERGED');
  v_result := fn_delete_member(jsonb_build_object('id', 'test_v3_rg_member_merged', 'adminToken', v_token));
  if v_result->>'success' is distinct from 'false'
     or not exists (select 1 from members where id = 'test_v3_rg_member_merged') then
    raise exception 'FAIL: merged member should not be physically deleted: %', v_result;
  end if;
end
$$;

rollback;
