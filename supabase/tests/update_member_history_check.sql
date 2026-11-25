-- ==============================================================================
-- Verification Script: update_member_history_check.sql
-- Description: Verifies 20261124040000_fix_update_member_history.sql
--
-- Symptom this guards against: an admin changes a member's status, the screen
-- shows the new value for ~1.5s and then reverts. Cause: fn_update_member
-- updated members.member_status but ignored p_payload->'historyItem', so the
-- open member_status_history row (end_date = '2999-12-31', old status) stayed
-- open. getEffectiveMemberStatus reads statusHistory first, so the stale open
-- row won on the next snapshot refresh.
--
-- Checks the stored rows, not just that the RPC returned success.
-- Run in a transaction with ROLLBACK at the end so it leaves no artifacts.
-- ==============================================================================
begin;

do $$
begin
  if to_regprocedure('fn_update_member__body(jsonb)') is null
     or to_regprocedure('fn_update_member__impl(jsonb)') is null
     or to_regprocedure('fn_update_member(jsonb)') is null
     or to_regprocedure('fn_get_initial_snapshot()') is null then
    raise exception 'FAIL: 20261124040000_fix_update_member_history.sql has not been applied.';
  end if;
end
$$;

-- ------------------------------------------------------------------------------
-- U1: historyItem is honoured -> old open row closed, new row stored
-- ------------------------------------------------------------------------------
do $$
declare
  v_token text := fn_issue_admin_session('admin')->>'token';
  v_member_id text := 'test_ums_history_member';
  v_result jsonb;
  v_old_end text;
  v_new_count integer;
  v_new_start text;
  v_new_end text;
  v_new_status text;
  v_new_part text;
  v_member_status text;
begin
  insert into members (id, name, part, phone_last4, phone, role, status, joined_at, member_status, note)
  values (v_member_id, '상태변경테스트', '소프라노', '4321', '', 'MEMBER', 'ACTIVE',
          '2026-01-01', '정단원', '')
  on conflict (id) do update set member_status = '정단원', part = '소프라노';

  delete from member_status_history where member_id = v_member_id;

  -- Baseline: the open membership row the bug used to leave behind.
  insert into member_status_history (id, member_id, name, status, part, start_date, end_date, reason, created_at)
  values ('test_ums_hist_old', v_member_id, '상태변경테스트', '정단원', '소프라노',
          '2026-01-01', '2999-12-31', '입단', '2026-01-01 09:00:00');

  v_result := fn_update_member(jsonb_build_object(
    'id', v_member_id,
    'name', '상태변경테스트',
    'part', '알토',
    'phoneLast4', '4321',
    'role', 'MEMBER',
    'status', 'ACTIVE',
    'joinedAt', '2026-01-01',
    'memberStatus', '휴단원',
    'note', '',
    'adminToken', v_token,
    'historyItem', jsonb_build_object(
      'id', 'test_ums_hist_new',
      'memberId', v_member_id,
      'status', '휴단원',
      'part', '알토',
      'startDate', '2026-12-01',
      'endDate', '2999-12-31',
      'reason', '개인 사정으로 휴단'
    )
  ));

  if v_result->>'success' is distinct from 'true' then
    raise exception 'FAIL (U1): fn_update_member refused the payload: %', v_result;
  end if;

  -- The previously open row must be closed the day before the new period starts.
  select end_date into v_old_end
    from member_status_history where id = 'test_ums_hist_old';
  if v_old_end is distinct from '2026-11-30' then
    raise exception 'FAIL (U1): old open history end_date = % (expected 2026-11-30)', v_old_end;
  end if;

  select count(*), min(start_date), min(end_date), min(status), min(part)
    into v_new_count, v_new_start, v_new_end, v_new_status, v_new_part
    from member_status_history
   where member_id = v_member_id and id = 'test_ums_hist_new';
  if v_new_count <> 1 then
    raise exception 'FAIL (U1): new history row was not inserted (count=%)', v_new_count;
  end if;
  if v_new_start is distinct from '2026-12-01'
     or v_new_end is distinct from '2999-12-31'
     or v_new_status is distinct from '휴단원'
     or v_new_part is distinct from '알토' then
    raise exception 'FAIL (U1): new history row = start %, end %, status %, part %',
      v_new_start, v_new_end, v_new_status, v_new_part;
  end if;

  select member_status into v_member_status from members where id = v_member_id;
  if v_member_status is distinct from '휴단원' then
    raise exception 'FAIL (U1): members.member_status = % (expected 휴단원)', v_member_status;
  end if;
end
$$;

-- ------------------------------------------------------------------------------
-- U2: no historyItem, but memberStatus changed -> defensive history is created
--     and the previous open row is still closed (payloads from older builds)
-- ------------------------------------------------------------------------------
do $$
declare
  v_token text := fn_issue_admin_session('admin')->>'token';
  v_member_id text := 'test_ums_implicit_member';
  v_result jsonb;
  v_open_count integer;
  v_created_status text;
  v_created_start text;
  v_today text := to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD');
begin
  insert into members (id, name, part, phone_last4, phone, role, status, joined_at, member_status, note)
  values (v_member_id, '암묵변경테스트', '테너', '5555', '', 'MEMBER', 'ACTIVE',
          '2026-01-01', '정단원', '')
  on conflict (id) do update set member_status = '정단원';

  delete from member_status_history where member_id = v_member_id;

  insert into member_status_history (id, member_id, name, status, part, start_date, end_date, reason, created_at)
  values ('test_ums_implicit_old', v_member_id, '암묵변경테스트', '정단원', '테너',
          '2026-01-01', '2999-12-31', '입단', '2026-01-01 09:00:00');

  v_result := fn_update_member(jsonb_build_object(
    'id', v_member_id,
    'name', '암묵변경테스트',
    'part', '테너',
    'phoneLast4', '5555',
    'memberStatus', '준단원',
    'adminToken', v_token
  ));
  if v_result->>'success' is distinct from 'true' then
    raise exception 'FAIL (U2): fn_update_member refused the payload: %', v_result;
  end if;

  select count(*) into v_open_count
    from member_status_history
   where member_id = v_member_id and end_date = '2999-12-31';
  if v_open_count <> 1 then
    raise exception 'FAIL (U2): expected exactly one open history row, found %', v_open_count;
  end if;

  select status, start_date into v_created_status, v_created_start
    from member_status_history
   where member_id = v_member_id and end_date = '2999-12-31';
  if v_created_status is distinct from '준단원' then
    raise exception 'FAIL (U2): open history status = % (expected 준단원)', v_created_status;
  end if;
  if v_created_start is distinct from v_today then
    raise exception 'FAIL (U2): open history start_date = % (expected KST today %)', v_created_start, v_today;
  end if;
end
$$;

-- ------------------------------------------------------------------------------
-- U3: no historyItem and no status change -> no extra history rows (idempotent)
-- ------------------------------------------------------------------------------
do $$
declare
  v_token text := fn_issue_admin_session('admin')->>'token';
  v_member_id text := 'test_ums_nochange_member';
  v_before integer;
  v_after integer;
begin
  insert into members (id, name, part, phone_last4, phone, role, status, joined_at, member_status, note)
  values (v_member_id, '무변경테스트', '베이스', '6666', '', 'MEMBER', 'ACTIVE',
          '2026-01-01', '정단원', '')
  on conflict (id) do update set member_status = '정단원';

  delete from member_status_history where member_id = v_member_id;
  insert into member_status_history (id, member_id, name, status, part, start_date, end_date, reason, created_at)
  values ('test_ums_nochange_old', v_member_id, '무변경테스트', '정단원', '베이스',
          '2026-01-01', '2999-12-31', '입단', '2026-01-01 09:00:00');

  select count(*) into v_before from member_status_history where member_id = v_member_id;

  -- Change only the note: status stays 정단원.
  perform fn_update_member(jsonb_build_object(
    'id', v_member_id,
    'name', '무변경테스트',
    'part', '베이스',
    'phoneLast4', '6666',
    'memberStatus', '정단원',
    'note', '메모만 변경',
    'adminToken', v_token
  ));

  select count(*) into v_after from member_status_history where member_id = v_member_id;
  if v_after <> v_before then
    raise exception 'FAIL (U3): history rows changed without a status change (% -> %)', v_before, v_after;
  end if;
end
$$;

-- ------------------------------------------------------------------------------
-- U4: fn_get_initial_snapshot still carries members + memberHistory
-- ------------------------------------------------------------------------------
do $$
declare
  v_snapshot jsonb;
begin
  v_snapshot := fn_get_initial_snapshot();
  if v_snapshot->>'success' is distinct from 'true' then
    raise exception 'FAIL (U4): snapshot failed: %', v_snapshot;
  end if;
  if jsonb_typeof(v_snapshot->'data'->'members') is distinct from 'array' then
    raise exception 'FAIL (U4): data.members is not an array';
  end if;
  if jsonb_typeof(v_snapshot->'data'->'memberHistory') is distinct from 'array' then
    raise exception 'FAIL (U4): data.memberHistory is not an array';
  end if;
  if not exists (
    select 1
      from jsonb_array_elements(v_snapshot->'data'->'memberHistory') h
     where h->>'memberId' = 'test_ums_history_member'
       and h->>'status' = '휴단원'
       and h->>'startDate' = '2026-12-01'
       and h->>'endDate' = '2999-12-31'
  ) then
    raise exception 'FAIL (U4): snapshot memberHistory does not expose the new 휴단원 row';
  end if;
end
$$;

-- ------------------------------------------------------------------------------
-- U5: anon / authenticated cannot execute the internals directly
-- ------------------------------------------------------------------------------
do $$
declare
  v_fn text;
  v_bad text[] := array[]::text[];
begin
  foreach v_fn in array array[
    'fn_update_member__body(jsonb)',
    'fn_update_member__impl(jsonb)',
    'fn_update_schedule__body(jsonb)'
  ] loop
    if to_regprocedure(v_fn) is null then
      v_bad := v_bad || (v_fn || ' (missing)');
      continue;
    end if;
    if has_function_privilege('anon', v_fn, 'execute') then
      v_bad := v_bad || (v_fn || ' (anon)');
    end if;
    if has_function_privilege('authenticated', v_fn, 'execute') then
      v_bad := v_bad || (v_fn || ' (authenticated)');
    end if;
  end loop;

  if array_length(v_bad, 1) is not null then
    raise exception 'FAIL (U5): executable by clients: %', array_to_string(v_bad, ', ');
  end if;
end
$$;

-- ------------------------------------------------------------------------------
-- U6: the public wrapper still refuses callers without an admin token
-- ------------------------------------------------------------------------------
do $$
declare
  v_result jsonb;
begin
  v_result := fn_update_member(jsonb_build_object(
    'id', 'test_ums_history_member',
    'memberStatus', '퇴단원'
  ));
  if v_result->>'code' is distinct from 'ADMIN_AUTH_REQUIRED' then
    raise exception 'FAIL (U6): wrapper without a token should be refused, got %', v_result;
  end if;
end
$$;

select 'update_member_history_check: PASS' as result;
rollback;
