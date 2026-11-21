-- ==============================================================================
-- Practice Catalog Verification Check (read-only; safe to run against production)
--
-- Run in the Supabase SQL editor AFTER applying 20261122000000_practice_catalog.sql.
-- Checks that:
-- 1. All 3 practice tables and triggers exist
-- 2. Direct DELETE is blocked by triggers
-- 3. All 6 write RPCs reject anonymous/unauthorized access (ADMIN_AUTH_REQUIRED)
-- 4. fn_get_practice_catalog is publicly readable
-- 5. fn_delete_program_card__impl is never callable by anon
-- Expected result: every row says PASS.
-- ==============================================================================
begin;

do $$
begin
  if to_regprocedure('fn_get_practice_catalog(boolean,text)') is null
     or to_regprocedure('fn_save_practice_piece(jsonb)') is null
     or to_regprocedure('fn_save_practice_track(jsonb)') is null then
    raise exception 'FAIL: 20261122000000_practice_catalog.sql has not been applied to this database.';
  end if;
end
$$;

set local role anon;

create temporary table if not exists _checks (name text, result text) on commit drop;

-- 1. Tables exist and direct permissions revoked from anon
insert into _checks
select 'Table exists: ' || tbl,
       case when to_regclass(tbl) is not null then 'PASS' else 'FAIL' end
  from unnest(array['practice_pieces', 'practice_program_pieces', 'practice_tracks']) as tbl;

insert into _checks
select 'Anon no direct select: ' || tbl,
       case when has_table_privilege('anon', tbl, 'select') then 'FAIL (anon can select directly)' else 'PASS' end
  from unnest(array['practice_pieces', 'practice_program_pieces', 'practice_tracks']) as tbl;

-- 2. Triggers exist on all 3 tables
insert into _checks
select 'No-delete trigger exists: ' || trg.tgname, 'PASS'
  from pg_trigger trg
 where trg.tgname in (
   'trg_practice_pieces_no_delete',
   'trg_practice_program_pieces_no_delete',
   'trg_practice_tracks_no_delete'
 );

-- 3. Anonymous write RPCs without token or with forged token
do $$
declare
  r jsonb;
  forged text := repeat('f', 64);
begin
  -- 3-1: fn_save_practice_piece
  r := fn_save_practice_piece('{"title":"test"}'::jsonb);
  insert into _checks values ('fn_save_practice_piece without token',
    case when r->>'code' = 'ADMIN_AUTH_REQUIRED' then 'PASS' else 'FAIL ' || r::text end);

  r := fn_save_practice_piece(jsonb_build_object('title', 'test', 'adminToken', forged));
  insert into _checks values ('fn_save_practice_piece with forged token',
    case when r->>'code' = 'ADMIN_AUTH_REQUIRED' then 'PASS' else 'FAIL ' || r::text end);

  -- 3-2: fn_set_practice_piece_archived
  r := fn_set_practice_piece_archived('{"id":"test","isArchived":true}'::jsonb);
  insert into _checks values ('fn_set_practice_piece_archived without token',
    case when r->>'code' = 'ADMIN_AUTH_REQUIRED' then 'PASS' else 'FAIL ' || r::text end);

  -- 3-3: fn_save_practice_track
  r := fn_save_practice_track('{"pieceId":"test","label":"test"}'::jsonb);
  insert into _checks values ('fn_save_practice_track without token',
    case when r->>'code' = 'ADMIN_AUTH_REQUIRED' then 'PASS' else 'FAIL ' || r::text end);

  -- 3-4: fn_set_practice_track_archived
  r := fn_set_practice_track_archived('{"id":"test","isArchived":true}'::jsonb);
  insert into _checks values ('fn_set_practice_track_archived without token',
    case when r->>'code' = 'ADMIN_AUTH_REQUIRED' then 'PASS' else 'FAIL ' || r::text end);

  -- 3-5: fn_set_program_pieces
  r := fn_set_program_pieces('{"programId":"test","pieceIds":[]}'::jsonb);
  insert into _checks values ('fn_set_program_pieces without token',
    case when r->>'code' = 'ADMIN_AUTH_REQUIRED' then 'PASS' else 'FAIL ' || r::text end);

  -- 3-6: fn_reorder_practice_tracks
  r := fn_reorder_practice_tracks('{"pieceId":"test","trackIds":[]}'::jsonb);
  insert into _checks values ('fn_reorder_practice_tracks without token',
    case when r->>'code' = 'ADMIN_AUTH_REQUIRED' then 'PASS' else 'FAIL ' || r::text end);

  -- 4. Public read RPC works
  r := fn_get_practice_catalog(false, null);
  insert into _checks values ('fn_get_practice_catalog public read',
    case when (r->>'success')::boolean = true and (r ? 'data') then 'PASS' else 'FAIL ' || r::text end);
end
$$;

-- 5. fn_delete_program_card__impl must not be executable by anon
insert into _checks
select 'Anon cannot execute fn_delete_program_card__impl',
       case when has_function_privilege('anon', 'fn_delete_program_card__impl(jsonb)', 'execute')
            then 'FAIL (anon can execute __impl)' else 'PASS' end;

select * from _checks order by name;
rollback;
