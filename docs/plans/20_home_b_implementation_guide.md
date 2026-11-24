# 20. 홈 B안 개편 개발 지시서 (V3-22)

> 작성: 리뷰어(Claude), 2026-11-23. 기준 코드: `origin/main` @ `73f073a`.
> 명세: `docs/MEMBER_UX_V3_SPEC.md` §0-1 V35~V40, §2(B안으로 갱신).
> 시안(사용자 확정): https://claude.ai/artifact/78R1NaARRVq6a9zKrpZM9r 의 `HomeB`, `HomeB2`, `HomeB3`. 시안에만 있는 설명 글자는 넣지 않는다.
> 시작 전: `.agents/rules/recurring-mistakes.md`를 읽고 `/spec-check`로 이 문서를 코드에 대 본다. 어긋나면 시작하지 말고 보고한다.

---

## 1. 바뀌는 것 한 줄

홈을 "월간 달력 → 일정 카드(옆으로 넘김) → 다가오는 일정" 순서로 바꾸고, 카드와 목록에서 댓글을 보이게 해 일정 상세(댓글)로 들어가는 길을 만든다.

### 데이터 경로

| 화면 요소 | 원천 → 저장 → 조회 → 계산 → 화면 |
|---|---|
| 일정 카드 묶음 | `schedules` → `sheetsService.getSchedulesForMember` → `selectTodayFocus`(오늘/다음 날짜 묶음) + 그 뒤 일정 → `buildHomeCards`(새, 순수 함수) → 카드 |
| 카드 버튼 | 투표·출결 → `deriveTodayCta`(그대로) → 카드 버튼 1개 |
| 다가오는 일정 | 같은 일정 목록 → `buildHomeCards`가 함께 돌려주는 `upcoming` → `HomeUpcomingSection` |
| 댓글 수·최근 댓글 | `schedule_comment_events` → `sheetsService.getCommentCounts` / `getComments` → 카드 댓글 줄, 목록 댓글 수 |
| 새 댓글 표시 | 기기 저장값 `moonchoir_pref_seen_comments_v1`(본 댓글 id 목록) + `getComments` + `isOwnComment` → `useSeenComments`(새) → 점·"새 댓글" |
| 설정 버튼 | `members.role`(운영 ADMIN 9명·MEMBER 15명 확인) + `isAdminLoggedIn()` → `AppHeader`의 `showAdminEntry` |

---

## 2. 기존 코드 계약 표 (리뷰어가 `origin/main`에서 직접 연 것)

| 이름 | 정의 위치 | 호출부 | 받는 것 → 돌려주는 것 | 빠뜨리면 | 대신/함께 쓸 것 |
|---|---|---|---|---|---|
| `selectTodayFocus` | `src/utils/todayFocus.ts:72` | `HomeTab.tsx:141` | `{schedules, member, memberAliasIds, identityMembers, now, todayStr, selectedId}` → `{mode, schedules, focus, dDay}`. `schedules`는 **같은 날짜** 묶음(오늘 아직 안 끝난 일정, 없으면 가장 가까운 미래 날짜) | 입력이 `getSchedulesForMember` 결과가 아니면 숨김 일정이 노출됨(파일 주석) | 카드 첫 묶음은 이 함수 결과 순서를 그대로 쓴다. 우선순위 규칙을 새로 쓰지 않는다 |
| `deriveTodayCta` | `src/utils/todayCta.ts:38` | `HomeTab.tsx:275` | 일정·now·필참·내 투표·내 출결·온라인 → `TodayCtaState`(라벨 예: "참석 투표하기", "투표 수정 · 현재 참석", "QR 찍기 / PIN 출석", "출석 완료 19:28") | 출석/투표 규칙이 갈라짐 | **카드마다** 이 함수로 버튼을 만든다. 시안의 "참석/불참" 두 버튼은 이 버튼 1개를 뜻한다(§3 R2) |
| `HomeActiveScheduleCard` | `src/components/home/HomeActiveScheduleCard.tsx:26` | `HomeTab.tsx:258` | 일정·CTA·출석 인원 등 → 카드 1장 | — | 재사용. **◀▶ 전환 줄(51~132행)과 "상세 보기" 버튼(300~321행)만** 뺀다. 필참 표시·장소 링크·설명·출석 인원은 남긴다 |
| `MonthCalendarGrid` | `src/components/MonthCalendarGrid.tsx:27` | `HomeTab.tsx:383` | `selectedDateStr`, `onSelectDate`, `headerExtra` 등 | — | 그대로 쓴다. `headerExtra`(주간/월간 토글)는 넘기지 않는다 |
| `WeekCalendarGrid` | `src/components/home/WeekCalendarGrid.tsx:16` | `HomeTab.tsx:373`(유일) | — | — | 홈에서 주간 보기를 없애므로 파일과 import를 지운다 |
| `PREFERENCE_KEYS.HOME_CALENDAR_VIEW` | `src/services/sheetsStorage.ts:14` | `HomeTab.tsx:53,163`, 테스트 | — | — | 홈에서 읽기·쓰기를 지운다. **키 상수는 남긴다**(`sheetsStorage.test.ts:73~81`이 예시로 씀) |
| `HomeUpcomingSection` | `src/components/home/HomeUpcomingSection.tsx:13` | `HomeTab.tsx:400` | `schedules`, `currentNow`, `onNavigate`, `onOpenRSVP` | — | 재사용. "최대 5개 표시" 배지와 줄 안 "투표" 버튼을 빼고 조용한 상태 글자와 댓글 수로 바꾼다(§3 R5) |
| `isRsvpOpenForSchedule` | `src/utils/timeWindow.ts:135` | `HomeUpcomingSection.tsx` | 일정, now → 투표 가능 여부 | — | 목록 상태 글자 판정에 그대로 쓴다 |
| `sheetsService.getComments` | `src/services/sheets.ts:347` | `ScheduleComments.tsx` | scheduleId → 댓글(오래된 순, 삭제 제외, 수정 반영) | 직접 이벤트를 읽으면 삭제·수정이 빠짐 | 최근 댓글 = 마지막 원소 |
| `sheetsService.getCommentCounts` | `src/services/sheets.ts:355` | 운영진 화면 | → `Map<scheduleId, 개수>` | — | 카드·목록 댓글 수. 새로 세지 않는다 |
| `sheetsService.isOwnComment` | `src/services/sheets.ts:372` | `ScheduleComments.tsx` | 댓글, memberId → 병합 별칭까지 같은 사람인지 | 내 댓글이 "새 댓글"로 뜸 | 새 댓글 판정에서 내 댓글 제외 |
| `sheetsService.getSyncState` / `subscribeSync` | `src/services/sheets.ts:1980` / `:1984` | `ProfileTab.tsx:63` | → `{lastSyncedAt, ...}` / 동기화 알림 | 데이터 도착 전 기준값 저장(규칙 14) | `lastSyncedAt`이 있을 때만 "준비됨" |
| `useSeenStickers` | `src/components/profile/useSeenStickers.ts:34` | `ProfileTab.tsx:264` | (본 것 목록 기기 저장, 첫 기기는 데이터 도착 후 기준값) | — | **같은 구조로** `useSeenComments`를 만든다(§3 R7). 스티커 훅은 고치지 않는다 |
| `readPreference` / `writePreference` | `src/services/sheetsStorage.ts:90` / `:113` | 여러 곳 | 키, 검사 함수, 기본값 | — | 새 키 `SEEN_COMMENTS: 'moonchoir_pref_seen_comments_v1'`를 `PREFERENCE_KEYS`에 추가 |
| `ScheduleComments` | `src/components/home/ScheduleComments.tsx:34` | `ScheduleDetailBody.tsx:147` | scheduleId, author, defaultExpanded | — | 펼쳐져 있을 때 이 일정의 댓글을 "봄"으로 기록하고, 아직 안 본 댓글에 "새 댓글" 표시(§3 R7) |
| `AppHeader` | `src/components/AppHeader.tsx:11` | `App.tsx:328` | `onOpenAdmin`, `onOpenSuperAdmin` | — | 로고 숨은 동작(`useMasterEntryGesture`의 `logoHandlers`)은 그대로. `showAdminEntry` prop 추가 |
| `isAdminLoggedIn` | `src/services/auth.ts:124` | `App.tsx:185,286` | → 관리자 세션 여부 | — | 설정 버튼 표시 조건의 하나 |
| `resolveMemberIdentity` | `src/utils/memberIdentity.ts:8` | `HomeTab.tsx:97` | memberId, members → canonicalId | 병합 별칭 id로 묶인 기기는 role을 못 찾음 | 설정 버튼의 role 확인은 대표 회원 기준 |
| `resolveMergedMemberIds` | `src/utils/attendanceStats.ts:208` | `HomeTab.tsx:111` | → 별칭 포함 id 집합 | — | 목록 "내 투표" 찾기에 쓴다 |

표에 없는 이름을 새로 쓰려면 먼저 보고한다.

---

## 3. 규칙과 경계 예시

공통 예시 데이터(KST, 오늘 = 2026-11-21 토):
`A` 11/21 14:00~17:00 추가연습 · `B` 11/24 19:30~21:40 정기연습 · `C` 11/28 14:00 추가연습 · `D` 12/01 19:30 정기연습 · `E` 12/05 13:00 리허설 · `F` 12/08 19:30 정기연습. 모두 나에게 보이는 일정(`getSchedulesForMember`), 취소·보관 아님.

### R1. 카드 묶음 (`buildHomeCards`, 새 순수 함수 `src/utils/homeCards.ts`)

- 첫 묶음 = `selectTodayFocus(...).schedules`(순서 그대로).
- 이어서 첫 묶음의 날짜보다 **뒤 날짜**의 유효 일정(취소·보관 제외)을 날짜→시작 시각 순으로 붙인다.
- **최대 3장.** `mode === 'NONE'`이면 카드 없음.
- `upcoming` = 유효 일정 중 (날짜, 시작 시각)이 **마지막 카드보다 뒤**인 것, 최대 5개. 카드가 없으면 빈 목록.
- 카드에 나온 일정은 `upcoming`에 다시 나오지 않는다(V36).

| 입력 | 기대 |
|---|---|
| now 11/21 10:00 | 카드 `[A, B, C]`, upcoming `[D, E, F]` |
| now 11/21 23:00 (A 출석 창 닫힘) | 카드 `[B, C, D]`, upcoming `[E, F]` (A는 어디에도 없음) |
| 11/21에 A와 `A2`(19:00) 둘, now 10:00 | 카드 `[A, A2, B]`(첫 묶음 순서는 `selectTodayFocus` 우선순위), upcoming `[C, D, E, F]` |
| 일정 `B` 하나뿐, now 11/21 23:00 | 카드 `[B]`, upcoming `[]` |
| 미래 일정 없음 | 카드 `[]`, upcoming `[]` → 기존 문구 "예정된 일정이 없습니다." |
| `C`가 취소(`isCancelled`) | 카드 `[A, B, D]` |

### R2. 카드 버튼

- 카드마다 `deriveTodayCta`로 버튼 1개(기존과 같음). 투표 버튼은 기존 `onOpenRSVP` 흐름을 연다. 시안처럼 카드 안에서 바로 참석/불참을 저장하지 않는다.
- 카드 오른쪽 위 상태: 오늘 카드이고 `RSVP_NEW`면 "투표 전"(`--status-warning` 계열 글자). 미래 카드는 "n일 뒤"(`computeDDayDifference`, `src/utils/todayFocus.ts`). 오늘이면 상태 글자만.

| 입력 | 기대 |
|---|---|
| A, 투표 없음, 투표 가능 시간 | 버튼 "참석 투표하기", 오른쪽 위 "투표 전" |
| B, 참석 투표함, 오늘 11/21 | 버튼 "투표 수정 · 현재 참석", 오른쪽 위 "3일 뒤" |
| A, 출석 창 열림 | 버튼 "QR 찍기 / PIN 출석"(필참일 때) |

### R3. 넘기기와 달력 연동

- 카드 줄은 가로 스크롤 + `scroll-snap`(브라우저 기본). 다음 카드 끝이 보이게 한다(시안 `HomeB`). 라이브러리 설치 금지.
- 점 표시는 `aria-hidden`. 보이는 카드(가장 많이 보이는 것)가 바뀌면 `activeIndex` 갱신.
- 화면에 일부만 보이는 카드를 누르면 그 카드로 스크롤만 하고 다른 동작은 하지 않는다.
- 달력 선택 = `routeSelectedDate ?? (보이는 카드 날짜가 지금 보는 달이면 그 날짜, 아니면 없음)`. 카드를 넘겨도 달은 자동으로 바꾸지 않는다.
- 날짜를 누르면 지금처럼 `handleSelectDate`로 일정 상세가 열린다. 카드는 움직이지 않는다(V37).

| 입력 | 기대 |
|---|---|
| 11월 보기, 카드 B로 넘김 | 달력 24일 선택 표시 |
| 11월 보기, 카드 D(12/01)로 넘김 | 달력 선택 없음(회색 12/1 칸도 선택 안 함), 달은 11월 그대로 |
| 주소에 `d=2026-11-14` | 14일 선택(카드와 무관) |
| 카드 1장 | 점 표시 없음 |

### R4. 카드 댓글 줄 (V38)

- 카드 맨 아래 한 줄 버튼(높이 44px 이상): 말풍선 아이콘 + 댓글 수 + (새 댓글 있으면 점) + 최근 댓글 `"{part} {memberName} · {text}"` 한 줄 말줄임 + 오른쪽 화살표. 누르면 `onOpenDetail(schedule)`.
- 댓글 0개: "첫 댓글을 남겨 보세요".
- `aria-label`: `댓글 {n}개` + (새 댓글 있으면 `, 새 댓글 있음`) + `. 일정 상세 열기`. 0개면 `댓글 남기기. 일정 상세 열기`.

| 입력 | 기대 |
|---|---|
| A 댓글 3개, 마지막 = 알토 민지 "저 30분 늦어요" | "3 · 알토 민지 · 저 30분 늦어요" |
| 마지막 댓글이 삭제됨 | 남은 것 중 마지막(`getComments`가 삭제를 이미 뺌), 수는 2 |
| 댓글 0개 | "첫 댓글을 남겨 보세요" |

### R5. 다가오는 일정 목록

- R1의 `upcoming`만. 제목 "다가오는 일정", "최대 5개 표시" 배지는 뺀다.
- 줄 오른쪽: 댓글이 1개 이상이면 말풍선 + 수, 그다음 상태 글자(배경 없음).
  - 내 투표 = 그 일정 투표 중 `memberId`가 `resolveMergedMemberIds(현재 회원)`에 있는 것.
  - 참석 → "참석"(`--status-success` 글자) · 불참 → "불참"(`--text-sub`) · 투표 없음이고 `isRsvpOpenForSchedule` 참 → "투표 전"(`--text-sub`) · 그 외 → 표시 없음.
- 줄 안 "투표" 버튼은 없앤다. 줄 전체를 누르면 지금처럼 일정 상세(투표 가능)가 열린다. 줄은 `<div onClick>`이 아니라 `<button>`으로 바꾼다.

| 입력 | 기대 |
|---|---|
| C, 투표 없음, 투표 가능, 댓글 5 | 말풍선 5, "투표 전" |
| E, 별칭 id로 참석 투표 | "참석" |
| F, 투표 마감, 투표 없음, 댓글 0 | 아무것도 없음 |

### R6. 머리(헤더)

- 왼쪽: 로고 이미지(`src/assets/moonchoir-logo.png`, 32px, 둥근 네모) + "MOONCHOIR". 기존 "문콰이어 출석부 / MOONCHOIR ATTENDANCE" 두 줄은 이 한 줄로 바꾼다. 로고의 3번 누르기·우클릭(최고 관리자 진입)은 그대로.
- 오른쪽 설정 버튼은 `showAdminEntry`일 때만(V39). `showAdminEntry = isAdminLoggedIn() || 대표 회원.role === 'ADMIN'`(`App.tsx`에서 계산).
- 다크 모드 버튼은 머리에 넣지 않는다. 지금처럼 '내 활동' 설정에 둔다(V40).

| 입력 | 기대 |
|---|---|
| role MEMBER, 관리자 세션 없음 | 설정 버튼 없음 |
| role ADMIN | 설정 버튼 있음 |
| role MEMBER, 관리자 세션 있음 | 있음 |
| 기기가 병합된 별칭 id로 묶여 있고 대표가 ADMIN | 있음 |

### R7. 새 댓글 (`useSeenComments`, `src/components/home/useSeenComments.ts`)

- 저장: `PREFERENCE_KEYS.SEEN_COMMENTS`에 본 댓글 id 문자열 배열. 시각을 비교하지 않는다(`timestamp`는 시간대 없는 text 19자).
- 처음 기기(저장값 없음): `getSyncState().lastSyncedAt`이 생긴 뒤 **그때 있는 모든 댓글 id를 기준값으로 저장**한다(규칙 14). 그 전에는 새 댓글 0개로 본다. 읽기 실패는 저장값 없음과 구분한다(스티커 훅과 같게).
- 새 댓글 = 저장값에 없는 id이고 `isOwnComment(댓글, 내 memberId)`가 거짓인 것.
- 봄 처리: `ScheduleComments`가 **펼쳐져 있는 동안** 그 일정의 현재 댓글 id를 모두 추가 저장한다. 접혀 있으면 기록하지 않는다.
- 같은 기기의 홈 카드가 상세를 닫은 뒤 바로 바뀌도록 모듈 단위 구독(`subscribe`)을 둔다.
- 상세의 댓글 목록에서 새 댓글에 "새 댓글" 글자(`--status-warning` 계열)를 붙인다. 표시 기준은 상세를 **열 때** 저장값이다(여는 순간 지워지지 않게).

| 입력 | 기대 |
|---|---|
| 새 기기, 동기화 전 | 새 댓글 0, 저장 안 함 |
| 새 기기, 동기화 후 댓글 44개 | 44개 id 저장, 새 댓글 0 |
| 저장 후 다른 사람이 A에 댓글 | A 카드에 점 |
| 내가(또는 병합 별칭으로) 댓글 | 점 없음 |
| A 상세 열기 → 닫기 | 열려 있는 동안 "새 댓글" 표시, 닫은 뒤 A 카드 점 사라짐 |
| 댓글을 접은 채 상세 닫기 | 점 그대로 |

### R8. 여백과 스타일 (시안 `HomeB`)

- 스타일은 `src/styles/v3/home.css`에 쓰고 `src/index.css`의 변수만 쓴다. 시안의 hex를 그대로 쓰지 않는다(다크 모드가 깨진다).
- 회색 바탕 위 흰 상자 묶음을 쓰지 않는다. 달력과 목록은 바탕 위에 바로, 묶음은 간격과 얇은 선(`--border-subtle`)으로 나눈다. 상자는 일정 카드만.
- 390×844 기준 값(시안): 머리 68px(로고 아래 정렬), 머리→달력 36px, 날짜 칸 높이 48px, 달력→카드 28px, 카드 줄→다가오는 일정 28px. 처음 열었을 때 로고·달력·카드 전체가 보이고 '다가오는 일정'은 제목만 보인다.
- 아이폰 SE(375×667) 같은 작은 화면 전용 처리는 하지 않는다(사용자 결정, 스크롤로 본다).
- 하단 메뉴는 스크롤해도 숨기지 않는다.
- 달력 화살표 `‹ ›`, 카드 `◀ ▶` 같은 글자 아이콘은 `src/components/Icons`의 아이콘이나 SVG로 바꾼다.

---

## 4. 끝에서 끝까지 손계산 (테스트에 그대로)

회원 `m1`(별칭 `m1b`가 `m1`로 병합), 오늘 11/21 10:00, 일정 A~F(§3).
- 투표: `m1b`가 E에 참석. A·C는 투표 없음, 둘 다 투표 가능.
- 댓글 이벤트:
  - A에 CREATE `c1`(알토 민지), `c2`(소프라노 지은), `c3`(m1 본인).
  - C에 CREATE `c4~c8` 다섯 개, 그다음 `c5` DELETE.
- 기기 저장값: `["c1"]`.

계산:
1. 카드 `[A, B, C]`, upcoming `[D, E, F]`.
2. A 댓글 = `[c1, c2, c3]`, 수 3, 최근 = c3(본인) → 줄 "3 · {c3 작성자} · …". 새 댓글 = 저장값에 없는 c2, c3 중 본인 아닌 c2 → 점 있음.
3. C 댓글 수 = 4(c5 삭제). C는 카드 3번째라 목록에는 없음.
4. 목록 E 상태 = "참석"(별칭 투표).
5. A 상세 열고 닫은 뒤 저장값 = `["c1","c2","c3"]` → A 점 없음.

---

## 5. 티켓 V3-22

**브랜치:** `main`에서 새 브랜치 `feat/home-b`. 커밋은 아래 묶음별로 나눈다. PR 1개, Base는 `main`(`gh pr view`로 확인해 보고, 규칙 17).

### Z1. 순수 함수와 저장 훅
- `src/utils/homeCards.ts`: `buildHomeCards({ focus: TodayFocusResult, schedules, maxCards = 3, maxUpcoming = 5 })` → `{ cards, upcoming }`. 날짜·시각 비교는 `date`/`startTime` 문자열로(기존 `upcoming5` 정렬과 같은 방식, `HomeTab.tsx:226~231`).
- `src/components/home/useSeenComments.ts`: R7.
- `PREFERENCE_KEYS.SEEN_COMMENTS` 추가.
- 테스트: R1·R7 표 전부와 §4 1~5. 수정 전에는 함수가 없어서 실패하므로, 실패 출력 대신 "새 파일"이라고 적는다.

### Z2. 홈 화면
- `HomeTab.tsx`:
  - 순서를 달력 → 카드 줄 → 다가오는 일정으로 바꾼다.
  - 주간 보기, 토글, `selectedScheduleId`·◀▶ 전환 로직을 지운다. `WeekCalendarGrid.tsx`를 삭제한다.
- `HomeActiveScheduleCard.tsx`: 전환 줄과 "상세 보기" 버튼을 빼고 R4 댓글 줄을 넣는다. `HomeTab.tsx`가 400줄을 넘으면 카드 줄을 `src/components/home/HomeCardCarousel.tsx`로 분리한다(규칙 9).
- `HomeUpcomingSection.tsx`: R5.
- 테스트(실제 화면 결과를 검사, 규칙 6):
  - R2, R3, R5 표.
  - "카드에 나온 일정이 목록에 없다".
  - "주간/월간 토글이 없다". `HomeTab.test.tsx`의 토글 테스트(89~108행)는 이에 맞게 바꾼다.

### Z3. 머리와 댓글 표시
- `AppHeader.tsx`: R6. `App.tsx`에서 `showAdminEntry`를 계산해 넘긴다.
- `ScheduleComments.tsx`: R7 봄 처리와 "새 댓글" 글자.
- 테스트: R6 표 4줄, R7의 상세 열기·접기 두 줄.

### 확인 방법 (테스트로 못 잡는 것)
- `scripts/dev/capture-screens.mjs`로 아래를 찍어 첨부하고, 각각 `document.documentElement.scrollWidth`를 적는다(규칙 13).
  - 홈 390×844: 라이트·다크, 카드 1번째·2번째.
  - 일정 상세(새 댓글 있음).
  - 1280×800.
- 390×844 첫 화면에서 '다가오는 일정' 제목의 `getBoundingClientRect().top` 값을 적는다. 기대: 하단 메뉴 위쪽 끝(약 780px)보다 위이고, 첫 줄은 일부만 보임.
- 실제 터치 넘기기는 Playwright `page.mouse`나 `scrollLeft`로 대신하고, 그 방법을 적는다.

### 멈출 조건
- §2 표의 함수·행이 다르면 시작하지 않고 보고.
- 새 문구가 §3에 없는 것이 필요하면 멈추고 보고.
- DB·`supabase/` 변경, npm 설치, PR 머지, 배포 금지.

### 보고
`docs/plans/17_v3_implementation_guide.md` §5 형식. `/report-ready`를 돌리고 CI 초록불 확인 후 보고하고 멈춘다.
