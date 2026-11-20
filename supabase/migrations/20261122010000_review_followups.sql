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

-- ------------------------------------------------------------------------------
-- C9. Update fn_reorder_practice_tracks (Verify no duplicate track IDs)
-- ------------------------------------------------------------------------------
create or replace function fn_reorder_practice_tracks(p_payload jsonb)
returns jsonb
security definer
set search_path = public, extensions
language plpgsql as $$
declare
  v_piece_id text;
  v_track_ids_json jsonb;
  v_track_id text;
  v_total_db integer;
  v_total_input integer;
  v_distinct_input integer;
begin
  if not fn_check_admin_token(p_payload->>'adminToken', 'admin') then
    return fn_admin_auth_required();
  end if;

  v_piece_id := trim(coalesce(p_payload->>'pieceId', p_payload->>'piece_id', ''));
  v_track_ids_json := coalesce(p_payload->'trackIds', p_payload->'tracks', '[]'::jsonb);

  if v_piece_id = '' or not exists(select 1 from practice_pieces where id = v_piece_id) then
    return jsonb_build_object('success', false, 'message', '유효한 연습곡 ID가 필요합니다.');
  end if;

  if jsonb_typeof(v_track_ids_json) <> 'array' then
    return jsonb_build_object('success', false, 'message', '트랙 목록이 올바른 배열 형식이 아닙니다.');
  end if;

  v_total_input := jsonb_array_length(v_track_ids_json);

  -- Count distinct IDs extracted from either string or object ({id} or {trackId}) elements
  select count(distinct case
      when jsonb_typeof(elem) = 'object' then trim(coalesce(elem->>'id', elem->>'trackId', ''))
      else trim(elem #>> '{}')
    end)
    into v_distinct_input
    from jsonb_array_elements(v_track_ids_json) as elem;

  if v_distinct_input <> v_total_input then
    return jsonb_build_object('success', false, 'message', '중복된 트랙이 있습니다.');
  end if;

  select count(*) into v_total_db
    from practice_tracks
   where piece_id = v_piece_id
     and archived_at is null;

  if v_total_input <> v_total_db then
    return jsonb_build_object(
      'success', false,
      'message', '트랙 목록이 일치하지 않습니다.'
    );
  end if;

  for i in 0 .. v_total_input - 1 loop
    if jsonb_typeof(v_track_ids_json->i) = 'object' then
      v_track_id := trim(coalesce(v_track_ids_json->i->>'id', v_track_ids_json->i->>'trackId', ''));
    else
      v_track_id := trim(coalesce(v_track_ids_json->>i, ''));
    end if;

    if not exists(
      select 1 from practice_tracks
       where id = v_track_id and piece_id = v_piece_id and archived_at is null
    ) then
      raise exception '트랙 % 은(는) 해당 곡의 활성 트랙이 아닙니다.', v_track_id;
    end if;

    update practice_tracks
       set order_index = i,
           updated_at = now()
     where id = v_track_id;
  end loop;

  return jsonb_build_object('success', true, 'message', '트랙 순서가 변경되었습니다.');
exception when others then
  return jsonb_build_object('success', false, 'message', SQLERRM);
end;
$$;
revoke all on function fn_reorder_practice_tracks(jsonb) from public;
grant execute on function fn_reorder_practice_tracks(jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
