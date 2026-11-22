# 17. v3 개발 지시서 — 홈 · 연습실 · 내 활동 · 운영진 연습곡

> 대상: 개발 에이전트
> 명세: [MEMBER_UX_V3_SPEC.md](../MEMBER_UX_V3_SPEC.md) — **모든 동작의 기준.** 이 지시서는 순서·파일·검증 방법을 정한다.
> 시안: Design 아티팩트 "문콰이어 단원 앱 v3 시안" (보드 이름은 티켓에 표기)
> 작성: 리뷰어(Claude), 2026-11-21

---

## 0. 시작 전에 반드시 읽을 것

1. `AGENTS.md` 전체(특히 §1 도메인 불변식, §2 운영 DB 변경 규칙)
2. `docs/MEMBER_UX_V3_SPEC.md` 전체
3. `docs/ARCHITECTURE_RECOVERY.md`의 2026-11-21 항목들
4. 이 문서의 §2 "반복 실수 방지 규칙" — **지난 리뷰 3회에서 실제로 나온 실수 목록이다.** 같은 실수가 다시 나오면 해당 티켓 전체를 반려한다.

---

## 1. 작업 환경

1. **기준 브랜치:** `origin/fix/review-followups`(PR #14~#20의 최종 상태 포함). 여기서 `feat/v3-member-ux`를 새로 만들고, 곧바로 `git merge origin/main`으로 이 지시서와 명세를 가져온다(충돌이 나면 멈추고 보고).
2. **PR은 3번에 나눈다 (2026-11-21 추가).** 각 묶음이 끝나면 PR을 만들고 **리뷰어 검수와 사용자 화면 확인이 끝날 때까지 다음 묶음을 시작하지 않는다.** 머지하지 않는다. 배포하지 않는다(`npm run deploy` 금지).
   - **v3-A (화면 골격):** V3-01, V3-02, V3-07b 중 카탈로그 새 필드 부분, V3-03, V3-04, V3-05, V3-06, V3-06b(새 탭 열기), V3-08, V3-09(압축 제외), **V3-15(공연 단위, 2026-11-22 추가)**. 브랜치 `feat/v3-member-ux` → PR 대상 `fix/review-followups`.
     - v3-A에 필요한 DB 변경(§7-3 열 추가, §7-4의 `fn_authorize_media_upload`, `fn_get_media_usage`, 기존 카탈로그 함수 3개 수정)만 별도 마이그레이션 `20261123000000_v3_media.sql`로 만든다.
   - **v3-B (내 활동 기본):** V3-11. DB 변경 없음. v3-A PR 브랜치에서 이어서 `feat/v3-profile`.
   - **v3-C (활동 기록):** V3-07의 나머지(§7-1, §7-2, `fn_log_listen_session`, `fn_get_member_activity`)를 `20261124000000_v3_activity.sql`로 만든다. 이어서 V3-10, V3-12, V3-13. 브랜치 `feat/v3-activity`.
   - 이미 v3-A 범위를 넘어 작업한 부분이 있으면 지우지 말고 별도 브랜치로 옮겨 두고 보고한다.
3. **커밋:** 티켓 하나 = 커밋 하나 이상. 메시지에 티켓 ID를 넣는다. 예: `feat(studio): V3-03 program scope dropdown`.
4. **Green Bar:** 매 커밋 전에 아래 4개가 모두 통과해야 한다. 린트 경고 수는 시작 시점보다 늘면 안 된다(시작할 때 경고 수를 보고서에 적는다).
   ```
   npm run typecheck && npm run lint && npm test && npm run build
   ```
5. **Worker 테스트:** `workers/media/index.test.js`는 `npm test`(vitest 기본 포함 규칙)에 함께 실행된다. Worker를 고친 티켓은 이 파일이 실제로 실행됐는지 테스트 출력에서 확인해 보고한다.
6. **멈추고 물어야 하는 경우** (답이 올 때까지 해당 티켓 진행 금지, 다른 독립 티켓은 진행 가능):
   - 명세와 실제 코드가 맞지 않을 때(예: 명세에 적힌 함수·열·파일이 없을 때)
   - 티켓에 적힌 파일 외의 파일을 고쳐야 할 때(테스트 파일 제외)
   - 같은 오류를 3번 고쳐도 해결되지 않을 때
   - 명세에 없는 문구가 필요할 때
   - 아래 승인된 2개 외의 npm 패키지가 필요할 때(승인 전 설치 금지)

---

## 2. 반복 실수 방지 규칙 (지난 리뷰에서 실제로 반려된 것)

| # | 규칙 | 지난 실제 사례 | 확인 방법 |
|---|---|---|---|
| R1 | **SQL에 쓰는 테이블·열·함수 이름은 모두 저장소의 마이그레이션에서 `grep`으로 확인한다.** 기억이나 추측으로 쓰지 않는다 | 존재하지 않는 `sort_order`, `target_part` 열과 없는 `fn_verify_admin_session`을 쓴 SQL이 운영 DB에 들어감 | 보고서에 "사용한 기존 식별자 → 정의 위치(파일:행)" 표를 붙인다 |
| R2 | **운영 DB에 SQL을 실행하지 않는다. 사용자에게 실행을 요청하지 않는다.** 마이그레이션 파일을 커밋만 한다 | 사용자에게 SQL 붙여넣기를 여러 번 요청함 | — |
| R3 | **기존 함수를 고칠 때는 그 함수를 정의한 가장 최신 마이그레이션을 찾아(파일명 정렬상 마지막) 본문을 그대로 복사한 뒤 필요한 줄만 바꾼다.** 처음부터 다시 쓰지 않는다. 관리자 RPC 래퍼(`fn_xxx`)는 건드리지 않고 `fn_xxx__impl`만 고친다 | 오래된 정의를 기준으로 덮어써 보안 수정이 되돌아갈 뻔함 | 보고서에 "복사 원본 파일:행"과 원본 대비 diff를 붙인다 |
| R4 | **새 서비스 동작은 Supabase 경로까지 연결한다.** `sheets.ts`에 메서드를 만들면 `supabaseBackend.ts`의 `mapActionToRpc`에도 추가하고 테스트한다 | 기기 연동 해제가 Sheets에서만 되고 Supabase에서는 항상 실패(C6) | `mapActionToRpc` 매핑 테스트 |
| R5 | **기기 저장소 키는 상수에서만 가져온다**(`STORAGE_KEYS`, 이번에 만드는 `PREFERENCE_KEYS`). 문자열을 직접 쓰지 않는다. 모든 읽기·쓰기는 `try/catch` 헬퍼로 한다 | 비상 캐시 초기화가 존재하지 않는 키를 지워 아무것도 안 지움(C5) | `grep -rn "localStorage\." src`에 헬퍼 외 결과 0 |
| R6 | **날짜·시간은 `src/utils/date.ts` 헬퍼로만 다룬다.** `toISOString().slice(0, 10)`, `new Date('YYYY-MM-DD')` 비교, `getDay()` 직접 호출 금지 | "이번 주" 계산이 UTC로 9시간 밀림, `addDaysKST` 시간대 버그(C10) | `grep -rn "toISOString().slice" src` 신규 0 |
| R7 | **CSS는 `src/index.css`에 정의된 변수만 쓴다.** `--color-*` 이름 금지. 컴포넌트에 hex 색 직접 쓰기 금지. 새 토큰은 명세 §6에 있는 것만 추가하고 다크 모드 값도 같이 넣는다 | 정의되지 않은 `--color-*` 변수 때문에 다크 모드가 깨짐(D1), 새 컴포넌트의 맨 hex(C12) | `src/styles/cssVariables.test.ts` 통과 + `grep -rnE "#[0-9A-Fa-f]{6}" src/components` 신규 0 |
| R8 | **터치 타깃 44px 이상.** 아이콘 버튼도 클릭 영역 44×44 | 36px 버튼(C11) | 새 버튼마다 `min-width`/`min-height` 44 확인 |
| R9 | **오류를 숨겨서 통과시키지 않는다.** `@ts-ignore`, `@ts-expect-error`, 운영 코드의 `as any`, `eslint-disable`/`oxlint-disable` 주석, 빈 `catch`, 테스트 삭제·`skip`·기대값을 결과에 맞추기 금지 | 린트 경고 10곳을 끄는 주석으로 덮음(N2) | `git diff`에서 해당 문자열 검색 0 |
| R10 | **테스트는 실제 시나리오를 검사한다.** 버그 수정·로직 티켓은 "수정 전 실패 → 수정 후 통과"를 확인한다 | 선택 유지 테스트가 실제 갱신 시나리오를 검사하지 않음(N3) | 보고서에 "수정 전 실패 출력" 붙이기 |
| R11 | **실시간 데이터 갱신이 화면 상태(선택, 열린 시트, 스크롤, 입력 중 값)를 초기화하지 않게 한다.** id 기준으로 상태를 유지한다 | 상세 시트 선택이 갱신마다 초기화(C7) | 갱신 시뮬레이션 테스트 |
| R12 | **오버레이(시트·전체 화면 플레이어·드롭다운)는 기존 라우트 규칙을 따른다.** 뒤로 가기 = 닫기, 닫을 때 기록 정리, StrictMode 중복 push 금지 | 닫기 시 기록이 남음(C8), 무시된 OPEN이 기록을 쌓음(N4) | `useHashRoute` 테스트 추가 |
| R13 | **RPC 입력을 방어한다.** 길이 제한, 중복 id 거부, 숫자 범위 자르기, 없는 참조 거부 | 트랙 순서에 중복 id 허용(C9), 입력 무제한(C15) | 검증 SQL에 실패 사례 포함 |
| R14 | **참조가 있는 행의 삭제는 DB 오류를 그대로 보이지 않고, 정해진 오류 코드로 돌려준다** | 사용 이력 있는 카드 삭제 시 원시 FK 오류 노출(C3) | — |
| R15 | **하드코딩 금지.** 사람 이름·전화번호·특정 회원 id, 파트·일정 구분·트랙 종류를 닫힌 enum으로 만드는 것 | 특정 개인 정보 하드코딩(Q6) | — |
| R16 | **문구는 명세에 있는 것만.** 설명 부제, 도움말, 툴팁, "~할 수 있어요" 안내를 새로 만들지 않는다(V3) | 결정과 어긋나는 문구 "파트 음원"(C13) | 새 한글 문자열 목록을 보고서에 붙인다 |
| R17 | **병합된 회원을 잊지 않는다.** 회원 기준 집계는 `resolveMergedMemberIds`로 별칭을 합친다 | — (이번 기능에서 위험이 큼) | 병합 회원 테스트 1개 이상 |
| R18 | **범위 밖 수정 금지.** `package.json`, `package-lock.json`, 설정 파일(`vite.config.*`, `tsconfig*`, 린트 설정), 다른 티켓 파일. **예외(2026-11-22 사용자 승인):** `npm install mediabunny pdfjs-dist`로 두 패키지를 추가하는 것만 허용한다. 정확한 버전으로 고정하고(`--save-exact`), `package-lock.json`은 npm이 만든 그대로 커밋한다(손으로 고치지 않음) | — | `git diff --stat` 보고 |
| R20 | **파일 크기 (2026-11-21 추가).** 새 파일은 400줄 이하(테스트 제외). 기존 파일은 이번 작업으로 순증 300줄을 넘기지 않는다. 넘으면 기능 단위로 나눈다 | `AdminPracticeTab.tsx` 1,185줄, `SuperAdminDashboard.tsx` 1,806줄로 비대 | 보고서에 새·수정 파일 줄 수 |
| R21 | **스타일·서비스 위치 (2026-11-21 추가).** `src/index.css`(7,000줄 이상)에는 명세 §6 토큰만 추가한다. 새 화면 스타일은 `src/styles/v3/<화면>.css`를 만들어 해당 컴포넌트에서 import 한다. `src/services/sheets.ts`(2,200줄 이상)에는 백엔드로 넘기는 1~5줄짜리 메서드만 추가하고, 로직은 `src/services/practice/`, `src/services/media/`, `src/utils/` 아래 기능별 파일에 둔다 | 전역 CSS와 서비스 파일 한 곳에 계속 누적됨 | `git diff --stat`에서 두 파일의 순증 줄 수 |
| R19 | **완료라고 쓰기 전에** Green Bar 4개 출력 마지막 줄, 수용 기준 체크 결과, 화면 확인 방법을 보고서에 붙인다. 확인하지 못한 항목은 "미확인"으로 쓴다 | 확인하지 않은 항목을 완료로 보고함 | §5 보고 형식 |

---

## 3. 티켓 순서

| 순서 | ID | 내용 | 명세 | 주요 파일 | 선행 |
|---|---|---|---|---|---|
| 1 | V3-01 | 디자인 토큰 3색 + 다크 모드 + 가드 테스트 | §6 | `src/index.css`, `src/styles/cssVariables.test.ts` | — |
| 2 | V3-02 | 기기 선호값 저장 헬퍼 | §9 | `src/services/sheetsStorage.ts`(+테스트) | — |
| 3 | V3-07 | DB 마이그레이션 + 검증 스크립트 (묶음별 2개, §1-2) | §7 | `supabase/migrations/20261123000000_v3_media.sql`, `20261124000000_v3_activity.sql`, `supabase/tests/v3_*_check.sql` | — |
| 4 | V3-07b | 타입·파서·서비스·백엔드 매핑 | §7-5 | `src/types/rollbook.ts`, 파서, `src/services/sheets.ts`, `src/services/backend/supabaseBackend.ts` | V3-07 |
| 5 | V3-03 | 홈 탭 통합 + 옛 주소 호환 | §2 | `src/utils/route.ts`, `src/hooks/useHashRoute.ts`, `src/App.tsx`, 새 `src/components/HomeTab.tsx`, `TodayTab.tsx`, `CalendarTab.tsx` | V3-01, V3-02 |
| 6 | V3-04 | 연습실 목록: 공연 드롭다운·검색·정렬 | §3-1 | `src/components/StudioTab.tsx`, 새 `src/components/studio/ProgramScopeMenu.tsx`, 새 `src/utils/practiceScope.ts` | V3-07b |
| 7 | V3-05 | 곡 상세: 단원 읽기 전용, 유튜브 버튼 줄 | §3-2 | `StudioTab.tsx`(또는 분리한 `PieceDetail.tsx`) | V3-04 |
| 8 | V3-06 | 플레이어: 미니 바 스와이프, 전체 화면, ±5초, 반복, 속도 시트 | §3-3 | `src/components/audio/*` | V3-02 |
| 9 | V3-06b | 악보 보기 (임시: 새 탭) | §3-4 | `PieceDetail` | 앱 안 보기는 V3-16에서 |
| 10 | V3-08 | Worker 업로드·삭제 | §8 | `workers/media/index.js`, `index.test.js`, `README.md` | — |
| 11 | V3-09 | 업로드 큐 + 운영진 연습곡 탭 개편 (압축은 V3-16) | §4 | 새 `src/services/media/uploadQueue.ts`, `workerClient.ts`, `audioCompress.ts`, `AdminPracticeTab.tsx` | V3-07b, V3-08 (**압축은 Q1 답 필요**) |
| 12 | V3-10 | 재생 기록 수집 | §7-2, §7-4 | `src/components/audio/AudioPlayerProvider.tsx`, 새 `src/services/media/listenLogger.ts` | V3-07b, V3-06 |
| 13 | V3-11 | 내 활동: 레이아웃, 레벨, 숫자, 출석 기록 필터 | §5-1~5-4 | `src/components/ProfileTab.tsx`, 새 `src/utils/memberProgress.ts` | V3-01 |
| 14 | V3-12 | 열정 온도 엔진 + 내역 시트 | §5-5 | 새 `src/utils/passionTemperature.ts`(+테스트), `ProfileTab.tsx` | V3-07b, V3-11 |
| 15 | V3-13 | 칭찬 스티커 엔진 + 보드 + 이미지 | §5-6 | 새 `src/utils/praiseStickers.ts`(+테스트), `public/stickers/*`, `ProfileTab.tsx` | V3-12 |
| 16 | V3-14 | 마무리: 문서, PR | — | `docs/ARCHITECTURE_RECOVERY.md`, `docs/DEV_LOG.md` | 전부 |
| v3-A 추가 | V3-16 | 흐름 검토 반영: 관리자 설정 3칸, 음원 압축, 악보 앱 안 보기, 유튜브 재생 시 음원 일시정지, 미니 바 범위 | §3-3, §3-4, §4-4~4-6 | 아래 상세 | V3-15 완료 후 |
| v3-A 추가 | V3-15 | 공연 단위(`performances`) 도입, 연습실·운영진의 공연 기준을 시즌 카드에서 공연으로 교체 | §3-1, §4-2, §4-3, §7-6 | 아래 상세 | `check.md` G1~G4 완료 후 |

---

## 4. 티켓 상세

### V3-01 디자인 토큰

- 명세 §6 표의 토큰을 `:root`와 다크 모드 블록(기존 다크 모드가 정의된 모든 곳: `@media (prefers-color-scheme: dark)`와 `[data-theme="dark"]` 등 현재 파일에 있는 선택자 그대로) **양쪽에** 추가한다.
- `cssVariables.test.ts`가 `src/**/*.{ts,tsx,css}`에서 쓰인 `var(--…)`가 모두 정의됐는지 검사하는지 확인한다. 아니라면 그렇게 고친다.
- **완료 조건:** 테스트에 "정의 안 된 변수를 쓰면 실패" 사례가 있다(수정 전 실패 확인).

### V3-02 선호값 헬퍼

- `PREFERENCE_KEYS`와 `readPreference<T>(key, validate, fallback)`, `writePreference(key, value)`를 만든다.
- `DATA_CACHE_KEYS`에는 넣지 않는다. 비상 캐시 초기화 동작은 바꾸지 않는다.
- **테스트:**
  - `localStorage`가 throw할 때 fallback을 돌려준다.
  - 형식이 틀린 값이면 fallback을 돌려준다.
  - 캐시 초기화 후에도 선호값이 남아 있다.

### V3-07 마이그레이션 (가장 주의)

- 명세 §7 그대로 만든다. 열 이름·타입·제약을 바꾸지 않는다.
- 맨 위 주석에 이 파일이 만드는 객체 목록을 적는다.
- 모든 `create`는 다시 실행해도 안전하게 쓴다.
  - 테이블·인덱스: `if not exists`
  - 함수: `create or replace`
  - 트리거: `drop trigger if exists` 후 `create`
  - 열 추가: `add column if not exists`
- 기존 함수 3개(`fn_save_practice_piece`, `fn_save_practice_track`, `fn_get_practice_catalog`)는 **R3 절차를 따른다.** 명세에 적힌 최신 정의 위치가 실제와 다르면 멈추고 보고한다.
- **권한:** 새 테이블은 `revoke all ... from public, anon, authenticated`. 새 함수는 `security definer`, `set search_path = public`. `grant execute`는 명세 권한 열 그대로.
- `fn_authorize_media_upload`는 `fn_check_admin_token`을 감싸기만 한다. 토큰 검증 로직을 새로 만들지 않는다.
- **검증 스크립트**(`supabase/tests/v3_media_check.sql`, `supabase/tests/v3_activity_check.sql`, 묶음별)는 트랜잭션 안에서 실행하고 마지막에 `rollback`한다. 각 확인은 `raise exception`으로 실패를 알린다. 포함할 것:
  1. rsvp insert / 상태 변경 update / 같은 상태 update / delete → 이벤트 1 / 1 / 0 / 1
  2. `rsvp_events` update·delete 거부
  3. 백필 중복 없음(마이그레이션 본문의 백필 구문을 한 번 더 실행해도 행 수 동일)
  4. `fn_log_listen_session`: 정상 1행, 같은 chunk 재전송 0행 추가, 200초 → 120 저장, 다른 곡의 트랙 → 거부, 없는 회원 → 거부, 당일 21,600초 초과분 무시
  5. 회원 물리 삭제 시 재생 기록 cascade 삭제
  6. `fn_get_practice_catalog` 응답에 새 필드 3개
  7. `fn_authorize_media_upload('짧은값')` → false
- 이 스크립트를 로컬에서 돌릴 수 없으면 **"미실행"이라고 보고한다.** 실행했다고 쓰지 않는다. 리뷰어가 로컬 PostgreSQL로 돌린다.

### V3-07b 타입·서비스

- §7-5대로 한다. 새 서비스 메서드:
  - `logListenSession(payload)`
  - `getMemberActivity(memberId)`
  - `getMediaUsage()`
  - 기존 저장 메서드의 새 필드 전달
- `mapActionToRpc` 매핑과 테스트를 추가한다(R4). Sheets 백엔드는 `UNSUPPORTED_BACKEND`를 돌려준다.
- 파서 테스트: 새 필드가 없는 옛 응답도 오류 없이 기본값으로 읽힌다.

### V3-03 홈 탭

- `MemberTab`을 `'home' | 'studio' | 'profile'`로 바꾼다. `parseRoute`에서 `today`, `calendar`를 `home`으로 해석한다. 기존 `calendar` 쿼리 처리(`m`, `d`, `sheet`, `sid`, `qr`)는 그대로 둔다.
- `HomeTab`은 기존 `TodayTab`의 상단 카드·출석 CTA와 `CalendarTab`의 달력·상세 시트를 **조립**해서 만든다. 로직을 복사하지 말고, 필요한 부분을 컴포넌트로 분리해 재사용한다.
- 하단 탭바를 3개로 바꾼다(아이콘: 집 / 음표 / 사람).
- **테스트:**
  - 옛 주소 3종 파싱
  - 주간/월간 기억
  - 오늘 일정 유무에 따른 상단 카드 분기
  - QR 오버레이 뒤로 가기(기존 테스트 유지)
- 시안: `Main`, `HomeMonth`.

### V3-04 연습실 목록

- 공연 범위 계산은 순수 함수 `src/utils/practiceScope.ts`로 만든다.
  - `buildProgramScopes(catalog, programCards, schedules, config, today)` → 메뉴 항목 목록 (**V3-15에서 `buildPerformanceScopes(catalog, today)`로 바뀐다**)
  - `filterPiecesByScope(...)`
  - `searchPieces(...)`
- 명세 §3-1의 날짜·정렬·숨김 규칙을 각각 테스트한다. 특히:
  - 공연 일정이 없는 카드의 날짜 대체 규칙
  - 날짜 미정 정렬
  - 보관된 연결 제외
- 드롭다운 `ProgramScopeMenu`는 `role="menu"` / `menuitemradio`. 바깥 클릭과 Esc로 닫히고, 포커스는 버튼으로 돌아간다. **목록 레이아웃을 밀지 않는 절대 위치 레이어**로 만든다.
- 운영진 탭에서도 이 컴포넌트를 재사용한다(V3-09).
- 시안: `Studio`, `StudioMenu`.

### V3-05 곡 상세

- 단원 화면에서 편집 진입점을 모두 지운다.
  - `+ 곡 추가`
  - `+ 악보/음원/링크`
  - 업로드 상태 칩
- 유튜브 줄: 명세 §3-2 그대로. `aria-label="유튜브 앱으로 열기"`. 화면 글자 없음.
- **테스트:**
  - 단원 화면에 편집 버튼이 없음
  - 유튜브 링크의 `href`가 등록 URL과 정확히 같음(`&list` 없음)
  - `target`/`rel` 값
- 시안: `StudioPiece`.

### V3-06 플레이어

- 미니 바 스와이프는 포인터 이벤트로 구현한다. 세로 이동 64px 이상이고 가로 이동보다 크면 닫는다. 라이브러리 금지.
  - `prefers-reduced-motion`이면 애니메이션 없이 닫는다.
- 전체 화면은 오버레이 라우트로 연다(R12).
- 속도 시트는 명세 §3-3 그대로. 1.0 근처 붙기, 경계 버튼 비활성화, 기억(V3-02 헬퍼).
- Media Session 핸들러 해제는 닫기·로그아웃·트랙 없음 상태에서 한다(기존 C16 정리 유지).
- **테스트:**
  - ±5초 경계(0, duration)
  - 반복 꺼짐 시 `ended` 후 정지
  - 속도 붙기·경계
  - 스와이프 임계값
  - 닫을 때 Media Session 해제
- 시안: `Player`, 각 화면 미니 바.

### V3-06b 악보 보기

- 완료됨(새 탭 열기). 앱 안 보기는 **V3-16**에서 한다.

### V3-08 Worker

- 명세 §8 그대로. 읽기 경로 코드는 건드리지 않는다(이미 리뷰 완료된 `computeContentRange` 포함).
- Supabase 호출은 `fetch(`${env.SUPABASE_URL}/rest/v1/rpc/fn_authorize_media_upload`, { method:'POST', headers:{ apikey, Authorization:`Bearer ${anon}`, 'Content-Type':'application/json' }, body: JSON.stringify({ p_token }) })`. 응답 본문이 정확히 `true`일 때만 통과시킨다.
- 테스트에서 `fetch`와 `MEDIA_BUCKET`은 가짜 객체로 대체한다. 명세 §8의 테스트 목록을 모두 넣는다.
- README에 기록할 것:
  - 대시보드 변수 2개 설정 절차
  - 재배포 방법
  - 허용 형식·크기 표
- 이 티켓에서 Cloudflare에 배포하지 않는다. 배포는 사용자와 리뷰어가 한다.

### V3-09 업로드 + 운영진 연습곡 탭

- **업로드 큐:** 명세 §4-5. React 밖 모듈 싱글턴 + `subscribe(listener)`를 두고, 훅 `useUploadQueue()`는 구독만 한다.
- **`workerClient.ts`:** `uploadFile(kind, blob, onProgress)`(XHR), `deleteObject(key)`. 토큰은 `getActiveAdminToken()`. 401이면 기존 관리자 인증 만료 처리 함수를 호출한다(새로 만들지 말고 `supabaseBackend`에 있는 처리 경로를 찾아 재사용, 없으면 멈추고 보고).
- **`audioCompress.ts`:**
  - 완료됨(압축 자리 + 압축 불가 경로). 실제 압축은 **V3-16**에서 한다.
  - 오류 문구는 "이 기기에서는 압축할 수 없어요" 하나만 쓴다.
- **교체:** 새 키로 저장 RPC가 성공한 뒤에만 이전 키를 DELETE한다. 저장이 실패하면 새로 올린 키를 DELETE하고 실패를 표시한다.
- **`AdminPracticeTab.tsx` 개편:** 명세 §4-1~4-4와 시안 `AdminPieces`, `AdminPieceEdit`, `AdminProgramOrder`, `AdminUpload`.
  - 기존 저장·보관·순서 RPC 호출은 그대로 쓴다.
  - 파일이 1,100줄을 넘으므로 `src/components/admin/practice/` 아래로 화면별 분리를 허용한다(이 폴더는 R18 예외).
- **테스트:**
  - 큐 상태 전이(성공 / 업로드 실패 / 저장 실패 시 새 키 삭제)
  - 교체 시 DELETE 순서
  - 시트를 언마운트해도 큐가 계속됨
  - 9.5GB 초과 비활성화
  - 유튜브 URL 검증 허용·거부 각 3개 이상
  - `beforeunload` 등록·해제

### V3-10 재생 기록

- 재생 중 `timeupdate` 간격으로 실제 재생 초를 누적한다. 직전 값과 2초 넘게 차이 나면 탐색으로 보고 넣지 않는다. 속도와 무관하게 실제 경과 시간 기준이다.
- **보내는 시점:** 60초마다, 일시정지, 끝, 트랙 변경, `visibilitychange` hidden. 누적이 30초 미만이면 보내지 않고 다음 묶음에 합친다.
- `chunkId`는 묶음마다 새 UUID(`crypto.randomUUID`, 없으면 대체 함수).
- 회원이 선택되지 않은 상태(로그인 전)에서는 보내지 않는다.
- 전송 실패는 조용히 버린다. 단, `catch`에서 `console.warn` 한 줄(R9: 빈 catch 금지).
- **테스트:**
  - 탐색 제외
  - 30초 미만 보류
  - 60초 주기
  - 회원 없음 시 미전송

### V3-11 내 활동 기본

- **2026-11-22 추가:** 출석률은 명세 §5-2의 새 정의(최근 90일 일정만 걸러 엔진에 넘김, 모수 0이면 "—")를 따른다. 테스트: 91일 전 결석이 출석률에 영향 없음, 신입은 "—". 레벨·온도·스티커의 빈 상태는 "아직 기록이 없어요" 한 줄.

- 숫자 정의(§5-2)와 레벨(§5-3)은 `src/utils/memberProgress.ts` 순수 함수로 만든다.
  - 입력: 기존 엔진 결과 + schedules + config
  - 출력: 레벨, 진행률, 함께한 날, 연습 시간, 공연 수
- 출석 기록 시트의 필터와 분류는 §5-4. 분류 매핑을 함수로 빼서 테스트한다(`미참`과 알 수 없는 값 처리 포함).
- **테스트:**
  - 레벨 경계 9/10, 99/100
  - 파트 빈 값 → "단원"
  - 병합 회원 합산(R17)
  - 연습 시간 계산(지각 포함, 사유결석 제외)
  - 필터 토글 해제
- 시안: `Profile`, `ProfileLevel`, `ProfileRecords`.

### V3-12 열정 온도

- **2026-11-22 추가:** 내역 항목을 누르면 출석 기록 시트를 "선택한 일정만" 모드로 연다(명세 §5-5). 테스트: 칩 표시, × 해제, 그 모드에서 기간 칩이 "전체" 고정.

- 명세 §5-5 표를 상수 하나(`PASSION_RULES`)에 모은다. 반환 형식:
  ```ts
  { value: number; weeklyDelta: number; windowSize: number;
    groups: { key: 'attendance'|'promise'|'stage'; items: { key: string; label: string; count: number; delta: number; scheduleIds: string[] }[] }[] }
  ```
- `label` 문구는 명세 예시 형식(`일찍 도착 3회`)을 따른다. 항목별 문구를 상수에 모아 보고서에 목록으로 붙인다.
- **테스트:** 명세 §10의 19번 4개를 포함해 최소 아래를 넣는다.
  - 빈 기록 → 36.5
  - 상한 3종(투표, 공연, 연속)이 넘지 않음
  - 34.0/42.0 자르기
  - backfill 이벤트 무시
  - 약속 대상 0개면 약속 묶음 없음
  - 같은 입력의 결정성
- 시안: `ProfileTemp`.

### V3-13 칭찬 스티커

- **2026-11-22 변경:** 새 스티커 팝업 알림은 만들지 않는다. 보드 칸의 "신규" 표시와 미리보기의 `신규 n`만 둔다(명세 §5-6). 보드를 닫을 때 본 목록 저장, 본 목록이 한 번도 없으면 표시 없이 현재 목록 저장. 테스트: 신규 표시 → 닫기 → 사라짐, 첫 기기에서 표시 안 함, 저장소 실패 시 표시 안 함.

- 이미지 24장을 `public/stickers/`에 넣는다. 원본 경로는 명세 §5-6. 파일명은 표의 "이미지" 열 + `.png`.
- `LICENSE-fluentui-emoji.txt`에 원본 저장소의 MIT 원문을 그대로 넣는다.
- 조건은 명세 표 그대로 `praiseStickers.ts`에 구현한다. 날짜 계산(달, 28일 창)은 KST 헬퍼만 쓴다(R6).
- **테스트:** 스티커마다 최소 "획득 / 미획득" 1쌍(24×2), 그리고 획득일이 처음 만족한 날짜인지.
- 새 스티커 알림은 한 번만 뜬다(`SEEN_STICKERS`). 저장 실패 시 알림을 띄우지 않는다.
- 시안: `Stickers`, `Profile`의 미리보기.

### V3-15 공연 단위 (v3-A, 2026-11-22 추가)

명세 V18, §3-1, §4-2, §4-3, §7-6. **`check.md` G1~G4를 끝낸 뒤** 같은 브랜치(`feat/v3-member-ux`)에서 한다. 커밋은 아래 단계마다 하나씩이다.

1. **마이그레이션** `supabase/migrations/20261123010000_v3_performances.sql` + `supabase/tests/v3_performances_check.sql`
   - 명세 §7-6의 열·제약·권한을 그대로 따른다. 다시 실행해도 안전해야 한다(`if not exists`, `drop trigger if exists`).
   - `fn_set_performance_pieces`: `20261122000000_practice_catalog.sql` 414행의 `fn_set_program_pieces`를 **복사해서** 테이블·열·메시지만 바꾼다. 명세의 추가 검증 3개(중복, 200개, 보관된 공연)를 넣는다. 원본 대비 diff를 보고서에 붙인다(R3).
   - `fn_get_practice_catalog`: `20261123000000_v3_media.sql` 248행 정의를 복사해서 `performances`, `performancePieces`만 추가한다(R3).
   - 물리 삭제 방지 트리거는 `20261122000000_practice_catalog.sql` 79~83행의 `trg_practice_program_pieces_no_delete` 방식을 그대로 따른다. `updated_at`은 같은 파일의 `set_updated_at` 트리거 방식을 따른다.
   - `practice_program_pieces`, `fn_set_program_pieces`, `program_cards`는 **수정 금지**.
   - **검증 스크립트**(트랜잭션 + `rollback`, 실패는 `raise exception`):
     1. 저장 성공 / 빈 제목 거부 / 날짜 형식 오류 거부 / 토큰 오류 거부
     2. 순서 저장 후 `order_index` 0,1,2
     3. 목록에서 뺀 곡은 `archived_at`이 채워짐(행은 남음)
     4. 중복 id 거부, 보관된 공연 거부
     5. 두 테이블 delete 거부
     6. 카탈로그 응답에 `performances`, `performancePieces` 키가 있고, 기존 `programPieces`도 그대로 있음
   - 로컬에서 실행하지 못하면 "미실행"으로 보고한다(리뷰어가 로컬 PostgreSQL로 확인한다).
2. **타입·파서·서비스·백엔드**
   - 명세 §7-5의 `Performance`, `PracticePerformancePiece`, `PracticeCatalog` 확장. 옛 응답(새 키 없음)은 `[]`로 읽혀야 한다(파서 테스트).
   - `sheets.ts`에 `savePerformance`, `setPerformanceArchived`, `setPerformancePieces`(각 1~5줄, R21)를 추가한다.
   - `supabaseBackend.ts`의 `mapActionToRpc`에 매핑과 테스트를 추가한다(R4). GAS 백엔드는 `UNSUPPORTED_BACKEND`.
3. **연습실 범위 계산 교체** (`src/utils/practiceScope.ts`)
   - `buildPerformanceScopes(catalog, today)`로 바꾼다. 날짜는 `performanceDate`만 쓰고, 일정·시즌 카드·`performanceCategories`는 이 계산에 쓰지 않는다.
   - 공연 미정 = 보관되지 않은 공연 연결이 없는 곡.
   - 기존 테스트는 지우지 말고 새 기준에 맞게 고친다. 시즌 카드 기반 테스트는 "시즌 카드는 범위에 나오지 않는다" 테스트로 바꾼다.
   - `STUDIO_SCOPE`에 예전 programId가 저장돼 있으면 "전체 곡"으로 돌아가야 한다(테스트).
4. **운영진 화면**
   - 하위 탭 "공연별 순서" → "공연". `ProgramOrderSection.tsx`는 `src/components/admin/practice/PerformanceSection.tsx`(목록 + 곡 순서)와 `PerformanceEditSheet.tsx`(만들기·편집·보관)로 바꾼다. 각 400줄 이하(R20).
   - 곡 편집의 "공연" 영역과 `AddProgramModal.tsx`는 공연 목록을 쓰도록 바꾼다. 시트 맨 아래에 "+ 새 공연"을 둔다.
   - 새 곡 화면(G1)에서도 공연 연결은 "저장 대기"로 쌓였다가 저장 시 반영된다.
   - 시안: Design 아티팩트의 `AdminProgramOrder` 보드(공연 곡 순서), `AdminPieceEdit`의 공연 영역.
5. **테스트**
   - 공연 만들기 시트: 제목 없으면 저장 비활성, 날짜 비우면 `''` 전송.
   - 보관된 공연은 단원 드롭다운에 없음.
   - 곡 편집에서 공연에 넣으면 해당 공연 목록 맨 뒤에 붙음(`setPerformancePieces` 인자 검사).
   - 순서 ↑↓ 경계 비활성.
- **완료 조건:** 명세 §10의 4·5번이 새 기준으로 통과한다. 보고는 §5 형식, 사용한 기존 식별자 표(R1)와 R3 diff를 포함한다.

### V3-16 흐름 검토 반영 (v3-A, 2026-11-22 추가)

명세 V19~V21, §3-1(지난 공연·곡 수), §3-3, §3-4, §4-3(보관 용도), §4-4~4-6, §10의 27·30·31·32. **V3-15를 끝낸 뒤** 같은 브랜치에서 한다. 묶음마다 커밋한다.

1. **패키지 설치:** `npm install --save-exact mediabunny pdfjs-dist` 한 번만 한다(R18 예외). 다른 패키지는 금지.
2. **관리자 설정 3칸**(§4-6)
   - `mediaPublicBaseUrl`은 최고관리자 설정 화면, 나머지 둘은 관리자 설정 화면에 둔다. 각 화면 파일이 300줄 넘게 늘면 칸을 `src/components/admin/settings/` 아래 새 컴포넌트로 뺀다(R20).
   - 저장 전에 **기존 설정 파서가 배열 값을 어떻게 읽는지** 찾아서 같은 방식으로 저장한다. 찾은 위치(파일:행)를 보고한다(R1).
   - **테스트:** 형식 검증(`http://` 거부, 끝 `/` 제거, 빈 종류·중복 거부), 저장 호출 인자, 파서가 배열로 되돌림.
3. **음원 압축**(§4-4, §4-5)
   - `audioCompress.ts`의 `canCompress()`와 `compressAudio(file, onProgress)`를 구현한다. `mediabunny`는 함수 안에서 `await import('mediabunny')`로만 불러온다.
   - 받는 형식·300MB 제한·"결과가 더 크면 원본" 규칙을 지킨다. 압축 결과의 길이로 `durationSeconds`를 채운다(F8의 `audioMetadata.ts`보다 우선).
   - 큐 상태 `compressing(%)`를 실제 진행률로 갱신한다.
   - **테스트:** 압축 가능/불가 분기, 300MB 초과 거부, 결과가 더 클 때 원본 사용, 진행률 콜백. `mediabunny`는 테스트에서 가짜로 대체한다.
4. **악보 앱 안 보기**(§3-4)
   - 새 `src/components/studio/ScoreViewer.tsx`(+ `src/styles/v3/score.css`). 오버레이 라우트를 추가한다(`useHashRoute` 규칙, R12).
   - `pdfjs-dist`는 화면 진입 시 `import()`, 워커는 `pdfjs-dist/build/pdf.worker.min.mjs?url`(실제 경로는 설치된 버전에서 확인해 보고)을 쓴다.
   - `score_storage_key`가 있을 때만 앱 안 보기, 외부 `score_url`은 새 탭. 실패 시 "악보를 열 수 없어요" + "새 탭에서 열기".
   - 전체 화면 플레이어의 "악보 보기" 버튼도 이 화면을 연다.
   - **테스트:** URL 분기, 실패 화면, 뒤로 가기로 닫힘, 미니 바 표시.
5. **유튜브 재생 시 음원 일시정지**(§3-3)
   - G3에서 만든 iframe `src`에 `enablejsapi=1&origin=`을 추가한다.
   - `message` 이벤트에서 `event.origin === 'https://www.youtube.com'`만 받고, JSON 파싱이 실패해도 조용히 넘기되 `console.warn`은 하지 않는다(유튜브가 다른 메시지도 많이 보냄. 이 경우만 R9 예외로 주석에 이유를 적는다).
   - 재생 상태 1이면 앱 플레이어 `pause()`를 부른다. 리스너는 곡 상세가 언마운트될 때 해제한다.
   - **테스트:** 다른 출처 무시, 상태 1에서만 일시정지, 언마운트 후 리스너 해제.
6. **미니 바 범위와 다음 버튼**(§3-3): 운영진·최고관리자 화면에서 숨기기(재생 유지), 마지막 트랙에서 "다음" 비활성. 테스트 포함.
7. **공연 목록 규칙 확인**(§3-1, §4-3): 지난 공연을 흐리게 하거나 숨기지 않기, 곡 수에서 보관된 곡 제외, 보관된 공연의 곡은 "공연 미정"이 아님. V3-15에서 이미 했으면 테스트만 추가한다.
8. **번들 확인:** `npm run build` 결과에서 첫 화면 청크에 `mediabunny`, `pdfjs-dist`가 없음을 보고한다(청크 이름과 크기 표).

### V3-14 마무리

1. `docs/ARCHITECTURE_RECOVERY.md`에 v3 항목을 추가한다(바뀐 탭 구조, 새 테이블 2개, 업로드 경로, 알려진 한계 §0-3).
2. `docs/DEV_LOG.md`에 티켓별 한 줄 요약을 쓴다.
3. 각 묶음 PR 본문에 아래를 넣는다.
   - 티켓 표(완료 / 미완료 / 보류)
   - 미확인 항목
   - 마이그레이션 적용 요청("리뷰어가 운영 적용" 명시)
   - Worker 변수·배포 필요 사항

---

## 5. 보고 형식 (티켓마다)

```
## [V3-xx] 제목
- 변경 파일: (git diff --stat)
- 사용한 기존 식별자 → 정의 위치: (R1, SQL·서비스 티켓)
- 복사 원본과 diff: (R3, 기존 함수 수정 시)
- 새 한글 문구 목록: (R16)
- 테스트: 추가한 테스트 이름 / 수정 전 실패 출력 요약 (R10)
- Green Bar: typecheck / lint(경고 n개) / test(통과 n개) / build 마지막 줄
- 수용 기준: 명세 §10의 해당 번호별 통과 / 미확인
- 멈춘 사항·질문:
```

---

## 6. 하지 말 것 (이번 작업 전체)

- 운영 DB 실행, 사용자에게 SQL 실행 요청, PR 머지, `npm run deploy`, Cloudflare 배포
- 승인된 2개(`mediabunny`, `pdfjs-dist`) 외의 npm 설치
- 단원 본인 인증(Task 76) 관련 작업
- 유튜브 재생 목록 기능, 원형 속도 다이얼, 길게 눌러 빨리감기
- 명세에 없는 화면·문구·설정 항목 추가
- 이 지시서와 명세 파일 수정(오류를 찾으면 보고만 한다)
