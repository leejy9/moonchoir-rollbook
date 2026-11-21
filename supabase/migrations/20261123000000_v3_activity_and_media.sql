-- ==============================================================================
-- Migration: 20261123000000_v3_activity_and_media.sql
-- Description: v3 Activity & Media Engine (RSVP events log, listen session logs, media storage keys)
--
-- Objects created / altered:
--   1. Table: rsvp_events (Append-only log for RSVP vote changes, V12)
--   2. Index: idx_rsvp_events_member_schedule_occurred on rsvp_events
--   3. Trigger Function: prevent_row_update()
--   4. Trigger: trg_rsvp_events_no_delete, trg_rsvp_events_no_update
--   5. Trigger Function: log_rsvp_vote_event()
--   6. Trigger: trg_rsvp_votes_log on rsvp_votes
--   7. Data backfill: initial rsvp_events from existing rsvp_votes
--   8. Table: practice_listen_sessions (Listening log sessions, cascade on member delete, V13)
--   9. Index: idx_practice_listen_sessions_member_received on practice_listen_sessions
--  10. Trigger: trg_practice_listen_sessions_no_update
--  11. Table Columns Added:
--        practice_pieces (score_storage_key text, score_size_bytes bigint)
--        practice_tracks (size_bytes bigint)
--  12. Functions:
--        fn_log_listen_session(p_payload jsonb)
--        fn_get_member_activity(p_member_id text)
--        fn_authorize_media_upload(p_token text)
--        fn_get_media_usage(p_token text)
--        fn_save_practice_piece(p_payload jsonb) [updated with score storage fields]
--        fn_save_practice_track(p_payload jsonb) [updated with size_bytes field]
--        fn_get_practice_catalog(p_include_archived boolean, p_token text) [updated with new fields]
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Table: rsvp_events (Append-only, V12)
-- ------------------------------------------------------------------------------
create table if not exists rsvp_events (
  seq bigint generated always as identity primary key,
  schedule_id text not null,
  member_id text not null,
  action text not null check (action in ('insert', 'update', 'delete', 'backfill')),
  status text not null,
  prev_status text,
  occurred_at timestamptz not null default now()
);

create index if not exists idx_rsvp_events_member_schedule_occurred
  on rsvp_events (member_id, schedule_id, occurred_at);

alter table rsvp_events enable row level security;
revoke all on table rsvp_events from public, anon, authenticated;

-- Update / Delete Prevention for rsvp_events
create or replace function prevent_row_update()
returns trigger
security definer
set search_path = public, extensions
language plpgsql as $$
begin
  raise exception 'Table % rows are append-only and cannot be updated.', TG_TABLE_NAME;
end;
$$;

drop trigger if exists trg_rsvp_events_no_delete on rsvp_events;
create trigger trg_rsvp_events_no_delete
  before delete on rsvp_events
  for each row execute function prevent_row_deletion();

drop trigger if exists trg_rsvp_events_no_update on rsvp_events;
create trigger trg_rsvp_events_no_update
  before update on rsvp_events
  for each row execute function prevent_row_update();

-- ------------------------------------------------------------------------------
-- 2. Trigger on rsvp_votes -> rsvp_events (V12)
-- ------------------------------------------------------------------------------
create or replace function log_rsvp_vote_event()
returns trigger
security definer
set search_path = public, extensions
language plpgsql as $$
begin
  if (TG_OP = 'INSERT') then
    insert into rsvp_events (schedule_id, member_id, action, status, prev_status, occurred_at)
    values (NEW.schedule_id, NEW.member_id, 'insert', NEW.status, null, now());
    return NEW;
  elsif (TG_OP = 'UPDATE') then
    if (OLD.status is distinct from NEW.status) then
      insert into rsvp_events (schedule_id, member_id, action, status, prev_status, occurred_at)
      values (NEW.schedule_id, NEW.member_id, 'update', NEW.status, OLD.status, now());
    end if;
    return NEW;
  elsif (TG_OP = 'DELETE') then
    insert into rsvp_events (schedule_id, member_id, action, status, prev_status, occurred_at)
    values (OLD.schedule_id, OLD.member_id, 'delete', OLD.status, null, now());
    return OLD;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_rsvp_votes_log on rsvp_votes;
create trigger trg_rsvp_votes_log
  after insert or update or delete on rsvp_votes
  for each row execute function log_rsvp_vote_event();

-- Backfill existing rsvp_votes into rsvp_events as 'backfill' action (idempotent)
insert into rsvp_events (schedule_id, member_id, action, status, prev_status, occurred_at)
select
  v.schedule_id,
  v.member_id,
  'backfill',
  v.status,
  null,
  coalesce(
    case
      when v.timestamp ~ '^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}' then
        case
          when v.timestamp ~ '(Z|[+-]\d{2}(:\d{2})?)$' then v.timestamp::timestamptz
          else (replace(v.timestamp, ' ', 'T') || '+09:00')::timestamptz
        end
      else null
    end,
    v.received_at,
    now()
  ) as occurred_at
from rsvp_votes v
where not exists (
  select 1 from rsvp_events e
  where e.schedule_id = v.schedule_id
    and e.member_id = v.member_id
    and e.action = 'backfill'
);

-- ------------------------------------------------------------------------------
-- 3. Table: practice_listen_sessions (V13)
-- ------------------------------------------------------------------------------
create table if not exists practice_listen_sessions (
  chunk_id text primary key,
  member_id text not null references members(id) on delete cascade,
  piece_id text not null references practice_pieces(id) on delete restrict,
  track_id text not null references practice_tracks(id) on delete restrict,
  started_at timestamptz not null,
  listened_seconds integer not null check (listened_seconds between 1 and 120),
  received_at timestamptz not null default now()
);

create index if not exists idx_practice_listen_sessions_member_received
  on practice_listen_sessions (member_id, received_at);

alter table practice_listen_sessions enable row level security;
revoke all on table practice_listen_sessions from public, anon, authenticated;

drop trigger if exists trg_practice_listen_sessions_no_update on practice_listen_sessions;
create trigger trg_practice_listen_sessions_no_update
  before update on practice_listen_sessions
  for each row execute function prevent_row_update();

-- ------------------------------------------------------------------------------
-- 4. Table Columns Added (score_storage_key, score_size_bytes, size_bytes)
-- ------------------------------------------------------------------------------
alter table practice_pieces
  add column if not exists score_storage_key text not null default '',
  add column if not exists score_size_bytes bigint check (score_size_bytes is null or score_size_bytes >= 0);

alter table practice_tracks
  add column if not exists size_bytes bigint check (size_bytes is null or size_bytes >= 0);

-- ------------------------------------------------------------------------------
-- 5. RPC: fn_log_listen_session (Public / Anon)
-- ------------------------------------------------------------------------------
create or replace function fn_log_listen_session(p_payload jsonb)
returns jsonb
security definer
set search_path = public, extensions
language plpgsql as $$
declare
  v_chunk_id text;
  v_member_id text;
  v_piece_id text;
  v_track_id text;
  v_started_at timestamptz;
  v_started_at_raw text;
  v_listened_raw text;
  v_listened_seconds integer;
  v_kst_day date;
  v_daily_sum integer;
begin
  v_chunk_id := trim(coalesce(p_payload->>'chunkId', p_payload->>'chunk_id', ''));
  v_member_id := trim(coalesce(p_payload->>'memberId', p_payload->>'member_id', ''));
  v_piece_id := trim(coalesce(p_payload->>'pieceId', p_payload->>'piece_id', ''));
  v_track_id := trim(coalesce(p_payload->>'trackId', p_payload->>'track_id', ''));
  v_started_at_raw := trim(coalesce(p_payload->>'startedAt', p_payload->>'started_at', ''));
  v_listened_raw := trim(coalesce(p_payload->>'listenedSeconds', p_payload->>'listened_seconds', ''));

  if v_chunk_id = '' or v_member_id = '' or v_piece_id = '' or v_track_id = '' then
    return jsonb_build_object('success', false, 'message', '필수 입력값이 누락되었습니다.');
  end if;

  -- 1) Verify member exists
  if not exists (select 1 from members where id = v_member_id) then
    return jsonb_build_object('success', false, 'message', '존재하지 않는 회원입니다.');
  end if;

  -- 2) Verify track exists and belongs to piece
  if not exists (select 1 from practice_tracks where id = v_track_id and piece_id = v_piece_id) then
    return jsonb_build_object('success', false, 'message', '곡에 속하지 않거나 유효하지 않은 트랙입니다.');
  end if;

  -- 3) Parse started_at
  begin
    if v_started_at_raw <> '' then
      v_started_at := v_started_at_raw::timestamptz;
    else
      v_started_at := now();
    end if;
  exception when others then
    v_started_at := now();
  end;

  -- 4) Parse and clamp listened_seconds (1 ~ 120)
  begin
    v_listened_seconds := v_listened_raw::integer;
  exception when others then
    v_listened_seconds := 1;
  end;
  v_listened_seconds := least(120, greatest(1, coalesce(v_listened_seconds, 1)));

  -- 5) Check daily KST limit (21,600 seconds = 6 hours)
  v_kst_day := (v_started_at at time zone 'Asia/Seoul')::date;
  select coalesce(sum(listened_seconds), 0)
    into v_daily_sum
    from practice_listen_sessions
   where member_id = v_member_id
     and (started_at at time zone 'Asia/Seoul')::date = v_kst_day;

  if v_daily_sum >= 21600 then
    -- Ignore over-quota logging gracefully
    return jsonb_build_object('ok', true, 'ignored', true);
  end if;

  -- 6) Deduplicate on chunk_id
  insert into practice_listen_sessions (
    chunk_id, member_id, piece_id, track_id, started_at, listened_seconds, received_at
  ) values (
    v_chunk_id, v_member_id, v_piece_id, v_track_id, v_started_at, v_listened_seconds, now()
  )
  on conflict (chunk_id) do nothing;

  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function fn_log_listen_session(jsonb) from public;
grant execute on function fn_log_listen_session(jsonb) to anon, authenticated;

-- ------------------------------------------------------------------------------
-- 6. RPC: fn_get_member_activity (Public / Anon)
-- ------------------------------------------------------------------------------
create or replace function fn_get_member_activity(p_member_id text)
returns jsonb
security definer
set search_path = public, extensions
language plpgsql as $$
declare
  v_rsvp_events jsonb;
  v_total_seconds integer;
  v_first_at timestamptz;
  v_per_piece jsonb;
begin
  -- Recent 400 RSVP events for this member
  select coalesce(jsonb_agg(jsonb_build_object(
    'seq', seq,
    'scheduleId', schedule_id,
    'memberId', member_id,
    'action', action,
    'status', status,
    'prevStatus', prev_status,
    'occurredAt', occurred_at
  ) order by occurred_at desc, seq desc), '[]'::jsonb)
  into v_rsvp_events
  from (
    select seq, schedule_id, member_id, action, status, prev_status, occurred_at
      from rsvp_events
     where member_id = p_member_id
     order by occurred_at desc, seq desc
     limit 400
  ) recent;

  -- Total seconds and first listen timestamp
  select coalesce(sum(listened_seconds), 0), min(started_at)
    into v_total_seconds, v_first_at
    from practice_listen_sessions
   where member_id = p_member_id;

  -- Aggregated seconds per piece
  select coalesce(jsonb_agg(jsonb_build_object(
    'pieceId', piece_id,
    'seconds', seconds
  ) order by seconds desc, piece_id asc), '[]'::jsonb)
  into v_per_piece
  from (
    select piece_id, sum(listened_seconds)::integer as seconds
      from practice_listen_sessions
     where member_id = p_member_id
     group by piece_id
  ) piece_totals;

  return jsonb_build_object(
    'success', true,
    'rsvpEvents', v_rsvp_events,
    'listen', jsonb_build_object(
      'totalSeconds', v_total_seconds,
      'firstAt', v_first_at,
      'perPiece', v_per_piece
    )
  );
end;
$$;
revoke all on function fn_get_member_activity(text) from public;
grant execute on function fn_get_member_activity(text) to anon, authenticated;

-- ------------------------------------------------------------------------------
-- 7. RPC: fn_authorize_media_upload (Worker upload authorization wrapper)
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
-- 8. RPC: fn_get_media_usage (Admin media storage usage audit)
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
-- 9. Updated: fn_save_practice_piece
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
-- 10. Updated: fn_save_practice_track
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
-- 11. Updated: fn_get_practice_catalog
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
