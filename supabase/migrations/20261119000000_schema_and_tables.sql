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
