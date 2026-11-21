-- ==============================================================================
-- Restore (20261122030000_drop_stray_catalog_functions.sql)
--
-- The production database contained functions that never existed in this
-- repository (hand-written SQL applied outside the migration files):
--   fn_delete_practice_program_card(jsonb)    -- references missing table practice_program_cards
--   fn_reorder_practice_program_pieces(jsonb) -- references missing columns card_id / sort_order
--   fn_get_practice_catalog()                 -- zero-argument duplicate of the real
--                                                fn_get_practice_catalog(boolean, text)
-- and had fn_reorder_practice_tracks / fn_unbind_member_device overwritten with
-- versions calling a non-existent fn_verify_admin_session(). All of them failed
-- before writing anything, so no data was affected.
--
-- Apply this file, then re-apply 20261122010000_review_followups.sql unchanged
-- to restore the repository versions of the overwritten functions.
-- Idempotent.
-- ==============================================================================

drop function if exists public.fn_delete_practice_program_card(jsonb);
drop function if exists public.fn_reorder_practice_program_pieces(jsonb);
drop function if exists public.fn_get_practice_catalog();

notify pgrst, 'reload schema';
