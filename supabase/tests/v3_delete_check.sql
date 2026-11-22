-- ==============================================================================
-- Verification Script: v3_delete_check.sql
-- Description: Verification for 20261123020000_v3_delete.sql
-- Run in transaction with ROLLBACK at the end so it leaves no test artifacts.
-- Any check failure raises an exception.
-- ==============================================================================
begin;

-- Verify migration procedures exist
do $$
begin
  if to_regprocedure('fn_delete_practice_piece(jsonb)') is null
     or to_regprocedure('fn_delete_practice_track(jsonb)') is null
     or to_regprocedure('fn_delete_performance(jsonb)') is null then
    raise exception 'FAIL: 20261123020000_v3_delete.sql has not been applied.';
  end if;
end
$$;

do $$
declare
  v_token text;
  v_piece_1 text := 'test_del_piece_001';
  v_piece_2 text := 'test_del_piece_002';
  v_track_1 text := 'test_del_track_001';
  v_track_2 text := 'test_del_track_002';
  v_perf_1 text := 'test_del_perf_001';
  v_card_1 text := 'test_del_card_001';

  v_res jsonb;
  v_del_error boolean := false;
  v_keys text[];
begin
  -- 0. Admin session setup (32+ chars test token)
  v_token := 'test_admin_token_for_delete_check_32chars_long';
  insert into admin_sessions (token_hash, tier, expires_at)
  values (fn_admin_token_hash(v_token), 'admin', now() + interval '1 hour');

  -- Setup dummy test data
  insert into practice_pieces (id, title, score_storage_key)
  values (v_piece_1, '삭제테스트곡1', '2026/score/piece1_score.pdf')
  on conflict (id) do nothing;

  insert into practice_pieces (id, title)
  values (v_piece_2, '삭제테스트곡2')
  on conflict (id) do nothing;

  insert into practice_tracks (id, piece_id, label, storage_key)
  values (v_track_1, v_piece_1, '소프라노파트', '2026/audio/track1_sop.m4a')
  on conflict (id) do nothing;

  insert into practice_tracks (id, piece_id, label, storage_key)
  values (v_track_2, v_piece_1, '알토파트', '2026/audio/track2_alt.m4a')
  on conflict (id) do nothing;

  insert into performances (id, title)
  values (v_perf_1, '삭제테스트공연1')
  on conflict (id) do nothing;

  insert into practice_performance_pieces (performance_id, piece_id, order_index)
  values (v_perf_1, v_piece_1, 0)
  on conflict (performance_id, piece_id) do nothing;

  insert into program_cards (id, title)
  values (v_card_1, '삭제테스트시즌카드1')
  on conflict (id) do nothing;

  insert into practice_program_pieces (card_id, piece_id, order_index)
  values (v_card_1, v_piece_1, 0)
  on conflict (card_id, piece_id) do nothing;

  -- ----------------------------------------------------------------------------
  -- Check 4: RPC 밖에서 직접 delete from practice_pieces를 하면 여전히 거부된다
  -- ----------------------------------------------------------------------------
  v_del_error := false;
  begin
    delete from practice_pieces where id = v_piece_2;
  exception when others then
    v_del_error := true;
  end;
  if not v_del_error then
    raise exception 'Check 4 FAIL: Direct delete from practice_pieces must be rejected by trigger';
  end if;

  -- ----------------------------------------------------------------------------
  -- Check 5: 토큰 없으면 ADMIN_AUTH_REQUIRED
  -- ----------------------------------------------------------------------------
  v_res := fn_delete_practice_piece(jsonb_build_object('pieceId', v_piece_1));
  if (v_res->>'success')::boolean is not false or v_res->>'code' <> 'ADMIN_AUTH_REQUIRED' then
    raise exception 'Check 5 FAIL: fn_delete_practice_piece should reject unauthenticated request, got %', v_res;
  end if;

  v_res := fn_delete_practice_track(jsonb_build_object('trackId', v_track_1));
  if (v_res->>'success')::boolean is not false or v_res->>'code' <> 'ADMIN_AUTH_REQUIRED' then
    raise exception 'Check 5 FAIL: fn_delete_practice_track should reject unauthenticated request, got %', v_res;
  end if;

  v_res := fn_delete_performance(jsonb_build_object('performanceId', v_perf_1));
  if (v_res->>'success')::boolean is not false or v_res->>'code' <> 'ADMIN_AUTH_REQUIRED' then
    raise exception 'Check 5 FAIL: fn_delete_performance should reject unauthenticated request, got %', v_res;
  end if;

  -- ----------------------------------------------------------------------------
  -- Check 6: 없는 id 거부
  -- ----------------------------------------------------------------------------
  v_res := fn_delete_practice_piece(jsonb_build_object('adminToken', v_token, 'pieceId', 'non_existent_piece_id'));
  if (v_res->>'success')::boolean is not false or (v_res->>'message') is null then
    raise exception 'Check 6 FAIL: fn_delete_practice_piece should reject non-existent piece, got %', v_res;
  end if;

  v_res := fn_delete_practice_track(jsonb_build_object('adminToken', v_token, 'trackId', 'non_existent_track_id'));
  if (v_res->>'success')::boolean is not false or (v_res->>'message') is null then
    raise exception 'Check 6 FAIL: fn_delete_practice_track should reject non-existent track, got %', v_res;
  end if;

  v_res := fn_delete_performance(jsonb_build_object('adminToken', v_token, 'performanceId', 'non_existent_perf_id'));
  if (v_res->>'success')::boolean is not false or (v_res->>'message') is null then
    raise exception 'Check 6 FAIL: fn_delete_performance should reject non-existent performance, got %', v_res;
  end if;

  -- ----------------------------------------------------------------------------
  -- Check 2: 트랙 단독 삭제 반환값
  -- ----------------------------------------------------------------------------
  v_res := fn_delete_practice_track(jsonb_build_object('adminToken', v_token, 'trackId', v_track_2));
  if (v_res->>'success')::boolean is not true then
    raise exception 'Check 2 FAIL: fn_delete_practice_track failed: %', v_res;
  end if;
  if jsonb_array_length(v_res->'storageKeys') <> 1 or (v_res->'storageKeys'->>0) <> '2026/audio/track2_alt.m4a' then
    raise exception 'Check 2 FAIL: storageKeys should contain track2 key, got %', v_res->'storageKeys';
  end if;
  if exists (select 1 from practice_tracks where id = v_track_2) then
    raise exception 'Check 2 FAIL: track2 should be deleted from table';
  end if;

  -- ----------------------------------------------------------------------------
  -- Check 3: 공연 삭제 후 곡은 남아 있다
  -- ----------------------------------------------------------------------------
  v_res := fn_delete_performance(jsonb_build_object('adminToken', v_token, 'performanceId', v_perf_1));
  if (v_res->>'success')::boolean is not true then
    raise exception 'Check 3 FAIL: fn_delete_performance failed: %', v_res;
  end if;
  if exists (select 1 from performances where id = v_perf_1) then
    raise exception 'Check 3 FAIL: performance should be deleted from table';
  end if;
  if exists (select 1 from practice_performance_pieces where performance_id = v_perf_1) then
    raise exception 'Check 3 FAIL: performance-piece link should be deleted';
  end if;
  if not exists (select 1 from practice_pieces where id = v_piece_1) then
    raise exception 'Check 3 FAIL: piece1 must remain after performance deletion';
  end if;

  -- ----------------------------------------------------------------------------
  -- Check 1: 곡 삭제 시 트랙·공연 연결·시즌 카드 연결이 모두 사라지고,
  --          반환 storageKeys에 트랙 키와 악보 키가 들어 있다.
  -- ----------------------------------------------------------------------------
  v_res := fn_delete_practice_piece(jsonb_build_object('adminToken', v_token, 'pieceId', v_piece_1));
  if (v_res->>'success')::boolean is not true then
    raise exception 'Check 1 FAIL: fn_delete_practice_piece failed: %', v_res;
  end if;

  if exists (select 1 from practice_pieces where id = v_piece_1) then
    raise exception 'Check 1 FAIL: piece1 should be deleted';
  end if;
  if exists (select 1 from practice_tracks where piece_id = v_piece_1) then
    raise exception 'Check 1 FAIL: piece1 tracks should be deleted';
  end if;
  if exists (select 1 from practice_program_pieces where piece_id = v_piece_1) then
    raise exception 'Check 1 FAIL: piece1 program link should be deleted';
  end if;

  -- Check returned storageKeys contains both track1 and score
  select array_agg(value::text) into v_keys from jsonb_array_elements_text(v_res->'storageKeys');
  if not ('2026/score/piece1_score.pdf' = any(v_keys)) or not ('2026/audio/track1_sop.m4a' = any(v_keys)) then
    raise exception 'Check 1 FAIL: returned storageKeys must contain both score and remaining track, got %', v_res->'storageKeys';
  end if;

  raise notice 'v3_delete_check: ALL CHECKS PASSED';
end
$$;

rollback;
