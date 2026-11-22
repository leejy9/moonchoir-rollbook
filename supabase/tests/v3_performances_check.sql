-- ==============================================================================
-- Verification Script: v3_performances_check.sql
-- Description: Verification for 20261123010000_v3_performances.sql
-- Run in transaction with ROLLBACK at the end so it leaves no test artifacts.
-- Any check failure raises an exception.
-- ==============================================================================
begin;

-- Verify migration procedures exist
do $$
begin
  if to_regprocedure('fn_save_performance(jsonb)') is null
     or to_regprocedure('fn_set_performance_archived(jsonb)') is null
     or to_regprocedure('fn_set_performance_pieces(jsonb)') is null
     or to_regprocedure('fn_get_practice_catalog(boolean, text)') is null then
    raise exception 'FAIL: 20261123010000_v3_performances.sql has not been applied.';
  end if;
end
$$;

do $$
declare
  v_token text;
  v_save_res jsonb;
  v_perf_id text;
  v_piece_1 text := 'test_perf_piece_001';
  v_piece_2 text := 'test_perf_piece_002';
  v_piece_3 text := 'test_perf_piece_003';
  v_order_res jsonb;
  v_archived_at_val timestamptz;
  v_row_count integer;
  v_del_error boolean := false;
  v_catalog jsonb;
  v_arch_res jsonb;
begin
  -- Create a valid admin session for test authentication (32+ chars)
  v_token := 'test_admin_token_for_performances_check_32chars';
  insert into admin_sessions (token_hash, tier, expires_at)
  values (fn_admin_token_hash(v_token), 'admin', now() + interval '1 hour');

  -- Create dummy test practice pieces
  insert into practice_pieces (id, title) values (v_piece_1, '공연곡1') on conflict (id) do nothing;
  insert into practice_pieces (id, title) values (v_piece_2, '공연곡2') on conflict (id) do nothing;
  insert into practice_pieces (id, title) values (v_piece_3, '공연곡3') on conflict (id) do nothing;

  -- ----------------------------------------------------------------------------
  -- Check 1: 저장 성공 / 빈 제목 거부 / 날짜 형식 오류 거부 / 토큰 오류 거부
  -- ----------------------------------------------------------------------------
  -- 1-1. 저장 성공
  v_save_res := fn_save_performance(jsonb_build_object(
    'adminToken', v_token,
    'title', '제1회 정기연주회',
    'performanceDate', '2026-12-14',
    'venue', '인천아트센터 콘서트홀'
  ));
  if (v_save_res->>'success')::boolean is not true then
    raise exception 'Check 1-1 FAIL: fn_save_performance should succeed, got %', v_save_res;
  end if;
  v_perf_id := v_save_res->>'id';
  if v_perf_id is null or v_perf_id = '' or not v_perf_id ~ '^perf_' then
    raise exception 'Check 1-1 FAIL: invalid performance id generated: %', v_perf_id;
  end if;

  -- 1-2. 빈 제목 거부
  v_save_res := fn_save_performance(jsonb_build_object(
    'adminToken', v_token,
    'title', '   ',
    'performanceDate', '2026-12-14'
  ));
  if (v_save_res->>'success')::boolean is not false then
    raise exception 'Check 1-2 FAIL: empty title should be rejected, got %', v_save_res;
  end if;

  -- 1-3. 날짜 형식 오류 거부
  v_save_res := fn_save_performance(jsonb_build_object(
    'adminToken', v_token,
    'title', '정기연주회',
    'performanceDate', '2026/12/14'
  ));
  if (v_save_res->>'success')::boolean is not false then
    raise exception 'Check 1-3 FAIL: invalid date format should be rejected, got %', v_save_res;
  end if;

  -- 1-4. 토큰 오류 거부
  v_save_res := fn_save_performance(jsonb_build_object(
    'adminToken', 'invalid_fake_token',
    'title', '정기연주회'
  ));
  if (v_save_res->>'success')::boolean is not false then
    raise exception 'Check 1-4 FAIL: invalid token should be rejected, got %', v_save_res;
  end if;

  -- ----------------------------------------------------------------------------
  -- Check 2: 순서 저장 후 order_index 0, 1, 2
  -- ----------------------------------------------------------------------------
  v_order_res := fn_set_performance_pieces(jsonb_build_object(
    'adminToken', v_token,
    'performanceId', v_perf_id,
    'pieceIds', jsonb_build_array(v_piece_1, v_piece_2, v_piece_3)
  ));
  if (v_order_res->>'success')::boolean is not true then
    raise exception 'Check 2 FAIL: fn_set_performance_pieces should succeed, got %', v_order_res;
  end if;

  select count(*) into v_row_count
  from practice_performance_pieces
  where performance_id = v_perf_id
    and archived_at is null
    and (
      (piece_id = v_piece_1 and order_index = 0) or
      (piece_id = v_piece_2 and order_index = 1) or
      (piece_id = v_piece_3 and order_index = 2)
    );
  if v_row_count <> 3 then
    raise exception 'Check 2 FAIL: expected 3 pieces with order_index 0,1,2, got %', v_row_count;
  end if;

  -- ----------------------------------------------------------------------------
  -- Check 3: 목록에서 뺀 곡은 archived_at이 채워짐 (행은 남음)
  -- ----------------------------------------------------------------------------
  -- Exclude v_piece_2
  v_order_res := fn_set_performance_pieces(jsonb_build_object(
    'adminToken', v_token,
    'performanceId', v_perf_id,
    'pieceIds', jsonb_build_array(v_piece_1, v_piece_3)
  ));
  if (v_order_res->>'success')::boolean is not true then
    raise exception 'Check 3 FAIL: fn_set_performance_pieces update should succeed, got %', v_order_res;
  end if;

  select archived_at into v_archived_at_val
  from practice_performance_pieces
  where performance_id = v_perf_id and piece_id = v_piece_2;

  if v_archived_at_val is null then
    raise exception 'Check 3 FAIL: excluded piece_2 must have archived_at set';
  end if;

  select count(*) into v_row_count
  from practice_performance_pieces
  where performance_id = v_perf_id;
  if v_row_count <> 3 then
    raise exception 'Check 3 FAIL: physical row must remain (expected 3, got %)', v_row_count;
  end if;

  -- ----------------------------------------------------------------------------
  -- Check 4: 중복 id 거부, 보관된 공연 거부
  -- ----------------------------------------------------------------------------
  -- 4-1. 중복 id 거부
  v_order_res := fn_set_performance_pieces(jsonb_build_object(
    'adminToken', v_token,
    'performanceId', v_perf_id,
    'pieceIds', jsonb_build_array(v_piece_1, v_piece_1)
  ));
  if (v_order_res->>'success')::boolean is not false
     or v_order_res->>'message' <> '중복된 곡이 있습니다.' then
    raise exception 'Check 4-1 FAIL: duplicate piece IDs should be rejected with message, got %', v_order_res;
  end if;

  -- 4-2. 보관된 공연 거부
  v_arch_res := fn_set_performance_archived(jsonb_build_object(
    'adminToken', v_token,
    'performanceId', v_perf_id,
    'archived', true
  ));
  if (v_arch_res->>'success')::boolean is not true then
    raise exception 'Check 4-2 setup FAIL: archiving performance failed, got %', v_arch_res;
  end if;

  v_order_res := fn_set_performance_pieces(jsonb_build_object(
    'adminToken', v_token,
    'performanceId', v_perf_id,
    'pieceIds', jsonb_build_array(v_piece_1)
  ));
  if (v_order_res->>'success')::boolean is not false
     or v_order_res->>'message' <> '보관된 공연의 곡 목록은 변경할 수 없습니다.' then
    raise exception 'Check 4-2 FAIL: modifying archived performance pieces must be rejected, got %', v_order_res;
  end if;

  -- Restore performance for subsequent checks
  perform fn_set_performance_archived(jsonb_build_object(
    'adminToken', v_token,
    'performanceId', v_perf_id,
    'archived', false
  ));

  -- ----------------------------------------------------------------------------
  -- Check 5: 두 테이블 delete 거부 (물리 삭제 방지)
  -- ----------------------------------------------------------------------------
  v_del_error := false;
  begin
    delete from practice_performance_pieces where performance_id = v_perf_id;
  exception when others then
    v_del_error := true;
  end;
  if not v_del_error then
    raise exception 'Check 5-1 FAIL: delete on practice_performance_pieces must raise error';
  end if;

  v_del_error := false;
  begin
    delete from performances where id = v_perf_id;
  exception when others then
    v_del_error := true;
  end;
  if not v_del_error then
    raise exception 'Check 5-2 FAIL: delete on performances must raise error';
  end if;

  -- ----------------------------------------------------------------------------
  -- Check 6: 카탈로그 응답에 performances, performancePieces 키가 있고 기존 programPieces도 있음
  -- ----------------------------------------------------------------------------
  v_catalog := fn_get_practice_catalog(true, v_token);
  if not (v_catalog->'data' ? 'performances') then
    raise exception 'Check 6-1 FAIL: catalog missing performances key';
  end if;
  if not (v_catalog->'data' ? 'performancePieces') then
    raise exception 'Check 6-2 FAIL: catalog missing performancePieces key';
  end if;
  if not (v_catalog->'data' ? 'programPieces') then
    raise exception 'Check 6-3 FAIL: catalog missing original programPieces key';
  end if;
end
$$;

rollback;
