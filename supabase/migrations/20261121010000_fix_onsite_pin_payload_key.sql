-- ==============================================================================
-- Hotfix (20261121010000_fix_onsite_pin_payload_key.sql)
--
-- Bug: 20261121000000_security_hardening.sql read the on-site PIN from
-- p_payload->>'inputPin', but the client (src/services/sheets.ts addCheckInLog)
-- sends it as `checkInPin`. After hardening, an empty PIN is rejected, so every
-- MANUAL_PIN check-in failed and was counted toward the on-site PIN lockout.
-- (Before hardening the null PIN silently skipped validation.)
--
-- Fix: read `checkInPin` first, then `inputPin`. Clear on-site PIN failure
-- counters produced by the bug so nobody stays locked out.
-- Idempotent. Only fn_record_attendance is redefined; it is not a __impl wrapper.
-- ==============================================================================
create or replace function fn_record_attendance(p_payload jsonb)
returns jsonb
security definer
set search_path = public, extensions
language plpgsql as $$
declare
  v_log_id text := p_payload->>'id';
  v_auth_method text := p_payload->>'authMethod';
  -- The client sends the on-site PIN as `checkInPin`; accept `inputPin` too for compatibility.
  v_input_pin text := coalesce(nullif(p_payload->>'checkInPin', ''), p_payload->>'inputPin');
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

revoke all on function fn_record_attendance(jsonb) from public;
grant execute on function fn_record_attendance(jsonb) to anon, authenticated;

delete from auth_failures where kind = 'activeOnSitePin';

notify pgrst, 'reload schema';
