-- ==============================================================================
-- Moonchoir Rollbook — Practice Catalog & Media Infrastructure (20261122000000_practice_catalog.sql)
--
-- 1. Practice pieces master table (practice_pieces)
-- 2. Practice pieces ↔ Program cards link table (practice_program_pieces, N:M)
-- 3. Practice audio/video tracks table (practice_tracks)
-- 4. Delete-prevention triggers (Archive-Only / Append-Only Invariant)
-- 5. Updated_at triggers
-- 6. RPCs with Phase 0 admin session token enforcement (7 functions)
-- 7. Update fn_delete_program_card__impl to protect against deleting cards with linked pieces
--
-- Idempotent: safe to run more than once.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Tables (create if not exists)
-- ------------------------------------------------------------------------------
create table if not exists practice_pieces (
  id text primary key,
  title text not null,
  composer text not null default '',
  arranger text not null default '',
  score_url text not null default '',
  notes text not null default '',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists practice_program_pieces (
  program_id text not null references program_cards(id) on delete restrict,
  piece_id   text not null references practice_pieces(id) on delete restrict,
  order_index integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (program_id, piece_id)
);

create table if not exists practice_tracks (
  id text primary key,
  piece_id text not null references practice_pieces(id) on delete restrict,
  label text not null,
  kind text not null default '',
  source_type text not null default '',
  url text not null default '',
  storage_key text not null default '',
  mime_type text not null default '',
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  order_index integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS enabled with zero direct policies; access strictly through SECURITY DEFINER RPCs
alter table practice_pieces enable row level security;
alter table practice_program_pieces enable row level security;
alter table practice_tracks enable row level security;

revoke all on table practice_pieces from public, anon, authenticated;
revoke all on table practice_program_pieces from public, anon, authenticated;
revoke all on table practice_tracks from public, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 2. Immutability / Deletion Prevention Triggers
-- ------------------------------------------------------------------------------
create or replace function prevent_row_deletion()
returns trigger as $$
begin
  raise exception 'Table % rows cannot be physically deleted. Use archiving (archived_at) instead.', TG_TABLE_NAME;
end;
$$ language plpgsql;

drop trigger if exists trg_practice_pieces_no_delete on practice_pieces;
create trigger trg_practice_pieces_no_delete
  before delete on practice_pieces
  for each row execute function prevent_row_deletion();

drop trigger if exists trg_practice_program_pieces_no_delete on practice_program_pieces;
create trigger trg_practice_program_pieces_no_delete
  before delete on practice_program_pieces
  for each row execute function prevent_row_deletion();

drop trigger if exists trg_practice_tracks_no_delete on practice_tracks;
create trigger trg_practice_tracks_no_delete
  before delete on practice_tracks
  for each row execute function prevent_row_deletion();

-- ------------------------------------------------------------------------------
-- 3. Automatic updated_at Triggers
-- ------------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_practice_pieces_updated_at on practice_pieces;
create trigger trg_practice_pieces_updated_at
  before update on practice_pieces
  for each row execute function set_updated_at();

drop trigger if exists trg_practice_tracks_updated_at on practice_tracks;
create trigger trg_practice_tracks_updated_at
  before update on practice_tracks
  for each row execute function set_updated_at();

-- ------------------------------------------------------------------------------
-- 4. RPC 1: fn_get_practice_catalog (Public Read, Admin can view archived)
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
    'score_url', score_url,
    'notes', notes,
    'isArchived', (archived_at is not null),
    'archivedAt', archived_at,
    'archived_at', archived_at,
    'createdAt', created_at,
    'created_at', created_at,
    'updatedAt', updated_at,
    'updated_at', updated_at
  ) order by created_at asc, id asc), '[]'::jsonb)
  into v_pieces
  from practice_pieces
  where v_can_include_archived or archived_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'pieceId', piece_id,
    'piece_id', piece_id,
    'label', label,
    'kind', kind,
    'source', source_type,
    'source_type', source_type,
    'url', url,
    'storageKey', storage_key,
    'storage_key', storage_key,
    'mimeType', mime_type,
    'mime_type', mime_type,
    'durationSeconds', duration_seconds,
    'duration_seconds', duration_seconds,
    'orderIndex', order_index,
    'order_index', order_index,
    'isArchived', (archived_at is not null),
    'archivedAt', archived_at,
    'archived_at', archived_at,
    'createdAt', created_at,
    'created_at', created_at,
    'updatedAt', updated_at,
    'updated_at', updated_at
  ) order by order_index asc, created_at asc, id asc), '[]'::jsonb)
  into v_tracks
  from practice_tracks
  where v_can_include_archived or archived_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'programId', program_id,
    'program_id', program_id,
    'pieceId', piece_id,
    'piece_id', piece_id,
    'orderIndex', order_index,
    'order_index', order_index,
    'isArchived', (archived_at is not null),
    'archivedAt', archived_at,
    'archived_at', archived_at,
    'createdAt', created_at,
    'created_at', created_at
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

-- ------------------------------------------------------------------------------
-- 5. RPC 2: fn_save_practice_piece (Admin Write)
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
begin
  if not fn_check_admin_token(p_payload->>'adminToken', 'admin') then
    return fn_admin_auth_required();
  end if;

  v_id := trim(coalesce(p_payload->>'id', ''));
  v_title := trim(coalesce(p_payload->>'title', ''));
  v_score_url := trim(coalesce(p_payload->>'scoreUrl', p_payload->>'score_url', ''));

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
    id, title, composer, arranger, score_url, notes, updated_at
  ) values (
    v_id,
    v_title,
    trim(coalesce(p_payload->>'composer', '')),
    trim(coalesce(p_payload->>'arranger', '')),
    v_score_url,
    trim(coalesce(p_payload->>'notes', '')),
    now()
  )
  on conflict (id) do update set
    title = excluded.title,
    composer = excluded.composer,
    arranger = excluded.arranger,
    score_url = excluded.score_url,
    notes = excluded.notes,
    updated_at = now();

  return jsonb_build_object('success', true, 'message', '연습곡이 저장되었습니다.', 'id', v_id);
end;
$$;

-- ------------------------------------------------------------------------------
-- 6. RPC 3: fn_set_practice_piece_archived (Admin Write)
-- ------------------------------------------------------------------------------
create or replace function fn_set_practice_piece_archived(p_payload jsonb)
returns jsonb
security definer
set search_path = public, extensions
language plpgsql as $$
declare
  v_id text;
  v_archived boolean;
begin
  if not fn_check_admin_token(p_payload->>'adminToken', 'admin') then
    return fn_admin_auth_required();
  end if;

  v_id := trim(coalesce(p_payload->>'id', ''));
  v_archived := coalesce((p_payload->>'isArchived')::boolean, (p_payload->>'archived')::boolean, true);

  if v_id = '' then
    return jsonb_build_object('success', false, 'message', '곡 ID가 필요합니다.');
  end if;

  update practice_pieces
     set archived_at = case when v_archived then coalesce(archived_at, now()) else null end,
         updated_at = now()
   where id = v_id;

  return jsonb_build_object('success', true, 'message', '연습곡 보관 상태가 변경되었습니다.');
end;
$$;

-- ------------------------------------------------------------------------------
-- 7. RPC 4: fn_save_practice_track (Admin Write)
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
  v_duration integer;
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
  v_order_index := coalesce((p_payload->>'orderIndex')::integer, (p_payload->>'order_index')::integer, 0);
  v_mime := trim(coalesce(p_payload->>'mimeType', p_payload->>'mime_type', ''));
  v_duration := (p_payload->>'durationSeconds')::integer;

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
    duration_seconds, order_index, updated_at
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
    order_index = excluded.order_index,
    updated_at = now();

  return jsonb_build_object('success', true, 'message', '트랙이 저장되었습니다.', 'id', v_id);
end;
$$;

-- ------------------------------------------------------------------------------
-- 8. RPC 5: fn_set_practice_track_archived (Admin Write)
-- ------------------------------------------------------------------------------
create or replace function fn_set_practice_track_archived(p_payload jsonb)
returns jsonb
security definer
set search_path = public, extensions
language plpgsql as $$
declare
  v_id text;
  v_archived boolean;
begin
  if not fn_check_admin_token(p_payload->>'adminToken', 'admin') then
    return fn_admin_auth_required();
  end if;

  v_id := trim(coalesce(p_payload->>'id', ''));
  v_archived := coalesce((p_payload->>'isArchived')::boolean, (p_payload->>'archived')::boolean, true);

  if v_id = '' then
    return jsonb_build_object('success', false, 'message', '트랙 ID가 필요합니다.');
  end if;

  update practice_tracks
     set archived_at = case when v_archived then coalesce(archived_at, now()) else null end,
         updated_at = now()
   where id = v_id;

  return jsonb_build_object('success', true, 'message', '트랙 보관 상태가 변경되었습니다.');
end;
$$;

-- ------------------------------------------------------------------------------
-- 9. RPC 6: fn_set_program_pieces (Admin Write, Single Transaction)
-- ------------------------------------------------------------------------------
create or replace function fn_set_program_pieces(p_payload jsonb)
returns jsonb
security definer
set search_path = public, extensions
language plpgsql as $$
declare
  v_program_id text;
  v_pieces_json jsonb;
  v_piece_id text;
  v_idx integer := 0;
  v_seen_ids text[] := array[]::text[];
begin
  if not fn_check_admin_token(p_payload->>'adminToken', 'admin') then
    return fn_admin_auth_required();
  end if;

  v_program_id := trim(coalesce(p_payload->>'programId', p_payload->>'program_id', ''));
  if v_program_id = '' or not exists(select 1 from program_cards where id = v_program_id) then
    return jsonb_build_object('success', false, 'message', '유효한 프로그램 카드 ID가 필요합니다.');
  end if;

  v_pieces_json := coalesce(p_payload->'pieceIds', p_payload->'pieces', '[]'::jsonb);

  for i in 0 .. jsonb_array_length(v_pieces_json) - 1 loop
    if jsonb_typeof(v_pieces_json->i) = 'object' then
      v_piece_id := trim(coalesce(v_pieces_json->i->>'pieceId', v_pieces_json->i->>'piece_id', ''));
    else
      v_piece_id := trim(coalesce(v_pieces_json->>i, ''));
    end if;

    if v_piece_id <> '' then
      if not exists(select 1 from practice_pieces where id = v_piece_id) then
        raise exception '연습곡 ID(%)가 존재하지 않습니다.', v_piece_id;
      end if;

      insert into practice_program_pieces (program_id, piece_id, order_index, archived_at)
      values (v_program_id, v_piece_id, v_idx, null)
      on conflict (program_id, piece_id) do update
        set order_index = excluded.order_index,
            archived_at = null;

      v_seen_ids := array_append(v_seen_ids, v_piece_id);
      v_idx := v_idx + 1;
    end if;
  end loop;

  -- Archive links not in the given list
  update practice_program_pieces
     set archived_at = coalesce(archived_at, now())
   where program_id = v_program_id
     and (cardinality(v_seen_ids) = 0 or piece_id != all(v_seen_ids))
     and archived_at is null;

  return jsonb_build_object('success', true, 'message', '시즌 곡 목록이 저장되었습니다.');
exception when others then
  return jsonb_build_object('success', false, 'message', SQLERRM);
end;
$$;

-- ------------------------------------------------------------------------------
-- 10. RPC 7: fn_reorder_practice_tracks (Admin Write, Single Transaction)
-- ------------------------------------------------------------------------------
create or replace function fn_reorder_practice_tracks(p_payload jsonb)
returns jsonb
security definer
set search_path = public, extensions
language plpgsql as $$
declare
  v_piece_id text;
  v_track_ids_json jsonb;
  v_track_id text;
  v_total_db integer;
  v_total_input integer;
begin
  if not fn_check_admin_token(p_payload->>'adminToken', 'admin') then
    return fn_admin_auth_required();
  end if;

  v_piece_id := trim(coalesce(p_payload->>'pieceId', p_payload->>'piece_id', ''));
  v_track_ids_json := coalesce(p_payload->'trackIds', p_payload->'tracks', '[]'::jsonb);

  if v_piece_id = '' or not exists(select 1 from practice_pieces where id = v_piece_id) then
    return jsonb_build_object('success', false, 'message', '유효한 연습곡 ID가 필요합니다.');
  end if;

  v_total_input := jsonb_array_length(v_track_ids_json);

  select count(*) into v_total_db
    from practice_tracks
   where piece_id = v_piece_id
     and archived_at is null;

  if v_total_input <> v_total_db then
    return jsonb_build_object(
      'success', false,
      'message', '트랙 목록이 일치하지 않습니다.'
    );
  end if;

  for i in 0 .. v_total_input - 1 loop
    if jsonb_typeof(v_track_ids_json->i) = 'object' then
      v_track_id := trim(coalesce(v_track_ids_json->i->>'id', v_track_ids_json->i->>'trackId', ''));
    else
      v_track_id := trim(coalesce(v_track_ids_json->>i, ''));
    end if;

    if not exists(
      select 1 from practice_tracks
       where id = v_track_id and piece_id = v_piece_id and archived_at is null
    ) then
      raise exception '트랙 % 은(는) 해당 곡의 활성 트랙이 아닙니다.', v_track_id;
    end if;

    update practice_tracks
       set order_index = i,
           updated_at = now()
     where id = v_track_id;
  end loop;

  return jsonb_build_object('success', true, 'message', '트랙 순서가 변경되었습니다.');
exception when others then
  return jsonb_build_object('success', false, 'message', SQLERRM);
end;
$$;

-- ------------------------------------------------------------------------------
-- 11. Update fn_delete_program_card__impl (Refuse delete if linked pieces exist)
-- ------------------------------------------------------------------------------
create or replace function fn_delete_program_card__impl(p_payload jsonb)
returns jsonb
security definer
set search_path = public
language plpgsql as $$
begin
  if exists (select 1 from practice_program_pieces where program_id = p_payload->>'id' and archived_at is null) then
    return jsonb_build_object(
      'success', false,
      'message', '연습곡이 연결된 카드는 삭제할 수 없습니다. 대신 보관 처리하세요.'
    );
  end if;
  delete from program_cards where id = p_payload->>'id';
  return jsonb_build_object('success', true, 'message', '일정 카드가 삭제되었습니다.');
end;
$$;
revoke all on function fn_delete_program_card__impl(jsonb) from public, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 12. Security Grants & PostgREST Reload
-- ------------------------------------------------------------------------------
grant execute on function fn_get_practice_catalog to anon, authenticated;
grant execute on function fn_save_practice_piece to anon, authenticated;
grant execute on function fn_set_practice_piece_archived to anon, authenticated;
grant execute on function fn_save_practice_track to anon, authenticated;
grant execute on function fn_set_practice_track_archived to anon, authenticated;
grant execute on function fn_set_program_pieces to anon, authenticated;
grant execute on function fn_reorder_practice_tracks to anon, authenticated;

notify pgrst, 'reload schema';
