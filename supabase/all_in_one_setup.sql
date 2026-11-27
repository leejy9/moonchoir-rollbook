-- ==============================================================================
-- WARNING (2026-11-21): This combined script creates the ORIGINAL, UNPROTECTED functions.
-- After running it, you MUST also run migrations/20261121000000_security_hardening.sql
-- and then rotate the admin/super PINs to 6-8 digits (see docs/DEPLOYMENT.md section 0).
-- ==============================================================================
-- ==============================================================================
-- Moonchoir Rollbook — Supabase Database Migration (00_schema_and_tables.sql)
-- Domain Invariants: Append-Only Event Sourcing & Configurable Dynamic Taxonomy
-- ==============================================================================

-- 1. Enable required extensions
create extension if not exists "pgcrypto";

-- 2. Members master table
create table if not exists members (
  id text primary key,
  name text not null,
  part text default '',
  phone_last4 text default '',
  phone text default '',
  role text default 'MEMBER',
  status text default 'ACTIVE',
  joined_at text default '',
  member_status text default '정단원',
  note text default '',
  bound_device_id text default '',
  bound_device_at text default '',
  merged_into_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Partial unique index: Prevents active/inactive duplicate registrations with same name and normalized phone
create unique index if not exists idx_members_active_name_phone
  on members (trim(name), regexp_replace(phone, '[^0-9]', '', 'g'))
  where status in ('ACTIVE', 'INACTIVE') and phone is not null and phone != '';

-- 3. Member Status History (Period-based membership/part changes for historical quorum)
create table if not exists member_status_history (
  id text primary key,
  member_id text not null,
  name text default '',
  status text default '',
  part text default '',
  start_date text not null,
  end_date text not null default '2999-12-31',
  reason text default '',
  created_at text default '',
  received_at timestamptz default now()
);
create index if not exists idx_member_status_history_member_id on member_status_history(member_id);

-- 4. Program Cards (Parent groupings for rehearsals / concert projects)
create table if not exists program_cards (
  id text primary key,
  title text not null,
  description text default '',
  category text default '',
  default_location_id text default '',
  default_start_time text default '',
  default_end_time text default '',
  is_archived boolean default false,
  created_at text default '',
  target_audience_type text default 'ALL',
  target_parts text[] default '{}',
  target_member_ids text[] default '{}',
  received_at timestamptz default now()
);

-- 5. Location Presets
create table if not exists locations (
  id text primary key,
  name text not null,
  address text default '',
  detail_address text default '',
  entrance_note text default '',
  latitude double precision default 0.0,
  longitude double precision default 0.0,
  radius_meters integer default 100,
  is_default boolean default false,
  created_at timestamptz default now()
);

-- 6. Schedules (Rehearsal and event calendar)
create table if not exists schedules (
  id text primary key,
  title text not null,
  date text not null,
  start_time text not null,
  end_time text not null,
  location_name text default '',
  location_id text default '',
  latitude double precision,
  longitude double precision,
  radius_meters integer,
  category text default '',
  check_in_pin text default '',
  description text default '',
  program_id text default '',
  series_id text default '',
  series_index integer,
  series_total integer,
  is_archived boolean default false,
  is_cancelled boolean default false,
  target_audience_type text default 'ALL',
  target_parts text[] default '{}',
  target_member_ids text[] default '{}',
  visibility text default 'ALL',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_schedules_date on schedules(date);
create index if not exists idx_schedules_program_id on schedules(program_id);

-- 7. RSVP Votes (Current intention only, deduplicated by schedule_id + member_id)
create table if not exists rsvp_votes (
  id text primary key,
  schedule_id text not null,
  member_id text not null,
  member_name text default '',
  part text default '',
  status text not null,
  reason text default '',
  timestamp text not null,
  received_at timestamptz default now(),
  constraint uq_rsvp_schedule_member unique (schedule_id, member_id)
);
create index if not exists idx_rsvp_votes_schedule_id on rsvp_votes(schedule_id);

-- 8. Raw Attendance Logs (Strictly Append-Only Event Sourcing)
create table if not exists attendance_logs (
  seq bigint generated always as identity primary key,
  id text not null unique,
  timestamp text not null,
  schedule_id text not null,
  member_id text not null,
  member_name text default '',
  part text default '',
  auth_method text not null,
  is_verified_location boolean default false,
  admin_note text default '',
  distance_meters numeric,
  device_id text default '',
  received_at timestamptz default now()
);
create index if not exists idx_attendance_logs_schedule_id on attendance_logs(schedule_id);
create index if not exists idx_attendance_logs_member_id on attendance_logs(member_id);

-- 9. Schedule Comments Events (Strictly Append-Only Event Sourcing)
create table if not exists schedule_comment_events (
  seq bigint generated always as identity primary key,
  id text not null unique,
  schedule_id text not null,
  member_id text not null,
  member_name text default '',
  part text default '',
  action text not null, -- CREATE | EDIT | DELETE
  target_id text default '',
  text text default '',
  timestamp text not null,
  device_id text default '',
  received_at timestamptz default now()
);
create index if not exists idx_schedule_comments_schedule_id on schedule_comment_events(schedule_id);

-- 10. App Config (Publicly readable configuration)
create table if not exists app_config (
  key text primary key,
  value text default '',
  description text default '',
  updated_at timestamptz default now()
);

-- 11. App Secrets (Protected configuration: adminPin, activeOnSitePin, masterQrToken)
create table if not exists app_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

-- ==============================================================================
-- Immutability Protection: Prohibit UPDATE & DELETE on Append-Only Raw Logs
-- ==============================================================================
create or replace function prevent_raw_log_mutation()
returns trigger as $$
begin
  raise exception 'Table % is strictly append-only. Modification (UPDATE) and Deletion (DELETE) are prohibited.', TG_TABLE_NAME;
end;
$$ language plpgsql;

drop trigger if exists trg_attendance_logs_immutable on attendance_logs;
create trigger trg_attendance_logs_immutable
  before update or delete on attendance_logs
  for each row execute function prevent_raw_log_mutation();

drop trigger if exists trg_schedule_comment_events_immutable on schedule_comment_events;
create trigger trg_schedule_comment_events_immutable
  before update or delete on schedule_comment_events
  for each row execute function prevent_raw_log_mutation();

-- ==============================================================================
-- Public Views & Security Grants
-- ==============================================================================

-- Public View for members (Includes phone)
drop view if exists members_public cascade;
create view members_public as
select
  id,
  name,
  part,
  phone_last4,
  phone,
  role,
  status,
  joined_at,
  member_status,
  note,
  bound_device_id,
  bound_device_at,
  merged_into_id,
  created_at,
  updated_at
from members;

-- ==============================================================================
-- Row Level Security (RLS) Activation & Policies
-- ==============================================================================
alter table members enable row level security;
alter table member_status_history enable row level security;
alter table program_cards enable row level security;
alter table locations enable row level security;
alter table schedules enable row level security;
alter table rsvp_votes enable row level security;
alter table attendance_logs enable row level security;
alter table schedule_comment_events enable row level security;
alter table app_config enable row level security;
alter table app_secrets enable row level security;

-- Read policies for public tables (select allowed for anon & authenticated)
drop policy if exists "Allow read members" on members;
create policy "Allow read members" on members for select using (true);

drop policy if exists "Allow read member_status_history" on member_status_history;
create policy "Allow read member_status_history" on member_status_history for select using (true);

drop policy if exists "Allow read program_cards" on program_cards;
create policy "Allow read program_cards" on program_cards for select using (true);

drop policy if exists "Allow read locations" on locations;
create policy "Allow read locations" on locations for select using (true);

drop policy if exists "Allow read schedules" on schedules;
create policy "Allow read schedules" on schedules for select using (true);

drop policy if exists "Allow read rsvp_votes" on rsvp_votes;
create policy "Allow read rsvp_votes" on rsvp_votes for select using (true);

drop policy if exists "Allow read attendance_logs" on attendance_logs;
create policy "Allow read attendance_logs" on attendance_logs for select using (true);

drop policy if exists "Allow read schedule_comment_events" on schedule_comment_events;
create policy "Allow read schedule_comment_events" on schedule_comment_events for select using (true);

drop policy if exists "Allow read app_config" on app_config;
create policy "Allow read app_config" on app_config for select using (true);

-- NOTICE: app_secrets has RLS enabled but NO policies, completely shielding it from anon/authenticated.
-- Direct INSERT/UPDATE/DELETE are blocked because no mutation policies exist.
-- Writes are only permitted through SECURITY DEFINER functions (RPC).



-- ==============================================================================
-- Moonchoir Rollbook — Supabase Database Migration (01_rpc_functions.sql)
-- Stored Procedures / RPC Functions for all 26 Real Actions & Snapshot Retrieval
-- Security: SECURITY DEFINER ensures atomic transactions and protected secrets access
-- ==============================================================================

-- Helper: KST current timestamp string (YYYY-MM-DD HH:mm:ss)
create or replace function fn_get_kst_now_string()
returns text as $$
begin
  return to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS');
end;
$$ language plpgsql;

-- ------------------------------------------------------------------------------
-- 1. Full Snapshot Reader (Replaces GAS doGet GET_INITIAL_DATA, executed in ~10ms)
-- ------------------------------------------------------------------------------
create or replace function fn_get_initial_snapshot()
returns jsonb
security definer
language plpgsql as $$
declare
  v_members jsonb;
  v_schedules jsonb;
  v_rsvp_votes jsonb;
  v_logs jsonb;
  v_locations jsonb;
  v_member_history jsonb;
  v_program_cards jsonb;
  v_comments jsonb;
  v_config jsonb;
begin
  -- 1. Members
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', m.id,
      'name', m.name,
      'part', m.part,
      'phoneLast4', m.phone_last4,
      'phone', m.phone,
      'role', m.role,
      'status', m.status,
      'joinedAt', m.joined_at,
      'memberStatus', m.member_status,
      'note', m.note,
      'boundDeviceId', m.bound_device_id,
      'boundDeviceAt', m.bound_device_at,
      'mergedIntoId', m.merged_into_id,
      'createdAt', to_char(m.created_at at time zone 'Asia/Seoul', 'YYYY-MM-DD"T"HH24:MI:SSOF')
    ) order by m.name
  ), '[]'::jsonb) into v_members from members m;

  -- 2. Schedules
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'title', s.title,
      'date', s.date,
      'startTime', s.start_time,
      'endTime', s.end_time,
      'locationName', s.location_name,
      'locationId', s.location_id,
      'latitude', s.latitude,
      'longitude', s.longitude,
      'radiusMeters', s.radius_meters,
      'category', s.category,
      'checkInPin', s.check_in_pin,
      'description', s.description,
      'programId', s.program_id,
      'seriesId', s.series_id,
      'seriesIndex', s.series_index,
      'seriesTotal', s.series_total,
      'isArchived', s.is_archived,
      'isCancelled', s.is_cancelled,
      'targetAudienceType', s.target_audience_type,
      'targetParts', coalesce(to_jsonb(s.target_parts), '[]'::jsonb),
      'targetMemberIds', coalesce(to_jsonb(s.target_member_ids), '[]'::jsonb),
      'visibility', s.visibility
    ) order by s.date, s.start_time
  ), '[]'::jsonb) into v_schedules from schedules s;

  -- 3. RSVP Votes
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'scheduleId', r.schedule_id,
      'memberId', r.member_id,
      'memberName', r.member_name,
      'part', r.part,
      'status', r.status,
      'reason', r.reason,
      'timestamp', r.timestamp
    )
  ), '[]'::jsonb) into v_rsvp_votes from rsvp_votes r;

  -- 4. Raw Attendance Logs (Ordered by seq to preserve append-order projection)
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', l.id,
      'timestamp', l.timestamp,
      'scheduleId', l.schedule_id,
      'memberId', l.member_id,
      'memberName', l.member_name,
      'part', l.part,
      'authMethod', l.auth_method,
      'isVerifiedLocation', l.is_verified_location,
      'adminNote', l.admin_note,
      'distanceMeters', l.distance_meters,
      'deviceId', l.device_id
    ) order by l.seq asc
  ), '[]'::jsonb) into v_logs from attendance_logs l;

  -- 5. Locations
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', loc.id,
      'name', loc.name,
      'address', loc.address,
      'detailAddress', loc.detail_address,
      'entranceNote', loc.entrance_note,
      'latitude', loc.latitude,
      'longitude', loc.longitude,
      'radiusMeters', loc.radius_meters,
      'isDefault', loc.is_default
    ) order by loc.name
  ), '[]'::jsonb) into v_locations from locations loc;

  -- 6. Member History
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', h.id,
      'memberId', h.member_id,
      'name', h.name,
      'status', h.status,
      'part', h.part,
      'startDate', h.start_date,
      'endDate', h.end_date,
      'reason', h.reason,
      'createdAt', h.created_at
    ) order by h.start_date desc
  ), '[]'::jsonb) into v_member_history from member_status_history h;

  -- 7. Program Cards
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'title', c.title,
      'description', c.description,
      'category', c.category,
      'defaultLocationId', c.default_location_id,
      'defaultStartTime', c.default_start_time,
      'defaultEndTime', c.default_end_time,
      'isArchived', c.is_archived,
      'createdAt', c.created_at,
      'targetAudienceType', c.target_audience_type,
      'targetParts', coalesce(to_jsonb(c.target_parts), '[]'::jsonb),
      'targetMemberIds', coalesce(to_jsonb(c.target_member_ids), '[]'::jsonb)
    ) order by c.created_at desc
  ), '[]'::jsonb) into v_program_cards from program_cards c;

  -- 8. Comments (Ordered by seq asc to preserve event projection folding)
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', cmt.id,
      'scheduleId', cmt.schedule_id,
      'memberId', cmt.member_id,
      'memberName', cmt.member_name,
      'part', cmt.part,
      'action', cmt.action,
      'targetId', cmt.target_id,
      'text', cmt.text,
      'timestamp', cmt.timestamp,
      'deviceId', cmt.device_id
    ) order by cmt.seq asc
  ), '[]'::jsonb) into v_comments from schedule_comment_events cmt;

  -- 9. Config (Key-Value map from app_config)
  select coalesce(jsonb_object_agg(cfg.key, cfg.value), '{}'::jsonb)
    into v_config from app_config cfg;

  return jsonb_build_object(
    'success', true,
    'timestamp', fn_get_kst_now_string(),
    'data', jsonb_build_object(
      'members', v_members,
      'schedules', v_schedules,
      'rsvpVotes', v_rsvp_votes,
      'logs', v_logs,
      'locations', v_locations,
      'memberHistory', v_member_history,
      'programCards', v_program_cards,
      'comments', v_comments,
      'config', v_config
    )
  );
end;
$$;

-- ------------------------------------------------------------------------------
-- 2. PIN Verification Functions
-- ------------------------------------------------------------------------------
create or replace function fn_verify_admin_pin(p_pin text)
returns jsonb
security definer
language plpgsql as $$
declare
  v_real_pin text;
begin
  select value into v_real_pin from app_secrets where key = 'adminPin';
  if v_real_pin is null then
    return jsonb_build_object('success', false, 'message', '관리자 PIN이 설정되지 않았습니다.');
  end if;

  if trim(p_pin) = trim(v_real_pin) then
    return jsonb_build_object('success', true, 'message', '관리자 인증 성공');
  else
    return jsonb_build_object('success', false, 'message', '관리자 PIN 번호가 일치하지 않습니다.');
  end if;
end;
$$;

create or replace function fn_verify_on_site_pin(p_pin text)
returns jsonb
security definer
language plpgsql as $$
declare
  v_real_pin text;
begin
  select value into v_real_pin from app_secrets where key = 'activeOnSitePin';
  if v_real_pin is null then
    return jsonb_build_object('success', false, 'message', '현장 인증 PIN이 설정되지 않았습니다.');
  end if;

  if trim(p_pin) = trim(v_real_pin) then
    return jsonb_build_object('success', true, 'message', '현장 PIN 인증 성공');
  else
    return jsonb_build_object('success', false, 'message', '현장 PIN 번호가 일치하지 않습니다.');
  end if;
end;
$$;

create or replace function fn_verify_super_admin_pin(p_pin text)
returns jsonb
security definer
language plpgsql as $$
declare
  v_real_pin text;
begin
  select value into v_real_pin from app_secrets where key = 'superAdminPin';
  if v_real_pin is null then
    v_real_pin := '2315';
  end if;

  if trim(p_pin) = trim(v_real_pin) then
    return jsonb_build_object('success', true, 'message', '최고 관리자 인증 성공');
  else
    return jsonb_build_object('success', false, 'message', '최고 관리자 PIN 번호가 일치하지 않습니다.');
  end if;
end;
$$;

create or replace function fn_get_admin_secrets()
returns jsonb
security definer
language plpgsql as $$
declare
  v_admin_pin text;
  v_on_site_pin text;
  v_super_pin text;
begin
  select value into v_admin_pin from app_secrets where key = 'adminPin';
  select value into v_on_site_pin from app_secrets where key = 'activeOnSitePin';
  select value into v_super_pin from app_secrets where key = 'superAdminPin';

  return jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'adminPin', coalesce(v_admin_pin, '1004'),
      'activeOnSitePin', coalesce(v_on_site_pin, '5027'),
      'superAdminPin', coalesce(v_super_pin, '2315')
    )
  );
end;
$$;

-- ------------------------------------------------------------------------------
-- 3. Attendance Recording & Clearing (Append-Only Event Sourcing with Idempotency)
-- ------------------------------------------------------------------------------
create or replace function fn_record_attendance(p_payload jsonb)
returns jsonb
security definer
language plpgsql as $$
declare
  v_log_id text := p_payload->>'id';
  v_auth_method text := p_payload->>'authMethod';
  v_input_pin text := p_payload->>'inputPin';
  v_active_pin text;
begin
  if v_log_id is null or v_log_id = '' then
    return jsonb_build_object('success', false, 'message', '출석 로그 ID가 누락되었습니다.');
  end if;

  -- 1. Idempotency Check: If already recorded, return success without duplicate append
  if exists (select 1 from attendance_logs where id = v_log_id) then
    return jsonb_build_object('success', true, 'message', '이미 출석이 기록되었습니다.');
  end if;

  -- 2. Manual PIN Validation
  if v_auth_method = 'MANUAL_PIN' then
    select value into v_active_pin from app_secrets where key = 'activeOnSitePin';
    if v_active_pin is null or trim(v_input_pin) != trim(v_active_pin) then
      return jsonb_build_object('success', false, 'message', '현장 출석 PIN 번호가 일치하지 않습니다.');
    end if;
  end if;

  -- 3. Append to attendance_logs
  insert into attendance_logs (
    id, timestamp, schedule_id, member_id, member_name, part,
    auth_method, is_verified_location, admin_note, distance_meters, device_id
  ) values (
    v_log_id,
    coalesce(p_payload->>'timestamp', fn_get_kst_now_string()),
    p_payload->>'scheduleId',
    p_payload->>'memberId',
    p_payload->>'memberName',
    p_payload->>'part',
    v_auth_method,
    coalesce((p_payload->>'isVerifiedLocation')::boolean, false),
    coalesce(p_payload->>'adminNote', ''),
    (p_payload->>'distanceMeters')::numeric,
    coalesce(p_payload->>'deviceId', '')
  );

  return jsonb_build_object('success', true, 'message', '출석이 성공적으로 저장되었습니다.');
end;
$$;

create or replace function fn_clear_attendance(p_payload jsonb)
returns jsonb
security definer
language plpgsql as $$
declare
  v_log_id text := 'clear_' || replace(gen_random_uuid()::text, '-', '');
begin
  insert into attendance_logs (
    id, timestamp, schedule_id, member_id, member_name, part,
    auth_method, is_verified_location, admin_note, device_id
  ) values (
    v_log_id,
    fn_get_kst_now_string(),
    p_payload->>'scheduleId',
    p_payload->>'memberId',
    coalesce(p_payload->>'memberName', ''),
    coalesce(p_payload->>'part', ''),
    'MANUAL_BY_ADMIN',
    true,
    '[ATTENDANCE_CLEARED] 관리자 초기화',
    coalesce(p_payload->>'deviceId', '')
  );

  return jsonb_build_object('success', true, 'message', '출석이 성공적으로 초기화되었습니다.');
end;
$$;

-- ------------------------------------------------------------------------------
-- 4. Comments Event Recording (Append-Only)
-- ------------------------------------------------------------------------------
create or replace function fn_add_comment(p_payload jsonb)
returns jsonb
security definer
language plpgsql as $$
begin
  insert into schedule_comment_events (
    id, schedule_id, member_id, member_name, part,
    action, target_id, text, timestamp, device_id
  ) values (
    p_payload->>'id',
    p_payload->>'scheduleId',
    p_payload->>'memberId',
    p_payload->>'memberName',
    p_payload->>'part',
    'CREATE',
    coalesce(p_payload->>'targetId', ''),
    p_payload->>'text',
    coalesce(p_payload->>'timestamp', fn_get_kst_now_string()),
    coalesce(p_payload->>'deviceId', '')
  );
  return jsonb_build_object('success', true, 'message', '댓글이 등록되었습니다.');
end;
$$;

create or replace function fn_edit_comment(p_payload jsonb)
returns jsonb
security definer
language plpgsql as $$
begin
  insert into schedule_comment_events (
    id, schedule_id, member_id, member_name, part,
    action, target_id, text, timestamp, device_id
  ) values (
    p_payload->>'id',
    p_payload->>'scheduleId',
    p_payload->>'memberId',
    p_payload->>'memberName',
    p_payload->>'part',
    'EDIT',
    p_payload->>'targetId',
    p_payload->>'text',
    coalesce(p_payload->>'timestamp', fn_get_kst_now_string()),
    coalesce(p_payload->>'deviceId', '')
  );
  return jsonb_build_object('success', true, 'message', '댓글이 수정되었습니다.');
end;
$$;

create or replace function fn_delete_comment(p_payload jsonb)
returns jsonb
security definer
language plpgsql as $$
begin
  insert into schedule_comment_events (
    id, schedule_id, member_id, member_name, part,
    action, target_id, text, timestamp, device_id
  ) values (
    p_payload->>'id',
    p_payload->>'scheduleId',
    p_payload->>'memberId',
    p_payload->>'memberName',
    p_payload->>'part',
    'DELETE',
    p_payload->>'targetId',
    '',
    coalesce(p_payload->>'timestamp', fn_get_kst_now_string()),
    coalesce(p_payload->>'deviceId', '')
  );
  return jsonb_build_object('success', true, 'message', '댓글이 삭제되었습니다.');
end;
$$;

-- ------------------------------------------------------------------------------
-- 5. RSVP Submission & Cancellation (Deduplication + Moving 1-hour Cutoff Check)
-- ------------------------------------------------------------------------------
create or replace function fn_submit_rsvp(p_payload jsonb)
returns jsonb
security definer
language plpgsql as $$
declare
  v_schedule_id text := p_payload->>'scheduleId';
  v_member_id text := p_payload->>'memberId';
  v_is_admin boolean := coalesce((p_payload->>'isAdmin')::boolean, false);
  v_schedule_date text;
  v_schedule_time text;
  v_cutoff_time timestamptz;
begin
  -- Moving 1-hour cutoff check for non-admin members
  if not v_is_admin then
    select date, start_time into v_schedule_date, v_schedule_time
      from schedules where id = v_schedule_id;

    if v_schedule_date is not null and v_schedule_time is not null then
      v_cutoff_time := (v_schedule_date || ' ' || v_schedule_time || ':00+09')::timestamptz - interval '1 hour';
      if now() >= v_cutoff_time then
        return jsonb_build_object('success', false, 'message', '연습 시작 1시간 전 투표 마감되었습니다.');
      end if;
    end if;
  end if;

  -- Upsert: Update existing response or insert new
  insert into rsvp_votes (
    id, schedule_id, member_id, member_name, part, status, reason, timestamp
  ) values (
    coalesce(p_payload->>'id', 'rsvp_' || replace(gen_random_uuid()::text, '-', '')),
    v_schedule_id,
    v_member_id,
    p_payload->>'memberName',
    p_payload->>'part',
    p_payload->>'status',
    coalesce(p_payload->>'reason', ''),
    coalesce(p_payload->>'timestamp', fn_get_kst_now_string())
  )
  on conflict (schedule_id, member_id) do update set
    status = excluded.status,
    reason = excluded.reason,
    timestamp = excluded.timestamp,
    received_at = now();

  return jsonb_build_object('success', true, 'message', '투표가 반영되었습니다.');
end;
$$;

create or replace function fn_cancel_rsvp(p_payload jsonb)
returns jsonb
security definer
language plpgsql as $$
begin
  delete from rsvp_votes
   where schedule_id = p_payload->>'scheduleId'
     and member_id = p_payload->>'memberId';

  return jsonb_build_object('success', true, 'message', '투표가 취소되었습니다.');
end;
$$;

-- ------------------------------------------------------------------------------
-- 6. Member Registration, Binding & Management
-- ------------------------------------------------------------------------------
create or replace function fn_register_and_bind_member(p_payload jsonb)
returns jsonb
security definer
language plpgsql as $$
declare
  v_name text := trim(p_payload->>'name');
  v_phone text := regexp_replace(coalesce(p_payload->>'phone', ''), '[^0-9]', '', 'g');
  v_existing_id text;
  v_new_id text := coalesce(p_payload->>'id', 'mem_new_' || extract(epoch from now())::bigint);
begin
  -- 1. Check duplicate active member by name + normalized phone
  select id into v_existing_id
    from members
   where trim(name) = v_name
     and regexp_replace(phone, '[^0-9]', '', 'g') = v_phone
     and status in ('ACTIVE', 'INACTIVE')
   limit 1;

  if v_existing_id is not null then
    return jsonb_build_object(
      'success', false,
      'message', '이미 등록된 단원입니다.',
      'existingMemberId', v_existing_id
    );
  end if;

  -- 2. Insert new member
  insert into members (
    id, name, part, phone_last4, phone, role, status, joined_at,
    member_status, note, bound_device_id, bound_device_at
  ) values (
    v_new_id,
    v_name,
    coalesce(p_payload->>'part', '소프라노'),
    coalesce(p_payload->>'phoneLast4', right(v_phone, 4)),
    coalesce(p_payload->>'phone', ''),
    coalesce(p_payload->>'role', 'MEMBER'),
    'ACTIVE',
    coalesce(p_payload->>'joinedAt', to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD')),
    coalesce(p_payload->>'memberStatus', '정단원'),
    coalesce(p_payload->>'note', ''),
    coalesce(p_payload->>'deviceId', ''),
    fn_get_kst_now_string()
  );

  return jsonb_build_object(
    'success', true,
    'message', '단원 가입 및 기기 연동 완료',
    'existingMemberId', v_new_id
  );
end;
$$;

create or replace function fn_bind_existing_member(p_payload jsonb)
returns jsonb
security definer
language plpgsql as $$
declare
  v_member_id text := p_payload->>'memberId';
  v_input_phone text := regexp_replace(coalesce(p_payload->>'phone', ''), '[^0-9]', '', 'g');
  v_row members%rowtype;
  v_stored_phone text;
begin
  select * into v_row from members where id = v_member_id;
  if not found then
    return jsonb_build_object('success', false, 'message', '단원 정보를 찾을 수 없습니다.');
  end if;

  v_stored_phone := regexp_replace(coalesce(v_row.phone, ''), '[^0-9]', '', 'g');

  -- Verify full phone or fallback to last 4 digits
  if v_stored_phone != '' then
    if v_stored_phone != v_input_phone then
      return jsonb_build_object('success', false, 'message', '전화번호가 등록된 정보와 일치하지 않습니다.');
    end if;
  else
    if v_row.phone_last4 != '' and v_row.phone_last4 != right(v_input_phone, 4) then
      return jsonb_build_object('success', false, 'message', '전화번호 뒷자리가 일치하지 않습니다.');
    end if;
  end if;

  -- Record first bound device if empty
  update members
     set bound_device_id = case when bound_device_id = '' or bound_device_id is null then coalesce(p_payload->>'deviceId', '') else bound_device_id end,
         bound_device_at = case when bound_device_at = '' or bound_device_at is null then fn_get_kst_now_string() else bound_device_at end,
         updated_at = now()
   where id = v_member_id;

  return jsonb_build_object('success', true, 'message', '기기 연동이 확인되었습니다.');
end;
$$;

create or replace function fn_register_member(p_payload jsonb)
returns jsonb
security definer
language plpgsql as $$
declare
  v_name text := trim(p_payload->>'name');
  v_phone text := regexp_replace(coalesce(p_payload->>'phone', ''), '[^0-9]', '', 'g');
  v_new_id text := coalesce(p_payload->>'id', 'mem_new_' || extract(epoch from now())::bigint);
begin
  insert into members (
    id, name, part, phone_last4, phone, role, status, joined_at, member_status, note
  ) values (
    v_new_id,
    v_name,
    coalesce(p_payload->>'part', '소프라노'),
    coalesce(p_payload->>'phoneLast4', right(v_phone, 4)),
    coalesce(p_payload->>'phone', ''),
    coalesce(p_payload->>'role', 'MEMBER'),
    'ACTIVE',
    coalesce(p_payload->>'joinedAt', to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD')),
    coalesce(p_payload->>'memberStatus', '정단원'),
    coalesce(p_payload->>'note', '')
  );

  return jsonb_build_object('success', true, 'message', '단원이 등록되었습니다.', 'existingMemberId', v_new_id);
end;
$$;

create or replace function fn_update_member(p_payload jsonb)
returns jsonb
security definer
language plpgsql as $$
begin
  update members
     set name = coalesce(p_payload->>'name', name),
         part = coalesce(p_payload->>'part', part),
         phone_last4 = coalesce(p_payload->>'phoneLast4', phone_last4),
         phone = coalesce(p_payload->>'phone', phone),
         role = coalesce(p_payload->>'role', role),
         status = coalesce(p_payload->>'status', status),
         joined_at = coalesce(p_payload->>'joinedAt', joined_at),
         member_status = coalesce(p_payload->>'memberStatus', member_status),
         note = coalesce(p_payload->>'note', note),
         updated_at = now()
   where id = p_payload->>'id';

  return jsonb_build_object('success', true, 'message', '단원 정보가 수정되었습니다.');
end;
$$;

create or replace function fn_add_member_history(p_payload jsonb)
returns jsonb
security definer
language plpgsql as $$
begin
  insert into member_status_history (
    id, member_id, name, status, part, start_date, end_date, reason, created_at
  ) values (
    coalesce(p_payload->>'id', 'hist_' || replace(gen_random_uuid()::text, '-', '')),
    p_payload->>'memberId',
    coalesce(p_payload->>'name', ''),
    coalesce(p_payload->>'status', ''),
    coalesce(p_payload->>'part', ''),
    coalesce(p_payload->>'startDate', to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD')),
    coalesce(p_payload->>'endDate', '2999-12-31'),
    coalesce(p_payload->>'reason', ''),
    fn_get_kst_now_string()
  );

  return jsonb_build_object('success', true, 'message', '단원 이력이 추가되었습니다.');
end;
$$;

create or replace function fn_delete_member(p_payload jsonb)
returns jsonb
security definer
language plpgsql as $$
declare
  v_member_id text := p_payload->>'id';
  v_is_merged boolean;
begin
  -- 1. Protect merged rows and rows targeted by merged_into_id
  select (status = 'MERGED' or exists(select 1 from members where merged_into_id = v_member_id))
    into v_is_merged from members where id = v_member_id;

  if v_is_merged then
    return jsonb_build_object('success', false, 'message', '병합 이력이 연결된 단원은 물리 삭제할 수 없습니다.');
  end if;

  -- 2. Physical delete only if no attendance or rsvp records exist, otherwise soft-delete
  if exists(select 1 from attendance_logs where member_id = v_member_id) or
     exists(select 1 from rsvp_votes where member_id = v_member_id) then
    update members set status = 'DELETED', updated_at = now() where id = v_member_id;
    return jsonb_build_object('success', true, 'message', '출석 이력이 있어 비활성화(삭제) 처리되었습니다.');
  else
    delete from members where id = v_member_id;
    return jsonb_build_object('success', true, 'message', '단원이 삭제되었습니다.');
  end if;
end;
$$;

create or replace function fn_merge_members(p_payload jsonb)
returns jsonb
security definer
language plpgsql as $$
declare
  v_rep_id text := p_payload->>'representativeId';
  v_dup_ids text[] := array(select jsonb_array_elements_text(p_payload->'mergedMemberIds'));
begin
  -- Raw attendance log member IDs remain strictly immutable!
  -- Point merged members to representativeId and mark as MERGED
  update members
     set status = 'MERGED',
         merged_into_id = v_rep_id,
         updated_at = now()
   where id = any(v_dup_ids)
     and id != v_rep_id;

  return jsonb_build_object('success', true, 'message', '단원이 성공적으로 병합되었습니다.');
end;
$$;

-- ------------------------------------------------------------------------------
-- 7. Schedule Management (Create, Update, Delete, Batch)
-- ------------------------------------------------------------------------------
create or replace function fn_create_schedule(p_payload jsonb)
returns jsonb
security definer
language plpgsql as $$
begin
  insert into schedules (
    id, title, date, start_time, end_time, location_name, location_id,
    latitude, longitude, radius_meters, category, check_in_pin, description,
    program_id, series_id, series_index, series_total, is_archived, is_cancelled,
    target_audience_type, target_parts, target_member_ids, visibility
  ) values (
    p_payload->>'id',
    p_payload->>'title',
    p_payload->>'date',
    p_payload->>'startTime',
    p_payload->>'endTime',
    coalesce(p_payload->>'locationName', ''),
    p_payload->>'locationId',
    (p_payload->>'targetLat')::double precision,
    (p_payload->>'targetLon')::double precision,
    (p_payload->>'radiusMeters')::integer,
    coalesce(p_payload->>'category', '정기연습'),
    coalesce(p_payload->>'checkInPin', ''),
    coalesce(p_payload->>'description', ''),
    p_payload->>'programId',
    p_payload->>'seriesId',
    (p_payload->>'seriesIndex')::integer,
    (p_payload->>'seriesTotal')::integer,
    coalesce((p_payload->>'isArchived')::boolean, false),
    coalesce((p_payload->>'isCancelled')::boolean, false),
    coalesce(p_payload->>'targetAudienceType', 'ALL'),
    array(select jsonb_array_elements_text(coalesce(p_payload->'targetParts', '[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(p_payload->'targetMemberIds', '[]'::jsonb))),
    coalesce(p_payload->>'visibility', 'ALL')
  );

  return jsonb_build_object('success', true, 'message', '일정이 등록되었습니다.');
end;
$$;

create or replace function fn_update_schedule(p_payload jsonb)
returns jsonb
security definer
language plpgsql as $$
begin
  update schedules
     set title = coalesce(p_payload->>'title', title),
         date = coalesce(p_payload->>'date', date),
         start_time = coalesce(p_payload->>'startTime', start_time),
         end_time = coalesce(p_payload->>'endTime', end_time),
         location_name = coalesce(p_payload->>'locationName', location_name),
         location_id = coalesce(p_payload->>'locationId', location_id),
         latitude = coalesce((p_payload->>'targetLat')::double precision, latitude),
         longitude = coalesce((p_payload->>'targetLon')::double precision, longitude),
         radius_meters = coalesce((p_payload->>'radiusMeters')::integer, radius_meters),
         category = coalesce(p_payload->>'category', category),
         check_in_pin = coalesce(p_payload->>'checkInPin', check_in_pin),
         description = coalesce(p_payload->>'description', description),
         program_id = coalesce(p_payload->>'programId', program_id),
         series_id = coalesce(p_payload->>'seriesId', series_id),
         series_index = coalesce((p_payload->>'seriesIndex')::integer, series_index),
         series_total = coalesce((p_payload->>'seriesTotal')::integer, series_total),
         is_archived = coalesce((p_payload->>'isArchived')::boolean, is_archived),
         is_cancelled = coalesce((p_payload->>'isCancelled')::boolean, is_cancelled),
         target_audience_type = coalesce(p_payload->>'targetAudienceType', target_audience_type),
         target_parts = case when p_payload ? 'targetParts' then array(select jsonb_array_elements_text(p_payload->'targetParts')) else target_parts end,
         target_member_ids = case when p_payload ? 'targetMemberIds' then array(select jsonb_array_elements_text(p_payload->'targetMemberIds')) else target_member_ids end,
         visibility = coalesce(p_payload->>'visibility', visibility),
         updated_at = now()
   where id = p_payload->>'id';

  return jsonb_build_object('success', true, 'message', '일정이 수정되었습니다.');
end;
$$;

create or replace function fn_delete_schedule(p_payload jsonb)
returns jsonb
security definer
language plpgsql as $$
begin
  delete from schedules where id = p_payload->>'id';
  return jsonb_build_object('success', true, 'message', '일정이 삭제되었습니다.');
end;
$$;

create or replace function fn_batch_delete_schedules(p_payload jsonb)
returns jsonb
security definer
language plpgsql as $$
declare
  v_ids text[] := array(select jsonb_array_elements_text(p_payload->'scheduleIds'));
begin
  delete from schedules where id = any(v_ids);
  return jsonb_build_object('success', true, 'message', '일정들이 일괄 삭제되었습니다.');
end;
$$;

create or replace function fn_batch_update_schedules(p_payload jsonb)
returns jsonb
security definer
language plpgsql as $$
declare
  v_sched jsonb;
begin
  for v_sched in select * from jsonb_array_elements(p_payload->'schedules') loop
    perform fn_update_schedule(v_sched);
  end loop;

  return jsonb_build_object('success', true, 'message', '일정들이 일괄 수정되었습니다.');
end;
$$;

-- ------------------------------------------------------------------------------
-- 8. Locations & Program Cards Management
-- ------------------------------------------------------------------------------
create or replace function fn_save_location(p_payload jsonb)
returns jsonb
security definer
language plpgsql as $$
begin
  insert into locations (
    id, name, address, detail_address, entrance_note,
    latitude, longitude, radius_meters, is_default
  ) values (
    p_payload->>'id',
    p_payload->>'name',
    coalesce(p_payload->>'address', ''),
    coalesce(p_payload->>'detailAddress', ''),
    coalesce(p_payload->>'entranceNote', ''),
    coalesce((p_payload->>'latitude')::double precision, 0.0),
    coalesce((p_payload->>'longitude')::double precision, 0.0),
    coalesce((p_payload->>'radiusMeters')::integer, 100),
    coalesce((p_payload->>'isDefault')::boolean, false)
  )
  on conflict (id) do update set
    name = excluded.name,
    address = excluded.address,
    detail_address = excluded.detail_address,
    entrance_note = excluded.entrance_note,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    radius_meters = excluded.radius_meters,
    is_default = excluded.is_default;

  return jsonb_build_object('success', true, 'message', '장소가 저장되었습니다.');
end;
$$;

create or replace function fn_delete_location(p_payload jsonb)
returns jsonb
security definer
language plpgsql as $$
begin
  delete from locations where id = p_payload->>'id';
  return jsonb_build_object('success', true, 'message', '장소가 삭제되었습니다.');
end;
$$;

create or replace function fn_save_program_card(p_payload jsonb)
returns jsonb
security definer
language plpgsql as $$
begin
  insert into program_cards (
    id, title, description, category, default_location_id,
    default_start_time, default_end_time, is_archived, created_at,
    target_audience_type, target_parts, target_member_ids
  ) values (
    p_payload->>'id',
    p_payload->>'title',
    coalesce(p_payload->>'description', ''),
    coalesce(p_payload->>'category', ''),
    p_payload->>'defaultLocationId',
    p_payload->>'defaultStartTime',
    p_payload->>'defaultEndTime',
    coalesce((p_payload->>'isArchived')::boolean, false),
    coalesce(p_payload->>'createdAt', fn_get_kst_now_string()),
    coalesce(p_payload->>'targetAudienceType', 'ALL'),
    array(select jsonb_array_elements_text(coalesce(p_payload->'targetParts', '[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(p_payload->'targetMemberIds', '[]'::jsonb)))
  )
  on conflict (id) do update set
    title = excluded.title,
    description = excluded.description,
    category = excluded.category,
    default_location_id = excluded.default_location_id,
    default_start_time = excluded.default_start_time,
    default_end_time = excluded.default_end_time,
    is_archived = excluded.is_archived,
    target_audience_type = excluded.target_audience_type,
    target_parts = excluded.target_parts,
    target_member_ids = excluded.target_member_ids;

  return jsonb_build_object('success', true, 'message', '일정 카드가 저장되었습니다.');
end;
$$;

create or replace function fn_delete_program_card(p_payload jsonb)
returns jsonb
security definer
language plpgsql as $$
begin
  delete from program_cards where id = p_payload->>'id';
  return jsonb_build_object('success', true, 'message', '일정 카드가 삭제되었습니다.');
end;
$$;

-- ------------------------------------------------------------------------------
-- 9. Config Management (Separates public config vs app_secrets)
-- ------------------------------------------------------------------------------
create or replace function fn_save_config(p_payload jsonb)
returns jsonb
security definer
language plpgsql as $$
declare
  v_key text;
  v_val text;
begin
  for v_key, v_val in select * from jsonb_each_text(p_payload) loop
    if v_key in ('adminPin', 'activeOnSitePin', 'masterQrToken', 'superAdminPin') then
      -- Sensitive values routed to app_secrets
      insert into app_secrets (key, value, updated_at)
      values (v_key, v_val, now())
      on conflict (key) do update set value = excluded.value, updated_at = now();
    else
      -- Public settings routed to app_config
      insert into app_config (key, value, updated_at)
      values (v_key, v_val, now())
      on conflict (key) do update set value = excluded.value, updated_at = now();
    end if;
  end loop;

  return jsonb_build_object('success', true, 'message', '설정이 저장되었습니다.');
end;
$$;

-- Grant EXECUTE permission on all RPC functions to anon and authenticated roles
grant execute on function fn_get_kst_now_string to anon, authenticated;
grant execute on function fn_get_initial_snapshot to anon, authenticated;
grant execute on function fn_verify_admin_pin to anon, authenticated;
grant execute on function fn_verify_on_site_pin to anon, authenticated;
grant execute on function fn_verify_super_admin_pin to anon, authenticated;
grant execute on function fn_get_admin_secrets to anon, authenticated;
grant execute on function fn_record_attendance to anon, authenticated;
grant execute on function fn_clear_attendance to anon, authenticated;
grant execute on function fn_add_comment to anon, authenticated;
grant execute on function fn_edit_comment to anon, authenticated;
grant execute on function fn_delete_comment to anon, authenticated;
grant execute on function fn_submit_rsvp to anon, authenticated;
grant execute on function fn_cancel_rsvp to anon, authenticated;
grant execute on function fn_register_and_bind_member to anon, authenticated;
grant execute on function fn_bind_existing_member to anon, authenticated;
grant execute on function fn_register_member to anon, authenticated;
grant execute on function fn_update_member to anon, authenticated;
grant execute on function fn_add_member_history to anon, authenticated;
grant execute on function fn_delete_member to anon, authenticated;
grant execute on function fn_merge_members to anon, authenticated;
grant execute on function fn_create_schedule to anon, authenticated;
grant execute on function fn_update_schedule to anon, authenticated;
grant execute on function fn_delete_schedule to anon, authenticated;
grant execute on function fn_batch_delete_schedules to anon, authenticated;
grant execute on function fn_batch_update_schedules to anon, authenticated;
grant execute on function fn_save_location to anon, authenticated;
grant execute on function fn_delete_location to anon, authenticated;
grant execute on function fn_save_program_card to anon, authenticated;
grant execute on function fn_delete_program_card to anon, authenticated;
grant execute on function fn_save_config to anon, authenticated;
