-- ==============================================================================
-- Review Follow-ups Migration (20261122010000_review_followups.sql)
--
-- Applies after:
-- 1. 20261121010000_fix_onsite_pin_payload_key.sql
-- 2. 20261122000000_practice_catalog.sql
--
-- Contains review follow-up fixes (C3, C9, C15, C6).
-- Safe to apply multiple times (idempotent).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- C3. Update fn_delete_program_card__impl (Refuse delete if any piece history exists)
-- ------------------------------------------------------------------------------
create or replace function fn_delete_program_card__impl(p_payload jsonb)
returns jsonb
security definer
set search_path = public
language plpgsql as $$
begin
  if exists (select 1 from practice_program_pieces where program_id = p_payload->>'id') then
    return jsonb_build_object(
      'success', false,
      'message', '연습곡이 등록되었던 시즌 카드는 삭제할 수 없습니다. 시즌 카드를 보관(숨김) 처리해 주세요.'
    );
  end if;
  delete from program_cards where id = p_payload->>'id';
  if not found then
    return jsonb_build_object('success', false, 'message', '일정 카드를 찾을 수 없습니다.');
  end if;
  return jsonb_build_object('success', true, 'message', '일정 카드가 삭제되었습니다.');
end;
$$;
revoke all on function fn_delete_program_card__impl(jsonb) from public, anon, authenticated;

notify pgrst, 'reload schema';
