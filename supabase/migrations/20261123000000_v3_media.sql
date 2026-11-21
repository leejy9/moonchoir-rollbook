-- ==============================================================================
-- Migration: 20261123000000_v3_media.sql
-- Description: v3 Media & Storage Engine (Score/track storage keys, upload auth, usage audit)
--
-- Objects created / altered:
--   1. Table Columns Added:
--        practice_pieces (score_storage_key text, score_size_bytes bigint)
--        practice_tracks (size_bytes bigint)
--   2. Functions:
--        fn_authorize_media_upload(p_token text)
--        fn_get_media_usage(p_token text)
--        fn_save_practice_piece(p_payload jsonb) [updated with score storage fields]
--        fn_save_practice_track(p_payload jsonb) [updated with size_bytes field]
--        fn_get_practice_catalog(p_include_archived boolean, p_token text) [updated with new fields]
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Table Columns Added (score_storage_key, score_size_bytes, size_bytes)
-- ------------------------------------------------------------------------------
alter table practice_pieces
  add column if not exists score_storage_key text not null default '',
  add column if not exists score_size_bytes bigint check (score_size_bytes is null or score_size_bytes >= 0);

alter table practice_tracks
  add column if not exists size_bytes bigint check (size_bytes is null or size_bytes >= 0);

-- ------------------------------------------------------------------------------
-- 2. RPC: fn_authorize_media_upload (Worker upload authorization wrapper)
-- ------------------------------------------------------------------------------
create or replace function fn_authorize_media_upload(p_token text)
returns boolean
security definer
set search_path = public, extensions
language plpgsql as $$
begin
  return fn_check_admin_token(p_token, 'admin');
end;
$$;
revoke all on function fn_authorize_media_upload(text) from public;
grant execute on function fn_authorize_media_upload(text) to anon, authenticated;

-- ------------------------------------------------------------------------------
-- 3. RPC: fn_get_media_usage (Admin media storage usage audit)
-- ------------------------------------------------------------------------------
create or replace function fn_get_media_usage(p_token text)
returns jsonb
security definer
set search_path = public, extensions
language plpgsql as $$
declare
  v_tracks_bytes bigint;
  v_scores_bytes bigint;
  v_total_bytes bigint;
begin
  if not fn_check_admin_token(p_token, 'admin') then
    return fn_admin_auth_required();
  end if;

  select coalesce(sum(size_bytes), 0) into v_tracks_bytes from practice_tracks;
  select coalesce(sum(score_size_bytes), 0) into v_scores_bytes from practice_pieces;
  v_total_bytes := v_tracks_bytes + v_scores_bytes;

  return jsonb_build_object(
    'success', true,
    'tracksBytes', v_tracks_bytes,
    'scoresBytes', v_scores_bytes,
    'totalBytes', v_total_bytes
  );
end;
$$;
revoke all on function fn_get_media_usage(text) from public;
grant execute on function fn_get_media_usage(text) to anon, authenticated;

-- ------------------------------------------------------------------------------
-- 4. Updated: fn_save_practice_piece
-- Source: supabase/migrations/20261122000000_practice_catalog.sql:211-262
-- Updated lines: add scoreStorageKey and scoreSizeBytes to variables, insert, and update
-- ------------------------------------------------------------------------------
create or replace function fn_save_practice_piece(p_payload jsonb)
returns jsonb
security definer
set search_path = public, extensions
language plpgsql as $$
declare
  v_id text;
  v_title text;
  v_score_url text;
  v_score_storage_key text;
  v_score_size_bytes bigint;
begin
  if not fn_check_admin_token(p_payload->>'adminToken', 'admin') then
    return fn_admin_auth_required();
  end if;

  v_id := trim(coalesce(p_payload->>'id', ''));
  v_title := trim(coalesce(p_payload->>'title', ''));
  v_score_url := trim(coalesce(p_payload->>'scoreUrl', p_payload->>'score_url', ''));
  v_score_storage_key := trim(coalesce(p_payload->>'scoreStorageKey', p_payload->>'score_storage_key', ''));
  v_score_size_bytes := (nullif(trim(coalesce(p_payload->>'scoreSizeBytes', p_payload->>'score_size_bytes', '')), ''))::bigint;

  if v_title = '' then
    return jsonb_build_object('success', false, 'message', '곡 제목은 필수입니다.');
  end if;

  if v_id = '' then
    v_id := 'piece_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12);
  end if;

  if v_score_url <> '' and not (v_score_url ilike 'https://%') then
    return jsonb_build_object('success', false, 'message', 'https 주소만 저장할 수 있습니다.');
  end if;

  insert into practice_pieces (
    id, title, composer, arranger, score_url, score_storage_key, score_size_bytes, notes, updated_at
  ) values (
    v_id,
    v_title,
    trim(coalesce(p_payload->>'composer', '')),
    trim(coalesce(p_payload->>'arranger', '')),
    v_score_url,
    v_score_storage_key,
    v_score_size_bytes,
    trim(coalesce(p_payload->>'notes', '')),
    now()
  )
  on conflict (id) do update set
    title = excluded.title,
    composer = excluded.composer,
    arranger = excluded.arranger,
    score_url = excluded.score_url,
    score_storage_key = excluded.score_storage_key,
    score_size_bytes = excluded.score_size_bytes,
    notes = excluded.notes,
    updated_at = now();

  return jsonb_build_object('success', true, 'message', '연습곡이 저장되었습니다.', 'id', v_id);
end;
$$;
revoke all on function fn_save_practice_piece(jsonb) from public;
grant execute on function fn_save_practice_piece(jsonb) to anon, authenticated;

-- ------------------------------------------------------------------------------
-- 5. Updated: fn_save_practice_track
-- Source: supabase/migrations/20261122010000_review_followups.sql:124-212
-- Updated lines: add sizeBytes to variables, insert, and update
-- ------------------------------------------------------------------------------
create or replace function fn_save_practice_track(p_payload jsonb)
returns jsonb
security definer
set search_path = public, extensions
language plpgsql as $$
declare
  v_id text;
  v_piece_id text;
  v_label text;
  v_kind text;
  v_source text;
  v_url text;
  v_storage_key text;
  v_order_index integer;
  v_mime text;
  v_duration_raw text;
  v_duration integer;
  v_size_bytes bigint;
begin
  if not fn_check_admin_token(p_payload->>'adminToken', 'admin') then
    return fn_admin_auth_required();
  end if;

  v_id := trim(coalesce(p_payload->>'id', ''));
  v_piece_id := trim(coalesce(p_payload->>'pieceId', p_payload->>'piece_id', ''));
  v_label := trim(coalesce(p_payload->>'label', ''));
  v_kind := trim(coalesce(p_payload->>'kind', ''));
  v_source := lower(trim(coalesce(p_payload->>'source', p_payload->>'source_type', '')));
  v_url := trim(coalesce(p_payload->>'url', ''));
  v_storage_key := trim(coalesce(p_payload->>'storageKey', p_payload->>'storage_key', ''));
  v_order_index := coalesce((nullif(trim(coalesce(p_payload->>'orderIndex', p_payload->>'order_index', '')), ''))::integer, 0);
  v_mime := trim(coalesce(p_payload->>'mimeType', p_payload->>'mime_type', ''));
  v_size_bytes := (nullif(trim(coalesce(p_payload->>'sizeBytes', p_payload->>'size_bytes', '')), ''))::bigint;

  v_duration_raw := trim(coalesce(p_payload->>'durationSeconds', p_payload->>'duration_seconds', ''));
  if v_duration_raw <> '' then
    if v_duration_raw !~ '^\d+$' then
      return jsonb_build_object('success', false, 'message', '재생 시간은 숫자로 입력해 주세요.');
    end if;
    v_duration := v_duration_raw::integer;
  else
    v_duration := null;
  end if;

  if v_piece_id = '' or not exists(select 1 from practice_pieces where id = v_piece_id) then
    return jsonb_build_object('success', false, 'message', '유효한 연습곡 ID가 필요합니다.');
  end if;

  if v_label = '' then
    return jsonb_build_object('success', false, 'message', '트랙 라벨을 입력해 주세요.');
  end if;

  if v_url <> '' and not (v_url ilike 'https://%') then
    return jsonb_build_object('success', false, 'message', 'https 주소만 저장할 수 있습니다.');
  end if;

  if v_id = '' then
    v_id := 'track_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12);
  end if;

  insert into practice_tracks (
    id, piece_id, label, kind, source_type, url, storage_key, mime_type,
    duration_seconds, size_bytes, order_index, updated_at
  ) values (
    v_id,
    v_piece_id,
    v_label,
    v_kind,
    v_source,
    v_url,
    v_storage_key,
    v_mime,
    v_duration,
    v_size_bytes,
    v_order_index,
    now()
  )
  on conflict (id) do update set
    piece_id = excluded.piece_id,
    label = excluded.label,
    kind = excluded.kind,
    source_type = excluded.source_type,
    url = excluded.url,
    storage_key = excluded.storage_key,
    mime_type = excluded.mime_type,
    duration_seconds = excluded.duration_seconds,
    size_bytes = excluded.size_bytes,
    order_index = excluded.order_index,
    updated_at = now();

  return jsonb_build_object('success', true, 'message', '트랙이 저장되었습니다.', 'id', v_id);
end;
$$;
revoke all on function fn_save_practice_track(jsonb) from public;
grant execute on function fn_save_practice_track(jsonb) to anon, authenticated;

-- ------------------------------------------------------------------------------
-- 6. Updated: fn_get_practice_catalog
-- Source: supabase/migrations/20261122010000_review_followups.sql:295-373
-- Updated lines: include scoreStorageKey, scoreSizeBytes in pieces, sizeBytes in tracks
-- ------------------------------------------------------------------------------
create or replace function fn_get_practice_catalog(
  p_include_archived boolean default false,
  p_token text default null
)
returns jsonb
security definer
set search_path = public, extensions
language plpgsql as $$
declare
  v_can_include_archived boolean := false;
  v_pieces jsonb;
  v_tracks jsonb;
  v_program_pieces jsonb;
begin
  if p_include_archived then
    v_can_include_archived := fn_check_admin_token(p_token, 'admin');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'title', title,
    'composer', composer,
    'arranger', arranger,
    'scoreUrl', score_url,
    'scoreStorageKey', score_storage_key,
    'scoreSizeBytes', score_size_bytes,
    'notes', notes,
    'isArchived', (archived_at is not null),
    'archivedAt', archived_at,
    'createdAt', created_at,
    'updatedAt', updated_at
  ) order by created_at asc, id asc), '[]'::jsonb)
  into v_pieces
  from practice_pieces
  where v_can_include_archived or archived_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'pieceId', piece_id,
    'label', label,
    'kind', kind,
    'source', source_type,
    'url', url,
    'storageKey', storage_key,
    'mimeType', mime_type,
    'durationSeconds', duration_seconds,
    'sizeBytes', size_bytes,
    'orderIndex', order_index,
    'isArchived', (archived_at is not null),
    'archivedAt', archived_at,
    'createdAt', created_at,
    'updatedAt', updated_at
  ) order by order_index asc, created_at asc, id asc), '[]'::jsonb)
  into v_tracks
  from practice_tracks
  where v_can_include_archived or archived_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'programId', program_id,
    'pieceId', piece_id,
    'orderIndex', order_index,
    'isArchived', (archived_at is not null),
    'archivedAt', archived_at,
    'createdAt', created_at
  ) order by order_index asc, created_at asc), '[]'::jsonb)
  into v_program_pieces
  from practice_program_pieces
  where v_can_include_archived or archived_at is null;

  return jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'pieces', v_pieces,
      'tracks', v_tracks,
      'programPieces', v_program_pieces
    )
  );
end;
$$;
revoke all on function fn_get_practice_catalog(boolean, text) from public;
grant execute on function fn_get_practice_catalog(boolean, text) to anon, authenticated;
