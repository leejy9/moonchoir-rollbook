# 16. 단원 UX 개편 · 연습실 구현 가이드 (구현 에이전트용 작업 지시서)

> **이 문서의 역할**: [MEMBER_UX_AUDIO_SPEC.md](../MEMBER_UX_AUDIO_SPEC.md)(이하 "명세")는 **무엇을** 만들지 정의합니다. 이 문서는 **어떤 순서로, 어떤 파일을, 어떻게 검증하며** 만들지 정합니다. 명세와 이 문서가 다르면 **명세가 우선**이며, 차이를 발견하면 작업을 멈추고 사용자에게 보고합니다.
>
> 작성: 2026-11-21 · 기준 커밋: `d12723a` (Phase 0 보안 강화 포함)
>
> 함께 읽을 문서: [AGENTS.md](../../AGENTS.md) · [구조 복구 기록](../ARCHITECTURE_RECOVERY.md) · [배포 절차](../DEPLOYMENT.md)

---

## 0. 먼저 읽을 것 — 이 규칙을 어기면 작업 전체가 반려됩니다

### 0-1. 절대 규칙
1. **한 번에 티켓 하나만** 진행합니다. 티켓 하나 = 커밋 하나입니다. 여러 티켓을 한 커밋에 섞지 않습니다.
2. **티켓에 적힌 파일 외에는 고치지 않습니다.** 다른 파일을 고쳐야 할 것 같으면 멈추고 보고합니다. "고치는 김에" 정리·리팩터링·이름 변경을 하지 않습니다.
3. **명세에 없는 기능, 문구, 색상, 애니메이션을 추가하지 않습니다.**
4. **모든 커밋 전에 Green Bar를 통과합니다.** 아래 4개를 실행하고, 출력 마지막 줄을 보고에 그대로 붙입니다.
   ```bash
   npm run typecheck
   npm run lint
   npm test
   npm run build
   ```
   하나라도 실패하면 커밋하지 않습니다. **테스트를 지우거나, `skip`·`only`를 붙이거나, 기대값을 실제 결과에 맞춰 바꿔서 통과시키는 것은 금지**입니다. 기존 테스트의 기대값을 바꿔야 한다면, 그 테스트가 명세상 바뀌어야 하는 동작을 검사하고 있다는 근거를 보고에 적습니다.
5. **새 npm 패키지를 설치하지 않습니다.** (AGENTS.md: 사전 승인 필요) 바텀시트, 라우팅, 오디오 플레이어 모두 브라우저 표준 API로 만듭니다. `package.json`, `package-lock.json`을 바꾸는 커밋은 반려됩니다.
6. **운영 Supabase DB에 직접 SQL을 실행하지 않습니다.** 마이그레이션 파일만 작성하고, 적용은 사용자가 합니다(§5 질문 지점).
7. **시크릿을 코드·문서·커밋·채팅에 쓰지 않습니다.** PIN 값, API 키, 토큰, R2 계정 정보 모두 해당합니다. 예시가 필요하면 `<새 PIN>` 같은 자리표시자를 씁니다.
8. **단원 본인 인증(Task 76)은 이번 범위가 아닙니다.** "다른 단원 이름으로 출석할 수 있다", "전화번호가 보인다" 같은 문제를 발견해도 고치지 말고, 이미 기록된 문제이므로 보고만 합니다.
9. **이모지를 화면 문구에 넣지 않습니다.** 기존 코드의 이모지를 지우는 것은 해당 티켓이 그 컴포넌트를 다룰 때만 합니다.
10. **인라인 hex 색상(`'#DC2626'` 등)을 새로 쓰지 않습니다.** `src/index.css`의 CSS 변수(`var(--brand-primary)` 등)만 씁니다. 필요한 변수가 없으면 보고합니다.

### 0-2. 반드시 멈추고 사용자에게 물어야 하는 상황
- 명세와 실제 코드가 다르다 (예: 명세가 말하는 함수가 없다, 동작이 다르다).
- 티켓 범위 밖 파일을 고쳐야 한다.
- 기존 테스트가 실패하는데 원인이 내 변경이 아닌 것 같다.
- DB 스키마나 RPC를 바꿔야 한다 (Phase 2a 마이그레이션 티켓 제외).
- 사용자에게 보이는 문구를 명세에 없는 내용으로 정해야 한다.
- 30분 이상 같은 오류를 해결하지 못했다.

질문할 때는 "무엇을 하려다", "무엇을 발견했고", "선택지 A/B와 각각의 영향"을 짧게 적습니다.

### 0-3. 보고 형식 (티켓마다)
```
## [티켓 ID] 제목
- 바꾼 파일: (목록)
- 한 일: (3줄 이내)
- 하지 않은 일 / 남은 문제: (없으면 "없음")
- 추가한 테스트: (테스트 이름 목록)
- Green Bar: typecheck ✓ / lint ✓ / test "Tests N passed (N)" / build ✓
- 확인 필요: (사용자 판단이 필요한 것, 없으면 "없음")
```

---

## 1. 현재 상태 (2026-11-21)

| 항목 | 상태 |
|---|---|
| 명세 v2 | 완료. §0 결정 기록에 사용자 확정 사항이 있음 |
| Phase 0 보안 | **운영 DB 적용 완료.** 화면(프런트엔드) 배포는 사용자가 진행 예정. 배포 전까지 관리자 화면 로그인 불가(정상) |
| Phase 1 | **완료** (티켓 P1-01 ~ P1-12 전원 통과, 브랜치 `feat/member-ux-phase1`) |
| Phase 2a / 2b / 3 | 착수 준비 완료 |
| Task 76 (단원 본인 인증) | **이번 단계 범위 아님** (사용자 결정) |
| 레벨·배지 | 보류 (명세 D6). 새로 만들지 않음 |

### 1-1. Phase 0이 바꾼 것 — 새 코드를 쓸 때 꼭 지켜야 함
- 관리자 전용 RPC는 **서버 발급 토큰**이 있어야 실행됩니다. 클라이언트는 `src/services/adminSession.ts`에 토큰을 보관하고, `src/services/backend/supabaseBackend.ts`가 모든 `p_payload`에 `adminToken`을 자동으로 붙입니다. **새 기능에서 토큰을 직접 다루지 마세요.** 기존 `sheetsService` 메서드 → `sendToGoogleSheet` → `backend.callAction` 경로를 타면 자동으로 처리됩니다.
- DB의 관리자 쓰기 함수는 `fn_xxx`(토큰 검사 래퍼)와 `fn_xxx__impl`(실제 본문)로 나뉘어 있습니다. **기존 관리자 함수의 동작을 바꿀 때는 `fn_xxx__impl`을 `create or replace` 해야 합니다.** `fn_xxx`를 `create or replace` 하면 토큰 검사가 사라져 보안 구멍이 다시 열립니다.
- 새로 만드는 관리자 쓰기 RPC는 함수 첫 줄에서 토큰을 검사해야 합니다(§4 Phase 2a 템플릿).
- Supabase는 public 스키마에 새 함수를 만들면 **자동으로 anon에게 실행 권한을 줍니다.** 내부용 함수는 반드시 `revoke all on function ... from public, anon, authenticated;` 합니다.

---

## 2. 작업 환경과 방법

### 2-1. 브랜치
- 사용자가 지정한 브랜치에서 작업합니다. 지정이 없으면 묻습니다. `main`에 직접 커밋하지 않습니다.

### 2-2. 커밋 메시지
```
<type>(<scope>): <티켓 ID> <한 줄 요약>

<무엇을 왜 바꿨는지 2~4줄>
```
- type: `feat` / `fix` / `refactor` / `test` / `docs`
- 예: `refactor(home): P1-03 extract selectTodayFocus pure function`

### 2-3. 테스트 작성 규칙
- 순수 함수는 `src/utils/<이름>.test.ts`에 둡니다. 기존 `src/utils/*.test.ts` 파일을 열어 같은 형식(vitest `describe/it/expect`)을 따릅니다.
- 컴포넌트 테스트는 기존 `src/components/HomeView.test.tsx`의 렌더링·목(mock) 방식을 그대로 복사해서 씁니다. 새 테스트 라이브러리를 들이지 않습니다.
- **현재 시각에 의존하는 테스트는 반드시 시각을 고정합니다.** 함수에 `now: Date` 인자를 받게 만들고 테스트에서 넘깁니다. `vi.useFakeTimers()`를 쓰면 `afterEach`에서 `vi.useRealTimers()`로 되돌립니다.
- **시간대 테스트**: KST 계산 함수는 `new Date('2026-11-20T10:00:00.000Z')`처럼 **UTC 시각을 명시해** 만들고, 그 시각이 KST로 몇 시인지 계산해 기대값을 적습니다(UTC 10:00 = KST 19:00). 추가 확인으로 `TZ=America/Los_Angeles npm test -- -t "<테스트명>"`과 `TZ=UTC npm test -- -t "<테스트명>"`을 둘 다 실행해 결과가 같아야 합니다.
- 테스트 이름은 동작을 설명하는 영어 문장으로 씁니다(기존 관례). 예: `it('keeps the check-in window closed when the start time cannot be parsed', ...)`.

### 2-4. 화면 확인
- 자동 뷰포트 측정 도구는 없습니다(Playwright 도입 보류). UI 티켓은 `npm run dev`로 띄워서 브라우저 개발자 도구의 기기 모드(375×667, 375×548, 360×740, 390×844)로 확인하고, **무엇을 확인했는지** 보고에 적습니다. 확인할 수 없는 환경이면 "화면 확인 못 함"이라고 정직하게 적습니다.

---

## 3. 티켓 목록과 순서

```
Phase 1 (셸·오늘·일정)
  P1-01 → P1-02 → P1-03 → P1-04 → P1-05     (순수 함수: 화면 변화 없음)
  → P1-06 (셸/라우팅) → P1-07 (오늘 탭) → P1-08 (상세 시트) → P1-09 (일정 탭)
  → P1-10 (QR·RSVP 정리) → P1-11 (새로고침 비용, 질문 필수) → P1-12 (문서)
Phase 2a (연습곡 데이터)  — P1 완료와 무관하게 시작 가능
  P2a-01 → P2a-02 (질문 필수) → P2a-03 → P2a-04 → P2a-05
Phase 2b (R2·플레이어)   — P1-06과 P2a-04 완료 후
  P2b-01 → P2b-02 → P2b-03 → P2b-04 → P2b-05 → P2b-06 (실기기, 사용자)
Phase 3 (내 활동)         — P1-06 완료 후
  P3-01 → P3-02 → P3-03 → P3-04
```

**순수 함수 티켓(P1-01~05)을 먼저 하는 이유**: 화면을 바꾸기 전에 판정 로직을 테스트로 고정해야, 화면을 옮기는 동안 동작이 몰래 바뀌는 것을 잡을 수 있습니다. 이 순서를 바꾸지 마세요.

---

## 4. 티켓 상세

> 각 티켓의 "명세" 항목은 MEMBER_UX_AUDIO_SPEC.md의 절 번호입니다. 티켓을 시작하기 전에 해당 절을 **처음부터 끝까지** 읽습니다.

---

### Phase 1 — 셸, 오늘, 일정

#### P1-01. 출석 창·투표 마감 시간 계산을 KST로 고정하고 60분 상수 통합
- **명세**: §2-3 (CTA 상태 아래 목록)
- **파일**: `src/utils/timeWindow.ts`, `src/utils/timeWindow.test.ts`
- **현재 문제 (직접 확인됨)**
  - `getCheckInWindowState()`와 `isRsvpOpenForSchedule()`가 `new Date(\`${schedule.date}T${HH}:${mm}:00\`)`로 시각을 만듭니다. 시간대 표시가 없어 **기기의 시간대**로 해석됩니다. 해외 시간대 기기에서 창이 몇 시간 밀립니다.
  - `isRsvpOpenForSchedule()`는 파싱 실패 시 `catch { return true; }`로 **열림** 처리합니다.
  - 출석 창 기본값 60(`openBeforeMinutes`)과 투표 마감 기본값 60(`closeBeforeMinutes`)이 따로 하드코딩되어 있습니다.
- **할 일**
  1. 파일 상단에 `export const CHECKIN_OPEN_BEFORE_MIN = 60;`과 `export const RSVP_CUTOFF_BEFORE_MIN = CHECKIN_OPEN_BEFORE_MIN;`을 추가하고, 두 함수의 기본값을 이 상수로 바꿉니다.
  2. 일정 날짜·시각을 KST로 해석하는 내부 함수 하나(예: `parseScheduleKST(date, 'HH:mm')`)를 만들고 두 함수 모두 이것을 씁니다. 문자열 끝에 `+09:00`을 붙여 `new Date('2026-11-20T19:30:00+09:00')`처럼 만듭니다.
  3. `HH:mm` 형식이 아니거나 숫자가 아니면(`NaN`) **닫힘**으로 처리합니다. `getCheckInWindowState`는 `isOpen: false`, `status: 'WINDOW_CLOSED'`, 메시지 `'일정 시간 오류, 운영진에게 문의해 주세요.'`를 돌려줍니다. `isRsvpOpenForSchedule`은 `false`를 돌려줍니다.
  4. 자정을 넘는 연습(종료 ≤ 시작) 처리는 그대로 유지합니다.
- **하지 말 것**: 함수 이름이나 반환 타입 바꾸기, `forceBypassForTesting` 제거, 호출하는 컴포넌트 수정.
- **테스트 (모두 추가)**
  - 정확히 시작 60분 전: 출석 창 열림 && 투표 마감 (경계값, 둘이 같은 순간에 바뀌는지)
  - 시작 60분 1초 전: 출석 창 닫힘 && 투표 가능
  - UTC 시각으로 만든 `now`에서 KST 기준으로 판정되는지 (예: `2026-11-20T10:00:00Z` = KST 19:00)
  - 23:00~01:00 자정 넘김 연습에서 00:30 KST에 열림
  - `startTime: '7시'`, `''`, `'25:99'` → 출석 닫힘, 투표 닫힘
  - `CHECKIN_OPEN_BEFORE_MIN === RSVP_CUTOFF_BEFORE_MIN` 고정 테스트
- **완료 조건**: 기존 `timeWindow.test.ts` 전부 통과, `TZ=America/Los_Angeles`와 `TZ=UTC`에서 새 테스트 결과가 같음.

#### P1-02. 해시 라우팅 순수 함수
- **명세**: §2-2
- **파일 (신규)**: `src/utils/route.ts`, `src/utils/route.test.ts`
- **할 일**: 명세 §2-2의 `MemberTab`, `Overlay`, `Route` 타입을 그대로 옮기고 다음 세 함수를 만듭니다. **이 티켓에서는 App.tsx에 연결하지 않습니다.**
  - `parseRoute(hash: string): Route` — 형식: `#/today`, `#/calendar?m=2026-11&d=2026-11-20`, `#/calendar?d=2026-11-20&sheet=1&sid=sch_1`, `#/profile`, `#/admin`, `#/super`. 모르는 형식, 빈 문자열, `#/` → `{ area: 'member', tab: 'today' }`. Phase 2 전까지 `#/studio`도 today로 처리합니다.
  - `formatRoute(route: Route): string` — `parseRoute(formatRoute(r))`가 `r`과 같아야 합니다(왕복).
  - `navReducer(route, action)` — action: `{ type: 'TAB', tab }`, `{ type: 'OPEN', overlay }`, `{ type: 'CLOSE' }`, `{ type: 'ADMIN' }`, `{ type: 'SUPER' }`, `{ type: 'RESET' }`. 반환값은 `{ route, history: 'push' | 'replace' | 'none' }`. 규칙은 명세 §2-2 그대로입니다: 탭 전환은 replace(단, today에서 다른 탭으로 처음 갈 때만 push), 오버레이 열기는 push, RESET은 replace로 `#/today`.
- **테스트**: 모든 형식 왕복, 잘못된 입력(`#/calendar?m=abc`) → 월 정보 없음, 날짜 검증(`2026-13-40` 무시), 명세 §6-1 5번 시퀀스(오늘→일정→시트 열기→CLOSE→뒤로)를 reducer로 재현.
- **하지 말 것**: `window.location` 직접 접근. 이 파일은 문자열만 다룹니다.

#### P1-03. 오늘 집중 일정 선택을 순수 함수로 추출 (화면 변화 없음)
- **명세**: §2-3, 처리표 `useTodayFocus`
- **파일**: `src/utils/todayFocus.ts`(신규), `src/utils/todayFocus.test.ts`(신규), `src/components/HomeView.tsx`
- **현재 코드**: `HomeView.tsx`의 `getSchedulePriorityScore`(약 230행 `useCallback`)와 `activeDateSchedules` 계산(약 255~298행), `activeSchedule`(약 301행)이 컴포넌트 안에 있습니다.
- **할 일**
  1. 이 로직을 **동작 그대로** `todayFocus.ts`로 옮깁니다: `getSchedulePriorityScore(schedule, member, now)`와 `selectTodayFocus({ schedules, member, now, todayStr, selectedId })`. 반환값은 `{ mode: 'TODAY' | 'NEXT' | 'NONE', schedules: Schedule[], focus?: Schedule, dDay?: number }`.
  2. `HomeView.tsx`는 이 함수를 호출하도록 바꿉니다. **화면 출력은 한 글자도 바뀌면 안 됩니다.**
  3. 입력 `schedules`는 반드시 `sheetsService.getSchedulesForMember(memberId)`의 결과여야 합니다(숨김 일정 보호). 함수 주석에 이 전제를 적습니다.
- **테스트**: 오늘 1개, 오늘 3개(진행 중 > 예정 > 마감 순서, 필참 가산점), 오늘 전부 마감 → NEXT + dDay, 일정 없음 → NONE, 취소·보관 제외, 자정 넘김, `selectedId`가 목록에서 빠지면 첫 번째로 되돌림.
- **완료 조건**: 기존 `HomeView.test.tsx` 6개 시나리오가 **수정 없이** 통과. 이 테스트를 고쳐야 통과한다면 추출이 잘못된 것입니다.

#### P1-04. CTA 상태 판정 함수
- **명세**: §2-3 CTA 상태 표 (10개 상태 + OFFLINE)
- **파일 (신규)**: `src/utils/todayCta.ts`, `src/utils/todayCta.test.ts`
- **할 일**: `deriveTodayCta(input)` 하나를 만듭니다. 입력: `schedule`, `now`, `isRequired`(대상 여부), `myVote`(없으면 undefined), `myReconciled`(확정 판정 결과, `sheetsService.reconcileAttendance()`에서 내 대표 ID 항목), `isOnline`. 반환은 판별 유니언 `{ kind: 'CANCELLED' } | { kind: 'RSVP_NEW' } | ... | { kind: 'ATTENDED', time: string } ...`.
  - 판정 순서: 취소 → 확정 결과(출석/지각/운영진 인정/운영진 결석/사유결석) → 출석 창 열림(오프라인이면 OFFLINE) → 투표 가능 → 마감 후 대상 미출석 → 마감 후 비대상.
  - **"완료" 계열은 오직 `myReconciled`에서만** 나옵니다. 방금 QR을 찍었다는 화면 상태로 완료를 만들지 않습니다(확정된 출석 규칙).
  - 시간 판정은 P1-01의 `getCheckInWindowState`, `isRsvpOpenForSchedule`만 씁니다. 시간 계산을 새로 쓰지 않습니다.
  - 상태 이름이 `reconcileAttendance` 결과의 어떤 값에 대응하는지 먼저 `src/utils/attendanceStats.ts`의 `reconcileSingleMemberAttendance`를 읽고 표로 정리해 보고에 첨부합니다. **명세 표와 맞지 않는 값이 있으면 멈추고 질문합니다.**
- **테스트**: 표의 모든 상태 각 1개 이상, 정확히 60분 전 경계, 출석 후에도 창이 열려 있을 때 ATTENDED(다시 출석 버튼 없음), 오프라인 + 창 열림 → OFFLINE, 오프라인 + 이미 출석 → ATTENDED.

#### P1-05. 작은 순수 함수 묶음
- **명세**: §2-3, §2-4, §7-1
- **파일**: `src/utils/kakaoMaps.ts`(함수 추가), `src/utils/date.ts`(함수 추가), `src/utils/rsvpTally.ts`(함수 추가), `src/utils/calendar.ts`(함수 추가), 각 `.test.ts`
- **할 일**
  - `buildKakaoMapLink({ name, lat, lon })`: 좌표가 둘 다 유한한 숫자면 `https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lon}`, 아니면 `https://map.kakao.com/link/search/${encodeURIComponent(name)}`, 이름이 비면 `null`. 기존 `kakaoMaps.ts`의 SDK 로딩 코드는 건드리지 않습니다.
  - `computeDDay(targetDate: 'YYYY-MM-DD', now: Date): number` — KST 날짜 기준(`getKSTDateString` 사용).
  - `countCheckedIn(reconciled, members)`: 출석·지각·운영진 인정인 **대표 단원 ID** 수. 병합된 ID는 `resolveMergedMemberIds`로 합쳐 중복을 셉니다.
  - `groupSchedulesByDate(schedules): Map<string, Schedule[]>` — 시작 시각 순 정렬.
  - `getCategoryDotKind(category: string)`: 알려진 카테고리 문자열은 기존 `HomeView`/`CalendarView`의 점 색상 규칙과 같은 종류를 돌려주고, 모르는 값과 직접 입력 값은 `'default'`입니다. 원문을 바꾸지 않습니다.
- **테스트**: 각 함수 경계값 (특수문자·한글 장소명 인코딩, KST 자정 직전·직후, 월말, 병합 ID 2개가 같은 사람이면 1명, 모르는 카테고리).

#### P1-06. 앱 셸, 헤더, 하단 탭, 해시 라우팅 연결
- **명세**: §2-1, §2-2, §2-6 표
- **파일**: `src/App.tsx`, `src/components/AppHeader.tsx`(신규), `src/components/BottomNav.tsx`(신규), `src/hooks/useMasterEntryGesture.ts`(신규), `src/hooks/useHashRoute.ts`(신규), `src/components/HomeView.tsx`(헤더 부분 제거), `src/index.css`, 관련 테스트
- **할 일 (순서대로)**
  1. `useHashRoute()` 훅: `window.location.hash`를 `parseRoute`로 읽고, `popstate`/`hashchange`를 구독하고, `navigate(action)`이 `navReducer` 결과에 따라 `history.pushState`/`replaceState`를 부릅니다.
  2. `App.tsx`의 `currentView` 상태를 이 훅으로 바꿉니다. `'HOME'` → `today`, `'CALENDAR'` → `calendar`, `'ADMIN'` → admin, `'SUPER_ADMIN'` → super. **관리자 세션 확인 로직(`isAdminLoggedIn` 30초 검사 등)은 그대로 유지**하고, 만료 시 `navigate({ type: 'RESET' })`를 부릅니다.
  3. `HomeView`의 헤더(로고, 이스터에그 제스처, 톱니 버튼)를 `AppHeader`로 옮기고, 이스터에그 제스처 코드는 `useMasterEntryGesture`로 분리합니다. **동작(우클릭, 3연타, 햅틱)은 그대로**입니다. 관리자·최고관리자 화면에서는 `AppHeader`를 렌더하지 않습니다.
  4. `BottomNav`: `<nav aria-label="주요 메뉴">` 안에 버튼 3개(오늘, 일정, 내 활동). 현재 탭에 `aria-current="page"`. 버튼은 최소 44×44px. 텍스트와 활성 표시선만 씁니다(아이콘·이모지 없음).
  5. `profile === null`이면 지금처럼 `BindingModal`만 렌더하고 탭 바는 렌더하지 않습니다. 이때 들어온 해시는 보관했다가 연동 완료 후 적용합니다.
  6. CSS: `:root`에 `--bottom-nav-h: 56px;`, `--mini-player-h: 0px;`, `--bottom-chrome-h: calc(var(--bottom-nav-h) + var(--mini-player-h) + env(safe-area-inset-bottom));`. 회원 화면 `main`에 `padding-bottom: var(--bottom-chrome-h)`. `.sync-status-pill`(약 6484행)의 `bottom`을 `calc(var(--bottom-chrome-h) + 8px)`로 바꿉니다.
  7. 이 티켓에서 `내 활동` 탭은 **임시로 기존 `MemberPortalModal`을 여는 버튼 역할**만 합니다(P3-03에서 교체). 명세 §2-1의 "Phase 1은 3탭"을 지키기 위함입니다.
- **하지 말 것**: 오늘 탭 카드 내용 수정(P1-07), 달력 수정(P1-09), 모달들의 내부 수정.
- **테스트**
  - `BottomNav` 렌더: 버튼 3개, 현재 탭 `aria-current`, 텍스트에 이모지 없음(`/\p{Extended_Pictographic}/u` 검사).
  - App 렌더: profile 없음 → 탭 바 없음.
  - 뒤로 가기: 일정 탭에서 `popstate` → 오늘 탭.
- **화면 확인**: 375×667에서 탭 바, 동기화 알약, 하단 안전 영역이 겹치지 않음. 관리자 화면 진입·이탈 동작.

#### P1-07. 오늘 탭
- **명세**: §2-3 전체
- **파일**: `src/components/TodayTab.tsx`(신규, `HomeView` 대체), `src/components/home/HomeActiveScheduleCard.tsx`(경량화), `src/components/HomeView.test.tsx` → `src/components/TodayTab.test.tsx`로 이동
- **할 일**
  1. `TodayTab`은 P1-03 `selectTodayFocus`, P1-04 `deriveTodayCta`, P1-05 함수들만 써서 화면을 만듭니다. 판정 로직을 컴포넌트 안에 새로 쓰지 않습니다.
  2. 카드에 남기는 것: 제목, 시간, 장소 + 카카오맵 링크(새 창, `rel="noopener noreferrer"`), "필참"/"자율 참여" 텍스트 배지, CTA, "상세 보기" 버튼. 설명은 2줄로 자릅니다.
  3. 카드에서 **빼는 것**: 투표 집계 명단(`HomeRsvpTallySection`), 댓글(`ScheduleComments`), 게이지(`LiquidGauge`), 긴 설명. 이것들은 P1-08 상세 시트로 갑니다. **삭제하지 말고 import만 옮깁니다.**
  4. 같은 날 여러 일정: "오늘 일정 1/2" + 이전/다음 버튼(각 44px). 점 표시는 장식(`aria-hidden="true"`)이고 클릭 이벤트를 달지 않습니다.
  5. "현재 N명 출석"은 `countCheckedIn`으로 계산하고 옆에 "HH:mm 기준"을 표시합니다. 새 네트워크 요청을 만들지 않습니다.
  6. 출석 완료 상태는 버튼이 아닌 텍스트 표시로 바꿉니다("다시 출석 체크하기" 버튼 제거).
  7. QR 버튼은 `onOpenQr(schedule.id)`로 **scheduleId를 명시**해 부릅니다.
  8. 일정 탭으로 가는 링크는 P1-06의 `navigate`를 씁니다.
- **테스트**: 기존 6개 시나리오를 `TodayTab.test.tsx`로 옮겨 통과(문구가 명세에 따라 바뀐 것만 기대값 수정, 수정한 줄마다 이유를 보고). 추가: CTA 상태별 렌더 4개 이상, 이모지 0건, 출석 완료 시 버튼 없음, 일정 없음(NONE) 카드.
- **화면 확인 (필수, 보고에 기록)**: 375×548, 375×667, 360×740, 390×844에서 `RSVP_NEW`, `CHECKIN_OPEN`, `ATTENDED` 상태일 때 CTA가 스크롤 없이 보이는지. 조건: 제목 2줄, 장소 1줄, 전환 컨트롤 포함. **안 되면 문구나 간격을 임의로 줄이지 말고 보고합니다.**

#### P1-08. 일정 상세 시트
- **명세**: §2-4
- **파일**: `src/components/ScheduleDetailSheet.tsx`(신규), `src/components/ScheduleDetailBody.tsx`(신규), 테스트
- **할 일**
  1. `ScheduleDetailBody`: 카드 정보 + `HomeRsvpTallySection` + `ScheduleComments`를 조립합니다(기존 컴포넌트 재사용, 내부 수정 금지).
  2. `ScheduleDetailSheet`: 화면 아래에서 올라오는 시트. `role="dialog"`, `aria-modal="true"`, 제목에 `aria-labelledby`. 열릴 때 시트 안 첫 버튼으로 포커스를 옮기고, Tab이 시트 밖으로 나가지 않게 하며, 닫히면 연 버튼으로 포커스를 돌려줍니다.
  3. 닫기: 닫기 버튼(44px), Esc, 배경 탭, 뒤로 가기(라우트 오버레이 CLOSE). 아래로 끌어 닫기는 Pointer Events + `transform`으로 구현하고, 80px 이상 끌면 닫힙니다.
  4. `@media (prefers-reduced-motion: reduce)`에서는 애니메이션을 끕니다.
  5. 그날 일정이 여러 개면 시간순 목록을 먼저 보여 주고, 하나를 고르면 상세로 갑니다. 일정이 1개면 바로 상세입니다.
  6. 숨김 일정 ID나 없는 ID → "볼 수 없는 일정입니다" 한 줄만 표시합니다.
- **테스트**: Esc로 닫힘, 닫기 버튼으로 닫힘, 포커스 복귀, 일정 2개 → 목록 → 선택 → 상세, 없는 ID → 안내 문구.

#### P1-09. 일정 탭과 `CalendarView` 폐기
- **명세**: §2-4
- **파일**: `src/components/home/HomeCalendarSection.tsx` → `src/components/MonthCalendarGrid.tsx`(이름 변경·승격), `src/components/CalendarTab.tsx`(신규), `src/components/CalendarView.tsx`(**삭제**), `src/components/home/HomeUpcomingListSection.tsx`(일정 탭으로 이동), 이 파일들을 import하는 곳, 테스트
- **할 일**
  1. `HomeCalendarSection`을 `MonthCalendarGrid`로 옮기고 날짜 클릭 시 `onSelectDate(date)`를 부르게 합니다. 점 색상은 P1-05 `getCategoryDotKind`.
  2. `CalendarTab`: 상단 `MonthCalendarGrid`, 하단 다가오는 일정 3개. 날짜 클릭 → P1-08 시트(라우트 오버레이 push). 보던 월은 라우트 `m`으로 유지합니다.
  3. `CalendarView.tsx` 삭제 전, `grep -rn "CalendarView" src`로 모든 사용처를 찾아 보고에 적고 모두 `CalendarTab`이나 라우트 이동으로 바꿉니다. **`AdminCalendarView`는 관리자용이므로 건드리지 않습니다.**
  4. 투표가 마감된 일정에서는 투표 버튼 대신 "투표 마감" 텍스트를 보여 줍니다.
- **테스트**: 날짜 클릭 → 시트 오버레이, 월 이동 후 탭 전환했다 돌아와도 월 유지, 모르는 카테고리 점 = 기본 점.
- **완료 조건**: `grep -rn "from './CalendarView'\|from '../CalendarView'" src` 결과 0건.

#### P1-10. QR 대상 일정 명시와 RSVP `alert()` 제거
- **명세**: §2-3, §2-4
- **파일**: `src/App.tsx`(약 212행 `currentSchedule`), `src/components/RSVPModal.tsx`
- **할 일**
  1. `currentSchedule`의 "오늘 첫 일정으로 대체" 경로를 지웁니다. QR 모달은 `qrTargetSchedule`이 있을 때만 엽니다. 없으면 열지 않고 오늘 탭으로 갑니다.
  2. `RSVPModal`의 `alert()`(약 30~50행)를 모달 안 메시지 영역으로 바꿉니다. 마감 시 모달을 자동으로 닫지 않고 메시지를 보여 줍니다.
- **테스트**: `qrTargetSchedule` 없음 → QR 모달 렌더 안 됨. 마감된 일정 제출 → `alert` 미호출(`vi.spyOn(window, 'alert')`), 화면에 마감 문구.

#### P1-11. 백그라운드 새로고침 비용 점검 — **시작 전에 사용자에게 질문 필수**
- **명세**: §5 Phase 1 5번
- **현재**: Supabase 모드에서 화면이 보이는 동안 **30초마다 전체 스냅샷을 강제로 다시 받습니다**(`src/App.tsx`, `src/services/realtime/supabaseRealtime.ts`). 실시간 구독이 이미 있는데 별도로 폴링합니다.
- **할 일**: 먼저 해당 코드를 찾아 "몇 초마다, 어떤 조건에서, 무엇을 받는지"를 보고하고, 다음 선택지를 사용자에게 묻습니다. **답을 받기 전에는 코드를 바꾸지 않습니다.**
  - A: 실시간 연결 중에는 폴링 간격을 5분으로 늘리고, 연결이 끊기면 30초로 돌아감 (권장)
  - B: 그대로 둠
- **완료 조건(A 선택 시)**: 탭 전환만으로 원격 읽기가 생기지 않음을 테스트로 고정.

#### P1-12. 문서 갱신
- **파일**: `docs/ARCHITECTURE_RECOVERY.md`, `docs/tasks.md`, `docs/DEV_LOG.md`, 이 문서의 §1 상태표
- **할 일**: 홈에서 달력을 뺀 것은 이전 Task 16 / 계획서 04 결정을 되돌린 것임을 사유와 함께 `ARCHITECTURE_RECOVERY.md`에 기록합니다. `tasks.md`에 완료 티켓을 체크합니다. 새 결정이 없으면 새로 만들어 적지 않습니다.

---

### Phase 2a — 연습곡 데이터

#### P2a-01. 타입 추가
- **명세**: §4-4
- **파일**: `src/types/rollbook.ts`, `src/types/schema.test.ts`
- **할 일**: 명세 §4-4의 인터페이스를 **그대로** 추가합니다. `AppConfig`에 optional `mediaPublicBaseUrl?: string`, `practiceTrackKinds?: string[]`를 추가합니다. 기존 타입은 바꾸지 않습니다.
- **테스트**: 새 키가 없는 기존 `AppConfig` 객체가 그대로 타입 검사를 통과하는지(`schema.test.ts` 관례 따름).

#### P2a-02. 마이그레이션 SQL 작성 — **적용은 사용자, 작성 후 질문 필수**
- **명세**: §4-1, §4-2
- **파일 (신규)**: `supabase/migrations/20261122000000_practice_catalog.sql`, `supabase/tests/practice_catalog_check.sql`
- **할 일**
  1. 명세 §4-1의 테이블 3개를 그대로 만듭니다. 모든 `create`는 `if not exists`로 써서 반복 실행해도 안전하게 합니다.
  2. 세 테이블에 RLS를 켜고(`enable row level security`) 정책은 만들지 않습니다. `revoke all on table ... from public, anon, authenticated;`
  3. 세 테이블에 행 삭제를 막는 트리거를 둡니다(기존 `prevent_raw_log_mutation`과 같은 방식, 단 UPDATE는 허용).
  4. `updated_at` 자동 갱신 트리거.
  5. 명세 §4-2의 RPC 7개를 만듭니다. **쓰기 RPC 6개는 반드시 아래 템플릿으로 시작합니다.**
     ```sql
     create or replace function fn_save_practice_piece(p_payload jsonb)
     returns jsonb
     security definer
     set search_path = public, extensions
     language plpgsql as $$
     begin
       if not fn_check_admin_token(p_payload->>'adminToken', 'admin') then
         return fn_admin_auth_required();
       end if;
       -- 이후 본문에서는 p_payload->>'adminToken'을 절대 저장하지 않는다
       ...
     end;
     $$;
     ```
  6. `fn_save_practice_track`은 `url`이 비어 있지 않으면 `https://`로 시작해야 하며, 아니면 `{success:false, message:'https 주소만 저장할 수 있습니다.'}`를 돌려줍니다. `source_type`은 `lower(trim(...))`만 하고 모르는 값도 저장합니다.
  7. `fn_set_program_pieces`와 `fn_reorder_practice_tracks`는 하나의 함수 안에서 처리합니다(함수 하나 = 트랜잭션 하나). 중간에 실패하면 `raise exception`으로 전체를 되돌립니다.
  8. 읽기 RPC `fn_get_practice_catalog(p_include_archived boolean default false)`는 토큰 없이 anon이 읽을 수 있습니다. 단 `p_include_archived = true`는 관리자 화면용이므로 이 경우만 `p_token text default null` 인자로 토큰을 확인합니다(토큰이 없으면 보관 항목 제외).
  9. **기존 `fn_delete_program_card` 보완**: 연결된 연습곡이 있으면 실패 메시지를 돌려주도록 바꿉니다. 이때 **반드시 `fn_delete_program_card__impl`을 `create or replace`** 합니다(§1-1). `fn_delete_program_card`(래퍼)는 건드리지 않습니다.
  10. 파일 마지막에 새 RPC 7개만 `grant execute ... to anon, authenticated;`, 그리고 `notify pgrst, 'reload schema';`.
  11. `practice_catalog_check.sql`: Phase 0의 `supabase/tests/security_hardening_check.sql` 형식을 복사해, anon으로 쓰기 RPC 6개가 토큰 없이 `ADMIN_AUTH_REQUIRED`를 돌려주는지, 세 테이블 DELETE가 거부되는지(트리거 존재 확인으로 대체 가능), `__impl` 실행 권한이 anon에 없는지를 **데이터를 바꾸지 않고** 확인합니다.
- **검증 방법**: 로컬에 PostgreSQL이 있으면 빈 DB에 `supabase/migrations/*.sql`을 파일명 순서대로 적용한 뒤 새 파일을 **두 번** 적용하고 check 스크립트를 실행합니다. 로컬 DB가 없으면 "SQL 실행 검증 못 함"이라고 보고합니다. **운영 DB에서 시험하지 않습니다.**
- **완료 후 질문**: "마이그레이션 파일과 검증 스크립트가 준비됐습니다. 운영 DB 적용은 사용자께서 SQL Editor에서 진행해 주세요"라고 보고하고 기다립니다. P2a-03~05는 적용 전에도 코드 작성은 가능하지만, 사용자 확인 없이 "동작 완료"라고 보고하지 않습니다.

#### P2a-03. 백엔드 매핑, 파서, 재생 방식 판정
- **명세**: §3-3, §4-3
- **파일**: `src/services/backend/supabaseBackend.ts`, `src/services/sheetsParser.ts`, `src/utils/practiceMedia.ts`(신규), 각 테스트
- **할 일**
  1. `supabaseBackend.ts`의 `mapActionToRpc`에 액션 7개를 추가합니다. `GET_PRACTICE_CATALOG`의 본문 형식은 `formatRpcBody`에서 `{ p_include_archived, p_token }`으로 만듭니다(토큰은 `getActiveAdminToken()`). 나머지는 기존처럼 `p_payload`.
  2. `sheetsParser.ts`에 `parsePracticeCatalog(raw: unknown): PracticeCatalog`. camelCase·snake_case 둘 다 받기, 빠진 필드 기본값, `kind`·`source` 원문 보존, **행을 걸러내지 않기**(id가 없는 행은 `orphan_${index}` id를 붙여 보존하고 `console.warn`), `archived_at` → `isArchived`, 잘못된 입력 → 빈 카탈로그.
  3. `practiceMedia.ts`: `resolveTrackUrl(track, baseUrl)`, `resolveTrackPlayback(track, config): TrackPlayback`, `buildStudioView(catalog, programCards)`. 규칙은 명세 §3-3 표 그대로입니다. `r2`만 `mode: 'audio'`이고, `drive`·`youtube`·모르는 값은 `external_link`, https가 아니거나 비면 `unavailable`.
  4. `storageKey` 합성: `baseUrl` 끝 슬래시와 key 앞 슬래시를 정리하고, key의 각 경로 조각을 `encodeURIComponent`로 인코딩합니다(슬래시는 유지).
- **테스트**: 명세 §7-1 표의 Phase 2a 행 전부. 특히: 한글 파일명 인코딩, `javascript:alert(1)` → unavailable, `http://` → unavailable, YouTube `watch`·`youtu.be`·`shorts` → external_link, 두 시즌에 걸친 곡이 각 섹션에 한 번씩.

#### P2a-04. `SheetsService` 메서드
- **명세**: §4-3
- **파일**: `src/services/sheets.ts`, `src/services/sheetsStorage.ts`, `src/services/sheets.test.ts`
- **할 일**: 명세 §4-3의 메서드 8개. 쓰기는 **서버 확인 후에만** 로컬 캐시를 바꾸고, 실패하면 예외를 던집니다(기존 `saveProgramCard`의 확인형 저장 방식 참고: `sendToGoogleSheet` 결과 `success` 확인 후 반영). `backend.kind === 'gas'`이면 `refreshPracticeCatalog`는 **네트워크를 부르지 않고** 빈 카탈로그를 돌려줍니다. 초기 스냅샷(`fetchRemoteData`)에는 넣지 않습니다.
- **테스트**: GAS 모드에서 `fetch` 미호출, 성공 시 캐시 저장, 실패 시 이전 캐시 유지 + 예외, 쓰기 실패 시 로컬 변경 없음, 보관 메서드가 보관 액션만 보냄(삭제 액션 없음).

#### P2a-05. 운영진 "연습곡" 관리 화면
- **명세**: §3-6, §5 Phase 2a 3번
- **파일**: `src/components/admin/AdminPracticeTab.tsx`(신규), `src/components/AdminDashboard.tsx`(탭 추가만), 테스트
- **할 일**: 명세 항목 그대로 — 곡 목록(활성/보관 필터, 보관·복원, **삭제 버튼 없음**), 시즌 카드별 곡 연결과 순서(위/아래 버튼 44px), 트랙 편집(라벨, 종류: 설정 목록 + 직접 입력, 출처, 경로/URL, 순서, 보관), **입력 즉시 `resolveTrackPlayback` 결과 미리보기**. 저장 실패 시 서버 메시지를 그대로 화면에 보여 줍니다.
- **하지 말 것**: 파일 업로드 기능(명세 D2: 업로드는 Cloudflare 대시보드에서 수동), 다른 관리자 탭 수정.
- **테스트**: 삭제 버튼 0개, `http://` 입력 시 저장 버튼 비활성 + 안내, 직접 입력한 종류 원문 유지.

---

### Phase 2b — R2, Worker, 연습실, 플레이어

#### P2b-01. Worker 소스
- **명세**: §3-2
- **파일 (신규)**: `workers/media/index.js`, `workers/media/README.md`
- **할 일**: 명세 §3-2의 요구사항을 **전부** 구현합니다. GET/HEAD만, 정확한 키만(목록 없음), Range → 206 + `Content-Range` + `Accept-Ranges: bytes`, 허용 출처만 CORS(허용 목록은 파일 상단 상수, 값은 사용자에게 물음), 노출 헤더, `Cache-Control`. R2 접근은 바인딩 이름 `MEDIA_BUCKET`으로만. 50줄을 넘기지 않도록 단순하게 씁니다.
- **README**: Cloudflare 대시보드에서 Worker 만들기 → 코드 붙여넣기 → R2 바인딩 `MEDIA_BUCKET` 연결 → 배포 → `curl -I -H "Range: bytes=0-1023" <주소>/<키>`로 206 확인, 순서를 번호 목록으로 씁니다. `wrangler` 설치를 안내하지 않습니다.
- **주의**: 이 파일은 `npm run build`/`lint` 대상이 아닐 수 있습니다. `oxlint`가 이 폴더를 검사하며 오류를 내면 보고합니다(설정을 임의로 바꾸지 않음).

#### P2b-02. 전역 오디오 플레이어
- **명세**: §3-4 전체
- **파일 (신규)**: `src/components/audio/AudioPlayerProvider.tsx`(context + 단일 `<audio>`), `src/components/audio/MiniPlayer.tsx`, `src/utils/audioQueue.ts`(순수 함수), 테스트. `src/App.tsx`는 Provider로 감싸기만.
- **핵심 규칙 (어기면 반려)**
  - `<audio>` 요소는 **앱 전체에 하나**이고, Provider 안에서 `useRef`로 만들며 탭 전환으로 언마운트되지 않는 위치(App 루트, 라우트 분기 바깥)에 둡니다.
  - 다음 곡은 **같은 요소의 `src`를 바꿔** 재생합니다. 두 번째 `Audio` 객체를 만들지 않습니다.
  - 기본값: 한 곡 반복 켜짐, 자동 다음 곡 꺼짐. `preload="metadata"`. Web Audio API(`AudioContext`) 사용 금지.
  - MediaSession: `'mediaSession' in navigator`일 때만 설정합니다. 핸들러 5개와 `setPositionState`.
  - 배속 0.8/1.0/1.2, `preservesPitch = true`, 10초 앞/뒤.
  - `mode !== 'audio'`인 트랙은 큐에 넣지 않습니다(`audioQueue.ts`에서 걸러 내고 테스트).
  - `play()`가 거부되면 "탭하여 다시 재생" 상태로 바꿉니다.
  - 재생 중이면 `--mini-player-h`를 56px로 설정합니다(P1-06 변수).
  - "미리 받기" 옵션은 이 티켓에서 만들지 않습니다(스트리밍만). 필요하면 별도 티켓으로 묻습니다.
- **테스트**: 탭을 5번 바꿔도 같은 `<audio>` 요소(렌더 테스트에서 `ref` 동일성), YouTube·Drive 트랙 큐 제외, 반복 켜짐일 때 `ended` → 같은 곡 처음부터, MediaSession 미지원 환경에서 오류 없음.

#### P2b-03. 연습실 탭과 QR 일시정지
- **명세**: §3-5, §3-4 (QR 일시정지)
- **파일**: `src/components/StudioTab.tsx`(신규), `src/components/BottomNav.tsx`(탭 추가), `src/utils/route.ts`(`studio` 활성화), `src/components/QRScannerModal.tsx`(열릴 때 `pause()` 호출만), 테스트
- **할 일**: 탭을 열 때만 `refreshPracticeCatalog()`. 시즌별 곡 목록, 곡 상세(악보 링크는 새 창, 트랙별 "재생"/"외부에서 열기"). 파트 필터 없음. GAS 모드면 "준비 중". 어떤 시즌에도 연결되지 않은 곡은 숨김. QR 모달이 열리면 플레이어 `pause()`, 닫혀도 자동 재생하지 않음.
- **테스트**: 파트 필터 없음, 외부 링크 트랙은 `<a target="_blank" rel="noopener noreferrer">`, QR 열림 → pause 호출.

#### P2b-04. iOS 홈 화면 앱 안내
- **명세**: §3-4 iOS 주의
- **파일**: `src/components/StudioTab.tsx`. standalone 판정은 새로 만들기 전에 `src/utils/pwaInstall.ts`와 `src/services/displayMode.ts`에 이미 있는지 먼저 확인하고 있으면 재사용합니다(무엇을 재사용했는지 보고)
- **할 일**: iOS + `display-mode: standalone`일 때만 연습실 상단에 명세 문구("음원은 Safari에서 들으면 화면이 꺼져도 끊기지 않아요")와 Safari로 여는 링크를 보여 줍니다.
- **테스트**: iOS standalone일 때만 표시, 안드로이드·데스크톱에서 미표시(`matchMedia`와 `navigator.userAgent` 목).

#### P2b-05. 운영 안내서
- **파일 (신규)**: `docs/user-guide/practice_audio_upload.md`
- **할 일**: 명세 §3-6 운영 절차를 운영진이 따라 할 수 있는 번호 목록으로 씁니다. 64kbps AAC 변환 방법은 특정 유료 프로그램을 추천하지 말고 "무료 변환 도구"로만 적습니다. 시판 음원은 올리지 않는다는 규칙을 굵게 씁니다.

#### P2b-06. 실기기 테스트 — **사용자 진행, 에이전트는 체크리스트만 준비**
- **명세**: §6-3 13개 항목
- **할 일**: 13개 항목을 표(항목 / iPhone Safari / iPhone 홈 화면 앱 / Android Chrome / 삼성 인터넷 / 비고)로 만든 `docs/plans/16a_studio_device_test_log.md`를 작성하고 사용자에게 넘깁니다. **에이전트가 결과를 지어내서 채우지 않습니다.**

---

### Phase 3 — 내 활동

#### P3-01. 회차별 기록 조립 함수 추출 (화면 변화 없음)
- **파일**: `src/utils/memberRecords.ts`(신규), 테스트, `src/components/MemberPortalModal.tsx`
- **할 일**: `MemberPortalModal`의 RECORDS 표를 만드는 로직을 `buildMemberScheduleRecords({ member, members, schedules, logs, now, includeArchived })`로 **동작 그대로** 옮깁니다. `includeArchived` 기본값은 `false`(현재 동작).
- **완료 조건**: `MemberPortalModal.test.tsx` 수정 없이 통과.

#### P3-02. 운영진 판정 하드코딩 제거
- **파일**: `src/utils/staff.ts`(신규), 테스트, `src/components/HomeView.tsx`(P1-07 이후에는 `TodayTab.tsx`), `src/components/MemberPortalModal.tsx`
- **현재**: `HomeView.tsx`(약 168행)와 `MemberPortalModal.tsx`(약 69행)의 `isStaffAdmin`이 특정 이름과 전화번호 뒷자리를 하드코딩합니다.
- **할 일 — 시작 전 질문 필수**: 운영진을 무엇으로 판정할지(`member.role`의 어떤 값인지, `memberStatus`인지) 사용자에게 묻습니다. 답을 받은 뒤 `isStaffMember(member)`를 만들고 두 곳을 교체합니다. 이 판정은 **메뉴 표시용**일 뿐 권한이 아닙니다(실제 권한은 PIN + 서버 토큰). 주석으로 명시합니다.
- **완료 조건**: `grep -rn "2440" src --include=*.tsx`에서 운영진 판정 관련 결과 0건.

#### P3-03. `MemberPortalModal` → `ProfileTab` 전환
- **명세**: §2-5
- **파일**: `src/components/ProfileTab.tsx`(신규), `src/components/MemberPortalModal.tsx`(삭제 또는 래퍼로 축소, 판단 근거 보고), `src/App.tsx`, `src/components/BottomNav.tsx`, 테스트
- **할 일**: 모달 껍데기를 없애고 탭 화면으로 렌더합니다. 명세 §2-5의 "보여 주는 것"만 남기고 "보여 주지 않는 것"(레벨 카드, 연락처 수정, 기기 잠금 문구)은 렌더하지 않습니다. `getGamifiedAttendanceLevel` 함수와 그 테스트는 **지우지 않습니다.** 표 제목은 "회차별 출결 기록"입니다.
- **테스트**: 레벨·칭호·배지 렌더 0건, 기존 포털 기능 5가지(화면 설정, 앱 설치, 동기화, 바인딩 변경, 로그아웃) 버튼 존재, 운영진 메뉴는 `isStaffMember`일 때만.

#### P3-04. 보관 일정 포함
- **명세**: §2-5 보관 일정 문제
- **파일**: `src/components/ProfileTab.tsx`, `src/utils/memberRecords.ts`, 테스트
- **할 일**: `ProfileTab`에서 `includeArchived: true`로 부릅니다. **`src/utils/attendanceStats.ts`의 통계 함수 기본 동작은 바꾸지 않습니다**(관리자 통계 화면 영향).
- **테스트**: 보관된 과거 일정의 출결이 기록 표에 남음, 관리자 통계 함수 결과는 변화 없음(같은 입력으로 비교).
- **교차 확인**: 명세 §6-4 1번 — 같은 입력에서 내 활동 누적 숫자 = 관리자 통계 숫자(보관 일정 제외 기준)를 테스트로 고정.

---

## 5. 사용자에게 물어야 하는 지점 (한눈에)

| 티켓 | 질문 | 권장 답 |
|---|---|---|
| P1-04 | 확정 판정 값과 명세 CTA 표가 맞지 않을 때 | 보고 후 결정 |
| P1-07 | CTA가 특정 화면 크기에서 스크롤 없이 안 보일 때 | 보고 후 결정 |
| P1-11 | 30초 전체 새로고침을 바꿀지 | A (실시간 연결 중 5분) |
| P2a-02 | 마이그레이션 운영 적용 | 사용자가 SQL Editor에서 적용 |
| P2b-01 | Worker CORS 허용 출처(앱 주소) | 사용자 답 |
| P2b-06 | 실기기 테스트 결과 | 사용자가 기록 |
| P3-02 | 운영진 판정 기준 필드 | 사용자 답 |

---

## 6. 이 저장소에서 자주 하는 실수 (반드시 확인)

1. **`fn_xxx` 래퍼를 덮어써서 보안 검사를 지우는 실수.** 기존 관리자 RPC를 고칠 때는 `fn_xxx__impl`만 고칩니다. 작업 후 `grep -n "create or replace function fn_" <새 마이그레이션>`으로 래퍼 이름이 없는지 확인합니다. 대상 래퍼: `fn_clear_attendance`, `fn_register_member`, `fn_update_member`, `fn_add_member_history`, `fn_delete_member`, `fn_merge_members`, `fn_create_schedule`, `fn_update_schedule`, `fn_delete_schedule`, `fn_batch_delete_schedules`, `fn_batch_update_schedules`, `fn_save_location`, `fn_delete_location`, `fn_save_program_card`, `fn_delete_program_card`, `fn_save_config`, `fn_register_and_bind_member`.
2. **새 내부 SQL 함수에 anon 권한이 남는 실수.** Supabase가 자동으로 부여합니다. 내부 함수는 `revoke all ... from public, anon, authenticated`.
3. **숨김 일정이 새는 실수.** 단원 화면의 일정 목록은 항상 `sheetsService.getSchedulesForMember(memberId)`에서 시작합니다. `getSchedules()`를 단원 화면에서 쓰지 않습니다.
4. **이름으로 사람을 찾는 실수.** 투표·출석·병합은 항상 ID와 `resolveMergedMemberIds`로 판정합니다. `memberName` 비교 금지.
5. **시간을 기기 시간대로 계산하는 실수.** 일정 날짜·시각은 P1-01의 KST 함수, 오늘 날짜는 `getKSTDateString()`만 씁니다. `new Date('YYYY-MM-DDTHH:mm')`(시간대 없음) 금지.
6. **낙관적 "완료" 표시.** 출석·저장 완료는 서버 확인 결과로만 표시합니다. 실패 시 대기열에 넣지 않습니다.
7. **동적 분류를 닫는 실수.** 파트, 출결 상태, 일정 구분, 트랙 종류를 `'소프라노' | '알토'` 같은 닫힌 유니언이나 `switch`의 `default: throw`로 막지 않습니다. 모르는 값은 원문 그대로 보여 줍니다.
8. **행 필터링으로 "정리"하는 실수.** 파서에서 이상한 행을 버리지 않습니다. 기본값을 채워 보존합니다.
9. **테스트에서 현재 시각 사용.** `new Date()`를 테스트 대상 함수 안에서 직접 부르지 말고 인자로 받습니다.
10. **`console.log` 남기기.** 디버깅 출력은 커밋 전에 지웁니다(`console.warn`/`console.error`는 기존 관례대로 오류 경로에만).
11. **"완료"라고 과장하는 실수.** 화면을 직접 확인하지 못했으면 "확인 못 함", SQL을 실행하지 못했으면 "실행 검증 못 함"이라고 씁니다.

---

## 7. Phase 완료 기준 (사용자 검수용)

| Phase | 완료로 볼 수 있는 조건 |
|---|---|
| 1 | P1-01~12 커밋 완료, 명세 §6-1 7개 기준 충족(화면 확인 기록 포함), `CalendarView.tsx` 삭제, 기존 테스트 전부 통과 |
| 2a | 마이그레이션 운영 적용 + `practice_catalog_check.sql` 전부 PASS(사용자 확인), 운영진 화면에서 곡·트랙 등록 가능 |
| 2b | Worker 배포 + 206 응답 확인, 연습실에서 재생, 실기기 13항목 기록(사용자) |
| 3 | 명세 §6-4 5개 기준 충족 |
