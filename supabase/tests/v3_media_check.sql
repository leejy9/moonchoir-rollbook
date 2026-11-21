-- ==============================================================================
-- v3 Media & Storage Engine Verification Script (v3-A)
-- Run in transaction with ROLLBACK at the end so it leaves no test artifacts.
-- Any check failure raises an exception.
-- ==============================================================================
begin;

-- Verify migration has been applied
do $$
begin
  if to_regprocedure('fn_authorize_media_upload(text)') is null
     or to_regprocedure('fn_get_media_usage(text)') is null
     or to_regprocedure('fn_save_practice_piece(jsonb)') is null
     or to_regprocedure('fn_save_practice_track(jsonb)') is null
     or to_regprocedure('fn_get_practice_catalog(boolean, text)') is null then
    raise exception 'FAIL: 20261123000000_v3_media.sql has not been applied.';
  end if;
end
$$;

-- Setup temporary test entities
do $$
declare
  v_test_piece_id text := 'test_v3_media_piece_001';
  v_test_track_id text := 'test_v3_media_track_001';
  v_auth_res boolean;
  v_catalog jsonb;
  v_usage jsonb;
begin
  -- Create isolated test piece with score storage fields
  insert into practice_pieces (id, title, score_storage_key, score_size_bytes)
  values (v_test_piece_id, '미디어테스트곡', '2026/score/testscore1234567.pdf', 1048576)
  on conflict (id) do update set score_storage_key = excluded.score_storage_key, score_size_bytes = excluded.score_size_bytes;

  -- Create isolated test track with size_bytes
  insert into practice_tracks (id, piece_id, label, kind, source_type, size_bytes)
  values (v_test_track_id, v_test_piece_id, '소프라노 음원', 'PART', 'r2', 5242880)
  on conflict (id) do update set size_bytes = excluded.size_bytes;

  -- ----------------------------------------------------------------------------
  -- Check 1: fn_get_practice_catalog contains 3 new fields
  --   scoreStorageKey, scoreSizeBytes in pieces
  --   sizeBytes in tracks
  -- ----------------------------------------------------------------------------
  v_catalog := fn_get_practice_catalog(true, 'dummy_token');
  if not (v_catalog->'data'->'pieces'->0 ? 'scoreStorageKey') then
    raise exception 'Check 1-1 FAIL: pieces missing scoreStorageKey field in catalog response';
  end if;
  if not (v_catalog->'data'->'pieces'->0 ? 'scoreSizeBytes') then
    raise exception 'Check 1-2 FAIL: pieces missing scoreSizeBytes field in catalog response';
  end if;
  if not (v_catalog->'data'->'tracks'->0 ? 'sizeBytes') then
    raise exception 'Check 1-3 FAIL: tracks missing sizeBytes field in catalog response';
  end if;

  -- ----------------------------------------------------------------------------
  -- Check 2: fn_authorize_media_upload('short') -> false
  -- ----------------------------------------------------------------------------
  v_auth_res := fn_authorize_media_upload('short_invalid_token');
  if v_auth_res is not false then
    raise exception 'Check 2 FAIL: fn_authorize_media_upload with invalid token should be false, got %', v_auth_res;
  end if;

  -- ----------------------------------------------------------------------------
  -- Check 3: fn_get_media_usage with invalid token -> admin auth required
  -- ----------------------------------------------------------------------------
  v_usage := fn_get_media_usage('invalid_token');
  if (v_usage->>'success')::boolean is not false then
    raise exception 'Check 3 FAIL: fn_get_media_usage with invalid token should fail, got %', v_usage;
  end if;
end
$$;

rollback;
