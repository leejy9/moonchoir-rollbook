-- ==============================================================================
-- Migration: 20261124000000_v3_activity.sql
-- Description: v3 Activity Engine (RSVP events log, listen session logs, member activity RPC)
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
--  11. Functions:
--        fn_log_listen_session(p_payload jsonb)
--        fn_get_member_activity(p_member_id text)
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
-- 4. RPC: fn_log_listen_session (Public / Anon)
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
-- 5. RPC: fn_get_member_activity (Public / Anon)
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
