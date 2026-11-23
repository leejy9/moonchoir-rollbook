-- ==============================================================================
-- Migration: 20261123010000_v3_performances.sql
-- Description: v3-A Separate Performances Unit (V18, §3-1, §4-2, §4-3, §7-6)
-- Target: Moonchoir Rollbook (Supabase PostgreSQL)
-- Safe to re-run: if not exists, drop trigger if exists, create or replace function
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Table: performances (RLS Enabled, No Physical Delete)
-- ------------------------------------------------------------------------------
create table if not exists performances (
  id text primary key,
  title text not null check (length(title) between 1 and 100),
  performance_date text not null default '' check (performance_date = '' or performance_date ~ '^\d{4}-\d{2}-\d{2}$'),
  venue text not null default '' check (length(venue) <= 100),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table performances enable row level security;
revoke all on table performances from public, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 2. Table: practice_performance_pieces (RLS Enabled, No Physical Delete)
-- ------------------------------------------------------------------------------
create table if not exists practice_performance_pieces (
  performance_id text not null references performances(id) on delete restrict,
  piece_id text not null references practice_pieces(id) on delete restrict,
  order_index integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (performance_id, piece_id)
);

alter table practice_performance_pieces enable row level security;
revoke all on table practice_performance_pieces from public, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 3. Triggers: Immutability / Deletion Prevention & updated_at
-- ------------------------------------------------------------------------------
drop trigger if exists trg_performances_no_delete on performances;
create trigger trg_performances_no_delete
  before delete on performances
  for each row execute function prevent_row_deletion();

drop trigger if exists trg_practice_performance_pieces_no_delete on practice_performance_pieces;
create trigger trg_practice_performance_pieces_no_delete
  before delete on practice_performance_pieces
  for each row execute function prevent_row_deletion();

drop trigger if exists trg_performances_updated_at on performances;
create trigger trg_performances_updated_at
  before update on performances
  for each row execute function set_updated_at();

-- ------------------------------------------------------------------------------
-- 4. RPC: fn_save_performance (Admin Write)
-- ------------------------------------------------------------------------------
create or replace function fn_save_performance(p_payload jsonb)
returns jsonb
security definer
set search_path = public, extensions
language plpgsql as $$
declare
  v_id text;
  v_title text;
  v_date text;
  v_venue text;
begin
  if not fn_check_admin_token(p_payload->>'adminToken', 'admin') then
    return fn_admin_auth_required();
  end if;

  v_id := trim(coalesce(p_payload->>'id', ''));
  v_title := trim(coalesce(p_payload->>'title', ''));
  v_date := trim(coalesce(p_payload->>'performanceDate', p_payload->>'performance_date', ''));
  v_venue := trim(coalesce(p_payload->>'venue', ''));

  if v_title = '' or length(v_title) > 100 then
    return jsonb_build_object('success', false, 'message', '공연 이름은 1~100자여야 합니다.');
  end if;

  if v_date <> '' and v_date !~ '^\d{4}-\d{2}-\d{2}$' then
    return jsonb_build_object('success', false, 'message', '공연 날짜 형식이 올바르지 않습니다.');
  end if;

  if length(v_venue) > 100 then
    return jsonb_build_object('success', false, 'message', '공연 장소는 100자 이하여야 합니다.');
  end if;

  if v_id = '' then
    v_id := 'perf_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 12));
    insert into performances (id, title, performance_date, venue)
    values (v_id, v_title, v_date, v_venue);
  else
    insert into performances (id, title, performance_date, venue)
    values (v_id, v_title, v_date, v_venue)
    on conflict (id) do update
      set title = excluded.title,
          performance_date = excluded.performance_date,
          venue = excluded.venue;
  end if;

  return jsonb_build_object('success', true, 'id', v_id);
exception when others then
  return jsonb_build_object('success', false, 'message', SQLERRM);
end;
$$;

revoke all on function fn_save_performance(jsonb) from public;
grant execute on function fn_save_performance(jsonb) to anon, authenticated;

-- ------------------------------------------------------------------------------
-- 5. RPC: fn_set_performance_archived (Admin Write)
-- ------------------------------------------------------------------------------
create or replace function fn_set_performance_archived(p_payload jsonb)
returns jsonb
security definer
set search_path = public, extensions
language plpgsql as $$
declare
  v_performance_id text;
  v_archived boolean;
begin
  if not fn_check_admin_token(p_payload->>'adminToken', 'admin') then
    return fn_admin_auth_required();
  end if;

  v_performance_id := trim(coalesce(p_payload->>'performanceId', p_payload->>'performance_id', ''));
  v_archived := coalesce((p_payload->>'archived')::boolean, false);

  if v_performance_id = '' or not exists(select 1 from performances where id = v_performance_id) then
    return jsonb_build_object('success', false, 'message', '공연을 찾을 수 없습니다.');
  end if;

  update performances
     set archived_at = (case when v_archived then coalesce(archived_at, now()) else null end)
   where id = v_performance_id;

  return jsonb_build_object(
    'success', true,
    'message', case when v_archived then '공연이 보관되었습니다.' else '공연이 복원되었습니다.' end
  );
exception when others then
  return jsonb_build_object('success', false, 'message', SQLERRM);
end;
$$;

revoke all on function fn_set_performance_archived(jsonb) from public;
grant execute on function fn_set_performance_archived(jsonb) to anon, authenticated;

-- ------------------------------------------------------------------------------
-- 6. RPC: fn_set_performance_pieces (Admin Write, Single Transaction)
-- Source: supabase/migrations/20261122000000_practice_catalog.sql:414 (fn_set_program_pieces)
-- Enhancements:
--   1) Duplicate piece ID validation
--   2) Max 200 pieces validation
--   3) Block modification on archived performance
-- ------------------------------------------------------------------------------
create or replace function fn_set_performance_pieces(p_payload jsonb)
returns jsonb
security definer
set search_path = public, extensions
language plpgsql as $$
declare
  v_performance_id text;
  v_pieces_json jsonb;
  v_piece_id text;
  v_idx integer := 0;
  v_seen_ids text[] := array[]::text[];
begin
  if not fn_check_admin_token(p_payload->>'adminToken', 'admin') then
    return fn_admin_auth_required();
  end if;

  v_performance_id := trim(coalesce(p_payload->>'performanceId', p_payload->>'performance_id', ''));
  if v_performance_id = '' or not exists(select 1 from performances where id = v_performance_id) then
    return jsonb_build_object('success', false, 'message', '유효한 공연 ID가 필요합니다.');
  end if;

  if exists(select 1 from performances where id = v_performance_id and archived_at is not null) then
    return jsonb_build_object('success', false, 'message', '보관된 공연의 곡 목록은 변경할 수 없습니다.');
  end if;

  v_pieces_json := coalesce(p_payload->'pieceIds', p_payload->'pieces', '[]'::jsonb);

  if jsonb_array_length(v_pieces_json) > 200 then
    return jsonb_build_object('success', false, 'message', '한 공연에는 최대 200곡까지 넣을 수 있습니다.');
  end if;

  for i in 0 .. jsonb_array_length(v_pieces_json) - 1 loop
    if jsonb_typeof(v_pieces_json->i) = 'object' then
      v_piece_id := trim(coalesce(v_pieces_json->i->>'pieceId', v_pieces_json->i->>'piece_id', ''));
    else
      v_piece_id := trim(coalesce(v_pieces_json->>i, ''));
    end if;

    if v_piece_id <> '' then
      if v_piece_id = any(v_seen_ids) then
        return jsonb_build_object('success', false, 'message', '중복된 곡이 있습니다.');
      end if;

      if not exists(select 1 from practice_pieces where id = v_piece_id) then
        raise exception '연습곡 ID(%)가 존재하지 않습니다.', v_piece_id;
      end if;

      insert into practice_performance_pieces (performance_id, piece_id, order_index, archived_at)
      values (v_performance_id, v_piece_id, v_idx, null)
      on conflict (performance_id, piece_id) do update
        set order_index = excluded.order_index,
            archived_at = null;

      v_seen_ids := array_append(v_seen_ids, v_piece_id);
      v_idx := v_idx + 1;
    end if;
  end loop;

  -- Archive links not in the given list
  update practice_performance_pieces
     set archived_at = coalesce(archived_at, now())
   where performance_id = v_performance_id
     and (cardinality(v_seen_ids) = 0 or piece_id != all(v_seen_ids))
     and archived_at is null;

  return jsonb_build_object('success', true, 'message', '공연 곡 목록이 저장되었습니다.');
exception when others then
  return jsonb_build_object('success', false, 'message', SQLERRM);
end;
$$;

revoke all on function fn_set_performance_pieces(jsonb) from public;
grant execute on function fn_set_performance_pieces(jsonb) to anon, authenticated;

-- ------------------------------------------------------------------------------
-- 7. Updated: fn_get_practice_catalog (Catalog Read with Performances)
-- Source: supabase/migrations/20261123000000_v3_media.sql:248
-- Updated lines: include performances and performancePieces arrays
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
  v_performances jsonb;
  v_performance_pieces jsonb;
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

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'title', title,
    'performanceDate', performance_date,
    'venue', venue,
    'isArchived', (archived_at is not null),
    'archivedAt', archived_at,
    'createdAt', created_at,
    'updatedAt', updated_at
  ) order by performance_date asc nulls last, created_at asc, id asc), '[]'::jsonb)
  into v_performances
  from performances
  where v_can_include_archived or archived_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'performanceId', performance_id,
    'pieceId', piece_id,
    'orderIndex', order_index,
    'isArchived', (archived_at is not null),
    'archivedAt', archived_at,
    'createdAt', created_at
  ) order by order_index asc, created_at asc), '[]'::jsonb)
  into v_performance_pieces
  from practice_performance_pieces
  where v_can_include_archived or archived_at is null;

  return jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'pieces', v_pieces,
      'tracks', v_tracks,
      'programPieces', v_program_pieces,
      'performances', v_performances,
      'performancePieces', v_performance_pieces
    )
  );
end;
$$;

revoke all on function fn_get_practice_catalog(boolean, text) from public;
grant execute on function fn_get_practice_catalog(boolean, text) to anon, authenticated;
