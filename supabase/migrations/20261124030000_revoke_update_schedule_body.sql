-- ==============================================================================
-- Revoke client execute privileges on internal helper and trigger functions.
-- Follow-up to 20261124020000_fix_update_schedule_arrays.sql:
--   fn_update_schedule__body(jsonb) is a SECURITY DEFINER helper without token
--   verification and must not be executable by public, anon, or authenticated.
-- Also revokes public/client execute on internal helper & trigger functions
-- audited across all migrations.
-- ==============================================================================

revoke all on function fn_update_schedule__body(jsonb) from public, anon, authenticated;

-- Internal helpers & trigger functions (not client RPCs)
revoke all on function fn_safe_timestamptz(text, timestamptz) from public, anon, authenticated;
revoke all on function fn_get_kst_now_string() from public, anon, authenticated;
revoke all on function prevent_raw_log_mutation() from public, anon, authenticated;
revoke all on function prevent_row_deletion() from public, anon, authenticated;
revoke all on function set_updated_at() from public, anon, authenticated;
revoke all on function fn_trg_rsvp_events_no_update_delete() from public, anon, authenticated;
revoke all on function fn_trg_rsvp_votes_log() from public, anon, authenticated;
revoke all on function fn_trg_practice_listen_sessions_no_update() from public, anon, authenticated;

-- Ensure fn_set_program_pieces has explicit revoke from public (grants to anon/authenticated preserved)
revoke all on function fn_set_program_pieces(jsonb) from public;
grant execute on function fn_set_program_pieces(jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
