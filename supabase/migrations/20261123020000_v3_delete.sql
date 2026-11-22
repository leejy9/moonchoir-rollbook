-- ==============================================================================
-- Migration: 20261123020000_v3_delete.sql
-- Description: v3-A Delete Operations for Pieces, Tracks, and Performances (V22, §4-2, §4-3, §7-7)
-- Target: Moonchoir Rollbook (Supabase PostgreSQL)
-- Safe to re-run: create or replace function
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Update prevent_row_deletion Trigger Function
-- ------------------------------------------------------------------------------
create or replace function prevent_row_deletion()
returns trigger as $$
begin
  if current_setting('moonchoir.allow_catalog_delete', true) = 'on' then
    return old;
  end if;
  raise exception 'Table % rows cannot be physically deleted. Use archiving (archived_at) instead.', TG_TABLE_NAME;
end;
$$ language plpgsql;

-- ------------------------------------------------------------------------------
-- 2. RPC: fn_delete_practice_piece(p_payload jsonb)
-- ------------------------------------------------------------------------------
create or replace function fn_delete_practice_piece(p_payload jsonb)
returns jsonb
security definer
set search_path = public, extensions
language plpgsql as $$
declare
  v_piece_id text;
  v_has_listen_sessions boolean := false;
  v_storage_keys text[];
begin
  if not fn_check_admin_token(p_payload->>'adminToken', 'admin') then
    return fn_admin_auth_required();
  end if;

  v_piece_id := trim(coalesce(p_payload->>'pieceId', ''));
  if v_piece_id = '' or not exists (select 1 from practice_pieces where id = v_piece_id) then
    return jsonb_build_object('success', false, 'message', '존재하지 않는 곡입니다.');
  end if;

  -- 재생 기록 확인 (v3-C 테이블이 있을 때만 확인)
  if to_regclass('public.practice_listen_sessions') is not null then
    execute format('select exists (select 1 from public.practice_listen_sessions where piece_id = %L)', v_piece_id)
      into v_has_listen_sessions;
    if v_has_listen_sessions then
      return jsonb_build_object('success', false, 'message', '재생 기록이 있어 삭제할 수 없어요. 보관해 주세요.');
    end if;
  end if;

  -- 지워질 대상 R2 storage_key 수집 (트랙 키들 + 악보 키, 빈 값 제외)
  select array_agg(k) into v_storage_keys
  from (
    select storage_key as k from practice_tracks where piece_id = v_piece_id and coalesce(storage_key, '') <> ''
    union
    select score_storage_key as k from practice_pieces where id = v_piece_id and coalesce(score_storage_key, '') <> ''
  ) s;

  -- 삭제 트리거 우회 활성화 (현재 트랜잭션 한정)
  perform set_config('moonchoir.allow_catalog_delete', 'on', true);

  -- 삭제 순서: 공연 연결 -> 시즌 카드 연결 -> 트랙 -> 곡
  delete from practice_performance_pieces where piece_id = v_piece_id;
  delete from practice_program_pieces where piece_id = v_piece_id;
  delete from practice_tracks where piece_id = v_piece_id;
  delete from practice_pieces where id = v_piece_id;

  return jsonb_build_object(
    'success', true,
    'storageKeys', coalesce(to_jsonb(v_storage_keys), '[]'::jsonb)
  );
end;
$$;

revoke all on function fn_delete_practice_piece(jsonb) from public;
grant execute on function fn_delete_practice_piece(jsonb) to anon, authenticated;

-- ------------------------------------------------------------------------------
-- 3. RPC: fn_delete_practice_track(p_payload jsonb)
-- ------------------------------------------------------------------------------
create or replace function fn_delete_practice_track(p_payload jsonb)
returns jsonb
security definer
set search_path = public, extensions
language plpgsql as $$
declare
  v_track_id text;
  v_has_listen_sessions boolean := false;
  v_storage_key text;
  v_storage_keys text[];
begin
  if not fn_check_admin_token(p_payload->>'adminToken', 'admin') then
    return fn_admin_auth_required();
  end if;

  v_track_id := trim(coalesce(p_payload->>'trackId', ''));
  if v_track_id = '' or not exists (select 1 from practice_tracks where id = v_track_id) then
    return jsonb_build_object('success', false, 'message', '존재하지 않는 트랙입니다.');
  end if;

  -- 재생 기록 확인 (v3-C 테이블이 있을 때만 확인)
  if to_regclass('public.practice_listen_sessions') is not null then
    execute format('select exists (select 1 from public.practice_listen_sessions where track_id = %L)', v_track_id)
      into v_has_listen_sessions;
    if v_has_listen_sessions then
      return jsonb_build_object('success', false, 'message', '재생 기록이 있어 삭제할 수 없어요. 보관해 주세요.');
    end if;
  end if;

  -- 지워질 대상 R2 storage_key 수집
  select storage_key into v_storage_key from practice_tracks where id = v_track_id;
  if coalesce(v_storage_key, '') <> '' then
    v_storage_keys := array[v_storage_key];
  else
    v_storage_keys := array[]::text[];
  end if;

  -- 삭제 트리거 우회 활성화 (현재 트랜잭션 한정)
  perform set_config('moonchoir.allow_catalog_delete', 'on', true);

  delete from practice_tracks where id = v_track_id;

  return jsonb_build_object(
    'success', true,
    'storageKeys', coalesce(to_jsonb(v_storage_keys), '[]'::jsonb)
  );
end;
$$;

revoke all on function fn_delete_practice_track(jsonb) from public;
grant execute on function fn_delete_practice_track(jsonb) to anon, authenticated;

-- ------------------------------------------------------------------------------
-- 4. RPC: fn_delete_performance(p_payload jsonb)
-- ------------------------------------------------------------------------------
create or replace function fn_delete_performance(p_payload jsonb)
returns jsonb
security definer
set search_path = public, extensions
language plpgsql as $$
declare
  v_perf_id text;
begin
  if not fn_check_admin_token(p_payload->>'adminToken', 'admin') then
    return fn_admin_auth_required();
  end if;

  v_perf_id := trim(coalesce(p_payload->>'performanceId', ''));
  if v_perf_id = '' or not exists (select 1 from performances where id = v_perf_id) then
    return jsonb_build_object('success', false, 'message', '존재하지 않는 공연입니다.');
  end if;

  -- 삭제 트리거 우회 활성화 (현재 트랜잭션 한정)
  perform set_config('moonchoir.allow_catalog_delete', 'on', true);

  -- 공연의 곡 연결 삭제 후 공연 삭제 (곡 자체는 남김)
  delete from practice_performance_pieces where performance_id = v_perf_id;
  delete from performances where id = v_perf_id;

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function fn_delete_performance(jsonb) from public;
grant execute on function fn_delete_performance(jsonb) to anon, authenticated;
