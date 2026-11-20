-- ==============================================================================
-- Review Follow-ups Migration (20261122010000_review_followups.sql)
--
-- Applies after:
-- 1. 20261121010000_fix_onsite_pin_payload_key.sql
-- 2. 20261122000000_practice_catalog.sql
--
-- Contains review follow-up fixes (C3, C9, C15, C6).
-- Safe to apply multiple times (idempotent).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- C3. Update fn_delete_program_card__impl (Refuse delete if any piece history exists)
-- ------------------------------------------------------------------------------
create or replace function fn_delete_program_card__impl(p_payload jsonb)
returns jsonb
security definer
set search_path = public
language plpgsql as $$
begin
  if exists (select 1 from practice_program_pieces where program_id = p_payload->>'id') then
    return jsonb_build_object(
      'success', false,
      'message', '연습곡이 등록되었던 시즌 카드는 삭제할 수 없습니다. 시즌 카드를 보관(숨김) 처리해 주세요.'
    );
  end if;
  delete from program_cards where id = p_payload->>'id';
  if not found then
    return jsonb_build_object('success', false, 'message', '일정 카드를 찾을 수 없습니다.');
  end if;
  return jsonb_build_object('success', true, 'message', '일정 카드가 삭제되었습니다.');
end;
$$;
revoke all on function fn_delete_program_card__impl(jsonb) from public, anon, authenticated;

-- ------------------------------------------------------------------------------
-- C9. Update fn_reorder_practice_tracks (Verify no duplicate track IDs)
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
  v_distinct_input integer;
begin
  if not fn_check_admin_token(p_payload->>'adminToken', 'admin') then
    return fn_admin_auth_required();
  end if;

  v_piece_id := trim(coalesce(p_payload->>'pieceId', p_payload->>'piece_id', ''));
  v_track_ids_json := coalesce(p_payload->'trackIds', p_payload->'tracks', '[]'::jsonb);

  if v_piece_id = '' or not exists(select 1 from practice_pieces where id = v_piece_id) then
    return jsonb_build_object('success', false, 'message', '유효한 연습곡 ID가 필요합니다.');
  end if;

  if jsonb_typeof(v_track_ids_json) <> 'array' then
    return jsonb_build_object('success', false, 'message', '트랙 목록이 올바른 배열 형식이 아닙니다.');
  end if;

  v_total_input := jsonb_array_length(v_track_ids_json);

  -- Count distinct IDs extracted from either string or object ({id} or {trackId}) elements
  select count(distinct case
      when jsonb_typeof(elem) = 'object' then trim(coalesce(elem->>'id', elem->>'trackId', ''))
      else trim(elem #>> '{}')
    end)
    into v_distinct_input
    from jsonb_array_elements(v_track_ids_json) as elem;

  if v_distinct_input <> v_total_input then
    return jsonb_build_object('success', false, 'message', '중복된 트랙이 있습니다.');
  end if;

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
revoke all on function fn_reorder_practice_tracks(jsonb) from public;
grant execute on function fn_reorder_practice_tracks(jsonb) to anon, authenticated;

-- ------------------------------------------------------------------------------
-- C15-1. Update fn_save_practice_track (Validate durationSeconds as positive integer)
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
revoke all on function fn_save_practice_track(jsonb) from public;
grant execute on function fn_save_practice_track(jsonb) to anon, authenticated;

-- ------------------------------------------------------------------------------
-- C15-2. Update fn_set_practice_piece_archived (Check ID existence)
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

  if not found then
    return jsonb_build_object('success', false, 'message', '연습곡을 찾을 수 없습니다.');
  end if;

  return jsonb_build_object('success', true, 'message', '연습곡 보관 상태가 변경되었습니다.');
end;
$$;
revoke all on function fn_set_practice_piece_archived(jsonb) from public;
grant execute on function fn_set_practice_piece_archived(jsonb) to anon, authenticated;

-- ------------------------------------------------------------------------------
-- C15-3. Update fn_set_practice_track_archived (Check ID existence)
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

  if not found then
    return jsonb_build_object('success', false, 'message', '트랙을 찾을 수 없습니다.');
  end if;

  return jsonb_build_object('success', true, 'message', '트랙 보관 상태가 변경되었습니다.');
end;
$$;
revoke all on function fn_set_practice_track_archived(jsonb) from public;
grant execute on function fn_set_practice_track_archived(jsonb) to anon, authenticated;

-- ------------------------------------------------------------------------------
-- C15-4. Update fn_get_practice_catalog (camelCase only to reduce payload size)
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

notify pgrst, 'reload schema';
