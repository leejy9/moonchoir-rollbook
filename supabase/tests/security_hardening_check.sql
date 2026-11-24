-- ==============================================================================
-- Security hardening check (read-only; safe to run against production)
--
-- Run in the Supabase SQL editor AFTER applying 20261121000000_security_hardening.sql.
-- Every call runs as the public `anon` role (what anyone with the app bundle can do)
-- and must be refused. None of these calls writes data: each is rejected before any
-- insert/update/delete. Expected result: every row says PASS.
-- ==============================================================================
begin;

do $$
begin
  if to_regprocedure('fn_get_admin_secrets(text)') is null
     or to_regprocedure('fn_check_admin_token(text,text)') is null then
    raise exception 'FAIL: 20261121000000_security_hardening.sql has not been applied to this database.';
  end if;
end
$$;

set local role anon;

create temporary table if not exists _checks (name text, result text) on commit drop;

do $$
declare
  r jsonb;
  forged text := repeat('a', 64);
begin
  -- S1: secrets without a token
  r := fn_get_admin_secrets(null);
  insert into _checks values ('S1 secrets without token',
    case when r->>'code' = 'ADMIN_AUTH_REQUIRED' then 'PASS' else 'FAIL ' || r::text end);

  r := fn_get_admin_secrets(forged);
  insert into _checks values ('S1 secrets with forged token',
    case when r->>'code' = 'ADMIN_AUTH_REQUIRED' then 'PASS' else 'FAIL ' || r::text end);

  -- S2: overwrite config / PINs without a token
  r := fn_save_config('{"adminPin":"000000"}'::jsonb);
  insert into _checks values ('S2 save config without token',
    case when r->>'code' = 'ADMIN_AUTH_REQUIRED' then 'PASS' else 'FAIL ' || r::text end);

  -- S4: admin write RPCs without / with forged token
  r := fn_delete_schedule('{"id":"__security_check__"}'::jsonb);
  insert into _checks values ('S4 delete schedule without token',
    case when r->>'code' = 'ADMIN_AUTH_REQUIRED' then 'PASS' else 'FAIL ' || r::text end);

  r := fn_merge_members(jsonb_build_object('adminToken', forged));
  insert into _checks values ('S4 merge members with forged token',
    case when r->>'code' = 'ADMIN_AUTH_REQUIRED' then 'PASS' else 'FAIL ' || r::text end);

  r := fn_record_attendance('{"id":"__security_check__","authMethod":"MANUAL_BY_ADMIN"}'::jsonb);
  insert into _checks values ('S4 admin attendance without token',
    case when r->>'code' = 'ADMIN_AUTH_REQUIRED' then 'PASS' else 'FAIL ' || r::text end);
end
$$;

-- S3 / S4b: functions that must not be executable at all by anon or authenticated
insert into _checks
select 'S3/S4b no execute: ' || f,
       case
         when has_function_privilege('anon', f, 'execute') then 'FAIL (anon can execute)'
         when has_function_privilege('authenticated', f, 'execute') then 'FAIL (authenticated can execute)'
         else 'PASS'
       end
  from unnest(array[
    'fn_import_sheets_snapshot(jsonb)',
    'fn_delete_schedule__impl(jsonb)',
    'fn_update_schedule__body(jsonb)',
    'fn_update_schedule__impl(jsonb)',
    'fn_batch_update_schedules__impl(jsonb)',
    'fn_save_config__impl(jsonb)',
    'fn_merge_members__impl(jsonb)',
    'fn_register_and_bind_member__impl(jsonb)',
    'fn_check_admin_token(text,text)',
    'fn_issue_admin_session(text)'
  ]) as f
 where to_regprocedure(f) is not null;

-- Old zero-argument secrets function must be gone
insert into _checks
select 'S1 old fn_get_admin_secrets() removed',
       case when to_regprocedure('fn_get_admin_secrets()') is null then 'PASS' else 'FAIL (still exists)' end;

do $$
declare
  v_fail record;
begin
  select name, result into v_fail from _checks where result <> 'PASS' limit 1;
  if found then
    raise exception 'security_hardening_check FAIL: % -> %', v_fail.name, v_fail.result;
  end if;
end
$$;

select * from _checks order by name;
rollback;
