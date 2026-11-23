-- ==============================================================================
-- Migration: 20261124000000_v3_activity.sql
-- Description: v3 Member Activity Tracking & Practice Listen Sessions (v3-C)
-- Objects Created:
--   1. Function: fn_safe_timestamptz(text, timestamptz)
--   2. Table: rsvp_events (Append-only RSVP event logs)
--   3. Index: idx_rsvp_events_member_schedule_occurred
--   4. Function & Trigger: fn_trg_rsvp_votes_log, trg_rsvp_votes_log on rsvp_votes
--   5. Function & Trigger: fn_trg_rsvp_events_no_update_delete, trg_rsvp_events_no_update_delete on rsvp_events
--   6. One-time Idempotent Backfill: rsvp_votes -> rsvp_events (action = 'backfill')
--   7. Table: practice_listen_sessions (Append-only listen session logs)
--   8. Index: idx_practice_listen_sessions_member_received
--   9. Function & Trigger: fn_trg_practice_listen_sessions_no_update, trg_practice_listen_sessions_no_update on practice_listen_sessions
--  10. RPC: fn_log_listen_session(p_payload jsonb)
--  11. RPC: fn_get_member_activity(p_member_ids text[])
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Helper: Safe timestamptz parser (fallback on invalid text format)
--    (V3-20 R4: timezone-aware parsing for KST naive strings and UTC timestamps)
-- ------------------------------------------------------------------------------
create or replace function fn_safe_timestamptz(p_text text, p_fallback timestamptz)
returns timestamptz
language plpgsql
stable
as $$
declare
  v_trimmed text;
begin
  if p_text is null or trim(p_text) = '' then
    return p_fallback;
  end if;
  v_trimmed := trim(p_text);
  if v_trimmed ~ '(Z|[+-][0-9]{2}(:[0-9]{2})?)$' then
    return v_trimmed::timestamptz; -- tz-checked (has explicit timezone offset or Z)
  else
    return (v_trimmed::timestamp at time zone 'Asia/Seoul');
  end if;
exception when others then
  return p_fallback;
end;
$$;

-- ------------------------------------------------------------------------------
-- 2. Table: rsvp_events (Append-only, V12)
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

-- ------------------------------------------------------------------------------
-- 3. Dedicated Trigger: Block update/delete on rsvp_events
-- ------------------------------------------------------------------------------
create or replace function fn_trg_rsvp_events_no_update_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'rsvp_events는 수정하거나 삭제할 수 없습니다.';
end;
$$;

drop trigger if exists trg_rsvp_events_no_update_delete on rsvp_events;
create trigger trg_rsvp_events_no_update_delete
before update or delete on rsvp_events
for each row execute function fn_trg_rsvp_events_no_update_delete();

-- ------------------------------------------------------------------------------
-- 4. Trigger on rsvp_votes: Automatically capture vote life-cycle events
-- ------------------------------------------------------------------------------
create or replace function fn_trg_rsvp_votes_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into rsvp_events (schedule_id, member_id, action, status, prev_status, occurred_at)
    values (new.schedule_id, new.member_id, 'insert', new.status, null, now());
    return new;
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      insert into rsvp_events (schedule_id, member_id, action, status, prev_status, occurred_at)
      values (new.schedule_id, new.member_id, 'update', new.status, old.status, now());
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    insert into rsvp_events (schedule_id, member_id, action, status, prev_status, occurred_at)
    values (old.schedule_id, old.member_id, 'delete', old.status, null, now());
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_rsvp_votes_log on rsvp_votes;
create trigger trg_rsvp_votes_log
after insert or update or delete on rsvp_votes
for each row execute function fn_trg_rsvp_votes_log();

-- ------------------------------------------------------------------------------
-- 5. Backfill: Existing rsvp_votes into rsvp_events (idempotent)
-- ------------------------------------------------------------------------------
insert into rsvp_events (
  schedule_id,
  member_id,
  action,
  status,
  prev_status,
  occurred_at
)
select
  v.schedule_id,
  v.member_id,
  'backfill',
  v.status,
  null,
  coalesce(fn_safe_timestamptz(v.timestamp, v.received_at), v.received_at, now())
from rsvp_votes v
where not exists (
  select 1 from rsvp_events e
  where e.schedule_id = v.schedule_id
    and e.member_id = v.member_id
);

-- ------------------------------------------------------------------------------
-- 6. Table: practice_listen_sessions (V13)
-- ------------------------------------------------------------------------------
create table if not exists practice_listen_sessions (
  chunk_id text primary key,
  member_id text not null references members(id) on delete cascade,
  piece_id text not null references practice_pieces(id) on delete restrict,
  track_id text not null references practice_tracks(id) on delete restrict,
  started_at timestamptz not null,
  listened_seconds integer not null check (listened_seconds >= 1 and listened_seconds <= 120),
  received_at timestamptz not null default now()
);

create index if not exists idx_practice_listen_sessions_member_received
  on practice_listen_sessions (member_id, received_at);

alter table practice_listen_sessions enable row level security;
revoke all on table practice_listen_sessions from public, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 7. Trigger: Block update on practice_listen_sessions (delete cascade allowed)
-- ------------------------------------------------------------------------------
create or replace function fn_trg_practice_listen_sessions_no_update()
returns trigger
language plpgsql
as $$
begin
  raise exception 'practice_listen_sessions는 수정할 수 없습니다.';
end;
$$;

drop trigger if exists trg_practice_listen_sessions_no_update on practice_listen_sessions;
create trigger trg_practice_listen_sessions_no_update
before update on practice_listen_sessions
for each row execute function fn_trg_practice_listen_sessions_no_update();

-- ------------------------------------------------------------------------------
-- 8. RPC: fn_log_listen_session
-- ------------------------------------------------------------------------------
create or replace function fn_log_listen_session(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_chunk_id text := p_payload->>'chunkId';
  v_member_id text := p_payload->>'memberId';
  v_piece_id text := p_payload->>'pieceId';
  v_track_id text := p_payload->>'trackId';
  v_started_at timestamptz;
  v_listened_seconds integer;
  v_clamped_seconds integer;
  v_current_daily_sum integer;
  v_allowed_seconds integer;
begin
  if v_chunk_id is null or trim(v_chunk_id) = '' then
    return jsonb_build_object('ok', false, 'message', 'chunkId가 필요합니다.');
  end if;

  if v_member_id is null or not exists (select 1 from members where id = v_member_id) then
    return jsonb_build_object('ok', false, 'message', '존재하지 않는 회원입니다.');
  end if;

  if v_piece_id is null or not exists (select 1 from practice_pieces where id = v_piece_id) then
    return jsonb_build_object('ok', false, 'message', '존재하지 않는 곡입니다.');
  end if;

  if v_track_id is null or not exists (select 1 from practice_tracks where id = v_track_id and piece_id = v_piece_id) then
    return jsonb_build_object('ok', false, 'message', '곡에 속하지 않는 트랙입니다.');
  end if;

  -- Idempotency: if chunk_id already exists, return ok: true without modifying
  if exists (select 1 from practice_listen_sessions where chunk_id = v_chunk_id) then
    return jsonb_build_object('ok', true);
  end if;

  v_listened_seconds := coalesce((p_payload->>'listenedSeconds')::integer, 0);
  v_clamped_seconds := greatest(1, least(120, v_listened_seconds));
  v_started_at := fn_safe_timestamptz(p_payload->>'startedAt', now());

  -- Check daily listening limit in Asia/Seoul (21,600 seconds = 6 hours max per day)
  select coalesce(sum(listened_seconds), 0) into v_current_daily_sum
  from practice_listen_sessions
  where member_id = v_member_id
    and (received_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date;

  if v_current_daily_sum >= 21600 then
    -- Daily ceiling reached; ignore session silently and report success
    return jsonb_build_object('ok', true);
  end if;

  v_allowed_seconds := 21600 - v_current_daily_sum;
  v_clamped_seconds := least(v_clamped_seconds, v_allowed_seconds);

  if v_clamped_seconds < 1 then
    return jsonb_build_object('ok', true);
  end if;

  insert into practice_listen_sessions (
    chunk_id, member_id, piece_id, track_id, started_at, listened_seconds, received_at
  ) values (
    v_chunk_id, v_member_id, v_piece_id, v_track_id, v_started_at, v_clamped_seconds, now()
  )
  on conflict (chunk_id) do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function fn_log_listen_session(jsonb) from public;
grant execute on function fn_log_listen_session(jsonb) to anon, authenticated;

-- ------------------------------------------------------------------------------
-- 9. RPC: fn_get_member_activity
-- ------------------------------------------------------------------------------
create or replace function fn_get_member_activity(p_member_ids text[])
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id_count integer;
  v_rsvp_events jsonb;
  v_total_seconds integer := 0;
  v_first_at timestamptz;
  v_daily jsonb;
  v_per_piece jsonb;
begin
  v_id_count := coalesce(cardinality(p_member_ids), 0);
  if v_id_count < 1 or v_id_count > 20 then
    raise exception 'INVALID_INPUT';
  end if;

  -- Recent 400 RSVP events for this member alias set, ordered chronologically ascending
  with recent_events as (
    select
      seq,
      schedule_id,
      member_id,
      action,
      status,
      prev_status,
      occurred_at
    from rsvp_events
    where member_id = any(p_member_ids)
    order by occurred_at desc, seq desc
    limit 400
  ),
  ordered_events as (
    select * from recent_events
    order by occurred_at asc, seq asc
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'seq', seq,
        'scheduleId', schedule_id,
        'memberId', member_id,
        'action', action,
        'status', status,
        'prevStatus', prev_status,
        'occurredAt', occurred_at
      )
    ),
    '[]'::jsonb
  ) into v_rsvp_events
  from ordered_events;

  -- Listen statistics across merged aliases
  select
    coalesce(sum(listened_seconds), 0)::integer,
    min(received_at)
  into
    v_total_seconds,
    v_first_at
  from practice_listen_sessions
  where member_id = any(p_member_ids);

  -- Daily listening aggregation grouped by KST date (Asia/Seoul)
  with daily_agg as (
    select
      to_char(received_at at time zone 'Asia/Seoul', 'YYYY-MM-DD') as day_kst,
      sum(listened_seconds)::integer as sec
    from practice_listen_sessions
    where member_id = any(p_member_ids)
    group by to_char(received_at at time zone 'Asia/Seoul', 'YYYY-MM-DD')
    order by day_kst asc
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', day_kst,
        'seconds', sec
      )
    ),
    '[]'::jsonb
  ) into v_daily
  from daily_agg;

  -- Per-piece aggregation with reached60At (earliest timestamp where cumulative listening reached >= 60s)
  with piece_running as (
    select
      piece_id,
      received_at,
      sum(listened_seconds) over (
        partition by piece_id
        order by received_at asc, chunk_id asc
      ) as running_seconds
    from practice_listen_sessions
    where member_id = any(p_member_ids)
  ),
  piece_first_60 as (
    select
      piece_id,
      min(received_at) as reached_60_at
    from piece_running
    where running_seconds >= 60
    group by piece_id
  ),
  piece_totals as (
    select
      piece_id,
      sum(listened_seconds)::integer as total_sec
    from practice_listen_sessions
    where member_id = any(p_member_ids)
    group by piece_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'pieceId', pt.piece_id,
        'seconds', pt.total_sec,
        'reached60At', pf.reached_60_at
      ) order by pt.piece_id
    ),
    '[]'::jsonb
  ) into v_per_piece
  from piece_totals pt
  left join piece_first_60 pf on pf.piece_id = pt.piece_id;

  return jsonb_build_object(
    'rsvpEvents', v_rsvp_events,
    'listen', jsonb_build_object(
      'totalSeconds', v_total_seconds,
      'firstAt', v_first_at,
      'daily', v_daily,
      'perPiece', v_per_piece
    )
  );
end;
$$;

revoke all on function fn_get_member_activity(text[]) from public;
grant execute on function fn_get_member_activity(text[]) to anon, authenticated;
