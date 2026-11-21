-- ==============================================================================
-- v3 Activity Engine Verification Script (v3-C)
-- Run in transaction with ROLLBACK at the end so it leaves no test artifacts.
-- Any check failure raises an exception.
-- ==============================================================================
begin;

-- Verify migration has been applied
do $$
begin
  if to_regclass('rsvp_events') is null
     or to_regclass('practice_listen_sessions') is null
     or to_regprocedure('fn_log_listen_session(jsonb)') is null
     or to_regprocedure('fn_get_member_activity(text)') is null then
    raise exception 'FAIL: 20261124000000_v3_activity.sql has not been applied.';
  end if;
end
$$;

-- Setup temporary test entities
do $$
declare
  v_test_member_id text := 'test_v3_mem_001';
  v_test_piece_id text := 'test_v3_piece_001';
  v_test_track_id text := 'test_v3_track_001';
  v_test_other_piece_id text := 'test_v3_piece_002';
  v_test_other_track_id text := 'test_v3_track_002';
  v_test_schedule_id text := 'test_v3_sch_001';

  v_count_before integer;
  v_count_after integer;
  v_res jsonb;
  v_saved_seconds integer;
begin
  -- Create isolated test member
  insert into members (id, name, part, phone_last_4, member_status)
  values (v_test_member_id, '테스트단원', '소프라노', '9999', '정단원')
  on conflict (id) do nothing;

  -- Create isolated test schedule
  insert into schedules (id, title, date, start_time, end_time, category)
  values (v_test_schedule_id, '테스트연습', '2026-11-23', '19:30', '21:30', '정기연습')
  on conflict (id) do nothing;

  -- Create isolated test pieces & tracks
  insert into practice_pieces (id, title)
  values (v_test_piece_id, '테스트곡')
  on conflict (id) do nothing;

  insert into practice_pieces (id, title)
  values (v_test_other_piece_id, '테스트다른곡')
  on conflict (id) do nothing;

  insert into practice_tracks (id, piece_id, label, kind, source_type)
  values (v_test_track_id, v_test_piece_id, '소프라노 트랙', 'PART', 'r2')
  on conflict (id) do nothing;

  insert into practice_tracks (id, piece_id, label, kind, source_type)
  values (v_test_other_track_id, v_test_other_piece_id, '다른곡 트랙', 'ALL', 'r2')
  on conflict (id) do nothing;

  -- ----------------------------------------------------------------------------
  -- Check 1: rsvp insert / 상태 변경 update / 같은 상태 update / delete
  -- Expect events: 1 (insert) + 1 (status change) + 0 (same status) + 1 (delete)
  -- ----------------------------------------------------------------------------
  -- 1-1. insert
  select count(*) into v_count_before from rsvp_events where schedule_id = v_test_schedule_id and member_id = v_test_member_id;
  insert into rsvp_votes (id, schedule_id, member_id, status, timestamp)
  values ('test_rsvp_vote_1', v_test_schedule_id, v_test_member_id, 'ATTEND', '2026-11-23 18:00:00');
  select count(*) into v_count_after from rsvp_events where schedule_id = v_test_schedule_id and member_id = v_test_member_id;
  if v_count_after - v_count_before <> 1 then
    raise exception 'Check 1-1 FAIL: Expected 1 rsvp_event on insert, got %', (v_count_after - v_count_before);
  end if;

  -- 1-2. update with status change (ATTEND -> LATE)
  select count(*) into v_count_before from rsvp_events where schedule_id = v_test_schedule_id and member_id = v_test_member_id;
  update rsvp_votes set status = 'LATE' where id = 'test_rsvp_vote_1';
  select count(*) into v_count_after from rsvp_events where schedule_id = v_test_schedule_id and member_id = v_test_member_id;
  if v_count_after - v_count_before <> 1 then
    raise exception 'Check 1-2 FAIL: Expected 1 rsvp_event on status change update, got %', (v_count_after - v_count_before);
  end if;

  -- 1-3. update with SAME status (LATE -> LATE, e.g. updating reason)
  select count(*) into v_count_before from rsvp_events where schedule_id = v_test_schedule_id and member_id = v_test_member_id;
  update rsvp_votes set reason = '교통 체증' where id = 'test_rsvp_vote_1';
  select count(*) into v_count_after from rsvp_events where schedule_id = v_test_schedule_id and member_id = v_test_member_id;
  if v_count_after - v_count_before <> 0 then
    raise exception 'Check 1-3 FAIL: Expected 0 rsvp_event on same status update, got %', (v_count_after - v_count_before);
  end if;

  -- 1-4. delete
  select count(*) into v_count_before from rsvp_events where schedule_id = v_test_schedule_id and member_id = v_test_member_id;
  delete from rsvp_votes where id = 'test_rsvp_vote_1';
  select count(*) into v_count_after from rsvp_events where schedule_id = v_test_schedule_id and member_id = v_test_member_id;
  if v_count_after - v_count_before <> 1 then
    raise exception 'Check 1-4 FAIL: Expected 1 rsvp_event on delete, got %', (v_count_after - v_count_before);
  end if;

  -- ----------------------------------------------------------------------------
  -- Check 2: rsvp_events update & delete must be rejected by triggers
  -- ----------------------------------------------------------------------------
  begin
    update rsvp_events set status = 'ATTEND' where schedule_id = v_test_schedule_id;
    raise exception 'Check 2-1 FAIL: rsvp_events update should have thrown error';
  exception when others then
    if sqlerrm not like '%append-only and cannot be updated%' then
      raise exception 'Check 2-1 FAIL: Unexpected error message on update: %', sqlerrm;
    end if;
  end;

  begin
    delete from rsvp_events where schedule_id = v_test_schedule_id;
    raise exception 'Check 2-2 FAIL: rsvp_events delete should have thrown error';
  exception when others then
    if sqlerrm not like '%cannot be physically deleted%' then
      raise exception 'Check 2-2 FAIL: Unexpected error message on delete: %', sqlerrm;
    end if;
  end;

  -- ----------------------------------------------------------------------------
  -- Check 3: Data backfill is idempotent (running backfill query again does not add duplicate rows)
  -- ----------------------------------------------------------------------------
  select count(*) into v_count_before from rsvp_events where action = 'backfill';
  insert into rsvp_events (schedule_id, member_id, action, status, prev_status, occurred_at)
  select
    v.schedule_id,
    v.member_id,
    'backfill',
    v.status,
    null,
    coalesce(v.received_at, now())
  from rsvp_votes v
  where not exists (
    select 1 from rsvp_events e
    where e.schedule_id = v.schedule_id
      and e.member_id = v.member_id
      and e.action = 'backfill'
  );
  select count(*) into v_count_after from rsvp_events where action = 'backfill';
  if v_count_after <> v_count_before then
    raise exception 'Check 3 FAIL: Backfill was not idempotent; row count changed from % to %', v_count_before, v_count_after;
  end if;

  -- ----------------------------------------------------------------------------
  -- Check 4: fn_log_listen_session
  --   4-1: Normal insert 1 row
  --   4-2: Same chunkId retransmission -> 0 rows added
  --   4-3: 200 seconds -> clamped and stored as 120 seconds
  --   4-4: Track belonging to another piece -> rejected
  --   4-5: Non-existent member -> rejected
  --   4-6: Daily limit 21,600s exceeded -> ignored gracefully
  -- ----------------------------------------------------------------------------
  -- 4-1. Normal insert
  v_res := fn_log_listen_session(jsonb_build_object(
    'chunkId', 'chk_test_001',
    'memberId', v_test_member_id,
    'pieceId', v_test_piece_id,
    'trackId', v_test_track_id,
    'startedAt', '2026-11-23T10:00:00Z',
    'listenedSeconds', 45
  ));
  if (v_res->>'ok')::boolean is not true then
    raise exception 'Check 4-1 FAIL: fn_log_listen_session normal insert failed: %', v_res;
  end if;

  -- 4-2. Same chunkId retransmission (idempotent, 0 rows added)
  select count(*) into v_count_before from practice_listen_sessions where member_id = v_test_member_id;
  v_res := fn_log_listen_session(jsonb_build_object(
    'chunkId', 'chk_test_001',
    'memberId', v_test_member_id,
    'pieceId', v_test_piece_id,
    'trackId', v_test_track_id,
    'startedAt', '2026-11-23T10:00:00Z',
    'listenedSeconds', 45
  ));
  select count(*) into v_count_after from practice_listen_sessions where member_id = v_test_member_id;
  if v_count_after <> v_count_before then
    raise exception 'Check 4-2 FAIL: Duplicate chunkId should not add row. Before %, after %', v_count_before, v_count_after;
  end if;

  -- 4-3. 200 seconds -> clamped to 120
  v_res := fn_log_listen_session(jsonb_build_object(
    'chunkId', 'chk_test_002',
    'memberId', v_test_member_id,
    'pieceId', v_test_piece_id,
    'trackId', v_test_track_id,
    'startedAt', '2026-11-23T10:05:00Z',
    'listenedSeconds', 200
  ));
  select listened_seconds into v_saved_seconds from practice_listen_sessions where chunk_id = 'chk_test_002';
  if v_saved_seconds <> 120 then
    raise exception 'Check 4-3 FAIL: Expected listened_seconds to be clamped to 120, got %', v_saved_seconds;
  end if;

  -- 4-4. Track belonging to different piece -> rejected
  v_res := fn_log_listen_session(jsonb_build_object(
    'chunkId', 'chk_test_003',
    'memberId', v_test_member_id,
    'pieceId', v_test_piece_id,
    'trackId', v_test_other_track_id,
    'startedAt', '2026-11-23T10:10:00Z',
    'listenedSeconds', 30
  ));
  if (v_res->>'success')::boolean is not false then
    raise exception 'Check 4-4 FAIL: Mismatched piece/track should be rejected: %', v_res;
  end if;

  -- 4-5. Non-existent member -> rejected
  v_res := fn_log_listen_session(jsonb_build_object(
    'chunkId', 'chk_test_004',
    'memberId', 'non_existent_mem_9999',
    'pieceId', v_test_piece_id,
    'trackId', v_test_track_id,
    'startedAt', '2026-11-23T10:15:00Z',
    'listenedSeconds', 30
  ));
  if (v_res->>'success')::boolean is not false then
    raise exception 'Check 4-5 FAIL: Non-existent member should be rejected: %', v_res;
  end if;

  -- 4-6. Exceeding daily 21,600s limit -> ignored gracefully
  insert into practice_listen_sessions (chunk_id, member_id, piece_id, track_id, started_at, listened_seconds)
  select 'chk_test_quota_' || i, v_test_member_id, v_test_piece_id, v_test_track_id, '2026-11-23T12:00:00Z', 120
  from generate_series(1, 180) as i; -- 180 * 120 = 21,600 seconds

  select count(*) into v_count_before from practice_listen_sessions where member_id = v_test_member_id;
  v_res := fn_log_listen_session(jsonb_build_object(
    'chunkId', 'chk_test_over_quota',
    'memberId', v_test_member_id,
    'pieceId', v_test_piece_id,
    'trackId', v_test_track_id,
    'startedAt', '2026-11-23T15:00:00Z',
    'listenedSeconds', 60
  ));
  select count(*) into v_count_after from practice_listen_sessions where member_id = v_test_member_id;
  if v_count_after <> v_count_before then
    raise exception 'Check 4-6 FAIL: Exceeding 21600s quota should not insert new row. Before %, after %', v_count_before, v_count_after;
  end if;
  if (v_res->>'ok')::boolean is not true then
    raise exception 'Check 4-6 FAIL: Over quota response should be {ok: true}, got %', v_res;
  end if;

  -- ----------------------------------------------------------------------------
  -- Check 5: Physical delete of member cascades to practice_listen_sessions
  -- ----------------------------------------------------------------------------
  delete from members where id = v_test_member_id;
  select count(*) into v_count_after from practice_listen_sessions where member_id = v_test_member_id;
  if v_count_after <> 0 then
    raise exception 'Check 5 FAIL: Deleting member should cascade delete listen sessions, found % rows', v_count_after;
  end if;
end
$$;

rollback;
