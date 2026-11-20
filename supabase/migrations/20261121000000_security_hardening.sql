-- ==============================================================================
-- Moonchoir Rollbook — Phase 0 Security Hardening (20261121000000_security_hardening.sql)
--
-- 1. Server-issued admin session tokens (admin_sessions). PIN verification issues a
--    random token; only its SHA-256 hash is stored. Admin RPCs require a valid token.
-- 2. Admin-only write RPCs are wrapped: the original body is renamed to <fn>__impl
--    (no client access) and a thin wrapper checks the token, then delegates.
-- 3. fn_get_admin_secrets requires a token (staff tier: on-site PIN only; super tier: all).
-- 4. fn_save_config requires a token; superAdminPin changes require the super tier.
-- 5. fn_import_sheets_snapshot (truncates every table) is revoked from anon/authenticated.
-- 6. Member RPCs keep anon access but no longer allow admin-only behavior without a token
--    (MANUAL_BY_ADMIN attendance, RSVP cutoff bypass, self-assigned role on registration).
-- 7. Failed PIN attempts are throttled per PIN kind.
--
-- Idempotent: safe to run more than once. Run AFTER all earlier migrations.
-- NOTE: Re-running an older migration (or all_in_one_setup.sql) recreates the original,
-- unprotected functions. Always re-run this file afterwards.
-- After applying: admin/super logins are refused until their PINs are rotated to 6+ digits
-- in the Supabase SQL editor (see docs/DEPLOYMENT.md). The on-site PIN should be rotated too.
-- ==============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------------------------
-- 1. Tables
-- ------------------------------------------------------------------------------
create table if not exists admin_sessions (
  token_hash text primary key,
  tier text not null check (tier in ('admin', 'super')),
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table admin_sessions enable row level security;
revoke all on table admin_sessions from public, anon, authenticated;

create table if not exists auth_failures (
  id bigserial primary key,
  kind text not null,
  failed_at timestamptz not null default now()
);
create index if not exists idx_auth_failures_kind_time on auth_failures(kind, failed_at);
alter table auth_failures enable row level security;
revoke all on table auth_failures from public, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 2. Internal helpers (never callable by clients)
-- ------------------------------------------------------------------------------
create or replace function fn_admin_token_hash(p_token text)
returns text
language sql immutable
set search_path = public, extensions as $$
  select encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

-- Throttle: true when the PIN kind has too many recent failures.
create or replace function fn_auth_is_locked(p_kind text, p_max integer)
returns boolean
language sql stable
set search_path = public as $$
  select count(*) >= p_max
    from auth_failures
   where kind = p_kind
     and failed_at > now() - interval '15 minutes';
$$;

create or replace function fn_auth_record_failure(p_kind text)
returns void
language sql
set search_path = public as $$
  delete from auth_failures where failed_at < now() - interval '1 day';
  insert into auth_failures (kind) values (p_kind);
$$;

create or replace function fn_issue_admin_session(p_tier text)
returns jsonb
language plpgsql
set search_path = public, extensions as $$
declare
  v_token text := encode(gen_random_bytes(32), 'hex');
  v_expires timestamptz := now() + interval '30 minutes';
begin
  delete from admin_sessions
   where expires_at < now() or created_at < now() - interval '12 hours';
  insert into admin_sessions (token_hash, tier, expires_at)
  values (fn_admin_token_hash(v_token), p_tier, v_expires);
  return jsonb_build_object('token', v_token, 'tier', p_tier, 'expiresAt', v_expires);
end;
$$;

-- Validates a token (sliding 30-minute idle window, 12-hour absolute limit).
-- p_min_tier: 'admin' accepts admin or super; 'super' accepts super only.
create or replace function fn_check_admin_token(p_token text, p_min_tier text default 'admin')
returns boolean
language plpgsql
set search_path = public as $$
declare
  v_tier text;
begin
  if p_token is null or length(p_token) < 32 then
    return false;
  end if;

  update admin_sessions
     set last_used_at = now(),
         expires_at = now() + interval '30 minutes'
   where token_hash = fn_admin_token_hash(p_token)
     and expires_at > now()
     and created_at > now() - interval '12 hours'
  returning tier into v_tier;

  if v_tier is null then
    return false;
  end if;
  return p_min_tier = 'admin' or v_tier = 'super';
end;
$$;

create or replace function fn_admin_auth_required()
returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'success', false,
    'code', 'ADMIN_AUTH_REQUIRED',
    'message', '관리자 인증이 필요합니다. 다시 로그인해 주세요.'
  );
$$;

revoke all on function fn_admin_token_hash(text) from public, anon, authenticated;
revoke all on function fn_auth_is_locked(text, integer) from public, anon, authenticated;
revoke all on function fn_auth_record_failure(text) from public, anon, authenticated;
revoke all on function fn_issue_admin_session(text) from public, anon, authenticated;
revoke all on function fn_check_admin_token(text, text) from public, anon, authenticated;
revoke all on function fn_admin_auth_required() from public, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 3. PIN verification (issues tokens, throttled, no hardcoded fallbacks)
-- ------------------------------------------------------------------------------
create or replace function fn_verify_admin_pin(p_pin text)
returns jsonb
security definer
set search_path = public, extensions
language plpgsql as $$
declare
  v_real_pin text;
begin
  if fn_auth_is_locked('adminPin', 20) then
    return jsonb_build_object('success', false, 'message', '시도 횟수가 너무 많습니다. 15분 후 다시 시도해 주세요.');
  end if;

  select value into v_real_pin from app_secrets where key = 'adminPin';
  if v_real_pin is null or trim(v_real_pin) = '' then
    return jsonb_build_object('success', false, 'message', '관리자 PIN이 설정되지 않았습니다.');
  end if;
  -- Old 4-digit PINs were published in the repository: refuse them until rotated.
  if length(trim(v_real_pin)) < 6 then
    return jsonb_build_object('success', false, 'message', '보안 업데이트로 관리자 PIN 교체가 필요합니다. 시스템 소유자에게 문의해 주세요.');
  end if;

  if trim(coalesce(p_pin, '')) <> '' and trim(p_pin) = trim(v_real_pin) then
    return jsonb_build_object(
      'success', true,
      'message', '관리자 인증 성공',
      'data', fn_issue_admin_session('admin')
    );
  end if;

  perform fn_auth_record_failure('adminPin');
  return jsonb_build_object('success', false, 'message', '관리자 PIN 번호가 일치하지 않습니다.');
end;
$$;

create or replace function fn_verify_super_admin_pin(p_pin text)
returns jsonb
security definer
set search_path = public, extensions
language plpgsql as $$
declare
  v_real_pin text;
begin
  if fn_auth_is_locked('superAdminPin', 10) then
    return jsonb_build_object('success', false, 'message', '시도 횟수가 너무 많습니다. 15분 후 다시 시도해 주세요.');
  end if;

  select value into v_real_pin from app_secrets where key = 'superAdminPin';
  if v_real_pin is null or trim(v_real_pin) = '' then
    return jsonb_build_object('success', false, 'message', '최고 관리자 PIN이 설정되지 않았습니다.');
  end if;
  -- Old 4-digit PINs were published in the repository: refuse them until rotated.
  if length(trim(v_real_pin)) < 6 then
    return jsonb_build_object('success', false, 'message', '보안 업데이트로 최고 관리자 PIN 교체가 필요합니다. 시스템 소유자에게 문의해 주세요.');
  end if;

  if trim(coalesce(p_pin, '')) <> '' and trim(p_pin) = trim(v_real_pin) then
    return jsonb_build_object(
      'success', true,
      'message', '최고 관리자 인증 성공',
      'data', fn_issue_admin_session('super')
    );
  end if;

  perform fn_auth_record_failure('superAdminPin');
  return jsonb_build_object('success', false, 'message', '최고 관리자 PIN 번호가 일치하지 않습니다.');
end;
$$;

create or replace function fn_verify_on_site_pin(p_pin text)
returns jsonb
security definer
set search_path = public
language plpgsql as $$
declare
  v_real_pin text;
begin
  if fn_auth_is_locked('activeOnSitePin', 60) then
    return jsonb_build_object('success', false, 'message', '시도 횟수가 너무 많습니다. QR로 출석하거나 15분 후 다시 시도해 주세요.');
  end if;

  select value into v_real_pin from app_secrets where key = 'activeOnSitePin';
  if v_real_pin is null or trim(v_real_pin) = '' then
    return jsonb_build_object('success', false, 'message', '현장 인증 PIN이 설정되지 않았습니다.');
  end if;

  if trim(coalesce(p_pin, '')) <> '' and trim(p_pin) = trim(v_real_pin) then
    return jsonb_build_object('success', true, 'message', '현장 PIN 인증 성공');
  end if;

  perform fn_auth_record_failure('activeOnSitePin');
  return jsonb_build_object('success', false, 'message', '현장 PIN 번호가 일치하지 않습니다.');
end;
$$;

-- Server-side logout: invalidate a token.
create or replace function fn_admin_logout(p_token text)
returns jsonb
security definer
set search_path = public, extensions
language plpgsql as $$
begin
  delete from admin_sessions where token_hash = fn_admin_token_hash(p_token);
  return jsonb_build_object('success', true, 'message', '로그아웃되었습니다.');
end;
$$;

-- ------------------------------------------------------------------------------
-- 4. Secrets read: token required. No default values are ever returned.
-- ------------------------------------------------------------------------------
drop function if exists fn_get_admin_secrets();

create or replace function fn_get_admin_secrets(p_token text)
returns jsonb
security definer
set search_path = public, extensions
language plpgsql as $$
declare
  v_is_super boolean;
  v_data jsonb;
begin
  if not fn_check_admin_token(p_token, 'admin') then
    return fn_admin_auth_required();
  end if;
  v_is_super := fn_check_admin_token(p_token, 'super');

  v_data := jsonb_build_object(
    'activeOnSitePin', coalesce((select value from app_secrets where key = 'activeOnSitePin'), '')
  );
  if v_is_super then
    v_data := v_data || jsonb_build_object(
      'adminPin', coalesce((select value from app_secrets where key = 'adminPin'), ''),
      'superAdminPin', coalesce((select value from app_secrets where key = 'superAdminPin'), '')
    );
  end if;

  return jsonb_build_object('success', true, 'data', v_data);
end;
$$;

-- ------------------------------------------------------------------------------
-- 5. Wrap admin-only write RPCs: <fn>(p_payload jsonb) -> token check -> <fn>__impl
-- ------------------------------------------------------------------------------
do $do$
declare
  f text;
  v_admin_fns text[] := array[
    'fn_clear_attendance',
    'fn_register_member',
    'fn_update_member',
    'fn_add_member_history',
    'fn_delete_member',
    'fn_merge_members',
    'fn_create_schedule',
    'fn_update_schedule',
    'fn_delete_schedule',
    'fn_batch_delete_schedules',
    'fn_batch_update_schedules',
    'fn_save_location',
    'fn_delete_location',
    'fn_save_program_card',
    'fn_delete_program_card',
    'fn_save_config'
  ];
begin
  foreach f in array v_admin_fns loop
    if to_regprocedure(f || '__impl(jsonb)') is null then
      if to_regprocedure(f || '(jsonb)') is null then
        raise exception 'Expected function %(jsonb) to exist before hardening', f;
      end if;
      execute format('alter function %I(jsonb) rename to %I', f, f || '__impl');
    elsif to_regprocedure(f || '(jsonb)') is not null
      and not exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = f
           and pg_get_functiondef(p.oid) like '%\_\_impl(%'
      ) then
      -- An older migration recreated the unprotected original: make it the new impl.
      execute format('drop function %I(jsonb)', f || '__impl');
      execute format('alter function %I(jsonb) rename to %I', f, f || '__impl');
    end if;
    execute format('revoke all on function %I(jsonb) from public, anon, authenticated', f || '__impl');
  end loop;

  foreach f in array v_admin_fns loop
    if f = 'fn_save_config' then
      continue; -- custom wrapper below
    end if;
    execute format($w$
      create or replace function %1$I(p_payload jsonb)
      returns jsonb
      security definer
      set search_path = public, extensions
      language plpgsql as $b$
      begin
        if not fn_check_admin_token(p_payload->>'adminToken', 'admin') then
          return fn_admin_auth_required();
        end if;
        return %2$I(p_payload - 'adminToken');
      end;
      $b$
    $w$, f, f || '__impl');
  end loop;
end
$do$;

create or replace function fn_save_config(p_payload jsonb)
returns jsonb
security definer
set search_path = public, extensions
language plpgsql as $$
declare
  v_token text := p_payload->>'adminToken';
begin
  if not fn_check_admin_token(v_token, 'admin') then
    return fn_admin_auth_required();
  end if;
  if (p_payload ? 'superAdminPin') and not fn_check_admin_token(v_token, 'super') then
    return jsonb_build_object('success', false, 'message', '최고 관리자 PIN은 최고 관리자만 변경할 수 있습니다.');
  end if;
  return fn_save_config__impl(p_payload - 'adminToken');
end;
$$;

-- ------------------------------------------------------------------------------
-- 6. Member RPCs: keep anon access, block admin-only behavior without a token
-- ------------------------------------------------------------------------------
create or replace function fn_record_attendance(p_payload jsonb)
returns jsonb
security definer
set search_path = public, extensions
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

  -- Admin-entered attendance requires an admin session.
  if v_auth_method = 'MANUAL_BY_ADMIN'
     and not fn_check_admin_token(p_payload->>'adminToken', 'admin') then
    return fn_admin_auth_required();
  end if;

  -- Idempotency: same ID already stored -> success without a duplicate append.
  if exists (select 1 from attendance_logs where id = v_log_id) then
    return jsonb_build_object('success', true, 'message', '이미 출석이 기록되었습니다.');
  end if;

  if v_auth_method = 'MANUAL_PIN' then
    if fn_auth_is_locked('activeOnSitePin', 60) then
      return jsonb_build_object('success', false, 'message', '시도 횟수가 너무 많습니다. QR로 출석하거나 15분 후 다시 시도해 주세요.');
    end if;
    select value into v_active_pin from app_secrets where key = 'activeOnSitePin';
    if v_active_pin is null or trim(coalesce(v_input_pin, '')) = ''
       or trim(v_input_pin) <> trim(v_active_pin) then
      perform fn_auth_record_failure('activeOnSitePin');
      return jsonb_build_object('success', false, 'message', '현장 출석 PIN 번호가 일치하지 않습니다.');
    end if;
  end if;

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

create or replace function fn_submit_rsvp(p_payload jsonb)
returns jsonb
security definer
set search_path = public, extensions
language plpgsql as $$
declare
  v_schedule_id text := p_payload->>'scheduleId';
  v_member_id text := p_payload->>'memberId';
  v_wants_admin boolean := coalesce((p_payload->>'isAdmin')::boolean, false);
  v_is_admin boolean := false;
  v_schedule_date text;
  v_schedule_time text;
  v_cutoff_time timestamptz;
begin
  -- The cutoff exemption applies only to verified operators.
  if v_wants_admin then
    v_is_admin := fn_check_admin_token(p_payload->>'adminToken', 'admin');
  end if;

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

-- Self-registration may not assign a privileged role or status.
do $do$
begin
  if to_regprocedure('fn_register_and_bind_member__impl(jsonb)') is null then
    alter function fn_register_and_bind_member(jsonb) rename to fn_register_and_bind_member__impl;
  elsif not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'fn_register_and_bind_member'
       and pg_get_functiondef(p.oid) like '%\_\_impl(%'
  ) then
    -- An older migration recreated the unprotected original: make it the new impl.
    drop function fn_register_and_bind_member__impl(jsonb);
    alter function fn_register_and_bind_member(jsonb) rename to fn_register_and_bind_member__impl;
  end if;
  revoke all on function fn_register_and_bind_member__impl(jsonb) from public, anon, authenticated;
end
$do$;

create or replace function fn_register_and_bind_member(p_payload jsonb)
returns jsonb
security definer
set search_path = public, extensions
language plpgsql as $$
begin
  return fn_register_and_bind_member__impl(
    (p_payload - 'adminToken' - 'role' - 'status' - 'mergedIntoId')
      || jsonb_build_object('role', 'MEMBER')
  );
end;
$$;

-- ------------------------------------------------------------------------------
-- 7. Bulk import: owner/service role only (it truncates every table)
-- ------------------------------------------------------------------------------
revoke all on function fn_import_sheets_snapshot(jsonb) from public, anon, authenticated;
grant execute on function fn_import_sheets_snapshot(jsonb) to service_role;

-- ------------------------------------------------------------------------------
-- 8. Client grants
-- ------------------------------------------------------------------------------
revoke all on function fn_verify_admin_pin(text) from public;
revoke all on function fn_verify_super_admin_pin(text) from public;
revoke all on function fn_verify_on_site_pin(text) from public;
revoke all on function fn_admin_logout(text) from public;
revoke all on function fn_get_admin_secrets(text) from public;
revoke all on function fn_record_attendance(jsonb) from public;
revoke all on function fn_submit_rsvp(jsonb) from public;
revoke all on function fn_register_and_bind_member(jsonb) from public;

grant execute on function fn_verify_admin_pin(text) to anon, authenticated;
grant execute on function fn_verify_super_admin_pin(text) to anon, authenticated;
grant execute on function fn_verify_on_site_pin(text) to anon, authenticated;
grant execute on function fn_admin_logout(text) to anon, authenticated;
grant execute on function fn_get_admin_secrets(text) to anon, authenticated;
grant execute on function fn_record_attendance(jsonb) to anon, authenticated;
grant execute on function fn_submit_rsvp(jsonb) to anon, authenticated;
grant execute on function fn_register_and_bind_member(jsonb) to anon, authenticated;

do $do$
declare
  f text;
begin
  foreach f in array array[
    'fn_clear_attendance', 'fn_register_member', 'fn_update_member', 'fn_add_member_history',
    'fn_delete_member', 'fn_merge_members', 'fn_create_schedule', 'fn_update_schedule',
    'fn_delete_schedule', 'fn_batch_delete_schedules', 'fn_batch_update_schedules',
    'fn_save_location', 'fn_delete_location', 'fn_save_program_card', 'fn_delete_program_card',
    'fn_save_config'
  ] loop
    execute format('revoke all on function %I(jsonb) from public', f);
    execute format('grant execute on function %I(jsonb) to anon, authenticated', f);
  end loop;
end
$do$;

-- Ask PostgREST to reload its schema cache (new function signatures).
notify pgrst, 'reload schema';
