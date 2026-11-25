-- ==============================================================================
-- Fix (20261124040000_fix_update_member_history.sql)
--
-- Symptom: an admin saves a member status/part change in MemberProfileModal. The
-- screen shows the new value for about 1.5 seconds and then reverts.
--
-- Cause: fn_update_member only updated `members`. It ignored
-- p_payload->'historyItem' entirely, so member_status_history kept the previous
-- open row (end_date = '2999-12-31', old status) and never received the new one.
-- After the write, refreshRemoteData() reads the snapshot again;
-- parseRemoteMembers attaches that stale open row as statusHistory, and
-- getEffectiveMemberStatus (src/utils/attendanceStats.ts) reads statusHistory
-- before member.memberStatus. The old status therefore wins and the whole screen
-- rolls back.
--
-- Fix: honour historyItem — close the previously open period the day before the
-- new period starts, then upsert the new period (same projection the front end
-- already applies in sheets.ts updateMember, so screen and DB agree). When a
-- caller sends no historyItem but does change memberStatus (older builds), create
-- the period defensively from KST today so the history can never fall behind.
--
-- 복사 원본: supabase/migrations/20261119000001_rpc_functions.sql:583-603
--           (fn_update_member — members-only UPDATE; this file keeps that UPDATE
--            clause unchanged and adds the history handling after it)
-- 권한: security definer 함수이므로 anon/authenticated 직접 실행을 회수한다.
--       (pg_default_acl 때문에 새 함수는 public에 실행 권한이 붙을 수 있다.)
-- Idempotent: create or replace only; no data is rewritten on re-run.
-- ==============================================================================

create or replace function fn_update_member__body(p_payload jsonb)
returns jsonb
security definer
set search_path = public, extensions
language plpgsql as $$
declare
  v_member_id text := p_payload->>'id';
  v_current_status text;
  v_new_status text;
  v_history jsonb;
  v_hist_id text;
  v_hist_start text;
  v_hist_end text;
  v_hist_status text;
  v_hist_part text;
  v_hist_reason text;
  v_prev_day text;
  v_today text := to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD');
begin
  select member_status into v_current_status from members where id = v_member_id;
  if not found then
    return jsonb_build_object('success', false, 'message', '단원 정보를 찾을 수 없습니다.');
  end if;

  -- 1. Master row (unchanged from the original fn_update_member)
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
   where id = v_member_id;

  v_new_status := coalesce(p_payload->>'memberStatus', v_current_status);

  -- 2. Which period row should this write record?
  if jsonb_typeof(p_payload->'historyItem') = 'object' then
    v_history := p_payload->'historyItem';
  elsif v_new_status is distinct from v_current_status then
    -- 방어 로직: historyItem 없이 상태만 바뀐 페이로드(이전 빌드·다른 호출부).
    -- KST 오늘부터 열린 기간으로 기록해 이력이 현재 상태보다 뒤처지지 않게 한다.
    v_history := jsonb_build_object(
      'id', 'hist_' || replace(gen_random_uuid()::text, '-', ''),
      'status', v_new_status,
      'part', coalesce(p_payload->>'part', ''),
      'startDate', v_today,
      'endDate', '2999-12-31',
      'reason', '상태를 [' || v_new_status || ']으로 변경'
    );
  end if;

  if v_history is not null then
    v_hist_id := coalesce(nullif(v_history->>'id', ''),
                          'hist_' || replace(gen_random_uuid()::text, '-', ''));
    v_hist_start := coalesce(nullif(v_history->>'startDate', ''), v_today);
    v_hist_end := coalesce(nullif(v_history->>'endDate', ''), '2999-12-31');
    v_hist_status := coalesce(nullif(v_history->>'status', ''), v_new_status, '');
    v_hist_part := coalesce(nullif(v_history->>'part', ''), p_payload->>'part', '');
    v_hist_reason := coalesce(v_history->>'reason', '');
    v_prev_day := to_char((v_hist_start::date - 1), 'YYYY-MM-DD');

    -- 3. Close the period this new one replaces. Same rule the front end uses in
    --    sheets.ts updateMember, so the DB projection matches the optimistic screen.
    update member_status_history
       set end_date = case when start_date < v_hist_start then v_prev_day else v_hist_start end
     where member_id = v_member_id
       and id <> v_hist_id
       and end_date >= v_hist_start;

    -- 4. Store the new period. Append-only: an existing row is only re-dated,
    --    never deleted, so past quorum keeps its snapshot.
    insert into member_status_history (
      id, member_id, name, status, part, start_date, end_date, reason, created_at
    ) values (
      v_hist_id,
      v_member_id,
      coalesce(p_payload->>'name', ''),
      v_hist_status,
      v_hist_part,
      v_hist_start,
      v_hist_end,
      v_hist_reason,
      fn_get_kst_now_string()
    )
    on conflict (id) do update
       set name = excluded.name,
           status = excluded.status,
           part = excluded.part,
           start_date = excluded.start_date,
           end_date = excluded.end_date,
           reason = excluded.reason,
           received_at = now();
  end if;

  return jsonb_build_object('success', true, 'message', '단원 정보가 수정되었습니다.');
end;
$$;

-- The token-checking wrapper (20261121000000_security_hardening.sql:320-338)
-- calls this. Replacing it changes nothing else about the public signature.
create or replace function fn_update_member__impl(p_payload jsonb)
returns jsonb
security definer
set search_path = public, extensions
language plpgsql as $$
begin
  return fn_update_member__body(p_payload);
end;
$$;

revoke all on function fn_update_member__body(jsonb) from public, anon, authenticated;
revoke all on function fn_update_member__impl(jsonb) from public, anon, authenticated;

-- Same gap, same file family: fn_update_schedule__body is security definer but
-- was never revoked (20261124020000_fix_update_schedule_arrays.sql revokes only
-- the __impl and batch functions), so anon could update schedules directly.
revoke all on function fn_update_schedule__body(jsonb) from public, anon, authenticated;

notify pgrst, 'reload schema';
