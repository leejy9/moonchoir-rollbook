# 20. 홈 B안 개편 개발 지시서 (V3-22)

> 작성: 리뷰어(Claude), 2026-11-24. 기준 코드: `origin/main` @ `73f073a`. spec-auditor 검토 2회(1차 차단 1·수정 13·사소 5, 2차 차단 2·수정 11·사소 다수)를 반영한 판이다.
> 명세: `docs/MEMBER_UX_V3_SPEC.md` §0-1 V35~V40, §2(B안), §9 `SEEN_COMMENTS`.
> 시안(사용자 확정): https://claude.ai/artifact/78R1NaARRVq6a9zKrpZM9r 의 `HomeB`, `HomeB2`, `HomeB3`. 시안에만 있는 설명 글자는 넣지 않는다. 시안 색 hex는 쓰지 않는다(§3 R8).
> 시작 전: `.agents/rules/recurring-mistakes.md`를 읽고 `/spec-check`로 이 문서를 코드에 대 본다. 어긋나면 시작하지 말고 보고한다.

---

## 1. 바뀌는 것 한 줄

홈을 "월간 달력 → 일정 카드(옆으로 넘김) → 다가오는 일정" 순서로 바꾼다. 카드와 목록에 댓글을 보여 일정 상세(댓글)로 들어가는 길을 만든다.

### 데이터 경로

| 화면 요소 | 원천 → 저장 → 조회 → 계산 → 화면 |
|---|---|
| 일정 카드 묶음 | `schedules` → `sheetsService.getSchedulesForMember` → `selectTodayFocus` + 그 뒤 일정 → `buildHomeCards`(새 순수 함수) → 카드 |
| 카드 버튼 | 투표·출결 → `findMyVote`(새, 출결 엔진과 같은 규칙) + `reconcileMemberAttendance` → `deriveTodayCta`(그대로) → 버튼 1개 |
| 다가오는 일정 | 같은 일정 목록 → `buildHomeCards`의 `upcoming` → `HomeUpcomingSection` |
| 댓글 수·최근 댓글 | `schedule_comment_events` → `getCommentCounts` / `getComments` → 카드 댓글 줄, 목록 댓글 수 |
| 새 댓글 표시 | 기기 저장값 `moonchoir_pref_seen_comments_v1`(본 댓글 id) + `getComments` + `isOwnComment` → `useSeenComments`(새) → 점·"새 댓글" |
| 설정 버튼 | `members.role`(운영: ADMIN 9·MEMBER 15, 리뷰어 확인) + `isAdminLoggedIn()` → `AppHeader`의 `showAdminEntry` |

### 리뷰어가 확인한 데이터 형식

- `schedule_comment_events.timestamp`: text, 19자, 시간대 없음(63행 모두).
- `rsvp_votes.timestamp`: text. **19자 KST 92행, 24자(ISO, `Z`) 2행이 섞여 있다.** 그래서 이 티켓에서는 시각 문자열을 비교·정렬하지 않는다.

---

## 2. 기존 코드 계약 표 (리뷰어와 spec-auditor가 `origin/main`에서 직접 연 것)

| 이름 | 정의 위치 | 호출부 | 받는 것 → 돌려주는 것 | 빠뜨리면 | 이 티켓에서 |
|---|---|---|---|---|---|
| `sheetsService.getSchedulesForMember` | `src/services/sheets.ts:308` | `HomeTab.tsx:88` | memberId → 나에게 보이는 일정 | 숨김(TARGETS_ONLY) 일정 노출 | 카드·목록 입력은 이것만 |
| `selectTodayFocus` | `src/utils/todayFocus.ts:72` | `HomeTab.tsx:141` | 일정·회원·now·todayStr → `{mode, schedules, focus, dDay}`. `schedules`는 **같은 날짜** 묶음이고, 점수(출석 창 열림 300 > 예정 200 > 마감 100, 필참 +50)순 다음 시작 시각순(`:86-95`) | — | 카드 첫 묶음. 우선순위 규칙을 새로 쓰지 않는다 |
| `computeDDayDifference` | `src/utils/todayFocus.ts:58` | `todayFocus.ts` | 날짜, todayStr → 일수 | — | 카드마다 "n일 뒤" |
| `getCheckInWindowState` | `src/utils/timeWindow.ts:44` | `todayFocus.ts`, `HomeTab.tsx:302` | 일정, now → 창 상태. **종료 시각까지 열림(포함, `now > 종료`일 때 닫힘 `:111`), 유예 없음. 종료 시각이 비거나 잘못되면 `WINDOW_CLOSED`**(`:66-77`) | — | `upcoming`에서 오늘 마감 일정 빼기 |
| `deriveTodayCta` | `src/utils/todayCta.ts:38` | `HomeTab.tsx:275` | 일정·now·필참·내 투표·내 출결·온라인 → 버튼 상태(라벨 `:87`,`:124`,`:135`,`:144` 등) | 출석/투표 규칙이 갈라짐 | **카드마다** 호출 |
| `isMemberRequiredForSchedule` | `src/utils/attendanceStats.ts` | `HomeTab.tsx:268` | 회원·날짜·일정·별칭·회원목록 → 필참 여부 | — | 카드마다(지금은 첫 카드만 계산) |
| `sheetsService.reconcileMemberAttendance` | `src/services/sheets.ts:1834` | `HomeTab.tsx:127,289` | 내 출결(내부에서 `buildMemberScheduleRecords` 사용, 규칙 11 충족) | — | 카드마다 그대로 |
| `sheetsService.reconcileAttendance` / `countCheckedIn` | `sheets.ts` / `src/utils/rsvpTally.ts` | `HomeTab.tsx:304-307` | 출석 인원 | — | 오늘 카드만, 그대로 |
| `sheetsService.getRSVPVotes` | `src/services/sheets.ts:464` | `HomeTab.tsx:286`, `App.tsx:526` 등 | scheduleId → 투표. **별칭 id 투표도 원래 id로 남는다**(병합 회원도 `this.members`에 있음). 키가 `scheduleId_memberId`라 대표와 별칭이 둘 다 투표했으면 둘 다 온다. 회원 목록에 없는 id의 투표는 버린다(`:469-476`) | — | 홈 표시용 내 투표는 `findMyVote`로만 |
| 출결 엔진의 내 투표 | `src/utils/memberRecords.ts:98` | `buildMemberScheduleRecords` → `reconcileMemberAttendance`, 내 활동 | `rsvpVotes.find(v => aliasIds.has(v.memberId) && v.scheduleId === s.id)`(배열 순서, 이름 대조 없음) | — | 이 줄을 `findMyVote` 호출로 바꾼다(동작 동일, 규칙 하나로) |
| `RSVPModal` `currentVote` | `src/components/RSVPModal.tsx:36,54-56`, 넘김 `App.tsx:526` | — | 표시뿐 아니라 저장·취소에 쓴다(새 투표 id, `cancelRSVP(schedule.id, profile.memberId)`) | 별칭 투표를 넘기면 취소가 안 되고 서버 저장이 기본키 중복으로 실패(로컬은 성공처럼 보임) | **이 티켓에서 바꾸지 않는다.** `App.tsx:526`은 그대로 둔다 |
| `resolveMemberIdentity` | `src/utils/memberIdentity.ts:8` | `HomeTab.tsx:97` | memberId, members → canonicalId(별칭에서 시작해도 대표로 올라감, `:15-52`). **`members`에 병합(MERGED) 행이 있어야 한다** | `getMembers()`(기본값)는 병합 행을 뺀다(`sheets.ts:268-273`) → 별칭 기기가 자기 자신으로 풀림 | 반드시 `sheetsService.getMembers(true)`와 함께(`HomeTab.tsx:93,97`과 같게) |
| `resolveMergedMemberIds` | `src/utils/attendanceStats.ts:208` | `HomeTab.tsx:111` | → 별칭 포함 id 집합 | — | `findMyVote` |
| `HomeActiveScheduleCard` | `src/components/home/HomeActiveScheduleCard.tsx:26` | `HomeTab.tsx:258` | 일정·CTA·dDay·필참 등 → 카드 | — | **고친다:** 전환 줄(`51-132`)·"상세 보기"(`300-321`)·날짜 배지(`151-157`)를 빼고 R2·R4를 넣는다. 분류·필참 배지·장소 링크·설명·출석 인원은 남긴다 |
| `MonthCalendarGrid` | `src/components/MonthCalendarGrid.tsx:27` | `HomeTab.tsx:383`(유일) | `selectedDateStr`, `onSelectDate`, `onJumpToToday`, `headerExtra`, `myLogsByScheduleId`(체크 표시, `:155`) … | — | **고친다:** R3·R8(상자 없애기 `:43-49`, 칸 48px, `highlightDateStr` 추가). 화살표는 이미 SVG(`:109-111,130-132`)라 그대로. "오늘" 버튼 조건(`:65`)은 `selectedDateStr`만 본다 |
| `WeekCalendarGrid` | `src/components/home/WeekCalendarGrid.tsx:16` | `HomeTab.tsx:373`(유일) | — | — | 파일 삭제 |
| `PREFERENCE_KEYS.HOME_CALENDAR_VIEW` | `src/services/sheetsStorage.ts:14` | `HomeTab.tsx:53,163`, 테스트 | — | — | 홈에서 읽기·쓰기 삭제. **상수는 유지**(`sheetsStorage.test.ts:73-81,115-123`) |
| `HomeUpcomingSection` | `src/components/home/HomeUpcomingSection.tsx:13` | `HomeTab.tsx:400`(유일) | `schedules`, `currentNow`, `onNavigate`, `onOpenRSVP` | — | **고친다:** R5. 새 props `myVoteBySchedule: Map<string, RSVPVote>`, `commentCounts: Map<string, number>` |
| `isRsvpOpenForSchedule` | `src/utils/timeWindow.ts:135` | `HomeUpcomingSection.tsx` | 일정, now → 투표 가능(시작 60분 전 마감) | — | R5 상태 글자 |
| `sheetsService.getComments` | `src/services/sheets.ts:347` | `ScheduleComments.tsx:51`, `admin/AdminScheduleComments.tsx:28` | scheduleId → 댓글(이벤트 순서, 삭제 제외, 수정 반영) | 이벤트를 직접 읽으면 삭제·수정 누락 | 최근 댓글 = 마지막 원소 |
| `sheetsService.getCommentCounts` | `src/services/sheets.ts:355` | `admin/AdminSchedulesTab.tsx:178` | → `Map<scheduleId, 개수>` | — | 카드·목록 댓글 수 |
| `sheetsService.isOwnComment` | `src/services/sheets.ts:372` | `ScheduleComments.tsx` | 댓글, memberId → 별칭 포함 본인 여부 | 내 댓글이 새 댓글로 뜸 | R7 |
| `sheetsService.getSyncState` / `subscribeSync` | `src/services/sheets.ts:1982` / `:1986` | `ProfileTab.tsx:63` | → `{lastSyncedAt: number, …}`. **초기값 0**(`:164`), 원격 동기화 성공 때만 설정(`:1963`). 백엔드 없는 모드에서는 계속 0 | — | R7 준비 = `lastSyncedAt > 0` |
| `useSeenStickers` | `src/components/profile/useSeenStickers.ts:34` | `ProfileTab.tsx:264` | 본 것 목록 + `isReady` | **읽기 실패와 저장값 없음을 구분하지 못해 실패 때 덮어쓴다**(`:35-55`) | 구조만 참고. 이 결함은 따라 하지 않는다(R7). 스티커 훅은 고치지 않는다 |
| `readPreference` / `writePreference` | `src/services/sheetsStorage.ts:90` / `:113` | 여러 곳 | 키 없음·해석 실패·검사 실패가 모두 `fallback`(`:90-106`) | — | R7은 새 함수 `readPreferenceState`를 쓴다 |
| `ScheduleComments` | `src/components/home/ScheduleComments.tsx:34` | `ScheduleDetailBody.tsx:147`(단원 일정 상세에서만, `App.tsx:479`) | 기본 펼침(`defaultExpanded = true`), 보이는 목록은 `visible` 배열(처음 최근 50개 `COMMENT_PAGE_SIZE`, "더 보기" 뒤 전체, `:52`) | — | R7 봄 처리, "새 댓글" 글자 |
| `<StrictMode>` | `src/main.tsx:39` | — | 개발 모드에서 effect 정리가 마운트 직후 한 번 더 돈다 | 개발 서버에서만 "열자마자 봄"으로 기록됨 | R7 확인은 빌드본(`dist`)으로 한다 |
| `AppHeader` | `src/components/AppHeader.tsx:11` | `App.tsx:328`(유일) | `onOpenAdmin`, `onOpenSuperAdmin`. 로고 숨은 동작 `:26-30` | — | R6. `showAdminEntry` prop 추가 |
| `isAdminLoggedIn` | `src/services/auth.ts:124` | `App.tsx:185,286` | → 관리자 세션 여부 | — | R6 |
| `src/components/Icons.tsx` | — | — | 말풍선·꺾쇠 아이콘 없음 | — | `IconChat`, `IconChevronRight` 추가 |
| `scripts/dev/capture-screens.mjs` | — | — | `dist`를 4173으로 띄워 프로필·연습실 두 화면만 찍음(`:91-109`). 저장값 주입·다크·스크롤·측정 없음, Chrome 대체 경로(`:115-125`)는 이런 기능 불가 | 홈은 기기 연결 창에 가려짐 | §5 확인 방법대로 Playwright 경로를 늘린다 |

표에 없는 이름을 새로 쓰려면 먼저 보고한다. `StudioTab`의 `onOpenAdmin` prop은 선언만 있고 쓰이지 않는다(`StudioTab.tsx:19`). 이 티켓에서는 건드리지 않는다.

---

## 3. 규칙과 경계 예시

공통 예시 데이터(KST, 오늘 = 2026-11-21 토). 모두 `getSchedulesForMember` 결과이고, 취소·보관이 아니며, 내가 필참 대상이다.

| id | 날짜 | 시간 | 이름 |
|---|---|---|---|
| A | 11/21 | 14:00~17:00 | 추가연습 |
| B | 11/24 | 19:30~21:40 | 정기연습 |
| C | 11/28 | 14:00~17:00 | 추가연습 |
| D | 12/01 | 19:30~21:40 | 정기연습 |
| E | 12/05 | 13:00~18:00 | 리허설 |
| F | 12/08 | 19:30~21:40 | 정기연습 |

### R1. 카드와 다가오는 일정 (`buildHomeCards`, 새 순수 함수 `src/utils/homeCards.ts`)

- 함수 모양: `buildHomeCards({ focusResult, schedules, now, todayStr, maxCards = 3, maxUpcoming = 5 })` → `{ cards, upcoming }`. `focusResult`는 `selectTodayFocus`의 결과 전체다.
- `cards`:
  - 먼저 `selectTodayFocus(...).schedules`를 순서 그대로 넣는다.
  - 이어서 그 묶음 날짜보다 **뒤 날짜**의 유효 일정(취소·보관 제외)을 날짜, 시작 시각 순으로 붙인다.
  - **최대 3장.** `mode === 'NONE'`이면 빈 목록이다.
- `upcoming`:
  - 유효 일정 중 **`cards`에 없고**, 날짜가 오늘 이후(오늘 포함)인 일정이다. 단 오늘 일정은 `getCheckInWindowState`가 `WINDOW_CLOSED`면 뺀다.
  - 날짜, 시작 시각 순으로 최대 5개.
- 카드에 나온 일정은 `upcoming`에 다시 나오지 않는다(V36).
- 정렬은 기존 `upcoming5`(`HomeTab.tsx:226-231`)처럼 `date`, `startTime` 문자열로 한다.

| now | 바꾼 데이터 | 기대 cards | 기대 upcoming |
|---|---|---|---|
| 11/21 10:00 | — | `[A, B, C]` | `[D, E, F]` |
| 11/21 16:59 | — | `[A, B, C]` | `[D, E, F]` |
| 11/21 17:00 | — | `[A, B, C]`(종료 시각 포함 열림) | `[D, E, F]` |
| 11/21 17:01 | — | `[B, C, D]`(A 마감) | `[E, F]` |
| 11/21 10:00 | `A2` 11/21 19:00~21:00 추가 | `[A, A2, B]` | `[C, D, E, F]` |
| 11/21 10:00 | 11/21에 A·A2·A3(20:00~21:00)·A4(21:00~22:00) | `[A, A2, A3]` | `[A4, B, C, D, E]` |
| 11/21 10:00 | A2를 종료 시각 없이 추가 | `[A, B, C]`(A2는 창 마감으로 취급) | `[D, E, F]` |
| 11/21 10:00 | C 취소 | `[A, B, D]` | `[E, F]` |
| 11/21 10:00 | D 보관 | `[A, B, C]` | `[E, F]` |
| 11/21 23:00 | B만 있음 | `[B]` | `[]` |
| 11/21 10:00 | 일정 없음 | `[]` → 카드 줄 없음 | `[]` → 기존 문구 "예정된 일정이 없습니다." |
| 11/21 17:01 | A만 있음 | `[]` | `[]` |

### R2. 카드 내용

- 버튼은 카드마다 `deriveTodayCta`로 1개 만든다. 투표는 기존 `onOpenRSVP` 흐름을 연다. 카드 안에서 바로 참석/불참을 저장하지 않는다(시안의 "참석 투표하기" 버튼 1개가 이것이다).
- 카드마다 `isRequired`, `dDay`(`computeDDayDifference(카드 날짜, todayStr)`), 내 투표(`findMyVote`), 내 출결을 따로 계산한다.
- 날짜·시간 줄: 기존 시간 줄(`165-173`)을 `"{M}월 {D}일 {요일} · {시작} ~ {종료}"`로 바꾼다(시안의 날짜 줄). 예: "11월 24일 화 · 19:30 ~ 21:40". 장소 줄은 그대로.
- 오른쪽 위 글자: 기존 날짜 배지(`151-157`)를 **대신**한다.
  - 오늘 카드: CTA가 `RSVP_NEW`면 "투표 전"(`--status-warning` 계열 글자), 그 밖에는 표시하지 않는다.
  - 미래 카드: "n일 뒤".

| 입력 | 기대 버튼 | 기대 오른쪽 위 |
|---|---|---|
| A, 투표 없음, now 10:00 | "참석 투표하기" | "투표 전" |
| A, now 13:30(출석 창 열림), 필참 | "QR 찍기 / PIN 출석" | 없음 |
| A, now 14:10, 13:58 출석 기록 | 상태 글자 "출석 완료 13:58" | 없음 |
| B, 참석 투표, 오늘 11/21 | "투표 수정 · 현재 참석" | "3일 뒤" |
| C, 투표 없음 | "참석 투표하기" | "7일 뒤" |

### R2-1. 내 투표 하나로 찾기 (`findMyVote`, 새 순수 함수 `src/utils/myVote.ts`)

`findMyVote(votes, aliasIds)` = `votes.find(v => aliasIds.has(v.memberId))`. 출결 엔진(`memberRecords.ts:98`)과 **같은 규칙**이다. 그 줄도 이 함수를 부르게 바꿔서 규칙을 하나로 만든다(동작은 같다).
- `aliasIds`는 `resolveMergedMemberIds(대표 id, getMembers(true))`다.
- 이름 대조는 하지 않는다. `getRSVPVotes`가 모르는 id를 이미 버리므로, 이름이 같은 투표는 다른 사람의 것일 수밖에 없다. `HomeTab.tsx:287`의 이름 대조도 지운다.
- 시각은 비교하지 않는다(§1 형식 섞임).
- 홈 카드 CTA와 다가오는 일정 목록이 이 함수를 쓴다. **투표 창(`App.tsx:526` → `RSVPModal`)은 바꾸지 않는다.** 저장·취소가 자기 id 기준이라, 별칭 투표를 넘기면 서버 저장이 깨진다(§2 표).

| 입력(투표 배열 순서) | 기대 |
|---|---|
| `[m1 참석]` | `m1` 참석 |
| `[m1b 참석]` | `m1b` 참석 |
| `[m1b 참석, m1 불참]` | `m1b` 참석(배열 순서, 출결 엔진과 같은 결과) |
| `[x9 참석]`, 이름만 같음 | `undefined` |
| `[]` | `undefined` |

**알려진 한계(이번 범위 밖):** 별칭 id로만 투표한 사람은 카드에 "투표 수정 · 현재 참석"이 보이지만, 투표 창을 열면 현재 투표가 비어 있다. 투표 창 수정은 별도 티켓이다.

### R3. 넘기기와 달력 연동

- 카드 줄은 가로 스크롤 + `scroll-snap`(브라우저 기본)으로 만든다. 다음 카드 끝이 보이게 한다(시안 `HomeB`). 라이브러리를 설치하지 않는다.
- `activeIndex`는 순수 함수 `activeCardIndex(scrollLeft, cardWidth, gap, count, maxScroll)`로 구한다. 반올림한 위치를 `0~count-1`로 제한하고, `scrollLeft >= maxScroll - 1`이면 마지막 카드로 본다. 카드 수가 줄면(17:00이 지나 A가 빠짐 등) 이 제한으로 범위 안에 남는다.
- 점 표시는 `aria-hidden`이고, 카드가 1장이면 없다.
- 보이는 카드가 아닌(일부만 보이는) 카드: 첫 탭은 그 카드로 스크롤만 한다. 그 카드 안의 버튼·링크·댓글 줄은 보이는 카드가 될 때까지 누를 수 없다(`inert` 또는 `tabIndex=-1`과 `pointer-events: none`).
- 달력 표시는 순수 함수 `calendarHighlightDate(activeCardDate, year, monthIndex)`로 정한다. 카드 날짜가 지금 보는 달이면 그 날짜, 아니면 `undefined`다. `MonthCalendarGrid`의 **새 prop `highlightDateStr`**로 넘기고, 모양은 선택과 같게 한다.
  - `selectedDateStr`(주소의 `d`)가 있으면 그것이 우선이다.
  - "오늘" 버튼 조건(`selectedDateStr`만 봄)은 바꾸지 않는다. 그래서 카드를 넘겨도 "오늘" 버튼은 생기지 않는다.
- 카드를 넘겨도 달은 바뀌지 않는다. 날짜를 누르면 지금처럼 `handleSelectDate`로 일정 상세가 열리고, 카드는 그대로다(V37).

| 입력 | 기대 |
|---|---|
| `activeCardIndex(0, 318, 10, 3, 700)` | 0 |
| `activeCardIndex(328, 318, 10, 3, 700)` | 1 |
| `activeCardIndex(990, 318, 10, 2, 300)` | 1 |
| `activeCardIndex(600, 318, 10, 3, 600)` | 2(끝까지 스크롤) |
| 11월 보기, 카드 B | 강조 24일, "오늘" 버튼 없음 |
| 11월 보기, 카드 D(12/01) | 강조 없음(회색 12/1 칸 포함), 달은 11월 |
| 주소 `d=2026-11-14`, 카드 B | 14일 선택, 24일 강조는 표시 안 함 |

### R4. 카드 댓글 줄 (V38)

- 카드 맨 아래에 한 줄짜리 버튼을 둔다(높이 44px 이상). 누르면 `onOpenDetail(schedule)`이 열린다.
  - 구성(각각 별도 요소): `IconChat` · 댓글 수 · (새 댓글이 있으면 점) · 최근 댓글 글자 `"{part} {memberName} · {text}"`(한 줄 말줄임) · `IconChevronRight`.
- 댓글이 0개면 "첫 댓글을 남겨 보세요".
- `aria-label`:
  - 댓글이 있으면 `댓글 {n}개` + (새 댓글이 있으면 `, 새 댓글 있음`) + `. 일정 상세 열기`.
  - 0개면 `댓글 남기기. 일정 상세 열기`.

| 입력 | 기대 |
|---|---|
| 댓글 3, 마지막 = 알토 민지 "저 30분 늦어요" | 수 요소 "3", 글자 요소 "알토 민지 · 저 30분 늦어요" |
| 마지막 댓글 삭제됨 | 글자는 남은 것 중 마지막, 수 "2" |
| 0개 | "첫 댓글을 남겨 보세요" |

### R5. 다가오는 일정 목록

- R1의 `upcoming`만 보여 준다. 제목은 "다가오는 일정"이고, "최대 5개 표시" 배지는 뺀다.
- 줄 오른쪽에는 먼저 댓글 수를 둔다(1개 이상이면 `IconChat` + 수). 그다음 상태 글자를 둔다. 배경은 없고 순수 함수 `upcomingStatusLabel(myVote: Pick<RSVPVote, 'status'> | undefined, rsvpOpen: boolean)`로 정한다.
  - 참석 → "참석"(`--status-success`)
  - 불참 → "불참"(`--text-sub`)
  - 투표 없음 + 투표 가능 → "투표 전"(`--text-sub`)
  - 그 밖 → 없음
- 줄 안 "투표" 버튼은 없앤다. 줄은 `<button>`으로 바꾸고, 누르면 지금처럼 일정 상세(투표 가능)가 열린다. 안 쓰게 되는 `onOpenRSVP` prop은 지운다.

| 입력 | 기대 |
|---|---|
| C, 투표 없음, 투표 가능, 댓글 5 | 말풍선 5 · "투표 전" |
| E, 별칭 id로 참석 | "참석" |
| `upcomingStatusLabel(undefined, false)` | 없음 |
| `upcomingStatusLabel({status:'ABSENT'}, false)` | "불참" |

### R6. 머리(헤더)

- 왼쪽: 로고(`src/assets/moonchoir-logo.png`, 32px, 둥근 네모) + "MOONCHOIR" 한 줄. 기존 "문콰이어 출석부 / MOONCHOIR ATTENDANCE"를 대신한다. 로고의 3번 누르기·우클릭(최고 관리자)은 그대로 둔다.
- 오른쪽 설정 버튼은 `showAdminEntry`일 때만 보인다(V39).
  - `App.tsx`에서 렌더마다 계산한다(동기화 때 다시 그려짐, `App.tsx:103`):
    ```ts
    const members = sheetsService.getMembers(true);
    const { canonicalId } = resolveMemberIdentity(profile.memberId, members);
    const showAdminEntry = isAdminLoggedIn() || members.find((m) => m.id === canonicalId)?.role === 'ADMIN';
    ```
  - `isStaffMember`(`src/utils/staff.ts:27`)는 쓰지 않는다. `memberStatus`가 선생님·운영진인 사람까지 포함하기 때문인데, 설정 버튼은 관리자 PIN 입구라 사용자가 "관리자에게만"으로 정했다(V39).
- **화면 표시일 뿐 권한이 아니다.** `#/admin` 주소는 지금처럼 PIN을 묻는다.
- 다크 모드 버튼은 넣지 않는다(V40).

| 입력 | 기대 |
|---|---|
| role MEMBER, 세션 없음 | 없음 |
| role ADMIN | 있음 |
| role MEMBER, 관리자 세션 있음 | 있음 |
| 기기가 별칭 id, 대표가 ADMIN | 있음 |
| 새 기기, 회원 목록 동기화 전 | 없음 → 동기화 후 ADMIN이면 나타남 |

### R7. 새 댓글 (`useSeenComments`, `src/components/home/useSeenComments.ts`)

- **저장:** `PREFERENCE_KEYS.SEEN_COMMENTS`에 본 댓글 id 문자열 배열을 둔다. 시각은 비교하지 않는다.
- **읽기:** `sheetsStorage.ts`에 `readPreferenceState(key, validate)`를 추가한다. 돌려주는 값은 `{kind:'missing'} | {kind:'invalid'} | {kind:'ok', value}`이다. `getItem === null`이면 missing, 해석 또는 검사 실패면 invalid다. 저장소 접근 자체가 실패해도 invalid다.
- **기준값:**
  - missing이고 `isReady`(= `getSyncState().lastSyncedAt > 0`)가 참이 되면 기준값을 저장한다. 기준값 = `getSchedulesForMember(memberId).flatMap((s) => getComments(s.id)).map((c) => c.id)`(지난 일정 포함 전부). 그 전에는 새 댓글 0이다(규칙 14).
  - invalid면 새 댓글 표시를 하지 않고 **저장하지도 않는다**.
  - ok면 준비 여부와 관계없이 바로 쓴다.
  - 홈이 `useSyncExternalStore`로 `getSyncState`를 구독해 `isReady`를 넘긴다(`ProfileTab.tsx:63,259-264`와 같은 방식).
- **새 댓글:** 저장값에 없는 id이면서 `isOwnComment(댓글, 내 memberId)`가 거짓인 것이다. 수정된 댓글은 id가 그대로라 새 댓글이 아니다.
- **봄 처리:** `ScheduleComments`가 언마운트될 때(상세를 닫을 때), 그 순간 펼쳐져 있었으면 **`visible` 배열**의 id를 저장값에 더한다. 접혀 있었으면 기록하지 않는다. **저장 상태가 ok일 때만 기록한다.** missing·invalid면 아무것도 쓰지 않는다(일부 목록을 써 버리면 기준값이 영영 안 만들어진다). 개발 모드의 `<StrictMode>`에서는 열자마자 기록될 수 있으니, 이 동작 확인은 빌드본으로 한다.
- **"새 댓글" 글자:** 댓글마다 작성자·시각 줄 끝에 붙인다(시안 `HomeB3`). 상세를 **열 때의 저장값** 기준으로 정하고, 열려 있는 동안 지워지지 않는다.
- **구독:** 상세를 닫은 뒤 홈 카드가 바로 바뀌도록 모듈 단위 구독(`subscribe`)을 둔다.
- **저장값 정리는 하지 않는다**(현재 댓글 CREATE 44건, 커져도 수백 건 수준).

| 입력 | 기대 |
|---|---|
| missing, 준비 안 됨 | 새 댓글 0, 저장 안 함 |
| missing, 준비 안 됨, 상세 열고 닫음 | 저장 안 함(여전히 missing) |
| missing, 준비됨, 댓글 44 | 44개 저장, 새 댓글 0 |
| 저장값이 깨진 JSON | 새 댓글 0, 저장값 그대로(덮어쓰지 않음) |
| ok, 백엔드 없는 모드(준비 안 됨) | 저장값 기준으로 정상 표시 |
| 다른 사람이 A에 새 댓글 | A 카드 점 |
| 내가(별칭 포함) 댓글 | 점 없음 |
| 남이 기존 댓글을 수정 | 점 없음 |
| A 상세 열고(펼침) 닫음 | 열린 동안 "새 댓글" 표시, 닫은 뒤 점 사라짐 |
| A 상세에서 댓글을 접고 닫음 | 점 그대로 |

### R8. 여백과 스타일 (시안 `HomeB`)

- 스타일은 `src/styles/v3/home.css`에 쓰고, `src/index.css` 변수만 쓴다(규칙 8). 시안의 hex를 쓰면 다크 모드가 깨진다.
- 회색 바탕 위 흰 상자 묶음을 쓰지 않는다. 달력과 목록은 바탕 위에 바로 두고, 묶음은 간격과 `--border-subtle` 선으로 나눈다. 상자는 일정 카드만 쓴다.
- 390×844 기준 값(시안):
  - 머리 68px(로고 아래 정렬)
  - 머리→달력 36px
  - 날짜 칸 48px
  - 달력→카드 28px
  - 카드 줄→다가오는 일정 28px
- 처음 열면 로고·달력·카드가 다 보이고, '다가오는 일정'은 제목만 보인다.
- 작은 화면(아이폰 SE) 전용 처리는 하지 않는다(사용자 결정).
- 하단 메뉴는 스크롤해도 숨기지 않는다(사용자 결정).
- 카드의 `◀ ▶`와 홈의 `‹ ›` 글자 아이콘은 해당 코드와 함께 지운다(`HomeTab.tsx:360,368`, `HomeActiveScheduleCard.tsx` 전환 줄).
- 지울 CSS(`home.css`): 토글 `64-96`, 주간 머리·이동 `13-62`, `98-111`, 주간 칸 `112-175`. `.schedule-date-badge`(`229-230`)는 `ScheduleDetailBody`가 쓰므로 남긴다.

---

## 4. 끝에서 끝까지 손계산 (테스트에 그대로)

**입력**
- 회원: `m1`(대표), 별칭 `m1b`.
- 오늘: 11/21 10:00. 일정 A~F(§3).
- 투표: `m1b`가 E에 참석. A·C는 투표 없음.
- 댓글 이벤트(이 순서):
  - A에 CREATE `c1`(알토 민지), `c2`(소프라노 지은), `c3`(m1).
  - C에 CREATE `c4`~`c8`(모두 테너 도윤).
  - 이벤트 `d1` = 도윤이 `c5`를 DELETE(`targetId: 'c5'`, 같은 작성자. `buildScheduleComments`는 남의 삭제를 무시한다, `src/utils/scheduleComments.ts:51-54`).
- 기기 저장값: `["c1"]`.

**계산**
1. 카드는 `[A, B, C]`, upcoming은 `[D, E, F]`다.
2. A 댓글은 `[c1, c2, c3]`, 수 3. 최근 댓글은 c3(본인)이다. 새 댓글은 저장값에 없는 c2와 c3 중 본인 것이 아닌 c2이므로, 점이 있다.
3. C 댓글 수는 4다(c5 삭제). C는 세 번째 카드라 목록에는 없다.
4. 목록에서 E 상태는 "참석"이다(`findMyVote`가 `m1b` 투표를 찾음).
5. A 상세를 펼친 채로 열었다 닫으면 저장값이 `["c1","c2","c3"]`가 되어 A 점이 사라진다.

---

## 5. 티켓 V3-22

**브랜치:** `main`에서 새 브랜치 `feat/home-b`를 만든다. 커밋은 Z1~Z3 묶음별로 나누고 PR은 1개다. Base는 `main`(`gh pr view`로 확인해 보고, 규칙 17).

### Z1. 순수 함수와 저장
- `src/utils/homeCards.ts`: `buildHomeCards`(R1)
- `src/utils/myVote.ts`: `findMyVote`(R2-1). `memberRecords.ts:98`이 이 함수를 부르게 바꾸고, 기존 내 활동·출결 테스트가 그대로 통과하는지 확인한다.
- `src/utils/homeCarousel.ts`: `activeCardIndex`, `calendarHighlightDate`(R3)
- `upcomingStatusLabel`(R5): `homeCards.ts` 또는 별도 파일
- `sheetsStorage.ts`: `readPreferenceState`와 `PREFERENCE_KEYS.SEEN_COMMENTS` 추가
- `src/components/home/useSeenComments.ts`: R7
- **테스트:** R1·R2-1·R3·R5·R7 표 전부와 §4 1~5. `readPreferenceState` 테스트 사이에는 `resetStorage()`를 부른다(모듈 단위 메모리 저장소). 새 함수라 "수정 전 실패" 대신 "새 파일"이라고 적는다. 이 저장소에는 jsdom이 없다. 스크롤과 레이아웃은 위 순수 함수로 시험하고, 실제 넘기기는 아래 캡처로 확인한다.

### Z2. 홈 화면
- `HomeTab.tsx`:
  - 순서를 달력 → 카드 줄 → 다가오는 일정으로 바꾼다.
  - 주간 보기, 토글, `selectedScheduleId`, ◀▶ 로직, `HOME_CALENDAR_VIEW` 읽기·쓰기를 지운다.
  - 카드 줄은 **반드시** `src/components/home/HomeCardCarousel.tsx`로 분리한다(`HomeTab.tsx`가 이미 408줄).
- `WeekCalendarGrid.tsx`를 삭제한다.
- `HomeActiveScheduleCard.tsx`: R2·R4
- `MonthCalendarGrid.tsx`: R3 `highlightDateStr`, R8
- `HomeUpcomingSection.tsx`: R5
- `Icons.tsx`: `IconChat`, `IconChevronRight`
- 안 쓰게 되는 props를 지운다: `HomeActiveScheduleCard`의 `schedulesCount`·`scheduleIndex`·`onPrevSchedule`·`onNextSchedule`·`todayStr`, `HomeUpcomingSection`의 `onOpenRSVP`.
- **달력 체크 표시 버그도 함께 고친다:** `HomeTab.tsx:133`이 `finalStatus === 'ATTENDED'`를 보지만, 실제 값은 한국어(`'출석' | '지각' | '수동인정' …`, `types/rollbook.ts:24-30`)라 체크가 한 번도 안 나왔다. `'출석' | '지각' | '수동인정'`이면 체크로 바꾼다.
- `home.css`: R8
- **테스트:**
  - R2 표
  - "카드에 나온 일정이 목록에 없다"
  - "주간/월간 토글이 없다"
  - `HomeTab.test.tsx`의 `:77-78`("주간"·"월간"), `:79`("주간 달력"), `:83`("최대 5개 표시"), `:88-109`(토글)와 `MonthCalendarGrid.test.tsx:51-52`(인라인 44px 검사)를 새 동작에 맞게 바꾼다.
  - 달력 체크: "오늘 A에 출석(`출석`) → A 날짜 칸에 체크", "`결석` → 체크 없음". 수정 전 실패를 확인한다.

### Z3. 머리와 댓글 표시
- `AppHeader.tsx`: R6
- `App.tsx`: `showAdminEntry` 계산
- `ScheduleComments.tsx`: R7 봄 처리와 "새 댓글" 글자
- **테스트:** R6 표 5줄. R7의 열기·접기 줄은 `ScheduleDetailSheet.test.tsx`의 가짜 DOM 방식이나 순수 함수로 나눠서 시험한다. 못 하면 "미확인"과 이유를 적는다.

### 확인 방법 (테스트로 못 잡는 것)
- **`scripts/dev/capture-screens.mjs`를 늘린다(Playwright 경로만).** Chrome 대체 경로로 찍은 것은 인정하지 않는다.
  - `page.addInitScript`로 기기 연결 정보(연결 창이 안 뜨게), `moonchoir_pref_seen_comments_v1`, 테마(`data-theme`)를 넣는다.
  - 홈 대상을 추가한다.
  - 카드 줄 `scrollLeft`를 바꿔서 찍을 수 있게 한다.
  - `document.documentElement.scrollWidth`, '다가오는 일정' 제목과 하단 메뉴의 `getBoundingClientRect().top`을 출력한다.
  - 빌드본에 일정 데이터가 없으면 `src/services/mockData.ts` 경로로 채운다. 그래도 안 되면 "미확인"과 이유를 적는다.
- **찍을 화면**(장마다 `scrollWidth`를 적는다, 규칙 13):
  - 홈 390×844: 라이트·다크 각각, 카드 1번째와 2번째
  - 일정 상세(새 댓글 있음): 저장값에 일부 id만 넣고 연다
  - 홈 1280×800
- **기대값:** '다가오는 일정' 제목 top < 하단 메뉴 top이고, 첫 줄은 일부만 보인다.

### 멈출 조건
- §2 표의 함수나 행이 다르면 시작하지 않고 보고한다.
- §3에 없는 새 문구가 필요하면 멈추고 보고한다.
- 하지 않는 것: `supabase/` 변경, 운영 DB 실행, npm 설치, `package.json` 수동 수정, PR 머지, 배포.

### 보고
`docs/plans/17_v3_implementation_guide.md` §5 형식으로 쓴다. `/report-ready`를 돌리고 CI 초록불을 확인한 뒤 보고하고 멈춘다.

---

## 6. spec-auditor 지적 반영 기록

| 지적 | 반영 |
|---|---|
| B1 읽기 실패와 저장값 없음 구분 불가 | `readPreferenceState` 추가, R7 깨진 값 예시 |
| S1 봄 처리 시점 모순 | 닫을 때 펼침 상태 + 보인 댓글만 |
| S2 내 투표 판정 3곳 | `findMyVote` 하나로(투표 창은 2차 B1로 제외) |
| S3 `isStaffMember` | 쓰지 않는 이유 명시(선생님 포함, 관리자 PIN 입구) |
| S4 동기화 전·표시 전용 | R6 예시와 "권한 아님" 명시 |
| S5 종료 시각 없음·경계 | 모든 예시에 시간 범위, 16:59·17:00·종료 없음 행 |
| S6 `upcoming` 정의 | "카드에 없음 + 오늘 마감 제외"로 변경, 4개 묶음·보관·취소 행 |
| S7 불가능한 예시 | `upcomingStatusLabel` 순수 함수 예시로 교체 |
| S8 표 누락 | 6개 이름 추가, 호출부 정정 |
| S9 달력 수정 필요 | "고친다"로, `highlightDateStr` 분리로 "오늘" 버튼 부작용 차단 |
| S10 깨질 테스트 | `:79`, `:83`, CSS 추가 |
| S11 jsdom 없음 | 순수 함수로 분리, 캡처로 확인 |
| S12 `lastSyncedAt` | `> 0`, 저장값 있으면 준비와 무관, 캡처용 시드 방법 |
| S13 날짜 배지 | 대신한다고 명시, CTA별 예시 |
| N1~N5 | 분리 필수, 아이콘 이름, 삭제 이벤트 작성자, 수정 댓글 행, 일부 보이는 카드 동작 |
| 2차 B1 투표 창에 별칭 투표 전달 | `App.tsx:526`·`RSVPModal`은 바꾸지 않음, 알려진 한계로 기록 |
| 2차 B2 종료 시각 경계 | 종료 시각 포함 열림, 17:00·17:01 행 |
| 2차 S1 병합 행 없는 회원 목록 | `getMembers(true)` 코드 명시 |
| 2차 S2 missing 상태에서 기록 | ok일 때만 기록, 예시 행 |
| 2차 S3 기준값 출처 | `getSchedulesForMember` → `getComments` 전부 |
| 2차 S4 규칙 두 개·이름 대조 | `findMyVote` = 출결 엔진 규칙, 엔진도 이 함수 호출, 이름 대조 삭제 |
| 2차 S5 StrictMode | 빌드본으로 확인 |
| 2차 S6 캡처 스크립트 기능 없음 | 스크립트 확장 항목 명시 |
| 2차 S7~S11 | 깨질 테스트 추가, 명세 §9 수정, 출석 예시 13:58, 날짜 줄 명시, 댓글 줄 요소 분리 |
| 2차 사소 | 행 번호, CSS 범위, 안 쓰는 props, 매개변수 타입, `focusResult`, `visible`, 끝 스크롤, 달력 체크 버그 |
