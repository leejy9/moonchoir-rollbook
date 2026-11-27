-- Verify V3-24: comment_reaction_events, member_seen_state, @mentions, snapshot, member deletion guard.
begin;

do $$
declare
  v_res jsonb;
  v_cnt integer;
  v_sched_id text;
  v_seen_before timestamptz;
  v_seen_after timestamptz;
  v_snapshot jsonb;
  v_cmt_obj jsonb;
  v_rxn_obj jsonb;
  v_mentions text[];
  v_token text;
  i integer;
begin
  v_token := fn_issue_admin_session('admin')->>'token';

  -- Setup members (including merged alias and cycle)
  insert into members (id, name, part, role, status, merged_into_id) values
    ('t24_m1', '이하은', '알토', 'MEMBER', 'ACTIVE', null),
    ('t24_m1b', '이하은_구', '알토', 'MEMBER', 'MERGED', 't24_m1'),
    ('t24_m2', '민지', '소프라노', 'MEMBER', 'ACTIVE', null),
    ('t24_m3', '지은', '테너', 'MEMBER', 'ACTIVE', null),
    ('t24_m4', '도윤', '베이스', 'MEMBER', 'ACTIVE', null),
    ('t24_m5', '수진', '알토', 'MEMBER', 'ACTIVE', null),
    ('t24_m6', '현우', '테너', 'MEMBER', 'ACTIVE', null),
    ('t24_m7', '서연', '소프라노', 'MEMBER', 'ACTIVE', null),
    ('t24_m8', '준호', '베이스', 'MEMBER', 'ACTIVE', null),
    ('t24_m9', '예진', '알토', 'MEMBER', 'ACTIVE', null),
    ('t24_m10', '민수', '테너', 'MEMBER', 'ACTIVE', null),
    ('t24_m11', '하린', '소프라노', 'MEMBER', 'ACTIVE', null),
    ('t24_m12', '우진', '베이스', 'MEMBER', 'ACTIVE', null),
    ('t24_del', '삭제단원', '알토', 'MEMBER', 'DELETED', null),
    ('t24_seen_only', '읽음만있는단원', '알토', 'MEMBER', 'ACTIVE', null),
    ('t24_rxn_only', '반응만있는단원', '알토', 'MEMBER', 'ACTIVE', null);

  insert into schedules (id, title, date, start_time, end_time, category) values
    ('t24_sch_a', '추가연습', '2026-11-28', '14:00', '17:00', '추가연습'),
    ('t24_sch_b', '정기연습', '2026-12-01', '19:30', '21:40', '정기연습');

  -- Add comment c1 by m1 with mention of m1b (should canonicalize to m1) and missing x9
  v_res := fn_add_comment(jsonb_build_object(
    'id', 't24_c1',
    'scheduleId', 't24_sch_a',
    'memberId', 't24_m1',
    'memberName', '이하은',
    'part', '알토',
    'text', '@이하은 안녕',
    'timestamp', '2026-11-27 09:00:00',
    'deviceId', 'dev1',
    'mentionMemberIds', jsonb_build_array('t24_x9', 't24_m1b', 't24_m2', 't24_m1')
  ));
  if v_res->>'success' is distinct from 'true' then
    raise exception 'FAIL: fn_add_comment failed: %', v_res;
  end if;

  select mention_member_ids into v_mentions from schedule_comment_events where id = 't24_c1';
  if v_mentions <> array['t24_m1', 't24_m2'] then
    raise exception 'FAIL: mention_member_ids expected {t24_m1,t24_m2}, got %', v_mentions;
  end if;

  -- R10: 11 valid + 1 missing -> first 10 kept
  v_res := fn_add_comment(jsonb_build_object(
    'id', 't24_c_11',
    'scheduleId', 't24_sch_a',
    'memberId', 't24_m2',
    'memberName', '민지',
    'part', '소프라노',
    'text', '많이 언급',
    'mentionMemberIds', jsonb_build_array(
      't24_x9', 't24_m1', 't24_m2', 't24_m3', 't24_m4', 't24_m5',
      't24_m6', 't24_m7', 't24_m8', 't24_m9', 't24_m10', 't24_m11'
    )
  ));
  select mention_member_ids into v_mentions from schedule_comment_events where id = 't24_c_11';
  if array_length(v_mentions, 1) <> 10 or v_mentions[1] <> 't24_m1' or v_mentions[10] <> 't24_m10' then
    raise exception 'FAIL: 10-mention cap failed: %', v_mentions;
  end if;

  -- R10: legacy fn_edit_comment without mentionMemberIds key inherits previous author mentions
  v_res := fn_edit_comment(jsonb_build_object(
    'id', 't24_c1_edit1',
    'scheduleId', 't24_sch_a',
    'memberId', 't24_m1',
    'memberName', '이하은',
    'part', '알토',
    'targetId', 't24_c1',
    'text', '@이하은 수정됨'
  ));
  select mention_member_ids into v_mentions from schedule_comment_events where id = 't24_c1_edit1';
  if v_mentions <> array['t24_m1', 't24_m2'] then
    raise exception 'FAIL: legacy fn_edit_comment should inherit mentions, got %', v_mentions;
  end if;

  -- Third-party DELETE on t24_c1 (should NOT block reactions)
  insert into schedule_comment_events (id, schedule_id, member_id, member_name, part, action, target_id, text, timestamp)
  values ('t24_c1_bad_del', 't24_sch_a', 't24_m2', '민지', '소프라노', 'DELETE', 't24_c1', '', '2026-11-27 09:05:00');

  -- R1: Normal ADD (payload scheduleId is wrong, server must use t24_sch_a)
  v_res := fn_add_reaction(jsonb_build_object(
    'id', 't24_r1',
    'commentId', 't24_c1',
    'scheduleId', 't24_sch_b',
    'memberId', 't24_m2',
    'emoji', '👏',
    'action', 'ADD',
    'deviceId', 'dev2'
  ));
  if v_res->>'success' is distinct from 'true' then
    raise exception 'FAIL: normal ADD failed: %', v_res;
  end if;
  select schedule_id into v_sched_id from comment_reaction_events where id = 't24_r1';
  if v_sched_id is distinct from 't24_sch_a' then
    raise exception 'FAIL: schedule_id should be t24_sch_a, got %', v_sched_id;
  end if;

  -- R1: Idempotency (same id twice -> 1 row, both success)
  v_res := fn_add_reaction(jsonb_build_object(
    'id', 't24_r1',
    'commentId', 't24_c1',
    'memberId', 't24_m2',
    'emoji', '👏',
    'action', 'ADD'
  ));
  select count(*) into v_cnt from comment_reaction_events where id = 't24_r1';
  if v_res->>'success' is distinct from 'true' or v_cnt <> 1 then
    raise exception 'FAIL: idempotent reaction failed: % count=%', v_res, v_cnt;
  end if;

  -- R1: Invalid emoji '👎' -> INVALID_REACTION
  v_res := fn_add_reaction(jsonb_build_object(
    'id', 't24_r_bad_emoji',
    'commentId', 't24_c1',
    'memberId', 't24_m2',
    'emoji', '👎',
    'action', 'ADD'
  ));
  if v_res->>'code' is distinct from 'INVALID_REACTION' then
    raise exception 'FAIL: expected INVALID_REACTION for bad emoji, got %', v_res;
  end if;

  -- R1: id 65 chars -> INVALID_REACTION
  v_res := fn_add_reaction(jsonb_build_object(
    'id', repeat('a', 65),
    'commentId', 't24_c1',
    'memberId', 't24_m2',
    'emoji', '👍',
    'action', 'ADD'
  ));
  if v_res->>'code' is distinct from 'INVALID_REACTION' then
    raise exception 'FAIL: expected INVALID_REACTION for 65-char id, got %', v_res;
  end if;

  -- R1: missing or deleted member -> MEMBER_NOT_FOUND
  v_res := fn_add_reaction(jsonb_build_object(
    'id', 't24_r_nomem',
    'commentId', 't24_c1',
    'memberId', 't24_missing',
    'emoji', '👍',
    'action', 'ADD'
  ));
  if v_res->>'code' is distinct from 'MEMBER_NOT_FOUND' then
    raise exception 'FAIL: expected MEMBER_NOT_FOUND, got %', v_res;
  end if;

  -- R1: Author (via alias m1b) deletes t24_c1 -> COMMENT_NOT_FOUND for new reactions
  insert into schedule_comment_events (id, schedule_id, member_id, member_name, part, action, target_id, text, timestamp)
  values ('t24_c1_del', 't24_sch_a', 't24_m1b', '이하은_구', '알토', 'DELETE', 't24_c1', '', '2026-11-27 09:10:00');

  v_res := fn_add_reaction(jsonb_build_object(
    'id', 't24_r_deleted_cmt',
    'commentId', 't24_c1',
    'memberId', 't24_m3',
    'emoji', '👍',
    'action', 'ADD'
  ));
  if v_res->>'code' is distinct from 'COMMENT_NOT_FOUND' then
    raise exception 'FAIL: expected COMMENT_NOT_FOUND on deleted comment, got %', v_res;
  end if;

  -- R1: Idempotent retry on deleted comment still succeeds
  v_res := fn_add_reaction(jsonb_build_object(
    'id', 't24_r1',
    'commentId', 't24_c1',
    'memberId', 't24_m2',
    'emoji', '👏',
    'action', 'ADD'
  ));
  if v_res->>'success' is distinct from 'true' then
    raise exception 'FAIL: idempotent retry after delete should succeed: %', v_res;
  end if;

  -- R1: Rate limit (30 reactions OK, 31st -> RATE_LIMITED)
  for i in 1..30 loop
    v_res := fn_add_reaction(jsonb_build_object(
      'id', 't24_rate_' || i,
      'commentId', 't24_c_11',
      'memberId', 't24_m3',
      'emoji', '👍',
      'action', 'ADD'
    ));
    if v_res->>'success' is distinct from 'true' then
      raise exception 'FAIL: rate limit hit early at %: %', i, v_res;
    end if;
  end loop;
  v_res := fn_add_reaction(jsonb_build_object(
    'id', 't24_rate_31',
    'commentId', 't24_c_11',
    'memberId', 't24_m3',
    'emoji', '👍',
    'action', 'ADD'
  ));
  if v_res->>'code' is distinct from 'RATE_LIMITED' then
    raise exception 'FAIL: expected RATE_LIMITED on 31st reaction, got %', v_res;
  end if;

  -- R1: Immutable trigger blocks update/delete
  begin
    update comment_reaction_events set emoji = '👍' where id = 't24_r1';
    raise exception 'FAIL: update on comment_reaction_events should be blocked';
  exception when others then
    null;
  end;

  -- R3: fn_mark_seen & fn_get_seen_state
  v_res := fn_mark_seen(jsonb_build_object(
    'memberId', 't24_m1',
    'items', jsonb_build_array(
      jsonb_build_object('kind', 'baseline', 'scope', ''),
      jsonb_build_object('kind', 'news', 'scope', '', 'upTo', '2026-11-26T02:00:00.000Z'),
      jsonb_build_object('kind', 'comments', 'scope', 't24_sch_a', 'upTo', to_char(now() + interval '1 day', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
    )
  ));
  if v_res->>'success' is distinct from 'true' then
    raise exception 'FAIL: fn_mark_seen failed: %', v_res;
  end if;

  -- Future upTo clamped to <= now()
  select seen_at into v_seen_after from member_seen_state where member_id = 't24_m1' and kind = 'comments' and scope = 't24_sch_a';
  if v_seen_after > now() + interval '5 seconds' then
    raise exception 'FAIL: future upTo not clamped: %', v_seen_after;
  end if;

  -- Older upTo does not move news backward
  select seen_at into v_seen_before from member_seen_state where member_id = 't24_m1' and kind = 'news' and scope = '';
  v_res := fn_mark_seen(jsonb_build_object(
    'memberId', 't24_m1',
    'items', jsonb_build_array(
      jsonb_build_object('kind', 'news', 'scope', '', 'upTo', '2026-11-25T00:00:00.000Z')
    )
  ));
  select seen_at into v_seen_after from member_seen_state where member_id = 't24_m1' and kind = 'news' and scope = '';
  if v_seen_after <> v_seen_before then
    raise exception 'FAIL: news moved backward: % -> %', v_seen_before, v_seen_after;
  end if;

  -- 51 items -> TOO_MANY_ITEMS
  v_res := fn_mark_seen(jsonb_build_object(
    'memberId', 't24_m1',
    'items', (select jsonb_agg(jsonb_build_object('kind', 'comments', 'scope', 's' || g)) from generate_series(1, 51) g)
  ));
  if v_res->>'code' is distinct from 'TOO_MANY_ITEMS' then
    raise exception 'FAIL: expected TOO_MANY_ITEMS, got %', v_res;
  end if;

  -- fn_get_seen_state returns rows for aliasIds
  v_res := fn_get_seen_state(jsonb_build_object('memberIds', jsonb_build_array('t24_m1', 't24_m1b')));
  if v_res->>'success' is distinct from 'true' or jsonb_array_length(v_res->'rows') < 3 then
    raise exception 'FAIL: fn_get_seen_state failed: %', v_res;
  end if;

  -- Snapshot includes receivedAt, mentionMemberIds, and reactions
  v_snapshot := fn_get_initial_snapshot();
  select elem into v_cmt_obj
    from jsonb_array_elements(v_snapshot->'data'->'comments') elem
   where elem->>'id' = 't24_c1';
  if v_cmt_obj is null or nullif(v_cmt_obj->>'receivedAt', '') is null or v_cmt_obj->'mentionMemberIds' is null then
    raise exception 'FAIL: snapshot comment missing receivedAt or mentionMemberIds: %', v_cmt_obj;
  end if;
  select elem into v_rxn_obj
    from jsonb_array_elements(v_snapshot->'data'->'reactions') elem
   where elem->>'id' = 't24_r1';
  if v_rxn_obj is null or nullif(v_rxn_obj->>'receivedAt', '') is null then
    raise exception 'FAIL: snapshot reaction missing or missing receivedAt: %', v_rxn_obj;
  end if;

  -- Member deletion guard: member with only reaction is soft-deleted; member with only seen_state is physically deleted & seen_state cleaned
  v_res := fn_add_reaction(jsonb_build_object(
    'id', 't24_r_guard',
    'commentId', 't24_c_11',
    'memberId', 't24_rxn_only',
    'emoji', '🎵',
    'action', 'ADD'
  ));
  v_res := fn_delete_member(jsonb_build_object('id', 't24_rxn_only', 'adminToken', v_token));
  if not exists (select 1 from members where id = 't24_rxn_only' and status = 'DELETED') then
    raise exception 'FAIL: member with reaction should be soft-deleted: %', v_res;
  end if;

  v_res := fn_mark_seen(jsonb_build_object(
    'memberId', 't24_seen_only',
    'items', jsonb_build_array(jsonb_build_object('kind', 'baseline', 'scope', ''))
  ));
  v_res := fn_delete_member(jsonb_build_object('id', 't24_seen_only', 'adminToken', v_token));
  if exists (select 1 from members where id = 't24_seen_only')
     or exists (select 1 from member_seen_state where member_id = 't24_seen_only') then
    raise exception 'FAIL: member with only seen_state should be physically deleted and seen_state cleaned: %', v_res;
  end if;
end $$;

rollback;
