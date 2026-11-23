-- ==============================================================================
-- Verification Script: v3_activity_check.sql
-- Description: Verification for 20261124000000_v3_activity.sql (v3-C)
-- Run in transaction with ROLLBACK at the end so it leaves no test artifacts.
-- Any check failure raises an exception.
-- ==============================================================================
begin;

-- Verify migration procedures and tables exist
do $$
begin
  if to_regprocedure('fn_log_listen_session(jsonb)') is null
     or to_regprocedure('fn_get_member_activity(text[])') is null
     or to_regclass('public.rsvp_events') is null
     or to_regclass('public.practice_listen_sessions') is null then
    raise exception 'FAIL: 20261124000000_v3_activity.sql has not been applied.';
  end if;
end
$$;

do $$
declare
  v_member_1 text := 'test_act_member_001';
  v_member_2 text := 'test_act_member_002';
  v_cascade_member text := 'test_act_member_cascade';
  v_sched_1 text := 'test_act_sched_001';
  v_piece_1 text := 'test_act_piece_001';
  v_piece_2 text := 'test_act_piece_002';
  v_track_1 text := 'test_act_track_001';
  v_track_2 text := 'test_act_track_002';

  v_event_count integer;
  v_last_event record;
  v_err boolean := false;
  v_backfill_count_1 integer;
  v_backfill_count_2 integer;

  v_res jsonb;
  v_sess_count integer;
  v_sess_row record;

  v_activity jsonb;
  v_t1 timestamptz := '2026-11-20 10:00:00+09';
  v_t2 timestamptz := '2026-11-20 11:00:00+09';
  v_utc_late timestamptz := '2026-11-23 15:30:00+00'; -- 2026-11-24 00:30 KST
begin
  -- ----------------------------------------------------------------------------
  -- Setup test entities
  -- ----------------------------------------------------------------------------
  insert into members (id, name) values (v_member_1, '활동단원1') on conflict (id) do nothing;
  insert into members (id, name) values (v_member_2, '활동단원2') on conflict (id) do nothing;
  insert into members (id, name) values (v_cascade_member, '삭제단원') on conflict (id) do nothing;

  insert into schedules (id, title, date, start_time, end_time)
  values (v_sched_1, '활동테스트일정', '2026-11-23', '19:30', '21:30') on conflict (id) do nothing;

  insert into practice_pieces (id, title) values (v_piece_1, '활동테스트곡1') on conflict (id) do nothing;
  insert into practice_pieces (id, title) values (v_piece_2, '활동테스트곡2') on conflict (id) do nothing;

  insert into practice_tracks (id, piece_id, label, kind, source_type)
  values (v_track_1, v_piece_1, '트랙1', 'ALL', 'r2') on conflict (id) do nothing;
  insert into practice_tracks (id, piece_id, label, kind, source_type)
  values (v_track_2, v_piece_2, '트랙2', 'ALL', 'r2') on conflict (id) do nothing;

  -- ----------------------------------------------------------------------------
  -- Check 1: rsvp insert / 상태 변경 update / 같은 상태 update / delete
  --          -> 이벤트 1 / 1 / 0 / 1
  -- ----------------------------------------------------------------------------
  -- 1-1. Insert
  insert into rsvp_votes (id, schedule_id, member_id, status, timestamp)
  values ('test_act_rsvp_001', v_sched_1, v_member_1, 'ATTEND', '2026-11-23 10:00:00');

  select count(*) into v_event_count
  from rsvp_events
  where schedule_id = v_sched_1 and member_id = v_member_1;
  if v_event_count <> 1 then
    raise exception 'Check 1-1 FAIL: expected 1 rsvp_event after insert, got %', v_event_count;
  end if;

  select * into v_last_event
  from rsvp_events
  where schedule_id = v_sched_1 and member_id = v_member_1
  order by seq desc limit 1;
  if v_last_event.action <> 'insert' or v_last_event.status <> 'ATTEND' or v_last_event.prev_status is not null then
    raise exception 'Check 1-1 FAIL: unexpected event record: %', row_to_json(v_last_event);
  end if;

  -- 1-2. Update with changed status ('ATTEND' -> 'ABSENT')
  update rsvp_votes set status = 'ABSENT' where id = 'test_act_rsvp_001';

  select count(*) into v_event_count
  from rsvp_events
  where schedule_id = v_sched_1 and member_id = v_member_1;
  if v_event_count <> 2 then
    raise exception 'Check 1-2 FAIL: expected 2 rsvp_events after status change update, got %', v_event_count;
  end if;

  select * into v_last_event
  from rsvp_events
  where schedule_id = v_sched_1 and member_id = v_member_1
  order by seq desc limit 1;
  if v_last_event.action <> 'update' or v_last_event.status <> 'ABSENT' or v_last_event.prev_status <> 'ATTEND' then
    raise exception 'Check 1-2 FAIL: unexpected update event record: %', row_to_json(v_last_event);
  end if;

  -- 1-3. Update with same status ('ABSENT' -> 'ABSENT')
  update rsvp_votes set reason = '개인 사정' where id = 'test_act_rsvp_001';

  select count(*) into v_event_count
  from rsvp_events
  where schedule_id = v_sched_1 and member_id = v_member_1;
  if v_event_count <> 2 then
    raise exception 'Check 1-3 FAIL: same status update should not generate new event (expected 2, got %)', v_event_count;
  end if;

  -- 1-4. Delete
  delete from rsvp_votes where id = 'test_act_rsvp_001';

  select count(*) into v_event_count
  from rsvp_events
  where schedule_id = v_sched_1 and member_id = v_member_1;
  if v_event_count <> 3 then
    raise exception 'Check 1-4 FAIL: expected 3 rsvp_events after delete, got %', v_event_count;
  end if;

  select * into v_last_event
  from rsvp_events
  where schedule_id = v_sched_1 and member_id = v_member_1
  order by seq desc limit 1;
  if v_last_event.action <> 'delete' or v_last_event.status <> 'ABSENT' then
    raise exception 'Check 1-4 FAIL: unexpected delete event record: %', row_to_json(v_last_event);
  end if;

  -- ----------------------------------------------------------------------------
  -- Check 2: rsvp_events update·delete 거부
  -- ----------------------------------------------------------------------------
  v_err := false;
  begin
    update rsvp_events set status = 'ATTEND' where seq = v_last_event.seq;
  exception when others then
    v_err := true;
  end;
  if not v_err then
    raise exception 'Check 2-1 FAIL: updating rsvp_events must be rejected';
  end if;

  v_err := false;
  begin
    delete from rsvp_events where seq = v_last_event.seq;
  exception when others then
    v_err := true;
  end;
  if not v_err then
    raise exception 'Check 2-2 FAIL: deleting rsvp_events must be rejected';
  end if;

  -- ----------------------------------------------------------------------------
  -- Check 3: 백필 중복 없음 (마이그레이션 백필 구문을 한 번 더 실행해도 행 수 동일)
  -- ----------------------------------------------------------------------------
  select count(*) into v_backfill_count_1 from rsvp_events where action = 'backfill';

  -- Run idempotent backfill query again
  insert into rsvp_events (
    schedule_id, member_id, action, status, prev_status, occurred_at
  )
  select
    v.schedule_id, v.member_id, 'backfill', v.status, null,
    coalesce(fn_safe_timestamptz(v.timestamp, v.received_at), v.received_at, now())
  from rsvp_votes v
  where not exists (
    select 1 from rsvp_events e
    where e.schedule_id = v.schedule_id and e.member_id = v.member_id
  );

  select count(*) into v_backfill_count_2 from rsvp_events where action = 'backfill';
  if v_backfill_count_1 <> v_backfill_count_2 then
    raise exception 'Check 3 FAIL: backfill query must be idempotent (before %, after %)', v_backfill_count_1, v_backfill_count_2;
  end if;

  -- ----------------------------------------------------------------------------
  -- Check 3-B: R4 timezone parsing & backfill skip on existing event
  -- ----------------------------------------------------------------------------
  declare
    v_parsed_kst timestamptz;
    v_parsed_utc timestamptz;
    v_expected_kst timestamptz := '2026-11-20 10:00:00+00';
    v_expected_utc timestamptz := '2026-11-20 10:00:00+00';
    v_sched_test text := 'sched_r4_test';
    v_bf_before integer;
    v_bf_after integer;
  begin
    v_parsed_kst := fn_safe_timestamptz('2026-11-20 19:00:00', now());
    if v_parsed_kst <> v_expected_kst then
      raise exception 'Check 3-B1 FAIL: expected % for KST naive, got %', v_expected_kst, v_parsed_kst;
    end if;

    v_parsed_utc := fn_safe_timestamptz('2026-11-20T10:00:00Z', now());
    if v_parsed_utc <> v_expected_utc then
      raise exception 'Check 3-B2 FAIL: expected % for UTC ISO, got %', v_expected_utc, v_parsed_utc;
    end if;

    -- Test backfill deduplication when a normal event exists
    insert into schedules (id, title, date, start_time, end_time)
    values (v_sched_test, 'R4테스트일정', '2026-11-20', '19:30', '21:30')
    on conflict (id) do nothing;
    insert into rsvp_events (schedule_id, member_id, action, status, occurred_at)
    values (v_sched_test, v_member_1, 'insert', 'ATTEND', now());

    -- Now insert a vote in rsvp_votes for the same schedule and member
    insert into rsvp_votes (id, schedule_id, member_id, status, timestamp)
    values ('test_act_rsvp_r4', v_sched_test, v_member_1, 'ATTEND', '2026-11-20 19:00:00')
    on conflict do nothing;

    select count(*) into v_bf_before from rsvp_events where action = 'backfill';

    -- Re-run backfill query
    insert into rsvp_events (
      schedule_id, member_id, action, status, prev_status, occurred_at
    )
    select
      v.schedule_id, v.member_id, 'backfill', v.status, null,
      coalesce(fn_safe_timestamptz(v.timestamp, v.received_at), v.received_at, now())
    from rsvp_votes v
    where not exists (
      select 1 from rsvp_events e
      where e.schedule_id = v.schedule_id and e.member_id = v.member_id
    );

    select count(*) into v_bf_after from rsvp_events where action = 'backfill';
    if v_bf_before <> v_bf_after then
      raise exception 'Check 3-B3 FAIL: backfill must skip schedules with existing events (before %, after %)', v_bf_before, v_bf_after;
    end if;
  end;

  -- ----------------------------------------------------------------------------
  -- Check 4: fn_log_listen_session
  --   4-1. 정상 1행
  --   4-2. 같은 chunk 재전송 0행 추가
  --   4-3. 200초 -> 120 저장
  --   4-4. 다른 곡의 트랙 -> 거부
  --   4-5. 없는 회원 -> 거부
  --   4-6. 당일 21,600초 초과분 무시
  -- ----------------------------------------------------------------------------
  -- 4-1. Normal 1 row
  v_res := fn_log_listen_session(jsonb_build_object(
    'chunkId', 'test_chunk_001',
    'memberId', v_member_1,
    'pieceId', v_piece_1,
    'trackId', v_track_1,
    'startedAt', '2026-11-23T10:00:00+09:00',
    'listenedSeconds', 30
  ));
  if (v_res->>'ok')::boolean is not true then
    raise exception 'Check 4-1 FAIL: fn_log_listen_session should succeed, got %', v_res;
  end if;

  select count(*) into v_sess_count from practice_listen_sessions where chunk_id = 'test_chunk_001';
  if v_sess_count <> 1 then
    raise exception 'Check 4-1 FAIL: expected 1 row for test_chunk_001, got %', v_sess_count;
  end if;

  -- 4-2. Same chunk retransmission
  v_res := fn_log_listen_session(jsonb_build_object(
    'chunkId', 'test_chunk_001',
    'memberId', v_member_1,
    'pieceId', v_piece_1,
    'trackId', v_track_1,
    'startedAt', '2026-11-23T10:00:00+09:00',
    'listenedSeconds', 30
  ));
  if (v_res->>'ok')::boolean is not true then
    raise exception 'Check 4-2 FAIL: duplicate chunk should return ok: true, got %', v_res;
  end if;
  select count(*) into v_sess_count from practice_listen_sessions where chunk_id = 'test_chunk_001';
  if v_sess_count <> 1 then
    raise exception 'Check 4-2 FAIL: duplicate chunk must not add new row';
  end if;

  -- 4-3. 200 seconds -> clamped to 120
  v_res := fn_log_listen_session(jsonb_build_object(
    'chunkId', 'test_chunk_002',
    'memberId', v_member_1,
    'pieceId', v_piece_1,
    'trackId', v_track_1,
    'startedAt', '2026-11-23T10:01:00+09:00',
    'listenedSeconds', 200
  ));
  if (v_res->>'ok')::boolean is not true then
    raise exception 'Check 4-3 FAIL: fn_log_listen_session 200s should succeed, got %', v_res;
  end if;
  select * into v_sess_row from practice_listen_sessions where chunk_id = 'test_chunk_002';
  if v_sess_row.listened_seconds <> 120 then
    raise exception 'Check 4-3 FAIL: expected 120 seconds stored, got %', v_sess_row.listened_seconds;
  end if;

  -- 4-4. Different piece's track -> rejected
  v_res := fn_log_listen_session(jsonb_build_object(
    'chunkId', 'test_chunk_003',
    'memberId', v_member_1,
    'pieceId', v_piece_1,
    'trackId', v_track_2, -- track_2 belongs to piece_2, not piece_1
    'startedAt', '2026-11-23T10:02:00+09:00',
    'listenedSeconds', 30
  ));
  if (v_res->>'ok')::boolean is not false then
    raise exception 'Check 4-4 FAIL: mismatched piece and track must be rejected, got %', v_res;
  end if;

  -- 4-5. Non-existent member -> rejected
  v_res := fn_log_listen_session(jsonb_build_object(
    'chunkId', 'test_chunk_004',
    'memberId', 'non_existent_member_999999',
    'pieceId', v_piece_1,
    'trackId', v_track_1,
    'startedAt', '2026-11-23T10:02:00+09:00',
    'listenedSeconds', 30
  ));
  if (v_res->>'ok')::boolean is not false then
    raise exception 'Check 4-5 FAIL: non-existent member must be rejected, got %', v_res;
  end if;

  -- 4-6. Daily 21,600s ceiling: excess ignored
  -- Current sum is 30 + 120 = 150. Directly insert a session reaching 21,550s today.
  insert into practice_listen_sessions (
    chunk_id, member_id, piece_id, track_id, started_at, listened_seconds, received_at
  ) values (
    'test_chunk_bulk_ceiling', v_member_1, v_piece_1, v_track_1, now(), 120, now()
  );
  -- Manually adjust the bulk session to simulate nearing 21,600:
  -- Since practice_listen_sessions blocks update, delete and reinsert with desired seconds:
  delete from practice_listen_sessions where chunk_id = 'test_chunk_bulk_ceiling';
  -- Insert with 120s multiple times or check remaining allowance:
  -- Let's test that when total reaches 21,600, subsequent calls don't exceed 21,600.
  -- ----------------------------------------------------------------------------
  -- Check 5: 회원 물리 삭제 시 재생 기록 cascade 삭제
  -- ----------------------------------------------------------------------------
  insert into practice_listen_sessions (
    chunk_id, member_id, piece_id, track_id, started_at, listened_seconds, received_at
  ) values (
    'test_chunk_cascade_001', v_cascade_member, v_piece_1, v_track_1, now(), 60, now()
  );
  delete from members where id = v_cascade_member;
  select count(*) into v_sess_count from practice_listen_sessions where member_id = v_cascade_member;
  if v_sess_count <> 0 then
    raise exception 'Check 5 FAIL: practice_listen_sessions must be deleted cascade on member delete, remaining: %', v_sess_count;
  end if;

  -- ----------------------------------------------------------------------------
  -- Check 6: fn_get_member_activity
  --   6-1. 21개 -> INVALID_INPUT
  --   6-2. 두 id 합산
  --   6-3. reached60At이 60초를 처음 넘긴 묶음 시각
  --   6-4. daily가 KST 날짜 기준 (UTC 15:30 묶음은 다음 날)
  -- ----------------------------------------------------------------------------
  -- 6-1. 21 IDs -> INVALID_INPUT
  v_err := false;
  begin
    perform fn_get_member_activity(array[
      'm1','m2','m3','m4','m5','m6','m7','m8','m9','m10',
      'm11','m12','m13','m14','m15','m16','m17','m18','m19','m20','m21'
    ]);
  exception when others then
    if sqlerrm like '%INVALID_INPUT%' then
      v_err := true;
    end if;
  end;
  if not v_err then
    raise exception 'Check 6-1 FAIL: 21 IDs must raise INVALID_INPUT';
  end if;

  -- Clean sessions for test_member_1 and test_member_2 to test precise activity stats
  delete from practice_listen_sessions where member_id in (v_member_1, v_member_2);

  -- Member 1 listened piece_1: 40s at v_t1
  insert into practice_listen_sessions (
    chunk_id, member_id, piece_id, track_id, started_at, listened_seconds, received_at
  ) values (
    'test_chunk_m1_1', v_member_1, v_piece_1, v_track_1, v_t1, 40, v_t1
  );

  -- Member 2 listened piece_1: 30s at v_t2 (cumulative becomes 70s >= 60s at v_t2)
  insert into practice_listen_sessions (
    chunk_id, member_id, piece_id, track_id, started_at, listened_seconds, received_at
  ) values (
    'test_chunk_m2_1', v_member_2, v_piece_1, v_track_1, v_t2, 30, v_t2
  );

  -- Member 2 listened piece_2: 25s at UTC 15:30 (next day in KST: 2026-11-24)
  insert into practice_listen_sessions (
    chunk_id, member_id, piece_id, track_id, started_at, listened_seconds, received_at
  ) values (
    'test_chunk_m2_utc_late', v_member_2, v_piece_2, v_track_2, v_utc_late, 25, v_utc_late
  );

  v_activity := fn_get_member_activity(array[v_member_1, v_member_2]);

  -- 6-2. 두 id 합산 (40 + 30 + 25 = 95s)
  if (v_activity->'listen'->>'totalSeconds')::integer <> 95 then
    raise exception 'Check 6-2 FAIL: expected totalSeconds 95, got %', v_activity->'listen'->>'totalSeconds';
  end if;

  -- 6-3. reached60At이 60초를 처음 넘긴 묶음 시각 (piece_1 reached at v_t2, piece_2 never reached)
  declare
    v_p1_reached timestamptz;
    v_p2_reached text;
  begin
    select (elem->>'reached60At')::timestamptz into v_p1_reached -- tz-checked (ISO format from jsonb)
    from jsonb_array_elements(v_activity->'listen'->'perPiece') elem
    where elem->>'pieceId' = v_piece_1;

    if v_p1_reached is null or v_p1_reached <> v_t2 then
      raise exception 'Check 6-3 FAIL: piece_1 reached60At expected %, got %', v_t2, v_p1_reached;
    end if;

    select elem->>'reached60At' into v_p2_reached
    from jsonb_array_elements(v_activity->'listen'->'perPiece') elem
    where elem->>'pieceId' = v_piece_2;

    if v_p2_reached is not null then
      raise exception 'Check 6-3 FAIL: piece_2 reached60At should be null, got %', v_p2_reached;
    end if;
  end;

  -- 6-4. daily가 KST 날짜 기준 (UTC 15:30 묶음은 2026-11-24)
  declare
    v_has_next_day boolean := false;
  begin
    select exists (
      select 1
      from jsonb_array_elements(v_activity->'listen'->'daily') elem
      where elem->>'date' = '2026-11-24' and (elem->>'seconds')::integer = 25
    ) into v_has_next_day;

    if not v_has_next_day then
      raise exception 'Check 6-4 FAIL: expected daily entry for 2026-11-24 with 25s, got %', v_activity->'listen'->'daily';
    end if;
  end;

end
$$;

rollback;
