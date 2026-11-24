-- ==============================================================================
-- Verify schedule update array/string handling, batch update execution,
-- and strict privilege revocation on internal __impl / __body functions.
-- Runs in a transaction with ROLLBACK so no test data persists.
-- ==============================================================================
begin;

do $$
declare
  v_bad_fn text;
begin
  if to_regprocedure('public.fn_update_schedule__body(jsonb)') is null
     or to_regprocedure('public.fn_update_schedule__impl(jsonb)') is null
     or to_regprocedure('public.fn_batch_update_schedules__impl(jsonb)') is null then
    raise exception 'FAIL: schedule update implementation functions are missing';
  end if;

  -- Explicit checks for fn_update_schedule__body, fn_update_schedule__impl, fn_batch_update_schedules__impl
  if has_function_privilege('anon', 'public.fn_update_schedule__body(jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.fn_update_schedule__body(jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.fn_update_schedule__impl(jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.fn_update_schedule__impl(jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.fn_batch_update_schedules__impl(jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.fn_batch_update_schedules__impl(jsonb)', 'EXECUTE') then
    raise exception 'FAIL: fn_update_schedule__body / __impl or fn_batch_update_schedules__impl is executable by anon or authenticated';
  end if;

  -- Dynamic scan across all public functions ending in __impl or __body
  select p.oid::regprocedure::text
    into v_bad_fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (p.proname like '%\_\_impl' escape '\' or p.proname like '%\_\_body' escape '\')
     and (
       has_function_privilege('anon', p.oid, 'EXECUTE')
       or has_function_privilege('authenticated', p.oid, 'EXECUTE')
     )
   limit 1;

  if v_bad_fn is not null then
    raise exception 'FAIL: internal function % is executable by anon or authenticated', v_bad_fn;
  end if;
end
$$;

do $$
declare
  v_token text;
  v_res jsonb;
  v_title_1 text;
  v_title_2 text;
  v_parts_1 text[];
  v_parts_2 text[];
  v_members_1 text[];
  v_lat_1 double precision;
begin
  -- 1. Reject unauthenticated calls to wrapper RPCs
  v_res := fn_update_schedule(jsonb_build_object('id', 'test_sched_upd_1', 'title', '무권한'));
  if v_res->>'code' is distinct from 'ADMIN_AUTH_REQUIRED' then
    raise exception 'FAIL: fn_update_schedule accepted missing token: %', v_res;
  end if;

  v_res := fn_batch_update_schedules(jsonb_build_object('ids', jsonb_build_array('test_sched_upd_1'), 'updates', jsonb_build_object('title', '무권한')));
  if v_res->>'code' is distinct from 'ADMIN_AUTH_REQUIRED' then
    raise exception 'FAIL: fn_batch_update_schedules accepted missing token: %', v_res;
  end if;

  -- 2. Issue admin token and seed two schedules
  v_token := fn_issue_admin_session('admin')->>'token';
  if v_token is null or length(v_token) < 32 then
    raise exception 'FAIL: could not issue test admin session';
  end if;

  insert into schedules (id, title, date, start_time, end_time, latitude, target_parts, target_member_ids)
  values
    ('test_sched_upd_1', '원래 제목 1', '2026-12-01', '19:00', '21:00', 37.5, array['소프라노'], array['m1']),
    ('test_sched_upd_2', '원래 제목 2', '2026-12-08', '19:00', '21:00', 37.5, array['알토'], array['m2']);

  -- 3. Single update with comma-separated scalar strings and empty numeric string
  v_res := fn_update_schedule(jsonb_build_object(
    'adminToken', v_token,
    'id', 'test_sched_upd_1',
    'title', '단일 수정 제목',
    'targetParts', '소프라노,테너',
    'targetMemberIds', 'm1,m3',
    'targetLat', ''
  ));
  if (v_res->>'success')::boolean is not true then
    raise exception 'FAIL: fn_update_schedule with scalar string failed: %', v_res;
  end if;

  select title, target_parts, target_member_ids, latitude
    into v_title_1, v_parts_1, v_members_1, v_lat_1
    from schedules
   where id = 'test_sched_upd_1';

  if v_title_1 is distinct from '단일 수정 제목'
     or v_parts_1 is distinct from array['소프라노', '테너']
     or v_members_1 is distinct from array['m1', 'm3']
     or v_lat_1 is distinct from 37.5 then
    raise exception 'FAIL: single update state mismatch: title=%, parts=%, members=%, lat=%',
      v_title_1, v_parts_1, v_members_1, v_lat_1;
  end if;

  -- 4. Batch update with { ids, updates } format (verifies __body is called without inner token rejection)
  v_res := fn_batch_update_schedules(jsonb_build_object(
    'adminToken', v_token,
    'ids', jsonb_build_array('test_sched_upd_1', 'test_sched_upd_2'),
    'updates', jsonb_build_object(
      'title', '일괄 수정 제목',
      'targetParts', jsonb_build_array('베이스')
    )
  ));
  if (v_res->>'success')::boolean is not true then
    raise exception 'FAIL: fn_batch_update_schedules {ids, updates} failed: %', v_res;
  end if;

  select title, target_parts into v_title_1, v_parts_1 from schedules where id = 'test_sched_upd_1';
  select title, target_parts into v_title_2, v_parts_2 from schedules where id = 'test_sched_upd_2';

  if v_title_1 is distinct from '일괄 수정 제목'
     or v_title_2 is distinct from '일괄 수정 제목'
     or v_parts_1 is distinct from array['베이스']
     or v_parts_2 is distinct from array['베이스'] then
    raise exception 'FAIL: batch update {ids, updates} did not persist: t1=%, t2=%, p1=%, p2=%',
      v_title_1, v_title_2, v_parts_1, v_parts_2;
  end if;

  -- 5. Batch update with { schedules: [...] } format (verifies inner items without adminToken still update)
  v_res := fn_batch_update_schedules(jsonb_build_object(
    'adminToken', v_token,
    'schedules', jsonb_build_array(
      jsonb_build_object('id', 'test_sched_upd_1', 'title', '배열 일괄 1', 'targetParts', '소프라노,알토'),
      jsonb_build_object('id', 'test_sched_upd_2', 'title', '배열 일괄 2', 'targetParts', jsonb_build_array('테너', '베이스'))
    )
  ));
  if (v_res->>'success')::boolean is not true then
    raise exception 'FAIL: fn_batch_update_schedules {schedules} failed: %', v_res;
  end if;

  select title, target_parts into v_title_1, v_parts_1 from schedules where id = 'test_sched_upd_1';
  select title, target_parts into v_title_2, v_parts_2 from schedules where id = 'test_sched_upd_2';

  if v_title_1 is distinct from '배열 일괄 1'
     or v_title_2 is distinct from '배열 일괄 2'
     or v_parts_1 is distinct from array['소프라노', '알토']
     or v_parts_2 is distinct from array['테너', '베이스'] then
    raise exception 'FAIL: batch update {schedules} did not persist: t1=%, t2=%, p1=%, p2=%',
      v_title_1, v_title_2, v_parts_1, v_parts_2;
  end if;
end
$$;

rollback;
