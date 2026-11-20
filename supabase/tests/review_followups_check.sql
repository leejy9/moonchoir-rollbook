-- ==============================================================================
-- Review Follow-ups Verification Script (read-only; safe to run against production)
--
-- Run in the Supabase SQL editor AFTER applying 20261122010000_review_followups.sql.
-- ==============================================================================
begin;

set local role anon;

create temporary table if not exists _checks (name text, result text) on commit drop;

-- C3 Check 1: fn_delete_program_card__impl must never be callable by anon
insert into _checks
select 'C3: Anon cannot execute fn_delete_program_card__impl',
       case when has_function_privilege('anon', 'fn_delete_program_card__impl(jsonb)', 'execute')
            then 'FAIL (anon can execute)'
            else 'PASS'
       end;

-- C3 Check 2: Verify function definition does NOT contain 'archived_at is null' condition
insert into _checks
select 'C3: fn_delete_program_card__impl checks all linked pieces (no archived_at filter)',
       case when pg_get_functiondef('fn_delete_program_card__impl(jsonb)'::regprocedure) not like '%where program_id = p_payload->>''id'' and archived_at is null%'
            then 'PASS'
            else 'FAIL'
       end;

select * from _checks;

rollback;
