# 22. 댓글 반응 · 새 소식 · 계정별 읽음 · 스티커 축하 개발 지시서 (V3-24)

> 작성: 리뷰어(Claude), 2026-11-27. 기준 코드: `origin/main` @ `3d34859`.
> 명세: `docs/MEMBER_UX_V3_SPEC.md` §0-1 V41~V47.
> 시안(사용자 확정): https://claude.ai/artifact/78R1NaARRVq6a9zKrpZM9r "댓글 반응 · 새 소식" 줄의 `SocialReact`, `SocialPick`, `SocialWho`, `NewsHome`, `NewsList`, `NewsEmpty`, `StickerCelebrate`, `StickerCelebrate2`. 시안 hex는 쓰지 않는다. 시안의 예시 이름·숫자는 넣지 않는다.
> 시작 전: `.agents/rules/recurring-mistakes.md`를 읽고 `/spec-check`로 §3 표를 코드에 대 본다. 어긋나면 시작하지 말고 보고한다.
> **DB 변경이 있다.** 개발 에이전트는 마이그레이션 파일과 검증 스크립트만 커밋한다. 운영 적용은 리뷰어가 앱 배포 **전에** 한다(§7).

---

## 1. 바뀌는 것 한 줄

댓글에 고정 6개 이모지 반응을 달고, 홈 머리의 종에서 "새 소식"을 보고, 읽음 기록을 기기가 아닌 계정(단원)별로 서버에 두고, 새 칭찬 스티커를 받으면 앱을 열 때 축하 화면을 띄운다.

## 2. 데이터 관계 (가장 중요)

### 2-1. 원천과 경로

| 화면 | 원천(저장) | 조회 | 계산(단일 함수) | 화면 |
|---|---|---|---|---|
| 댓글 반응 칩 | **새** `comment_reaction_events`(추가만, 서버 시각 `received_at`) | `fn_get_initial_snapshot`의 `reactions` | `buildCommentReactions` | 댓글 아래 칩, 반응한 사람 |
| 반응 남기기 | — | **새** RPC `fn_add_reaction` | — | 칩 누름 |
| 새 댓글 표시 | `schedule_comment_events.received_at`(이미 있음, 스냅샷에 **추가**) + **새** `member_seen_state` | 스냅샷 + **새** RPC `fn_get_seen_state` | `isCommentUnread` | 홈 카드 점, 상세 "새 댓글" |
| 새 소식 | 반응·댓글 `received_at`, 일정·투표, 스티커 판정 + `member_seen_state` | 위와 같음 | `buildNewsItems` | 종 숫자, 소식 목록 |
| 스티커 축하 | 스티커 판정(`evaluatePraiseStickers`) + `member_seen_state`(kind `sticker`) | 활동 RPC `fn_get_member_activity` + 위 | `useEarnedStickers` → `pickUnseenStickers` | 축하 화면, 내 활동 "신규" |

### 2-2. 데이터 관계 점검 (data-integrity-review 기준)

| 연결부 | 규칙 |
|---|---|
| **병합 회원(V33)** | 반응·읽음 기록을 **쓸 때**는 대표 id로 쓴다(`resolveMemberIdentity(...).canonicalId`). **읽을 때**는 별칭 포함 id 전체(`aliasIds`)의 행을 모아 계산한다. "내 것" 판정은 `sheetsService.isOwnComment`처럼 별칭까지 같은 사람으로 본다. 한 사람이 별칭 id와 대표 id로 같은 이모지를 둘 다 눌렀으면 한 명으로 센다. |
| **시각** | 새 소식과 읽음 비교에는 **서버 시각만** 쓴다: 반응·댓글의 `received_at`, 읽음의 `seen_at`(서버 `now()`). 댓글의 `timestamp` 열(기기가 보낸 KST 문자열, 19자, 시간대 없음, 운영 83건)은 화면 표시용으로만 남긴다. 서버 시각은 스냅샷에서 **UTC ISO 문자열**(`YYYY-MM-DDTHH:MM:SS.mssZ`)로 보낸다(`to_char(... at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`). 기존 `createdAt`처럼 `OF` 형식(`+09`)을 쓰지 않는다. 일정 시작은 기존 KST 해석(`parseScheduleKST`, `timeWindow.ts:26`)을 쓴다. |
| **단일 원천** | 반응 집계 = `buildCommentReactions` 하나. 새 소식 = `buildNewsItems` 하나. 스티커 판정 = `useEarnedStickers` 하나(내 활동과 축하가 같이 쓴다). 내 투표 = `findMyVote`(V3-22). 투표 가능 = `isRsvpOpenForSchedule`. |
| **보관·취소·숨김** | 새 소식의 일정은 `getSchedulesForMember` 결과만(숨김 일정 제외). 미투표 소식은 취소·보관 일정 제외(`isRsvpOpenForSchedule`이 이미 거른다). 스티커는 기존 규칙 그대로(V31). |
| **삭제된 댓글** | 반응 원천은 지우지 않는다. 화면은 `getComments`(삭제 제외)에 있는 댓글의 반응만 보여 준다. 서버는 삭제된 댓글에 새 반응을 받지 않는다. |
| **서버↔화면 계약** | 새 RPC 3개의 payload 키는 `src/services/backend/rpcContract.test.ts` 방식으로 SQL 최신 정의와 대조하는 테스트를 둔다(V3-21 교훈). 이모지 목록도 SQL 검사식과 TS 상수가 같은지 테스트로 확인한다. |
| **기존 상태 이전** | V3-22의 기기 저장 `SEEN_COMMENTS`와 `SEEN_STICKERS`는 더 읽지 않는다(키 상수는 남김). 계정 기록이 처음 생길 때는 "지금까지 것은 다 읽음"으로 시작한다(§4 R5). |
| **권한** | 단원 본인 인증(Task 76)이 아직 없다. 새 RPC도 댓글(`fn_add_comment`)과 같은 수준으로 기기가 보낸 `memberId`를 믿는다. 다만 서버에서 단원·댓글 존재와 이모지·종류 값을 검사한다. |

### 2-3. 리뷰어가 확인한 운영 데이터(읽기 전용)
- `schedule_comment_events`: 83행, `received_at` 83행 모두 있음(최소 2026-11-19). `timestamp`는 19자 KST 문자열.
- `members`: 24명, MERGED 0, DELETED 0(그래도 병합 규칙은 지킨다).
- `rsvp_votes.timestamp`: 19자 92행 + 24자 ISO 2행 혼재 → 이 티켓은 투표 시각을 비교하지 않는다.

---

## 3. 기존 코드 계약 표 (리뷰어가 `origin/main` @ 3d34859에서 연 것)

| 이름 | 정의 위치 | 호출부 | 받는 것 → 돌려주는 것 | 이 티켓에서 |
|---|---|---|---|---|
| `schedule_comment_events` | `supabase/migrations/20261119000000_schema_and_tables.sql:144-158` | `fn_add_comment` 등 | `id`(unique), `schedule_id`, `member_id`, `action`(CREATE/EDIT/DELETE), `target_id`, `timestamp`(text), `received_at timestamptz default now()`, 수정·삭제 막는 트리거(`:191-194`, `prevent_raw_log_mutation`) | 반응 표를 같은 모양으로 만든다 |
| `fn_add_comment` | `supabase/migrations/20261119000001_rpc_functions.sql:324` | `supabaseBackend.ts:118` | payload → insert, 검사 없음 | 참고만(반응 RPC는 검사를 더 둔다) |
| `fn_get_initial_snapshot` | `20261119000001_rpc_functions.sql:18`(유일한 정의) | `supabaseBackend.ts:36` | 전체 데이터. 댓글은 `seq` 순(`order by cmt.seq asc`), `receivedAt` 없음 | **최신 정의 전체를 복사해** 댓글에 `receivedAt` 추가, `reactions` 배열 추가(규칙 4) |
| `fn_safe_timestamptz` | `20261124000000_v3_activity.sql:22` | 활동 RPC | text, fallback → timestamptz | `fn_mark_seen`의 `upTo` 해석 |
| `fn_get_kst_now_string` | `20261119000001_rpc_functions.sql:8` | 여러 RPC | KST 문자열 | 쓰지 않는다(서버 시각은 `now()`) |
| `parseRemoteCommentEvents` | `src/services/sheetsParser.ts:266` | `sheets.ts:1954` | 원격 행 → `ScheduleCommentEvent[]` | `receivedAt` 읽기 추가. 같은 파일에 `parseRemoteReactionEvents` 추가 |
| `ScheduleCommentEvent` / `ScheduleComment` | `src/types/rollbook.ts:212` / `:226` | 댓글 전반 | — | 둘 다 `receivedAt?: string` 추가(없으면 옛 데이터, R5 참고) |
| `buildScheduleComments` | `src/utils/scheduleComments.ts:27` | `sheets.ts:347,355` | 이벤트 → 댓글(삭제 제외, 수정 반영, 이벤트 순) | `receivedAt`은 **CREATE 행의 값**을 쓴다(수정해도 바뀌지 않음) |
| `createCommentEventId` | `src/utils/scheduleComments.ts:8` | 댓글 쓰기 | 고유 id | 반응 이벤트 id에도 같은 방식 사용 |
| `sheetsService.getComments` / `getCommentCounts` / `isOwnComment` | `src/services/sheets.ts:347` / `:355` / `:372` | 댓글·홈 | — | 재사용 |
| `isSameMember`(private) | `src/services/sheets.ts:331` | 댓글 | 별칭 포함 같은 사람 | 반응 집계에 같은 판정 사용(public 래퍼를 새로 만들지 말고 `isOwnComment`처럼 필요한 메서드 안에서 쓴다) |
| `recordCommentEvent` | `src/services/sheets.ts:376` | 댓글 쓰기 | 같은 id 재시도 무시 → 서버 → 로컬 반영 | 반응은 **낙관적 반영 후 실패 시 되돌림**(R2) |
| `sendToGoogleSheet` / `mapActionToRpc` | `sheets.ts:2339` / `supabaseBackend.ts:55` | 모든 쓰기 | action → RPC | `ADD_REACTION`→`fn_add_reaction`, `MARK_SEEN`→`fn_mark_seen`, `GET_SEEN_STATE`→`fn_get_seen_state` 추가 |
| `GasBackend` | `src/services/backend/gasBackend.ts` | `sheets.ts:77` | 옛 GAS 경로 | 새 기능을 넣지 않는다. GAS 모드면 반응 버튼·종을 숨긴다(R1·R4) |
| `rpcContract.test.ts` | `src/services/backend/rpcContract.test.ts` | — | SQL 최신 정의 본문과 payload 키 대조 | 새 RPC 3개 추가 |
| `resolveMemberIdentity` | `src/utils/memberIdentity.ts:8` | `ProfileTab.tsx:100` 등 | → `{canonicalId, aliasIds}` | 쓰기=canonical, 읽기=aliasIds. **`getMembers(true)`와 함께**(병합 행 필요, `sheets.ts:268`) |
| `getSyncState` / `subscribeSync` | `src/services/sheets.ts:1980` / `:1984` | 홈·내 활동 | `lastSyncedAt > 0`이면 준비 | 읽음 기록·축하의 준비 조건 |
| `getMemberActivity` | `src/services/sheets.ts:823` | `ProfileTab.tsx:109` | 별칭 id들 → 활동(투표 이력·재생) | `useEarnedStickers`로 옮긴다 |
| 스티커 입력 조립 | `src/components/ProfileTab.tsx:70-264` | — | members, config, currentMember, activity, schedules, logs, votes, `isActivityStaff`(:138), `buildMemberScheduleRecords`(:143), `evaluatePraiseStickers`(:236) | **`src/components/profile/useEarnedStickers.ts`로 추출**하고 `ProfileTab`과 축하 화면이 같이 쓴다 |
| `evaluatePraiseStickers` | `src/utils/praiseStickers.ts:55` | `ProfileTab.tsx:236` | → 스티커마다 `earned`, `earnedOn`(YYYY-MM-DD), `progress` | 재사용. 24개 모두 `earnedOn` 계산(`praiseStickerEvaluators.ts`) |
| `isStickerDataReady` | `src/components/profile/useSeenStickers.ts:8` | `ProfileTab.tsx:259` | `lastSyncedAt > 0 && (isStaff \|\| activity 도착)` | 재사용 |
| `useSeenStickers` | `src/components/profile/useSeenStickers.ts:34` | `ProfileTab.tsx:264` | 기기 저장 본 스티커 | **계정 기록으로 교체**. `StickerBoardSheet`의 `unseenStickerIds`(:397)는 계정 기록에서 받는다 |
| `useSeenComments` / `recordSeenComments` / `readSeenCommentsState` | `src/components/home/useSeenComments.ts:59` / `:40` / `:16` | `HomeTab.tsx:147`, `ScheduleComments.tsx:59,76` | 기기 저장 새 댓글 | **계정 기록으로 교체**(같은 파일을 고친다. 호출부 모양은 가능하면 유지) |
| `findMyVote` | `src/utils/myVote.ts` | 홈 | 별칭 포함 내 투표 | 미투표 소식 |
| `isRsvpOpenForSchedule` | `src/utils/timeWindow.ts:135` | 홈·상세 | 시작 60분 전까지 투표 가능, 취소·보관 false | 미투표 소식 |
| `parseScheduleKST`(비공개) | `src/utils/timeWindow.ts:26` | 같은 파일 | 일정 날짜·시각 → KST Date | `export` 해서 소식의 "3일 전" 계산에 쓴다(새 해석기 금지) |
| `isMemberRequiredForSchedule` | `src/utils/attendanceStats.ts:65` | 홈 | 필참 여부 | 미투표 소식 대상(V45, 사용자 확인 대기) |
| `AppHeader` | `src/components/AppHeader.tsx` | `App.tsx` | 로고, `showAdminEntry`(:114) | 종 버튼 추가(설정 버튼 왼쪽) |
| `stickerImageUrl` | `src/utils/praiseStickers.ts:37` | 스티커판 | 그림 경로 | 축하 화면 |
| `route` 겹침 화면 | `src/utils/route.ts:4-8` | — | `scheduleSheet`, `qr`, `rsvp`, `player`, `score` | 축하는 겹침 화면이 없을 때만. 새 소식은 경로 없이 시트로 연다(새 경로 금지) |
| `scripts/ci/db-check.sh`, `supabase/tests/*.sql` | — | CI | 빈 PostgreSQL에 마이그레이션 + 검증 | `supabase/tests/v3_reactions_seen_check.sql` 추가 |

표에 없는 이름을 새로 쓰려면 먼저 보고한다.

---

## 4. 규칙과 경계 예시

공통 데이터: 단원 `m1`(이하은, 알토), 별칭 `m1b`→`m1` 병합. `m2` 민지, `m3` 지은, `m4` 도윤. 일정 `A` 11/28 토 14:00~17:00(필참), `B` 12/01 화 19:30~21:40(필참), `C` 12/05 13:00~18:00(자율). now = 2026-11-27 12:00 KST.

### R1. 반응 데이터 (DB, `supabase/migrations/20261127000000_v3_reactions_seen.sql`)

```sql
create table if not exists comment_reaction_events (
  seq bigint generated always as identity primary key,
  id text not null unique,
  comment_id text not null,
  schedule_id text not null,          -- 서버가 댓글 행에서 채운다(payload 값 무시)
  member_id text not null,            -- 쓸 때 대표 id
  emoji text not null check (emoji in ('👍','❤️','👏','😂','🙏','🎵')),
  action text not null check (action in ('ADD','REMOVE')),
  device_id text not null default '',
  received_at timestamptz not null default now()
);
create index if not exists idx_reaction_events_comment on comment_reaction_events(comment_id);
create index if not exists idx_reaction_events_member_time on comment_reaction_events(member_id, received_at);
-- 수정·삭제 금지: 기존 prevent_raw_log_mutation 트리거 재사용
-- RLS enable + select using (true) (schedule_comment_events와 같게)
```

`fn_add_reaction(p_payload jsonb) returns jsonb`, `security definer`, `set search_path = public`, anon·authenticated 실행 허용:
- payload: `id`, `commentId`, `memberId`, `emoji`, `action`, `deviceId`.
- 검사(실패 시 `{success:false, code, message}`, 예외 아님):
  - `memberId`가 `members`에 있고 `status <> 'DELETED'` → 아니면 `MEMBER_NOT_FOUND`.
  - `commentId`인 CREATE 행이 있고, 그 댓글을 가리키는 DELETE 행이 없음 → 아니면 `COMMENT_NOT_FOUND`.
  - 이모지·종류는 표의 check가 막는다(`check_violation`을 잡아 `INVALID_REACTION`으로 돌려준다).
- `schedule_id`는 댓글 CREATE 행의 값으로 넣는다.
- `insert ... on conflict (id) do nothing`. 같은 id 재전송은 성공으로 돌려준다(멱등).
- 성공: `{success:true}`.

| 입력 | 기대 |
|---|---|
| 정상 ADD | 1행 추가, `received_at` = 서버 시각 |
| 같은 `id`로 두 번 | 1행만, 둘 다 success |
| 삭제된 댓글에 ADD | `COMMENT_NOT_FOUND`, 행 없음 |
| emoji `'👎'` | `INVALID_REACTION`, 행 없음 |
| 없는 `memberId` | `MEMBER_NOT_FOUND` |
| payload `scheduleId`가 다른 일정 | 무시하고 댓글의 일정으로 저장 |
| update/delete 시도 | 트리거가 막음 |

### R2. 반응 집계와 화면

- 상수 `REACTION_EMOJIS = ['👍','❤️','👏','😂','🙏','🎵'] as const`(`src/utils/commentReactions.ts`). 화면의 순서도 이 순서다.
- `buildCommentReactions(events, isSamePerson)` → `Map<commentId, Map<emoji, { memberIds: string[]; lastAt: string }>>`:
  - 이벤트를 스냅샷 순서(`seq`)대로 접는다. (댓글, **같은 사람**, 이모지)마다 마지막 동작이 ADD면 켜짐.
  - 같은 사람 = `isSamePerson`(별칭 포함). 사람 id는 대표 id 기준으로 하나만 남긴다.
  - `lastAt` = 켜진 사람들의 마지막 ADD `received_at` 중 가장 늦은 값.
- 칩: 켜진 수 > 0인 이모지만, `REACTION_EMOJIS` 순서. 내가 켠 칩은 진하게(`aria-pressed="true"`).
- 칩을 누르면 내 반응을 켜거나 끈다. 끝의 ☺+ 버튼은 6개 고르기를 연다. 고른 게 이미 켜져 있으면 끈다.
- **낙관적 반영:** 누르면 로컬 이벤트를 먼저 넣어 화면을 바꾼다. 서버 실패면 그 이벤트를 빼서 되돌리고 "반응을 남기지 못했어요. 다시 시도해 주세요."를 짧게 보여 준다.
- 칩을 **0.5초 길게 누르면**(마우스는 우클릭) 반응한 사람 시트를 연다. 위에 칩 줄, 아래에 사람 목록. 이름·파트는 현재 명부(대표 회원) 기준. 내가 있으면 "나(이름)"로 맨 위.
- GAS 모드(`isBackendActive()`가 Supabase가 아님)에서는 칩은 보이되 ☺+와 누르기를 막는다.

| 입력(이벤트, 순서대로) | 기대 |
|---|---|
| m2 👏 ADD | 👏 1, m1 화면에서 안 진함 |
| m1 👏 ADD → m1 👏 REMOVE | 👏 칩 없음 |
| m1b 👏 ADD, m1 👏 ADD | 👏 1(한 사람), m1 화면에서 진함 |
| m1b 👏 ADD → m1 👏 REMOVE | 👏 없음(같은 사람의 마지막 동작) |
| m2 ❤️ ADD, m3 👍 ADD | 칩 순서 👍 ❤️ |
| 댓글 삭제 후 | 칩 안 보임(댓글이 목록에 없음) |
| 서버 실패 | 화면 되돌림 + 문구 |

### R3. 읽음 기록 (DB, 같은 마이그레이션)

```sql
create table if not exists member_seen_state (
  member_id text not null,             -- 쓸 때 대표 id
  kind text not null check (kind in ('baseline','news','comments','sticker')),
  scope text not null default '',      -- comments: schedule_id, sticker: sticker id, baseline: '' 또는 'stickers'
  seen_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (member_id, kind, scope)
);
-- RLS enable. 직접 select 정책은 두지 않는다(아래 RPC로만 읽고 쓴다).
```

이 표는 덮어쓰는 표다(화면 설정 성격이라 원천 보존 원칙 대상이 아니다).

`fn_mark_seen(p_payload jsonb)`, security definer, anon·authenticated 허용:
- payload: `memberId`, `items: [{kind, scope, upTo?}]`(최대 50개).
- `memberId` 검사는 R1과 같다.
- 항목마다 `v_at := least(fn_safe_timestamptz(upTo, now()), now())`. 미래 시각은 지금으로 자른다.
- `kind = 'baseline'`: `on conflict do nothing`(처음 값이 고정, 절대 안 움직임).
- 나머지: `on conflict do update set seen_at = greatest(member_seen_state.seen_at, excluded.seen_at), updated_at = now()`(뒤로 가지 않음).

`fn_get_seen_state(p_payload jsonb)`, security definer, anon·authenticated 허용:
- payload: `memberIds: text[]`(별칭 포함, 최대 20개).
- 돌려줌: `{success:true, rows:[{memberId, kind, scope, seenAt}]}`. `seenAt`은 UTC ISO(§2-2).

클라이언트는 별칭 id들의 행을 (kind, scope)마다 **가장 늦은 `seenAt`**으로 합친다(`mergeSeenRows`).

| 입력 | 기대 |
|---|---|
| news `upTo` 없음 | `seen_at` = 서버 now |
| news 11:00 저장 후 10:00 다시 저장 | 11:00 유지 |
| `upTo` = 내일 | 지금으로 잘림 |
| baseline 두 번 | 처음 값 유지 |
| `m1` news 10:00, `m1b` news 11:00 | 합친 값 11:00 |
| 항목 51개 | 실패(`TOO_MANY_ITEMS`) |

### R4. 새 댓글 표시 (V3-22를 계정 기록으로 교체)

- 댓글의 `receivedAt` = 그 댓글 CREATE 행의 `received_at`.
- **새 댓글** = `receivedAt > max(seen[comments][그 일정], seen[baseline][''])`이고 내 것이 아닌 댓글.
  - `receivedAt`이 없는 옛 로컬 캐시 댓글은 새 댓글로 보지 않는다.
  - seen 기록을 아직 못 받았으면(준비 안 됨) 새 댓글 0.
- 홈 카드 점과 상세 "새 댓글" 글자가 이 판정 하나(`isCommentUnread`)를 쓴다. 상세 글자는 V3-22처럼 **열 때의 값**으로 고정한다.
- 상세를 닫을 때 펼쳐져 있었으면 `fn_mark_seen({kind:'comments', scope: 일정 id, upTo: 보인 댓글 중 가장 늦은 receivedAt})`. V3-22의 닫을 때 기록 위치를 그대로 쓴다.
- 서버 저장 실패: 로컬 상태만 먼저 바꾸고, 다음에 앱을 열 때 같은 값을 다시 보낸다(`greatest`라 중복 무해).

| 입력 | 기대 |
|---|---|
| baseline 11/27 09:00, 댓글 08:00(m2) | 새 댓글 아님 |
| 댓글 10:00(m2), comments[A] 없음 | 새 댓글 |
| 위 상태에서 A 상세 펼쳐 닫음 | comments[A]=10:00 → 점 사라짐 |
| 닫는 사이 10:05 댓글 도착(안 보였음) | 10:05는 새 댓글로 남음 |
| 댓글 m1b가 씀 | 새 댓글 아님(내 것) |
| 다른 휴대폰에서 같은 단원 | 같은 결과 |

### R5. 처음 쓰는 계정과 기존 기기 상태

- seen 기록을 받았는데 `baseline('')` 행이 없으면, 준비(`lastSyncedAt > 0`) 뒤 한 번 `fn_mark_seen([{kind:'baseline',scope:''},{kind:'news',scope:''}])`. 이 시각 이전의 댓글·반응·소식은 모두 읽음.
- `baseline('stickers')` 행이 없으면, **스티커 데이터 준비 뒤**(`isStickerDataReady`) 한 번 `baseline('stickers')` + 지금 받은 모든 스티커의 `sticker` 행을 쓴다. 이미 받은 스티커로 축하가 쏟아지지 않게 하려는 것이다.
- 기기 저장 `SEEN_COMMENTS`·`SEEN_STICKERS`는 읽지도 쓰지도 않는다(지우지도 않는다. 키 상수는 유지).

| 입력 | 기대 |
|---|---|
| 첫 실행, 동기화 전 | 아무것도 쓰지 않음, 점·숫자 0 |
| 첫 실행, 동기화 후, 받은 스티커 7개 | baseline 2행 + sticker 7행, 축하 없음 |
| 그 뒤 8번째 스티커 획득 | 축하 1번 |
| seen 조회 실패 | 준비 안 됨으로 처리(점·숫자·축하 없음), 다음 동기화 때 재시도 |

### R6. 새 소식 (`buildNewsItems`, `src/utils/news.ts`)

입력: 내 대표 id·별칭, 일정(`getSchedulesForMember`), 댓글(`getComments`), 반응 집계, 투표, 스티커 판정 결과, seen 합친 값, now, 보는 기간(일).
출력: `{ unread: NewsItem[]; read: NewsItem[] }`, 각 시각 내림차순. `NewsItem = { key, kind, at, title, sub, target }`.

| 종류 | 대상 | 시각(`at`) | 문구(`title` / `sub`) | 누르면 |
|---|---|---|---|---|
| 반응 | 내 댓글(별칭 포함, 삭제 안 됨)에 **남이** 켠 반응. 댓글마다 묶음 | 켜진 남의 반응 중 가장 늦은 ADD `received_at` | 1명: "{이름} 님이 내 댓글에 {이모지} 반응했어요" / 여러 명: "{가장 늦은 사람} 님 외 {n-1}명이 내 댓글에 반응했어요" · "\"{댓글 앞 20자}…\" · {일정 제목} · {상대 시각}" | 그 일정 상세 |
| 새 댓글 | 내가 댓글을 단 일정에서, 내 첫 댓글보다 뒤에 남이 쓴 댓글. 일정마다 묶음 | 그중 가장 늦은 `receivedAt` | "{일정 제목}({날짜 라벨})에 새 댓글 {n}개" / "내가 댓글 단 일정 · {상대 시각}" | 그 일정 상세 |
| 미투표 | 필참 일정(V45), 투표 가능, 내 투표 없음, now ≥ 시작 − 72시간 | 시작 − 72시간 | "{일정 제목}({M월 D일 요일}) 투표를 아직 안 했어요" / "투표 마감 {M월 D일 HH:mm}"(시작 − 60분) | 투표 창(`rsvp` 경로) |
| 스티커 | 받은 스티커 | `earnedOn`의 KST 0시 | "칭찬 스티커 {이름}{을/를} 받았어요" / {상대 날짜} | 내 활동 탭 + 스티커판 |

- **안 읽음:** 반응·새 댓글·미투표는 `at > max(seen.news, seen.baseline)`. 스티커는 `sticker` 행이 없으면 안 읽음(날짜 무관, V44).
- **기간:** `at ≥ now − 보는 기간`(14일, "이전 소식 더 보기"마다 +14, 최대 90). 예외로, 안 읽은 스티커는 기간과 상관없이 넣는다. 미투표는 마감 지나면 빠진다.
- 묶음 개수 `n`은 기간 안의 것만 센다. 새 댓글 개수는 안 읽음이면 `at > seen.news`인 것만, 읽음이면 기간 안 전체.
- 종 숫자 = `unread.length`(묶음 하나 = 1). 0이면 숫자 없이 종만.
- 소식 목록을 **닫을 때** `news` 행을 서버 now로 저장. 목록을 연 동안에는 연 순간의 안/읽음을 유지한다.
- "모두 읽음": `news` + 안 읽은 스티커 `sticker` 행 전부를 한 번에 저장한다.
- 스티커 항목을 누르면 그 `sticker` 행을 저장한 뒤 이동한다.
- 목적어 조사: `withObjectParticle(name)`(받침 있으면 "을", 없으면 "를", 한글이 아니면 "을(를)").
- 상대 시각(KST): 1분 미만 "방금", 60분 미만 "n분 전", 24시간 미만 "n시간 전", 어제 날짜 "어제", 그 외 "M월 D일".
- GAS 모드에서는 종을 숨긴다.

| 입력 | 기대 |
|---|---|
| m2·m3·m4가 내 댓글에 반응(마지막 m4 11:50), seen.news 11:00 | 안 읽음 1개, "도윤 님 외 2명이 내 댓글에 반응했어요" |
| 내가 내 댓글에 👍 | 소식 없음 |
| m2가 반응 후 취소 | 소식 없음 |
| 내 댓글이 삭제됨 | 그 댓글의 반응 소식 없음 |
| A에 내 첫 댓글 09:00, m2 08:00·10:00·11:30, seen.news 11:00 | "추가연습(11월 28일 토)에 새 댓글 1개", 안 읽음 |
| A(11/28 14:00) 투표 없음, now 11/27 12:00 | 미투표 소식, at = 11/25 14:00, 마감 "11월 28일 13:00" |
| A 투표 없음, now 11/25 13:59 | 미투표 소식 없음(72시간 전) |
| A 투표 없음, now 11/28 13:00 | 없음(마감) |
| C(자율) 투표 없음 | 없음(V45 기본값) |
| 별칭 m1b로 A 투표함 | 없음 |
| 안 읽은 스티커 earnedOn 3주 전 | 안 읽음에 포함 |
| 읽은 스티커 earnedOn 20일 전, 기간 14일 | 없음 → 더 보기(28일) 후 지난 소식에 |
| 기간 90일에서 더 보기 | 버튼 없음 |
| `withObjectParticle('첫걸음')` / `('열 번째 노래')` / `('Day1')` | "첫걸음을" / "열 번째 노래를" / "Day1을(를)" |

### R7. 스티커 축하 (`StickerCelebration`, 시안 `StickerCelebrate`)

- `useEarnedStickers(profile)`: `ProfileTab.tsx:70-264`의 입력 조립과 `evaluatePraiseStickers` 호출을 그대로 옮긴 훅이다. `ProfileTab`과 축하 화면이 이 훅 하나를 쓴다.
- **안 본 스티커** = 받았고 `sticker` 행이 없는 것. 준비 조건: `isStickerDataReady` 참, seen 기록 받음, `baseline('stickers')` 행 있음.
- **보여 줄 때:** 회원 화면(`route.area === 'member'`)이고 겹침 화면이 없을 때. 안 본 스티커를 `earnedOn` 오름차순, 같으면 정의 순서로 하나씩.
  - 여러 개면 점 표시와 "다음 스티커".
- "좋아요!"·닫기: 지금 스티커의 `sticker` 행 저장 → 다음. "스티커판 보기": 남은 것까지 모두 저장 → 내 활동 탭으로 이동하고 스티커판을 연다.
- 화면 글자: "칭찬 스티커를 받았어요!", 스티커 이름, **축하 문장**(아래 표), 메달 칩("동메달"/"은메달"/"금메달", `tier` 없으면 칩 없음), 묶음 칩(`bundleTitle`), "{n}번째 칭찬 스티커예요"(받은 스티커를 `earnedOn` 순으로 셌을 때 순서).
- 축하 문장은 `StickerDefinition`에 `celebrationText` 필드로 추가한다. `conditionDescription`은 개발자용 조건이라 화면에 쓰지 않는다. 새 스티커를 추가할 때 이 필드가 빠지면 타입 오류가 나게 필수로 둔다. 이 문장은 리뷰어가 정의의 조건(`praiseStickerDefinitions.ts`)을 보고 쓴 새 문구다.

| id | 축하 문장 |
|---|---|
| `first-step` | 첫 연습에 함께했어요 |
| `att-10` | 누적 출석 10번을 채웠어요 |
| `att-50` | 누적 출석 50번을 채웠어요 |
| `att-100` | 누적 출석 100번을 채웠어요 |
| `full-month` | 한 달 필참 연습을 빠짐없이 함께했어요 |
| `anniv-1y` | 문콰이어와 함께한 지 1년이 됐어요 |
| `ontime-5` | 5번 연속 시간 맞춰 왔어요 |
| `ontime-10` | 10번 연속 시간 맞춰 왔어요 |
| `early-5` | 10분 일찍 온 날이 5번이 됐어요 |
| `early-20` | 10분 일찍 온 날이 20번이 됐어요 |
| `back-on-time` | 다시 3번 연속 시간 맞춰 왔어요 |
| `first-vote` | 첫 참석 투표를 했어요 |
| `quick-10` | 하루 전에 미리 투표한 게 10번이 됐어요 |
| `kept-10` | 투표한 대로 10번 연속 지켰어요 |
| `all-voted-month` | 한 달 필참 일정에 모두 미리 투표했어요 |
| `first-play` | 연습곡을 처음 들었어요 |
| `listen-1h` | 연습곡을 1시간 들었어요 |
| `listen-5h` | 연습곡을 5시간 들었어요 |
| `listen-20h` | 연습곡을 20시간 들었어요 |
| `explorer-10` | 연습곡 10곡을 들어 봤어요 |
| `first-stage` | 첫 무대에 함께했어요 |
| `stage-3` | 무대에 3번 섰어요 |
| `stage-10` | 무대에 10번 섰어요 |
| `stage-ready` | 공연 전 4주 연습을 빠짐없이 함께했어요 |

- **움직임(CSS만, 시안 값):** 배경 0.25초, 빛 퍼짐, 스티커 떨어짐 0.75초(튕김·눌림), 고리 퍼짐 + 색종이 40조각(0.3초부터), 반짝 빛 1번, 글자 차례로, 이후 둥실·반짝. 색종이 색은 `checkin.css`처럼 화면 전용 CSS 변수로 둔다(라이트·다크 짝).
- **진동(V47):** 스티커가 닿는 순간(열고 약 0.45초) 한 번 `navigator.vibrate([20, 40, 70])`. `prefers-reduced-motion`이거나 지원 안 하면(아이폰 웹 앱) 안 한다. try/catch.
- `prefers-reduced-motion: reduce`면 움직임·색종이·진동 없이 완성 화면.
- 스티커를 누르면 한 번 더 튕긴다.
- 접근성: `role="dialog"`, `aria-modal`, `aria-label="칭찬 스티커를 받았어요"`, 열 때 "좋아요!"로 포커스.

| 입력 | 기대 |
|---|---|
| 안 본 스티커 1개, 홈, 겹침 없음 | 축하 1장, "좋아요!" → 행 저장, 닫힘 |
| 2개(earnedOn 11/20, 11/25) | 11/20 먼저, "다음 스티커" |
| QR 화면이 열려 있음 | 닫힌 뒤에 보여 줌 |
| 동작 줄이기 켬 | 움직임·진동 없음 |
| 스티커판 보기 | 남은 것 모두 저장 + 내 활동 스티커판 |
| 스태프(선생님) | `staffEligible`인 스티커만(기존 판정) |

### R8. 홈 머리 종 (시안 `NewsHome`)

- 로고 오른쪽 끝, 설정 버튼(운영진만)의 왼쪽. 44px. `aria-label="새 소식 {n}개"`(0이면 "새 소식").
- 숫자 배지는 1~9, 10 이상은 "9+".
- 누르면 아래에서 올라오는 시트(시안 `NewsList`): 제목 "새 소식", "모두 읽음", 구역 "새로 온 소식"/"지난 소식", 맨 아래 "이전 소식 더 보기"(90일이면 숨김) 또는 "최근 {N}일 소식만 보여요".
- 빈 상태(시안 `NewsEmpty`): "새 소식이 없어요" / "댓글에 반응이 달리거나 투표할 일정이 생기면 알려 드릴게요".
- 아이콘: 반응은 그 이모지 글자(내용이므로 허용), 새 댓글·미투표는 `Icons.tsx`(말풍선 `IconChat`, 투표는 기존 `IconVote`), 스티커는 스티커 그림.

---

## 5. 끝에서 끝까지 손계산 (테스트에 그대로)

**입력**
- 계정 `m1`: seen 행 `baseline('')=11/26 09:00`, `news=11/27 11:00`, `comments[A]=11/27 09:30`, `baseline('stickers')`, `sticker:first-step`.
- 댓글(A):
  - c1 m1 09:00
  - c2 m2 09:20
  - c3 m3 10:10
  - c4 m4 11:40
- 반응 이벤트:
  - r1 m2 👏 ADD c1 10:00
  - r2 m3 👏 ADD c1 11:10
  - r3 m3 👏 REMOVE c1 11:20
  - r4 m4 ❤️ ADD c1 11:50
  - r5 m1b 👍 ADD c2 11:55
- 투표: A 없음, B 없음.
- 스티커 판정: `first-step`(11/20), `att-10`(11/27) 받음.
- now: 11/27 12:00.

**계산**
1. c1 칩: 👏 1(m2), ❤️ 1(m4). m3는 취소했다. c2 칩: 👍 1(내 것, 진함).
2. 새 댓글(A): 기준 = max(09:30, 09:00) = 09:30. c3(10:10)와 c4(11:40)가 새 댓글이다. c2(09:20)는 기준 이전이고, c1은 내 것이다. 홈 A 카드에 점이 뜬다.
3. 새 소식(기준 = max(news 11:00, baseline 09:00) = 11:00):
   - 반응(c1): 켜진 남은 m2(10:00)와 m4(11:50). at = 11:50 > 11:00이라 안 읽음. "도윤 님 외 1명이 내 댓글에 반응했어요"(m3는 취소해서 빠짐).
   - 새 댓글(A): 내 첫 댓글 09:00 뒤의 남의 댓글은 c2·c3·c4. 안 읽음 개수는 at > 11:00인 c4 하나 → "추가연습(11월 28일 토)에 새 댓글 1개".
   - 미투표 A: at = 11/25 14:00 < 11:00(11/27)이라 **읽음**(지난 소식). B: 시작 12/01 19:30 − 72시간 = 11/28 19:30 > now라 아직 없음.
   - 스티커: `att-10`은 행이 없어서 안 읽음. `first-step`은 행이 있고 11/20이 기간 안이라 지난 소식.
   - 종 숫자 = 3(반응, 새 댓글, att-10).
4. 축하: `att-10` 1장. "좋아요!"를 누르면 `sticker:att-10`을 저장하고, 종 숫자는 2가 된다.

---

## 6. 티켓 V3-24

**브랜치:** `main`에서 `feat/reactions-news`. 커밋은 W1~W5로 나누고 PR은 하나, Base는 `main`(규칙 17).

### W1. DB (마이그레이션 + 검증)
- `supabase/migrations/20261127000000_v3_reactions_seen.sql`:
  - R1 표와 `fn_add_reaction`
  - R3 표와 `fn_mark_seen`, `fn_get_seen_state`
  - `fn_get_initial_snapshot`: **`20261119000001_rpc_functions.sql:18`의 정의 전체를 복사**해 댓글 객체에 `'receivedAt', to_char(cmt.received_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`를 넣고, `reactions`(seq 순, 같은 시각 형식)를 추가한다. 다른 줄은 바꾸지 않는다. 복사 원본과 diff를 보고한다(규칙 4).
  - 새 함수의 `grant execute ... to anon, authenticated`와 `set search_path = public`
- `supabase/tests/v3_reactions_seen_check.sql`(트랜잭션 + ROLLBACK): R1·R3 표의 모든 줄과 스냅샷의 `receivedAt`·`reactions` 존재를 검사한다.
- SQL에서 text 시각을 `::timestamptz`로 바로 바꾸지 않는다(규칙 12). `fn_safe_timestamptz`를 쓴다.

### W2. 데이터 층 (순수 함수 + 어댑터)
- 타입: `CommentReactionEvent`, `ReactionEmoji`, `SeenStateRow`, `ScheduleCommentEvent.receivedAt?`, `ScheduleComment.receivedAt?`.
- `sheetsParser.ts`: `parseRemoteReactionEvents`, 댓글 `receivedAt`.
- `src/utils/commentReactions.ts`: `REACTION_EMOJIS`, `buildCommentReactions`.
- `src/utils/seenState.ts`: `mergeSeenRows`, `isCommentUnread`, `pickUnseenStickers`.
- `src/utils/news.ts`: `buildNewsItems`, `withObjectParticle`, `formatRelativeKST`.
- `timeWindow.ts`: `parseScheduleKST`를 export.
- `sheets.ts`(얇게, 규칙 9): 반응 이벤트 보관·로컬 저장, `getCommentReactions(commentId)`, `toggleReaction`, `getSeenState(aliasIds)`, `markSeen(items)`, 구독. 로직은 위 utils에 둔다.
- `supabaseBackend.ts`: action 3개.
- **테스트:**
  - R1(클라이언트 쪽 payload)·R2·R3(합치기)·R4·R5·R6 표 전부와 §5 손계산 1~4.
  - `rpcContract.test.ts`: 새 RPC 3개 payload 키, `REACTION_EMOJIS`와 SQL check 목록이 같은지 검사.
  - 스냅샷 파서: `receivedAt` 없는 옛 행.

### W3. 반응 화면
- `ScheduleComments.tsx`에 칩 줄·☺+·고르기·길게 누르기 → `src/components/home/CommentReactions.tsx`, `ReactorsSheet.tsx`(새 파일, 각 400줄 이하).
- **테스트:** 가짜 DOM(`ScheduleDetailSheet.test.tsx` 방식)으로 칩 누름 → 낙관적 반영, 실패 → 되돌림.

### W4. 계정 읽음 기록으로 교체 + 새 소식
- `useSeenComments.ts`를 계정 기록 기반으로 고친다(R4·R5). `ScheduleComments.tsx`의 닫을 때 기록을 `markSeen`으로 바꾼다.
- `useSeenStickers` 사용처(`ProfileTab.tsx:264,397`)를 계정 기록으로 바꾼다.
- `AppHeader.tsx`에 종, `src/components/news/NewsSheet.tsx`(새).
- **테스트:** R4·R5·R6 화면 연결(가짜 DOM): 열 때 고정, 닫을 때 `markSeen` 호출 인자.

### W5. 스티커 축하
- `src/components/profile/useEarnedStickers.ts`(`ProfileTab`에서 추출, `ProfileTab` 결과가 바뀌지 않는지 기존 테스트로 확인)
- `src/components/celebration/StickerCelebration.tsx` + `src/styles/v3/celebration.css`
- `App.tsx`에서 조건에 맞을 때 보여 주기(R7)
- **테스트:** 순서·저장·겹침 화면 조건(순수 함수 `nextCelebration(queue, action)`), 동작 줄이기 때 진동 안 함

### 확인 방법
- `scripts/dev/capture-screens.mjs`(V3-22 `--home` 방식)에 장면 추가. 장마다 `scrollWidth`를 적는다.
  - 390×844: 댓글 반응, 고르기 열림, 반응한 사람, 홈 종(숫자 3), 소식 목록, 빈 상태, 축하(0.4초·완료 2장), 축하 2개 중 1
  - 다크: 소식 목록, 축하
- 로컬 PostgreSQL이 없으면 `db-check.sh`는 "미실행"으로 적고 CI 결과를 붙인다.

### 멈출 조건
- §3 표와 코드가 다르면 시작하지 않는다.
- §4에 없는 문구가 필요하면 멈춘다.
- 운영 DB 실행, npm 설치, PR 머지, 배포를 하지 않는다. 푸시 알림은 범위 밖(다음 티켓).
- 스티커 판정 결과가 추출 전후로 달라지면 멈춘다.

### 보고
`docs/plans/17_v3_implementation_guide.md` §5 형식. 마이그레이션 복사 원본·diff, 새 문구 목록을 붙인다. `/report-ready` 후 CI 초록이면 보고하고 멈춘다.

---

## 7. 배포 순서 (리뷰어)
1. PR 병합 전에 리뷰어가 마이그레이션을 검토한다.
2. 병합 후 리뷰어가 운영에 마이그레이션 적용 → 검증(새 표·함수·권한, 스냅샷에 `receivedAt`·`reactions`, 기존 앱이 그대로 열리는지).
   - 추가만 하는 변경이라 옛 앱은 새 필드를 무시한다.
3. 그 뒤 앱 배포. 순서를 바꾸면 새 앱이 없는 RPC를 불러 반응·종이 실패한다.

## 8. 사용자 확인 대기
- **V45:** 미투표 소식은 **필참 일정만**으로 적었다(자율 참여 일정에 잔소리를 피하려고). 자율 일정도 넣을지 확인 필요.
