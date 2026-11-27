-- ==============================================================================
-- Migration: 20261127000000_v3_reactions_seen.sql
-- Description: V3-24 Comment Reactions, @Mentions, Account Seen State
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Helper: Canonical member ID (follows merged_into_id, cycle-safe)
-- ------------------------------------------------------------------------------
create or replace function fn_canonical_member_id(p_member_id text)
returns text
security definer
set search_path = public
language plpgsql
stable
as $$
declare
  v_current text := p_member_id;
  v_parent text;
  v_visited text[] := array[p_member_id];
begin
  if p_member_id is null or p_member_id = '' then
    return p_member_id;
  end if;

  loop
    select m.merged_into_id into v_parent from members m where m.id = v_current;
    exit when v_parent is null or v_parent = '';
    if v_parent = any(v_visited) then
      return p_member_id;
    end if;
    v_visited := array_append(v_visited, v_parent);
    v_current := v_parent;
  end loop;

  return v_current;
end;
$$;
revoke all on function fn_canonical_member_id(text) from public, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 2. R1: comment_reaction_events (Append-Only)
-- ------------------------------------------------------------------------------
create table if not exists comment_reaction_events (
  seq bigint generated always as identity primary key,
  id text not null unique,
  comment_id text not null,
  schedule_id text not null,
  member_id text not null,
  emoji text not null check (emoji in ('👍','❤️','👏','😂','🙏','🎵')),
  action text not null check (action in ('ADD','REMOVE')),
  device_id text not null default '',
  received_at timestamptz not null default now()
);

create index if not exists idx_reaction_events_comment on comment_reaction_events(comment_id);
create index if not exists idx_reaction_events_member_time on comment_reaction_events(member_id, received_at);

drop trigger if exists trg_comment_reaction_events_immutable on comment_reaction_events;
create trigger trg_comment_reaction_events_immutable
  before update or delete on comment_reaction_events
  for each row execute function prevent_raw_log_mutation();

alter table comment_reaction_events enable row level security;
drop policy if exists "Allow read comment_reaction_events" on comment_reaction_events;
create policy "Allow read comment_reaction_events" on comment_reaction_events for select using (true);

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comment_reaction_events') then
    alter publication supabase_realtime add table comment_reaction_events;
  end if;
end $$;

create or replace function fn_add_reaction(p_payload jsonb)
returns jsonb
security definer
set search_path = public
language plpgsql as $$
declare
  v_id text := p_payload->>'id';
  v_comment_id text := p_payload->>'commentId';
  v_member_id text := p_payload->>'memberId';
  v_emoji text := p_payload->>'emoji';
  v_action text := p_payload->>'action';
  v_device_id text := coalesce(p_payload->>'deviceId', '');
  v_schedule_id text;
  v_author_id text;
  v_author_canon text;
  v_canonical_id text;
  v_ids text[];
  v_recent_count integer;
begin
  -- 1. Idempotency check first (even if comment was deleted later)
  if v_id is not null and exists (select 1 from comment_reaction_events where id = v_id) then
    return jsonb_build_object('success', true);
  end if;

  -- 2. Length & required field checks
  if v_id is null or char_length(v_id) < 1 or char_length(v_id) > 64 or char_length(v_device_id) > 128 then
    return jsonb_build_object('success', false, 'code', 'INVALID_REACTION', 'message', '잘못된 반응 요청입니다.');
  end if;

  if v_emoji is null or v_action is null then
    return jsonb_build_object('success', false, 'code', 'INVALID_REACTION', 'message', '잘못된 반응 요청입니다.');
  end if;

  -- 3. Member check
  if v_member_id is null or not exists (
    select 1 from members where id = v_member_id and status <> 'DELETED'
  ) then
    return jsonb_build_object('success', false, 'code', 'MEMBER_NOT_FOUND', 'message', '단원을 찾을 수 없습니다.');
  end if;

  -- 4. Comment existence & not deleted by author (canonical comparison)
  select c.schedule_id, c.member_id
    into v_schedule_id, v_author_id
    from schedule_comment_events c
   where c.id = v_comment_id
     and c.action = 'CREATE'
   limit 1;

  if v_schedule_id is null then
    return jsonb_build_object('success', false, 'code', 'COMMENT_NOT_FOUND', 'message', '댓글을 찾을 수 없습니다.');
  end if;

  v_author_canon := fn_canonical_member_id(v_author_id);
  if exists (
    select 1 from schedule_comment_events d
     where d.action = 'DELETE'
       and d.target_id = v_comment_id
       and fn_canonical_member_id(d.member_id) = v_author_canon
  ) then
    return jsonb_build_object('success', false, 'code', 'COMMENT_NOT_FOUND', 'message', '댓글을 찾을 수 없습니다.');
  end if;

  -- 5. Rate limit: max 30 reactions in 1 minute per canonical member
  v_canonical_id := fn_canonical_member_id(v_member_id);
  with recursive tree as (
    select v_canonical_id as id
    union
    select m.id from members m join tree t on m.merged_into_id = t.id
  )
  select coalesce(array_agg(id), array[v_member_id]) into v_ids from tree;

  select count(*)
    into v_recent_count
    from comment_reaction_events
   where member_id = any(v_ids)
     and received_at > now() - interval '1 minute';

  if v_recent_count >= 30 then
    return jsonb_build_object('success', false, 'code', 'RATE_LIMITED', 'message', '잠시 후 다시 시도해 주세요.');
  end if;

  insert into comment_reaction_events (
    id, comment_id, schedule_id, member_id, emoji, action, device_id
  ) values (
    v_id, v_comment_id, v_schedule_id, v_member_id, v_emoji, v_action, v_device_id
  ) on conflict (id) do nothing;

  return jsonb_build_object('success', true);
exception when check_violation then
  return jsonb_build_object('success', false, 'code', 'INVALID_REACTION', 'message', '잘못된 반응 요청입니다.');
end;
$$;

grant execute on function fn_add_reaction(jsonb) to anon, authenticated;

-- ------------------------------------------------------------------------------
-- 3. R3: member_seen_state & RPCs
-- ------------------------------------------------------------------------------
create table if not exists member_seen_state (
  member_id text not null,
  kind text not null check (kind in ('baseline','news','comments','sticker','vote')),
  scope text not null default '',
  seen_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (member_id, kind, scope)
);

alter table member_seen_state enable row level security;

create or replace function fn_mark_seen(p_payload jsonb)
returns jsonb
security definer
set search_path = public
language plpgsql as $$
declare
  v_member_id text := p_payload->>'memberId';
  v_items jsonb := p_payload->'items';
  v_item jsonb;
  v_kind text;
  v_scope text;
  v_up_to text;
  v_at timestamptz;
  v_now timestamptz := now();
begin
  if v_member_id is null or not exists (
    select 1 from members where id = v_member_id and status <> 'DELETED'
  ) then
    return jsonb_build_object('success', false, 'code', 'MEMBER_NOT_FOUND', 'message', '단원을 찾을 수 없습니다.');
  end if;

  if v_items is null or jsonb_typeof(v_items) <> 'array' then
    return jsonb_build_object('success', false, 'code', 'INVALID_SEEN_STATE', 'message', '잘못된 읽음 기록 요청입니다.');
  end if;

  if jsonb_array_length(v_items) > 50 then
    return jsonb_build_object('success', false, 'code', 'TOO_MANY_ITEMS', 'message', '한 번에 저장할 수 있는 항목이 너무 많습니다.');
  end if;

  for v_item in select value from jsonb_array_elements(v_items) loop
    v_kind := v_item->>'kind';
    v_scope := coalesce(v_item->>'scope', '');
    v_up_to := v_item->>'upTo';
    v_at := least(fn_safe_timestamptz(v_up_to, v_now), v_now);

    if v_kind = 'baseline' then
      insert into member_seen_state (member_id, kind, scope, seen_at)
      values (v_member_id, 'baseline', v_scope, v_now)
      on conflict (member_id, kind, scope) do nothing;
    else
      insert into member_seen_state (member_id, kind, scope, seen_at)
      values (v_member_id, v_kind, v_scope, v_at)
      on conflict (member_id, kind, scope) do update
        set seen_at = greatest(member_seen_state.seen_at, excluded.seen_at),
            updated_at = now();
    end if;
  end loop;

  return jsonb_build_object('success', true);
exception when check_violation then
  return jsonb_build_object('success', false, 'code', 'INVALID_SEEN_STATE', 'message', '잘못된 읽음 기록 항목입니다.');
end;
$$;

grant execute on function fn_mark_seen(jsonb) to anon, authenticated;

create or replace function fn_get_seen_state(p_payload jsonb)
returns jsonb
security definer
set search_path = public
language plpgsql as $$
declare
  v_raw_ids jsonb := p_payload->'memberIds';
  v_member_ids text[];
  v_rows jsonb;
begin
  if v_raw_ids is null or jsonb_typeof(v_raw_ids) <> 'array' then
    return jsonb_build_object('success', true, 'rows', '[]'::jsonb);
  end if;

  if jsonb_array_length(v_raw_ids) > 20 then
    return jsonb_build_object('success', false, 'code', 'TOO_MANY_ITEMS', 'message', '조회할 단원 ID가 너무 많습니다.');
  end if;

  select coalesce(array_agg(val), '{}'::text[])
    into v_member_ids
    from jsonb_array_elements_text(v_raw_ids) as val;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'memberId', s.member_id,
      'kind', s.kind,
      'scope', s.scope,
      'seenAt', to_char(s.seen_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )
  ), '[]'::jsonb)
    into v_rows
    from member_seen_state s
   where s.member_id = any(v_member_ids);

  return jsonb_build_object('success', true, 'rows', v_rows);
end;
$$;

grant execute on function fn_get_seen_state(jsonb) to anon, authenticated;

-- ------------------------------------------------------------------------------
-- 4. R10: @Mentions on schedule_comment_events
-- ------------------------------------------------------------------------------
alter table schedule_comment_events
  add column if not exists mention_member_ids text[] not null default '{}';

create or replace function fn_clean_mention_ids(p_val jsonb)
returns text[]
security definer
set search_path = public
language plpgsql
stable
as $$
declare
  v_result text[];
begin
  if p_val is null or jsonb_typeof(p_val) <> 'array' then
    return '{}'::text[];
  end if;

  select coalesce(array_agg(sub.canon_id order by sub.first_ord), '{}'::text[])
    into v_result
    from (
      select canon_id, min(ord) as first_ord
        from (
          select fn_canonical_member_id(elem.raw_id) as canon_id, elem.ord
            from jsonb_array_elements_text(p_val) with ordinality as elem(raw_id, ord)
        ) mapped
        join members m on m.id = mapped.canon_id and m.status <> 'DELETED'
       group by canon_id
       order by min(ord) asc
       limit 10
    ) sub;

  return v_result;
end;
$$;
revoke all on function fn_clean_mention_ids(jsonb) from public, anon, authenticated;

-- Copy of 20261119000001_rpc_functions.sql:324-346 with mention_member_ids added
create or replace function fn_add_comment(p_payload jsonb)
returns jsonb
security definer
language plpgsql as $$
begin
  insert into schedule_comment_events (
    id, schedule_id, member_id, member_name, part,
    action, target_id, text, timestamp, device_id, mention_member_ids
  ) values (
    p_payload->>'id',
    p_payload->>'scheduleId',
    p_payload->>'memberId',
    p_payload->>'memberName',
    p_payload->>'part',
    'CREATE',
    coalesce(p_payload->>'targetId', ''),
    p_payload->>'text',
    coalesce(p_payload->>'timestamp', fn_get_kst_now_string()),
    coalesce(p_payload->>'deviceId', ''),
    fn_clean_mention_ids(p_payload->'mentionMemberIds')
  );
  return jsonb_build_object('success', true, 'message', '댓글이 등록되었습니다.');
end;
$$;

-- Copy of 20261119000001_rpc_functions.sql:348-370 with mention_member_ids added
create or replace function fn_edit_comment(p_payload jsonb)
returns jsonb
security definer
language plpgsql as $$
declare
  v_mentions text[];
  v_author_canon text;
begin
  if p_payload ? 'mentionMemberIds' then
    v_mentions := fn_clean_mention_ids(p_payload->'mentionMemberIds');
  else
    v_author_canon := fn_canonical_member_id(p_payload->>'memberId');
    select coalesce(e.mention_member_ids, '{}'::text[])
      into v_mentions
      from schedule_comment_events e
     where (e.id = p_payload->>'targetId' and e.action = 'CREATE' and fn_canonical_member_id(e.member_id) = v_author_canon)
        or (e.target_id = p_payload->>'targetId' and e.action = 'EDIT' and fn_canonical_member_id(e.member_id) = v_author_canon)
     order by e.seq desc
     limit 1;
    v_mentions := coalesce(v_mentions, '{}'::text[]);
  end if;

  insert into schedule_comment_events (
    id, schedule_id, member_id, member_name, part,
    action, target_id, text, timestamp, device_id, mention_member_ids
  ) values (
    p_payload->>'id',
    p_payload->>'scheduleId',
    p_payload->>'memberId',
    p_payload->>'memberName',
    p_payload->>'part',
    'EDIT',
    p_payload->>'targetId',
    p_payload->>'text',
    coalesce(p_payload->>'timestamp', fn_get_kst_now_string()),
    coalesce(p_payload->>'deviceId', ''),
    v_mentions
  );
  return jsonb_build_object('success', true, 'message', '댓글이 수정되었습니다.');
end;
$$;

-- ------------------------------------------------------------------------------
-- 5. Snapshot: Copy of 20261119000001_rpc_functions.sql:18-197 with receivedAt,
--    mentionMemberIds on comments, and reactions array added
-- ------------------------------------------------------------------------------
create or replace function fn_get_initial_snapshot()
returns jsonb
security definer
language plpgsql as $$
declare
  v_members jsonb;
  v_schedules jsonb;
  v_rsvp_votes jsonb;
  v_logs jsonb;
  v_locations jsonb;
  v_member_history jsonb;
  v_program_cards jsonb;
  v_comments jsonb;
  v_reactions jsonb;
  v_config jsonb;
begin
  -- 1. Members
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', m.id,
      'name', m.name,
      'part', m.part,
      'phoneLast4', m.phone_last4,
      'phone', m.phone,
      'role', m.role,
      'status', m.status,
      'joinedAt', m.joined_at,
      'memberStatus', m.member_status,
      'note', m.note,
      'boundDeviceId', m.bound_device_id,
      'boundDeviceAt', m.bound_device_at,
      'mergedIntoId', m.merged_into_id,
      'createdAt', to_char(m.created_at at time zone 'Asia/Seoul', 'YYYY-MM-DD"T"HH24:MI:SSOF')
    ) order by m.name
  ), '[]'::jsonb) into v_members from members m;

  -- 2. Schedules
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'title', s.title,
      'date', s.date,
      'startTime', s.start_time,
      'endTime', s.end_time,
      'locationName', s.location_name,
      'locationId', s.location_id,
      'latitude', s.latitude,
      'longitude', s.longitude,
      'radiusMeters', s.radius_meters,
      'category', s.category,
      'checkInPin', s.check_in_pin,
      'description', s.description,
      'programId', s.program_id,
      'seriesId', s.series_id,
      'seriesIndex', s.series_index,
      'seriesTotal', s.series_total,
      'isArchived', s.is_archived,
      'isCancelled', s.is_cancelled,
      'targetAudienceType', s.target_audience_type,
      'targetParts', coalesce(to_jsonb(s.target_parts), '[]'::jsonb),
      'targetMemberIds', coalesce(to_jsonb(s.target_member_ids), '[]'::jsonb),
      'visibility', s.visibility
    ) order by s.date, s.start_time
  ), '[]'::jsonb) into v_schedules from schedules s;

  -- 3. RSVP Votes
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'scheduleId', r.schedule_id,
      'memberId', r.member_id,
      'memberName', r.member_name,
      'part', r.part,
      'status', r.status,
      'reason', r.reason,
      'timestamp', r.timestamp
    )
  ), '[]'::jsonb) into v_rsvp_votes from rsvp_votes r;

  -- 4. Raw Attendance Logs (Ordered by seq to preserve append-order projection)
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', l.id,
      'timestamp', l.timestamp,
      'scheduleId', l.schedule_id,
      'memberId', l.member_id,
      'memberName', l.member_name,
      'part', l.part,
      'authMethod', l.auth_method,
      'isVerifiedLocation', l.is_verified_location,
      'adminNote', l.admin_note,
      'distanceMeters', l.distance_meters,
      'deviceId', l.device_id
    ) order by l.seq asc
  ), '[]'::jsonb) into v_logs from attendance_logs l;

  -- 5. Locations
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', loc.id,
      'name', loc.name,
      'address', loc.address,
      'detailAddress', loc.detail_address,
      'entranceNote', loc.entrance_note,
      'latitude', loc.latitude,
      'longitude', loc.longitude,
      'radiusMeters', loc.radius_meters,
      'isDefault', loc.is_default
    ) order by loc.name
  ), '[]'::jsonb) into v_locations from locations loc;

  -- 6. Member History
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', h.id,
      'memberId', h.member_id,
      'name', h.name,
      'status', h.status,
      'part', h.part,
      'startDate', h.start_date,
      'endDate', h.end_date,
      'reason', h.reason,
      'createdAt', h.created_at
    ) order by h.start_date desc
  ), '[]'::jsonb) into v_member_history from member_status_history h;

  -- 7. Program Cards
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'title', c.title,
      'description', c.description,
      'category', c.category,
      'defaultLocationId', c.default_location_id,
      'defaultStartTime', c.default_start_time,
      'defaultEndTime', c.default_end_time,
      'isArchived', c.is_archived,
      'createdAt', c.created_at,
      'targetAudienceType', c.target_audience_type,
      'targetParts', coalesce(to_jsonb(c.target_parts), '[]'::jsonb),
      'targetMemberIds', coalesce(to_jsonb(c.target_member_ids), '[]'::jsonb)
    ) order by c.created_at desc
  ), '[]'::jsonb) into v_program_cards from program_cards c;

  -- 8. Comments (Ordered by seq asc to preserve event projection folding)
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', cmt.id,
      'scheduleId', cmt.schedule_id,
      'memberId', cmt.member_id,
      'memberName', cmt.member_name,
      'part', cmt.part,
      'action', cmt.action,
      'targetId', cmt.target_id,
      'text', cmt.text,
      'timestamp', cmt.timestamp,
      'deviceId', cmt.device_id,
      'receivedAt', to_char(cmt.received_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'mentionMemberIds', to_jsonb(cmt.mention_member_ids)
    ) order by cmt.seq asc
  ), '[]'::jsonb) into v_comments from schedule_comment_events cmt;

  -- 8b. Comment Reactions (Ordered by seq asc)
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'commentId', r.comment_id,
      'scheduleId', r.schedule_id,
      'memberId', r.member_id,
      'emoji', r.emoji,
      'action', r.action,
      'deviceId', r.device_id,
      'receivedAt', to_char(r.received_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ) order by r.seq asc
  ), '[]'::jsonb) into v_reactions from comment_reaction_events r;

  -- 9. Config (Key-Value map from app_config)
  select coalesce(jsonb_object_agg(cfg.key, cfg.value), '{}'::jsonb)
    into v_config from app_config cfg;

  return jsonb_build_object(
    'success', true,
    'timestamp', fn_get_kst_now_string(),
    'data', jsonb_build_object(
      'members', v_members,
      'schedules', v_schedules,
      'rsvpVotes', v_rsvp_votes,
      'logs', v_logs,
      'locations', v_locations,
      'memberHistory', v_member_history,
      'programCards', v_program_cards,
      'comments', v_comments,
      'reactions', v_reactions,
      'config', v_config
    )
  );
end;
$$;

-- ------------------------------------------------------------------------------
-- 6. Member deletion guard: Copy of 20261124010000_v3_record_guards.sql:272-310
--    with comment_reaction_events check & member_seen_state cleanup
-- ------------------------------------------------------------------------------
create or replace function fn_delete_member__impl(p_payload jsonb)
returns jsonb
security definer
set search_path = public, extensions
language plpgsql as $$
declare
  v_member_id text := p_payload->>'id';
  v_is_merged boolean;
begin
  select (status = 'MERGED' or exists(select 1 from members where merged_into_id = v_member_id))
    into v_is_merged
    from members
   where id = v_member_id;

  if v_is_merged then
    return jsonb_build_object('success', false, 'message', '병합 이력이 연결된 단원은 물리 삭제할 수 없습니다.');
  end if;

  if exists (select 1 from attendance_logs where member_id = v_member_id)
     or exists (select 1 from rsvp_votes where member_id = v_member_id)
     or exists (select 1 from rsvp_events where member_id = v_member_id)
     or exists (select 1 from schedule_comment_events where member_id = v_member_id)
     or exists (select 1 from comment_reaction_events where member_id = v_member_id)
     or exists (select 1 from member_status_history where member_id = v_member_id)
     or exists (select 1 from practice_listen_sessions where member_id = v_member_id)
     or exists (
       select 1 from schedules
        where v_member_id = any(target_member_ids)
     ) then
    update members
       set status = 'DELETED',
           updated_at = now()
     where id = v_member_id;
    return jsonb_build_object('success', true, 'message', '기록이 있어 비활성화(삭제) 처리되었습니다.');
  end if;

  delete from member_seen_state where member_id = v_member_id;
  delete from members where id = v_member_id;
  return jsonb_build_object('success', true, 'message', '단원이 삭제되었습니다.');
end;
$$;

revoke all on function fn_delete_member__impl(jsonb) from public, anon, authenticated;
