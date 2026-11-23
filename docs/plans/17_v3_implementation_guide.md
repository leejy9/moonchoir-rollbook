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
   - **v3-A (화면 골격):** V3-01, V3-02, V3-07b 중 카탈로그 새 필드 부분, V3-03, V3-04, V3-05, V3-06, V3-06b(새 탭 열기), V3-08, V3-09(압축 제외), **V3-15(공연 단위)**, **V3-16(흐름 검토 반영)**, **V3-17(삭제 기능 + 사용자 확인 버그)** (모두 2026-11-22 추가). 브랜치 `feat/v3-member-ux` → PR 대상 `fix/review-followups`.
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

### 1-A. 하루 연속 진행 규칙 (2026-11-23 사용자 승인, §1-2의 "검수 후 다음 묶음"을 대체)

1. 순서: **V3-18 → V3-19 → v3-B(V3-11) → v3-C(V3-07 activity → V3-07b 나머지 → V3-10 → V3-12 → V3-13)**.
2. 묶음을 끝낼 때마다 푸시하고 **GitHub CI 세 개가 모두 초록불인지 확인한 뒤에만** 다음 묶음으로 넘어간다. 빨간불이면 고치고, 3번 고쳐도 안 되면 멈추고 보고한다.
3. 브랜치:
   - V3-18·V3-19: `feat/v3-member-ux`(PR #27).
   - v3-B: `feat/v3-member-ux`에서 새 브랜치 `feat/v3-profile`. PR 대상 `feat/v3-member-ux`.
   - v3-C: `feat/v3-profile`에서 **새로** `feat/v3-activity-2`를 만든다. PR 대상 `feat/v3-profile`.
     - 예전 `feat/v3-activity` 브랜치(커밋 `b53a3a6`)는 공연·삭제 기능이 생기기 전 초안이다. **가져오지 말고 참고만 한다.** 이름이 겹치는 `20261123000000_v3_activity_and_media.sql`은 절대 쓰지 않는다. 마이그레이션은 `20261124000000_v3_activity.sql` 하나로, 명세 §7-1·§7-2·§7-4를 보고 새로 쓴다.
4. 각 PR 본문에 §5 보고 형식을 쓰고, 마지막에 전체 보고를 한 번 더 한다(묶음별 완료/미완료/미확인, CI 링크).
5. 머지·배포·운영 DB 실행은 하지 않는다. v3-C 마이그레이션은 리뷰어가 검토 후 운영에 적용한다.
6. 배포는 v3 전체를 한 번에 한다(V28). 그래서 v3-A만 따로 배포 준비를 하지 않는다.

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
| v3-A 추가 | V3-19 | 플레이어 v2: 디자인 개편, 공연 전체 재생(대표 음원), 반복 3단계, 이전/다음, 재생 목록 시트, 플레이어 안 유튜브 | §3-1, §3-3, §4-2, §6, §9, §10-36~40 | 아래 상세 | **V3-18 완료 후** |
| v3-A 추가 | V3-18 | 사용자 테스트 반영: 저장 공간 MB 표시, 음원 여러 파일 올리기, 새 화면 폭·비율, 반복 버튼 "전체" 표시 제거 | §4-4, §4-4b, §10-33~35 | 아래 상세 | V3-17 완료 후 |
| v3-A 추가 | V3-17 | 곡·트랙·공연 삭제, 업로드 완료 후 목록 갱신, 악보 업로드 실패 표시, 받는 음원 형식, 악보 뒤집힘 | §4-2, §4-3, §7-7 | 아래 상세 | V3-16, H1·H2 완료 후 |
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

- **2026-11-23 추가 (V26 스태프):** 명세 §5-7. `isActivityStaff`와 스태프 화면을 이 티켓에서 만든다. `선생님·지휘·반주` 문자열 필터는 `AdminScheduleForm.tsx`·`AdminProgramCardForm.tsx`에 이미 있으니 공용 상수로 뽑아 세 곳이 함께 쓴다(R2, 기존 두 파일 수정 허용). 테스트: 상태 선생님 / 파트 반주 / 파트 객원(단원) / role ADMIN + 파트 알토(단원), 스태프 화면에 링·레벨·온도 DOM 없음, `함께한 지` 문구 경계(29일·1개월·12개월·13개월).

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

- **2026-11-23 추가 (V27):** 백필 행은 점수에 넣지 않되, "3시간 안에 참석 → 불참" 판정의 변경 전 상태로는 쓴다. 테스트: 백필 참석 → 배포 뒤 시작 2시간 전 불참 = −0.10, 백필만 있는 일정 = 약속 대상 아님. 스태프는 이 함수를 부르지 않는다(V26).

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

- **2026-11-23 추가 (V26·V27):** 약속 묶음 스티커는 백필 이벤트를 세지 않는다. 스태프는 §5-7의 8개만 계산·표시하고 분모는 8. 테스트: 백필만 있는 회원은 첫 투표 미획득, 스태프 보드에 8칸.

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

1. **패키지 설치:** `npm install --save-exact mediabunny@1.65.2 pdfjs-dist@6.5.438` 한 번만 한다(R18 예외). **버전을 바꾸지 않는다**(둘 다 공개된 지 2주 이상 지난 버전이고, 아래 §4-A의 API는 이 버전의 타입 정의로 확인했다). 다른 패키지는 금지.
2. **관리자 설정 3칸**(§4-6)
   - `mediaPublicBaseUrl`은 최고관리자 설정 화면, 나머지 둘은 관리자 설정 화면에 둔다. 각 화면 파일이 300줄 넘게 늘면 칸을 `src/components/admin/settings/` 아래 새 컴포넌트로 뺀다(R20).
   - **설정값은 서버에서 모두 문자열로 돌아온다**(리뷰어 확인: `app_config.value`가 `text`, `fn_get_initial_snapshot`이 `jsonb_object_agg(key, value)`로 내려 줌, `sheets.ts`가 `{...this.config, ...data.config}`로 그대로 합침). 배열은 `JSON.stringify`로 보내고, 읽을 때는 아래 §4-A-0의 정규화 함수가 배열로 되돌린다.
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
0. **설정값 정규화(운영 지각 버그):** **리뷰어가 이미 고쳐서 main에 반영했다**(`src/services/configNormalize.ts`). 직접 다시 만들지 말고 `git merge origin/main`으로 가져온다. 충돌이 나면 main 쪽을 남기고, `feat/v3-member-ux`에만 있는 설정 합치기 코드가 있으면 거기에도 `normalizeAppConfig`를 적용한다. 그 위치를 보고한다.
8. **번들 확인:** `npm run build` 결과에서 첫 화면 청크에 `mediabunny`, `pdfjs-dist`가 없음을 보고한다(청크 이름과 크기 표).

### §4-A. V3-16 구현 참고 (리뷰어가 코드·패키지 타입 정의로 확인한 내용)

추측으로 API를 쓰지 않는다. 아래 이름이 실제와 다르면 **멈추고 보고**한다.

#### §4-A-0. 설정값 정규화 (운영 버그)

- **현상(리뷰어 재현):**
  - 운영 `app_config`의 `lateGraceMinutes` 값은 문자열 `"15"`다.
  - 이 값이 그대로 `reconcileSingleMemberAttendance(…, lateGraceMinutes)`에 들어가면, `startMinutes + lateGraceMinutes`가 숫자 덧셈이 아니라 문자열 이어 붙이기(`1170 + "15"` → `"117015"`)가 된다.
  - 그래서 **40분 늦은 체크인도 "출석"이 된다.** 숫자 `15`를 넣으면 "지각", 문자열 `"15"`를 넣으면 "출석"이다.
  - 운영 앱은 Supabase 전환 이후 지각을 판정하지 못하고 있다. 원천 로그는 그대로라 고치면 과거 기록도 올바르게 다시 계산된다.
- **수정:**
  - 새 파일 `src/services/configNormalize.ts`에 `normalizeAppConfig(raw: Record<string, unknown>): Partial<AppConfig>`를 만든다.
    - `AppConfig`에서 타입이 `number`인 필드 전부(최소 `lateGraceMinutes`, `defaultLat`, `defaultLon`, `defaultRadius`. `src/types/rollbook.ts`의 `AppConfig`를 읽고 목록을 보고서에 적는다): 문자열이면 `Number()`로 바꾸고, `NaN`이면 그 키를 버린다(기본값 유지).
    - 배열 필드(`practiceTrackKinds`, `performanceCategories`, 그 밖에 `AppConfig`에서 배열인 것): 문자열이면 `JSON.parse`. 실패하거나 배열이 아니면 키를 버린다.
    - `boolean` 필드: `"true"`/`"false"` 문자열을 boolean으로 바꾼다.
    - 그 밖의 키는 원문 그대로 둔다(AGENTS §1 하위 호환).
  - 적용 위치(모두):
    - ① `sheets.ts`에서 서버 스냅샷의 `data.config`를 합치는 곳(현재 `this.config = { ...this.config, ...data.config, … }`)
    - ② 기기 저장소에서 설정을 읽는 곳(`loadFromStorage(STORAGE_KEYS.CONFIG, …)`)
    - ③ 실시간 갱신으로 설정이 들어오는 곳(`src/services/realtime/supabaseRealtime.ts`에서 config를 반영하는 경로. 없으면 "없음"이라고 보고)
    - ④ GAS 백엔드 응답(같은 합치기 경로를 쓰면 ①로 충분)
- **테스트(수정 전 실패 필수):**
  - `normalizeAppConfig({lateGraceMinutes:'15'})` → `15`
  - 스냅샷에 `lateGraceMinutes:'15'`가 든 상태로 서비스를 초기화한 뒤, 19:30 시작 일정에 19:46 체크인 → "지각", 19:45 → "출석"
  - `practiceTrackKinds:'["가이드","MR"]'` → 배열
  - 잘못된 JSON → 기본값 유지
- **이 커밋은 v3 기능과 무관하게 운영 배포 대상이다.** PR 본문 맨 위에 "운영 버그 수정 포함"을 적는다.

#### §4-A-1. `mediabunny@1.65.2`로 압축 (`src/services/media/audioCompress.ts`)

```ts
// 함수 안에서만 동적 import (첫 화면 번들에 넣지 않기)
const mb = await import('mediabunny');
const { Input, ALL_FORMATS, BlobSource, Output, Mp4OutputFormat, BufferTarget, Conversion, canEncodeAudio } = mb;

// 1) 지원 확인
const ok = await canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: 44100, bitrate: 64000 });
if (!ok) → 압축 불가 경로(§4-5)

// 2) 변환
const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
const durationSeconds = await input.computeDuration();
const target = new BufferTarget();
const output = new Output({ format: new Mp4OutputFormat(), target });
const conversion = await Conversion.init({
  input, output,
  video: { discard: true },
  audio: { codec: 'aac', bitrate: 64000, sampleRate: 44100 },   // 모노 원본이면 numberOfChannels: 1
});
if (!conversion.isValid) → conversion.discardedTracks의 reason을 console.warn으로 남기고 압축 불가 경로
conversion.onProgress = (progress) => onProgress(Math.round(progress * 100));  // 0~1
await conversion.execute();
const blob = new Blob([target.buffer!], { type: 'audio/mp4' });
```

- 위 이름(`Input`, `ALL_FORMATS`, `BlobSource`, `Output`, `Mp4OutputFormat`, `BufferTarget`, `Conversion.init`, `isValid`, `discardedTracks`, `onProgress(progress, processedTime)`, `execute()`, `target.buffer`, `canEncodeAudio`, `input.computeDuration()`)은 리뷰어가 `mediabunny` 패키지의 `dist/mediabunny.d.ts`에서 확인했다.
- 모노 판별: `(await input.getPrimaryAudioTrack())`의 채널 수. 메서드 이름이 다르면 `d.ts`에서 찾아 보고한다.
- 취소: 큐에서 작업을 지우면 `conversion.cancel()`.
- 테스트에서는 `vi.mock('mediabunny', …)`로 대체한다. 실제 인코딩은 테스트하지 않는다(브라우저 API 필요).

#### §4-A-2. `pdfjs-dist@6.5.438`로 악보 보기 (`ScoreViewer.tsx`)

```ts
const pdfjs = await import('pdfjs-dist');
const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
const doc = await pdfjs.getDocument({ url }).promise;
const page = await doc.getPage(n);
const viewport = page.getViewport({ scale });
await page.render({ canvas, viewport }).promise;   // v6: canvas 필수, canvasContext는 선택
```

- **두 손가락 확대(사용자 확정).** 앱의 `index.html`이 `user-scalable=no`라 브라우저 확대가 꺼져 있으므로 **직접 구현한다.** `index.html`의 viewport는 바꾸지 않는다(앱 전체가 확대되는 문제). 라이브러리 금지.
  - 쪽들을 감싼 컨테이너에 `touch-action: none`을 주고, 포인터 이벤트(`pointerdown`/`pointermove`/`pointerup`/`pointercancel`)로 손가락 2개의 거리 변화를 잰다.
  - **제스처 중:** 컨테이너에 CSS `transform: translate(x, y) scale(s)`만 바꾼다(다시 그리지 않음 → 부드러움). 두 손가락 가운데 점을 기준으로 확대한다.
  - **손을 뗀 뒤:** 최종 배율로 화면에 보이는 쪽만 다시 그려 선명하게 만든다(300ms 디바운스). 다시 그린 뒤 transform의 scale을 1로 되돌리고 캔버스 크기에 반영한다.
  - 배율 1~3배로 제한. 1배보다 크면 한 손가락 끌기로 이동, 1배면 한 손가락은 세로 스크롤(쪽 넘기기)로 동작한다.
  - 두 번 탭(300ms 이내)하면 1배 ↔ 2배.
  - 헤더 −/+ 버튼(44px)은 0.5씩 같은 배율 값을 바꾼다(접근성).
  - 제스처 계산(거리→배율, 가운데 점 기준 이동, 경계 제한)은 순수 함수 `src/utils/pinchZoom.ts`로 빼서 테스트한다. 테스트: 거리 2배 → 배율 2배, 3배 초과 제한, 1배 미만 제한, 가운데 점 고정, 이동 경계.
- **악보 위 필기·그리기 기능은 만들지 않는다.** 위의 "다시 그린다"는 PDF 쪽을 화면에 표시한다는 뜻이다.
- **아이폰 캔버스 한도:** 캔버스 한 장의 `width × height`가 16,000,000 픽셀을 넘지 않도록 `scale × devicePixelRatio`를 줄인다. 넘으면 흰 화면이 된다.
- 쪽 이동은 스크롤 위치로 현재 쪽을 계산한다. ‹ › 버튼은 해당 쪽으로 스크롤한다.
- 화면을 닫을 때 `doc.destroy()`를 부른다.
- 테스트에서는 `vi.mock('pdfjs-dist', …)`로 대체한다.
- 명세 §3-4의 "두 손가락 확대·축소"는 이 버튼 방식으로 대체한다(리뷰어 결정, 2026-11-22).

#### §4-A-3. 유튜브 재생 감지 (곡 상세)

두 가지를 함께 쓴다. ①은 비공식 방식이라 동작하지 않는 기기가 있을 수 있어서, ②를 반드시 같이 둔다.

1. **iframe 메시지:**
   - iframe `src`에 `enablejsapi=1&origin=${encodeURIComponent(location.origin)}`을 붙인다.
   - iframe `onLoad`에서 `iframe.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: <영상 id>, channel: 'widget' }), 'https://www.youtube.com')`를 보낸다. 이걸 보내야 유튜브가 상태 메시지를 보내기 시작한다.
   - `message` 이벤트에서 `event.origin === 'https://www.youtube.com'`만 받는다. `data`가 문자열이면 `JSON.parse`(실패하면 무시).
   - 아래 둘 중 하나면 앱 플레이어 `pause()`:
     - `{event:'onStateChange', info: 1}`
     - `{event:'infoDelivery', info:{playerState: 1}}`
2. **포커스 감지(예비):** `window`의 `blur` 이벤트에서 `document.activeElement`가 곡 상세의 유튜브 iframe 중 하나면 `pause()`. 사용자가 영상을 누르는 순간 포커스가 iframe으로 넘어가는 것을 이용한다.

- 리스너는 곡 상세 언마운트 시 모두 해제한다.
- **테스트:**
  - 다른 출처 무시
  - 두 메시지 형식 각각
  - `blur` + `activeElement`
  - 언마운트 후 해제

### V3-17 삭제 기능 + 사용자 확인 버그 (v3-A, 2026-11-22 추가)

사용자가 로컬에서 직접 써 보고 나온 항목이다. **H1·H2를 먼저 끝낸 뒤** 같은 브랜치에서 한다. 항목마다 커밋한다.

**J1. 업로드가 끝나도 목록이 갱신되지 않음 (사용자 재현, 리뷰어 운영 DB로 확인)**
- **현상:** 음원 업로드·압축·저장은 성공했다(운영 DB에 트랙 행 있음). 그런데 운영진 곡 편집 화면에는 "등록된 음원이 없습니다"가 계속 보인다.
- **원인:** `AdminPracticeTab`은 큐에 넣는 순간(`onJobEnqueued`)에만 `reloadCatalog()`를 부르고, 작업이 `done`이 될 때는 부르지 않는다.
- **수정:**
  - `AdminPracticeTab`에서 `uploadQueue.subscribe`로 작업 상태를 지켜본다. 어떤 작업이 `done`으로 바뀌면 `reloadCatalog()`를 부른다.
  - 같은 순간에 여러 작업이 끝나면 300ms 디바운스로 한 번만 부른다.
  - 열려 있는 `PieceEditModal`은 새 `catalog`를 받아 바로 반영한다. 트랙·악보 표시가 `catalog` prop에서 계산되는지 확인한다. 모달 안에 따로 복사해 둔 상태(`currentPiece` 등)가 있으면 최신 카탈로그의 같은 id 값으로 갱신한다.
- **테스트:** 가짜 큐에서 작업을 `done`으로 바꾸면 `refreshPracticeCatalog`가 1회 불린다. 모달에 새 트랙이 보인다.

**J2. 악보 업로드가 실패해도 아무 표시가 없음 (사용자 재현: 0.2MB PDF)**
- **현상:** 운영 DB에는 악보 키가 하나도 저장되지 않았다. 화면에는 실패 표시도 없다.
- **확인된 부분:** `failedJobs`가 트랙 영역에만 넘어가고 악보 영역(`PieceScoreSection`)에는 넘어가지 않는다.
- **수정:**
  - ① 악보 영역에도 해당 곡의 `kind === 'score'` 실패 작업을 "실패 · 이유 · 다시 시도 · 지우기"로 표시한다.
  - ② 큐가 작업을 `failed`로 바꿀 때 `console.warn('[uploadQueue] failed', { kind, fileName, status, message })`를 남긴다. `status`는 Worker 응답 코드이고, 저장 단계 실패면 `'save'`다.
  - ③ `workerClient.uploadFile`의 실패 메시지에 HTTP 상태 코드를 넣는다(`Upload failed (415): …`).
- **원인 찾기(필수):** 수정 후 로컬에서 0.2MB PDF를 기존 곡과 새 곡 각각에 올려 보고, 실패하면 위 로그의 상태 코드와 메시지를 보고서에 붙인다.
  - 성공하면 운영 DB 확인을 리뷰어에게 요청한다.
  - 원인이 코드에 있으면 고치고, 수정 전 실패 테스트를 함께 넣는다.
- **테스트:** 악보 실패 표시, 상태 코드가 들어간 메시지.

**J3. 받는 음원 형식**
- `MediaUploadSheet`의 `accept`에 명세 §4-4의 wav, aiff, flac을 추가한다(`audio/wav,audio/x-wav,audio/aiff,audio/x-aiff,audio/flac,.wav,.aif,.aiff,.flac`).
- `validateAudioFile`은 **압축 가능할 때만** 이 형식을 허용한다. 압축이 불가능하면 지금처럼 m4a·mp3·aac 30MB 이하만 받는다.
- 300MB 제한을 지킨다.
- **테스트:** 압축 가능/불가 각각에서 wav 허용 여부.

**J5. 악보가 뒤집히고 일부만 그려짐 (사용자 재현, 리뷰어 원인 확인)**
- **현상:** 앱 안 악보 보기에서 쪽이 위아래로 뒤집히고, 쪽의 왼쪽 위 일부에만 작게 그려진다. 저장된 PDF는 정상이다.
- **원인:** `ScoreViewer.tsx`의 `renderPage`가 같은 캔버스에 **이전 `page.render()`가 끝나기 전에 새 `page.render()`를 시작한다**(쪽 번호·배율 변경 effect, 개발 모드의 effect 이중 실행). pdf.js는 같은 캔버스의 동시 렌더를 허용하지 않는다. 겹치면 뷰포트 변환(위아래 뒤집기 포함)이 두 번 쌓여 뒤집히고 축소된다.
- **수정:**
  1. 쪽 번호별로 진행 중인 `RenderTask`를 `Map<number, RenderTask>`(ref)에 보관한다. 새로 그리기 전에 이전 작업의 `cancel()`을 부르고, 그 `promise`가 끝나기(거절 포함)를 기다린 다음 시작한다.
     - 취소로 생기는 `RenderingCancelledException`(`err.name === 'RenderingCancelledException'`)은 정상이므로 경고 없이 무시한다. 다른 오류만 `console.warn`.
  2. 쪽마다 "마지막으로 그린 배율"을 기억해, 같은 배율이면 다시 그리지 않는다.
  3. 언마운트와 `storageUrl` 변경 시 진행 중인 렌더 작업을 모두 `cancel()`한 뒤 `doc.destroy()`를 부른다.
  4. `page.render()` 전에 `canvas.getContext('2d')`를 따로 부르지 않는다(`canvas`만 넘긴다).
  5. 타입은 `pdfjs-dist`의 `RenderTask`, `PDFDocumentProxy`를 쓴다(R9, `as any` 금지).
- **현재 쪽 표시 버그:** 1쪽이 보이는데 "2 / 9"로 표시된다.
  - `offsetTop` 비교 대신 각 쪽의 `getBoundingClientRect().top`과 컨테이너의 `getBoundingClientRect().top`을 비교한다.
  - **컨테이너 위쪽 절반 안에 윗변이 들어온 마지막 쪽**을 현재 쪽으로 한다. 순수 함수 `src/utils/scoreViewport.ts`로 빼서 테스트한다.
- **테스트(수정 전 실패 확인):**
  - 같은 쪽 `renderPage`를 연달아 두 번 부르면 첫 작업의 `cancel`이 불리고, 두 번째 렌더는 첫 번째가 끝난 뒤 시작된다(가짜 `RenderTask`).
  - 같은 배율 재호출 시 렌더 생략
  - 언마운트 시 모든 작업 취소
  - 쪽 번호 계산 함수의 경계(맨 위, 두 쪽 경계, 맨 아래)
- **사용자 확인:** 고친 뒤 로컬에서 같은 PDF가 똑바로, 쪽 전체 폭으로 그려지는지 사용자가 확인한다.

**J7. 악보 화면을 pdf.js 공식 뷰어 부품으로 교체 — J6을 대체한다 (2026-11-22 리뷰어 결정)**

J6의 "직접 만드는 방식"은 하지 않는다. 쪽 배치, 화면 근처만 그리기, 먼 쪽 메모리 해제, 확대 후 고해상도 재렌더, 현재 쪽 추적은 pdf.js 팀이 Firefox PDF 보기용으로 이미 만든 `PDFViewer` 부품이 한다. 이미 설치한 `pdfjs-dist@6.5.438` 안에 들어 있어 **새 패키지가 필요 없다.** 압축 후 약 72KB이고 악보 화면 청크에만 들어간다.

- **원인 요약(J6과 같음):**
  - 쪽을 자리 표시와 바꿔 끼워 크기가 흔들린다. 그래서 2쪽 근처에서 멈춘다.
  - 인라인 ref 때문에 렌더가 반복 취소된다. 그래서 흰 화면이 남는다.
  - 고해상도 재렌더가 끝나지 않아 흐릿하다.
  - 저장된 PDF는 원본과 같다(운영 DB 크기 193,457바이트 일치).
- **구현 (`ScoreViewer.tsx`를 이 방식으로 다시 작성):**
  ```ts
  const pdfjs = await import('pdfjs-dist');
  // 필수: pdf_viewer.mjs는 불러오는 순간 globalThis.pdfjsLib에서 값을 꺼낸다(6.5.438 기준 91행).
  // 이 줄이 없으면 뷰어 import가 TypeError로 실패한다(2026-11-22 사용자 재현, 리뷰어 지시서 누락).
  (globalThis as { pdfjsLib?: typeof pdfjs }).pdfjsLib = pdfjs;
  const viewerMod = await import('pdfjs-dist/web/pdf_viewer.mjs');
  await import('pdfjs-dist/web/pdf_viewer.css');           // 악보 청크에만 들어가야 함
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;

  const eventBus = new viewerMod.EventBus();
  const viewer = new viewerMod.PDFViewer({
    container,                 // position:absolute; inset:0; overflow:auto 인 div
    viewer: innerDiv,          // className="pdfViewer"
    eventBus,
    textLayerMode: 0,          // 글자 선택 레이어 끔(가볍게)
    annotationMode: 0,         // 주석 레이어 끔
    removePageBorders: true,
    maxCanvasPixels: 16_000_000, // 아이폰 캔버스 한도
  });
  const doc = await pdfjs.getDocument({ url }).promise;
  viewer.setDocument(doc);
  eventBus.on('pagesinit', () => { viewer.currentScaleValue = 'page-width'; });
  eventBus.on('pagechanging', (e) => setCurrentPage(e.pageNumber));
  ```
  - **쪽 이동 ‹ ›:** `viewer.currentPageNumber = n`. **−/+:** `viewer.decreaseScale()` / `viewer.increaseScale()`. 범위는 `page-width` 기준 1~3배로 제한한다(배율을 확인한 뒤 넘치면 되돌림).
  - **두 손가락 확대:**
    - 컨테이너의 `touchstart`/`touchmove`/`touchend`에서 손가락 2개 사이 거리 비율을 구한다.
    - `viewer.updateScale({ scaleFactor: 이전 대비 비율, origin: [두 손가락 가운데 x, y](컨테이너 기준), drawingDelay: 400 })`를 부른다. pdf.js 뷰어 앱이 핀치에 쓰는 방식과 같다.
    - 손가락 2개일 때만 `preventDefault()`(리스너는 `{ passive: false }`). 손가락 1개는 기본 스크롤 그대로.
    - J5의 `pinchZoom.ts` 중 거리→비율 계산만 재사용하고, 나머지 직접 렌더 코드는 지운다.
  - **두 번 탭:** `page-width` ↔ 2배.
  - **닫을 때:** `viewer.setDocument(null)` → `doc.destroy()`. J5의 `ScoreRenderCoordinator`와 직접 렌더 코드는 더 이상 쓰지 않으므로 지운다(테스트도 함께 정리, R9 예외 허용).
  - 위 API 이름(`EventBus`, `PDFViewer`, `setDocument`, `currentScaleValue`, `currentPageNumber`, `updateScale`, `increaseScale`, `decreaseScale`, `pagesinit`, `pagechanging`)은 리뷰어가 `pdfjs-dist@6.5.438`의 `types/web/pdf_viewer.d.ts`에서 확인했다. 다르면 멈추고 보고한다.
- **테스트:**
  - `pdfjs-dist`와 뷰어를 가짜로 대체해 `setDocument`, `page-width` 설정, ‹ ›의 `currentPageNumber`, 핀치의 `updateScale` 인자(비율, 가운데 점), 닫을 때 정리 순서를 검사한다.
  - 빌드 결과에서 `pdf_viewer` 코드와 CSS가 첫 화면 청크에 없음을 보고한다.
- **사용자 확인(보고서에 "미확인"):** 9쪽 PDF 끝까지 스크롤, ‹ ›로 9쪽, 확대 후 선명, 휴대폰 두 손가락 확대와 한 손가락 스크롤.

**J8. 미니 바를 눌러도 전체 화면 플레이어가 열리지 않음 (사용자 재현)**
- **코드상으로는:** `MiniPlayer` 클릭 → `navigate({ type: 'OPEN', overlay: { kind: 'player' } })` → `App.tsx`에서 `route.overlay?.kind === 'player'`일 때 `FullPlayer`를 그린다. 리뷰어가 정적으로는 원인을 찾지 못했다.
- **할 일:**
  1. `npm run dev`에서 재현하고, 개발자 도구로 클릭 후 주소(`#/…?player=1`)가 바뀌는지, `FullPlayer` DOM이 생기는지 확인한다.
  2. 아래 후보를 하나씩 확인하고, 찾은 원인과 근거를 보고한다.
     - ① 주소는 바뀌는데 `hashchange` 처리에서 overlay가 사라짐
     - ② DOM은 생기는데 CSS(`position`, `z-index`, 부모의 `transform`/`overflow`) 때문에 안 보임
     - ③ 미니 바 안쪽 요소가 클릭을 막음(`stopPropagation`, 포인터 처리)
     - ④ `FullPlayer`가 `null`을 반환
  3. **통합 테스트를 추가한다:** 트랙 재생 상태에서 미니 바 제목을 클릭하면 `FullPlayer`가 화면에 있고, 뒤로 가기(`CLOSE`)로 닫힌다. 수정 전 실패를 확인한다.

**J9. 미니 바 × 닫기 버튼 (명세 §3-3, 사용자 요청)**
- 미니 바 오른쪽 끝(다음 버튼 오른쪽)에 × 버튼(44px, `aria-label="플레이어 닫기"`)을 둔다. 누르면 기존 `closePlayer()`를 부른다(재생 멈춤 + 미니 바 사라짐 + Media Session 해제).
- 클릭이 미니 바의 "전체 화면 열기"로 번지지 않게 한다.
- 아이콘은 인라인 SVG, 색은 토큰.
- **테스트:** × 클릭 시 `closePlayer` 1회, 전체 화면 열기 0회.

**J6. 악보 화면: 쪽 넘김이 2쪽에서 멈추고, 스크롤하면 흰 화면, 흐릿함 — J7로 대체됨, 하지 않음**
- **저장된 PDF는 손상되지 않았다.** 운영 DB의 `score_size_bytes`가 원본 크기(193,457바이트)와 같고, Worker는 받은 바이트를 그대로 저장한다. 문제는 전부 화면 그리기 쪽이다.
- **원인(`ScoreViewer.tsx`):**
  1. 현재 쪽 ±1만 `<canvas>`를 두고 나머지는 **고정 크기 320×450 자리 표시**로 바꿔 끼운다. 쪽 크기가 계속 바뀌어 스크롤 위치와 현재 쪽 계산이 흔들리고, 쪽 이동이 2쪽 근처에서 멈춘다.
  2. `ref`가 인라인 함수라 다시 그릴 때마다 `renderPage`가 다시 불린다. 그 결과 렌더 → 취소가 반복되어 그리기가 끝나지 않고 흰 캔버스로 남는다.
  3. 확대 중에는 CSS로만 키운 저해상도 그림이 보이는데, 위 반복 때문에 고해상도 재렌더가 끝나지 않아 흐릿하게 남는다.
- **수정(구조 변경, 이 방식 그대로):**
  1. 문서를 연 직후 모든 쪽의 크기를 미리 구한다(`for n: (await doc.getPage(n)).getViewport({ scale: 1 })`, 메타데이터라 가볍다).
     - 각 쪽마다 **크기가 정확한 감싸개 `<div>`**를 만든다. 가로 = 화면 폭 맞춤 × 배율, 세로 = 비율대로.
     - 감싸개 안의 `<canvas>`는 **항상 그 자리에 둔다.** 자리 표시로 바꿔 끼우지 않는다.
  2. 캔버스 ref는 쪽 번호별로 한 번만 만든다(`useRef<Map<number, HTMLCanvasElement>>` + 쪽마다 고정된 콜백, 또는 `createRef` 배열). 다시 그릴 때마다 ref 콜백이 다시 불리지 않아야 한다.
  3. **`IntersectionObserver`**(root = 스크롤 컨테이너, `rootMargin: '100% 0px'`)로 화면 근처의 쪽만 그린다(J5의 `ScoreRenderCoordinator` 사용, 같은 배율이면 생략).
     - 화면에서 3화면 이상 멀어진 쪽은 `canvas.width = canvas.height = 0`으로 메모리를 돌려주고 "안 그림"으로 표시한다.
     - 다시 가까워지면 다시 그린다. 감싸개 크기는 그대로라 스크롤 위치가 변하지 않는다.
  4. **현재 쪽:** 감싸개들의 위치로 계산한다(J5의 `scoreViewport` 사용). 감싸개 크기가 고정이므로 흔들리지 않는다.
  5. **‹ › 버튼:** `container.scrollTo({ top: 감싸개.offsetTop, behavior: 'smooth' })`. 현재 쪽 상태를 직접 바꾸지 않고, 스크롤 결과로 갱신되게 한다.
  6. **터치:**
     - 배율 1이고 손가락이 1개면 브라우저 기본 세로 스크롤을 쓴다(컨테이너 `touch-action: pan-y`).
     - 손가락 2개를 감지했거나 배율이 1보다 크면 `touch-action: none`으로 바꿔 직접 처리한다.
     - 지금처럼 항상 `none`이면 휴대폰에서 스크롤이 안 된다.
  7. **선명도:** 캔버스 실제 픽셀 = 감싸개 CSS 크기 × `devicePixelRatio`(16,000,000픽셀 한도 안). 손을 뗀 뒤 300ms 후 화면 근처 쪽만 새 배율로 다시 그린다.
- **테스트(수정 전 실패 확인):**
  - 모든 쪽 감싸개 높이가 쪽 비율대로 정해짐
  - 다시 그려도 캔버스 요소가 바뀌지 않음(같은 객체)
  - 화면 근처 쪽만 렌더 요청
  - 먼 쪽은 해제되고 돌아오면 다시 렌더
  - ‹ ›가 해당 감싸개 위치로 스크롤
  - `touch-action` 전환
- **사용자 확인 항목(보고서에 "미확인"으로 남겨 두고 사용자에게 요청):** 9쪽짜리 PDF에서 끝까지 스크롤, ‹ ›로 9쪽까지 이동, 확대 후 선명해짐, 휴대폰에서 한 손가락 스크롤.

**J4. 삭제 기능 (명세 V22, §4-2, §4-3, §7-7)**
1. **마이그레이션** `supabase/migrations/20261123020000_v3_delete.sql` + `supabase/tests/v3_delete_check.sql`
   - `prevent_row_deletion()`은 `20261122000000_practice_catalog.sql` 67행 정의를 **복사해서** `if current_setting('moonchoir.allow_catalog_delete', true) = 'on' then return old; end if;` 한 줄만 추가한다(R3, diff 보고).
   - 삭제 RPC 3개는 명세 §7-7 표 그대로 만든다. 각 함수는 토큰 검사 직후 `perform set_config('moonchoir.allow_catalog_delete', 'on', true);`를 부른다.
   - 재생 기록 확인은 `to_regclass('public.practice_listen_sessions') is not null`일 때만 `execute format(...)`로 한다(v3-C 테이블이 아직 없으므로).
   - **검증 스크립트**(트랜잭션 + rollback, 토큰은 `admin_sessions`에 `fn_admin_token_hash('32자 이상')`로 행 추가. 지어낸 열 금지):
     1. 곡 삭제 시 트랙·공연 연결·시즌 카드 연결이 모두 사라지고, 반환 `storageKeys`에 트랙 키와 악보 키가 들어 있다.
     2. 트랙 삭제 반환값
     3. 공연 삭제 후 곡은 남아 있다.
     4. **RPC 밖에서 직접 `delete from practice_pieces`를 하면 여전히 거부된다**(우회 장치가 새지 않는지).
     5. 토큰 없으면 `ADMIN_AUTH_REQUIRED`.
     6. 없는 id 거부.
2. **서비스:** `sheets.ts`에 `deletePracticePiece`, `deletePracticeTrack`, `deletePerformance`(각 1~5줄, R21). `mapActionToRpc` 매핑과 테스트(R4).
   - 삭제 후 Worker DELETE와 목록 갱신은 새 파일 `src/services/practice/deleteFlow.ts`에서 한다(DB 성공 → 키마다 `deleteObject` → 실패는 `console.warn` → `refreshPracticeCatalog`).
3. **화면:**
   - 곡 편집 하단 "삭제", 트랙·영상 ⋯ 메뉴 "삭제", 공연 편집 시트 하단 "삭제"를 둔다.
   - 확인 창은 공통 컴포넌트 `src/components/admin/practice/DeleteConfirmModal.tsx` 하나로 만든다. 문구는 명세 그대로, 빨간 버튼은 `--status-danger` 토큰을 쓴다.
   - 재생 기록 때문에 거부되면 명세 문구 한 줄을 보여 준다.
4. **테스트:**
   - 삭제 순서(DB → 파일 → 갱신)
   - 파일 삭제 실패해도 성공 처리
   - 거부 메시지 표시
   - 확인 창 취소 시 아무것도 호출 안 함

**완료 후 운영 적용:** `20261123020000_v3_delete.sql`은 리뷰어가 운영 DB에 적용한다. 개발 에이전트는 실행하지 않는다.

### V3-18 사용자 테스트 반영 (v3-A, 2026-11-23 추가)

> 브랜치 `feat/v3-member-ux`(PR #27)에서 이어서 한다. 먼저 `git merge origin/main`. 커밋은 L번호 하나에 하나.
> 플레이어 디자인 개편·목록 전체 재생·플레이어 안 유튜브는 **시안 확정 뒤 V3-19로 따로 온다. 이번에는 하지 않는다.**

**L1. 저장 공간이 0.0GB로 보임 (명세 §4-4)**
- **원인(리뷰어가 운영 DB로 확인):** 운영에는 파일 6개, 합계 약 10.4MB가 크기와 함께 정상 저장돼 있다. `MediaUploadSheet.tsx`가 `totalGB.toFixed(1)`로 GB 소수점 1자리만 보여 줘서 0.01GB가 "0.0GB"가 된다. 저장은 문제없다.
- **할 일:**
  1. 새 파일 `src/utils/formatStorage.ts`에 `formatStorageUsage(bytes: number): string`을 만든다. 규칙은 명세 §4-4 그대로다(1GB 미만 MB 1자리, 0 초과 0.1MB 미만은 `0.1MB`, 1GB 이상 GB 2자리). 함수는 사용량만 돌려주고 화면에서 ` / 10GB`를 붙인다.
  2. `MediaUploadSheet.tsx`의 표시를 이 함수로 바꾼다. 9.5GB 비활성 판정(`isOverQuota`)은 바이트로 계산한 지금 값을 그대로 둔다.
  3. 같은 계산이 다른 곳에도 있으면(`grep -rn "1024 \* 1024 \* 1024\|toFixed(1)}GB" src`) 모두 이 함수로 바꾸고 목록을 보고한다.
- **테스트:** 0 → `0MB`, 50,000바이트 → `0.1MB`, 10,905,190 → `10.4MB`, 1,073,741,824 → `1.00GB`, 1,342,177,280 → `1.25GB`. 수정 전 실패를 확인한다(R10).

**L2. 음원 여러 파일 한 번에 올리기 (명세 §4-4 V23)**
- **범위:** 음원 시트의 새 업로드만. 악보 시트와 "파일 교체"는 1개 그대로(`multiple` 금지).
- **구조(R20·R21, 파일 400줄 제한):**
  - 파일 검사·이름 만들기는 새 순수 함수 파일 `src/services/media/uploadBatch.ts`에 둔다.
    - `prepareUploadBatch(files: File[], accept: AcceptRule): { accepted: BatchItem[]; rejected: { file: File; reason: 'type' | 'size' }[]; truncated: boolean }`
    - `BatchItem = { file: File; title: string }`, `title`은 확장자 뺀 파일명(앞뒤 공백 제거, 비면 파일명 전체).
    - 형식·크기 기준은 지금 `MediaUploadSheet`에 있는 값을 **옮겨서** 쓴다(새로 정하지 않는다). 20개 초과면 앞 20개만, `truncated: true`.
  - 목록 모드 화면은 새 컴포넌트 `src/components/admin/practice/MediaBatchList.tsx`로 분리한다. `MediaUploadSheet.tsx`가 더 커지지 않게 한다.
- **올리기:**
  - 각 항목마다 **지금 단일 업로드와 같은 함수**(`readAudioDuration` → `createUploadSaveFn` → `uploadQueue.enqueue`)를 부른다. 새 업로드 경로를 만들지 않는다.
  - 큐가 한 번에 하나만 처리하는지 확인하고, 동시 처리 코드가 있으면 보고한다(압축 메모리 문제).
  - 트랙 순서가 고른 순서대로 뒤에 붙는지 확인한다. 저장 함수가 순서를 정하는 방식(예: 최댓값+1)을 보고서에 적는다. 같은 곡에 동시에 저장되어 순서가 겹칠 수 있으면 멈추고 보고한다.
  - 올리기를 누르면 시트를 닫아도 된다(기존과 같음). 진행 상태는 곡 편집 화면의 트랙 행과 헤더 칩에 파일마다 보인다.
- **새 문구(이것만):** "n개 올리기", "제외", "20개까지 올릴 수 있어요".
- **테스트:**
  - `prepareUploadBatch`: 3개 정상 / 형식 오류 1개 제외 / 300MB 초과 제외 / 21개 → 20개 + `truncated` / 확장자 뺀 이름.
  - 3개 고르고 "3개 올리기" → `enqueue`가 고른 순서로 3번, 각 `title`이 파일명.
  - 1개 고르면 기존 화면(이름 입력란 1개)이 그대로 나온다.
  - 악보 시트·교체 입력에는 `multiple` 속성이 없다.

**L3. 새 화면 폭·비율 (명세 §4-4b V24, 사용자 캡처)**
- **증상:** 운영진 "연습곡" 탭이 화면 가운데 약 450px 폭으로 몰려 있다. "공연" 목록에서는 "곡 1"이 제목 옆에서 줄바꿈돼 행이 어긋난다.
- **유력한 원인(확인 후 보고):** `.admin-practice-container`가 `max-width: 800px; margin: 0 auto`만 있고 `width: 100%`가 없다. 부모가 가운데 정렬 flex이면 내용 폭만큼 줄어든다. 다른 운영진 탭의 바깥 컨테이너 클래스를 찾아 **그 클래스를 그대로 쓰거나 같은 값**으로 맞춘다. 새 폭 값을 지어내지 않는다.
- **할 일:**
  1. 다른 운영진 탭(출석 탭 등)의 바깥 컨테이너 클래스와 값을 찾아 보고서에 적는다(파일:줄).
  2. 연습곡 탭(곡 목록·공연 목록·공연별 순서)에 같은 폭과 여백을 적용한다.
  3. 목록 행: 제목은 `min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap`. 오른쪽 숫자·상태는 `flex-shrink: 0; white-space: nowrap`.
  4. 시트·모달은 휴대폰에서 화면 폭 전체, PC에서는 최대 560px 가운데(§4-4b).
  5. CSS는 `src/styles/v3/adminPractice.css`에만 쓴다. 인라인 스타일로 폭을 고치지 않는다(R7). `index.css` 순증가 40줄 제한(가드)을 지킨다.
- **캡처 확인(필수):** 개발 서버에서 브라우저 도구로 아래 화면을 **390×844와 1280×800 두 크기**로 캡처해 보고서에 첨부한다.
  - 운영진: 연습곡 곡 목록, 공연 목록, 공연별 순서, 곡 편집, 음원 올리기 시트(파일 3개 목록 모드)
  - 단원: 홈, 연습실 목록, 곡 상세, 전체 화면 플레이어, 악보 보기
  - 캡처를 못 했으면 **"미확인"**으로 적는다. 캡처 없이 "확인함"이라고 쓰지 않는다(R13).
  - 캡처에서 다른 화면도 비율이 어긋나 보이면 고치지 말고 목록으로 보고한다(범위 밖 수정 금지).

**L4. 반복 버튼의 "전체" 표시 제거 (임시, 명세 §3-3)**
- **원인:** `FullPlayer.tsx`의 반복 버튼이 `{repeatOne ? '1곡' : '전체'}`를 보여 준다. 실제 동작은 "한 곡 반복 켬/끔"뿐이라, 꺼진 상태가 "전체 재생"처럼 보인다.
- **할 일:** 글자를 없애고 아이콘만 둔다. 켜짐은 `--brand-lavender` + `aria-pressed="true"`, `aria-label="한 곡 반복"`. 꺼짐은 흐린 흰색.
- 목록 전체 재생과 3단계 반복은 V3-19에서 만든다. 이번에는 동작을 바꾸지 않는다.
- **테스트:** 반복 버튼에 "전체" 글자가 없다. 누르면 `aria-pressed`가 바뀐다.

**마무리:** `docs/DEV_LOG.md`에 L1~L4 요약. PR #27에 푸시하고 멈춘다. 보고는 §5 형식 + L3 캡처.

### V3-19 플레이어 v2 (v3-A, 2026-11-23 추가)

> 명세 V25, §3-1 "전체 재생", §3-3 전체(새로 씀), §4-2 "대표" 표시, §6 토큰 3개, §9 `YT_MINIMIZE_HINT_COUNT`, 수용 기준 36~40.
> **시안:** https://claude.ai/artifact/78R1NaARRVq6a9zKrpZM9r 의 `Player`, `PlayerQueue`, `PlayerVideo`, `PlayerMini`. 사용자가 확정한 화면이다. 값(크기·색·배치)은 시안과 명세를 따르고, 시안에만 있고 명세에 없는 글자(예: "↑ 유튜브 공식 플레이어 · 시안 표시용")는 넣지 않는다.
> 브랜치 `feat/v3-member-ux`(PR #27). V3-18이 끝난 뒤 시작한다. 커밋은 M번호 하나에 하나.

**M1. 재생 목록 순수 함수 + 토큰**
- 새 파일 `src/utils/practiceQueue.ts`(+`practiceQueue.test.ts`). React 없이 순수 함수만.
  - `getRepresentativeTrack(pieceId, tracks, config): PracticeTrack | null` — `filterPlayableAudioTracks`(기존, `src/utils/audioQueue.ts`)를 **재사용**하고 `orderIndex` 오름차순 첫 항목.
  - `buildPieceQueue(pieceId, catalog, config)` / `buildPerformanceQueue(performanceId, catalog, config)` → `PlayableTrackItem[]`. 공연 곡 대상·순서는 §3-1 공연 목록을 만드는 기존 함수(`src/utils/practiceScope.ts` 등)를 **재사용**한다. 같은 규칙을 새로 쓰지 않는다(R2). 쓰는 함수 이름과 위치를 보고한다.
  - `type RepeatMode = 'off' | 'all' | 'one'`, `cycleRepeat(mode)`(off→all→one→off).
  - `indexOnTrackEnd(index, length, mode): number | null`(null = 정지), `indexOnNext(index, length, mode): number | null`, `actionOnPrevious(index, currentTime): { type: 'restart' } | { type: 'go'; index: number }`(3초 기준).
- 토큰 `--player-gradient-top`, `--player-gradient-mid`, `--player-accent`을 `src/index.css`의 라이트·다크 양쪽에 추가(§6). 가드 테스트가 통과해야 한다.
- **테스트:** 대표 음원(순서 1이 보관 → 순서 2, 유튜브만 있는 곡 → null), 공연 큐(영상만 있는 곡 제외, 순서), 반복 순환, 끝났을 때 3가지 모드 × 마지막/중간, 이전 3초 경계(3.0초는 이전 항목, 3.01초는 처음으로).

**M2. 플레이어 상태 (`AudioPlayerProvider`)**
- `repeatOne`·`autoNext`·`toggleRepeatOne`·`toggleAutoNext`를 **`repeatMode`·`cycleRepeat`로 바꾼다.** 기존 `getNextTrackIndex`(`audioQueue.ts`)는 M1 함수로 대체하고 지운다(테스트도 정리, R9 예외).
- 추가: `queueSource: { kind: 'piece' | 'performance'; id: string; title: string } | null`, `playQueue(source, items, startIndex, repeatMode)`, `previousTrack()`, `playQueueIndex(index)`.
- 곡 상세에서 음원을 누르면 `playQueue({kind:'piece'…}, buildPieceQueue(...), 그 트랙 위치, 'one')`.
- Media Session: `previoustrack`/`nexttrack`은 큐 길이 2 이상일 때만 등록, 아니면 `null`로 해제.
- **파일 크기:** `AudioPlayerProvider.tsx`가 이미 400줄을 넘는다. 더 늘리지 말고, Media Session 등록은 새 훅 `src/components/audio/useMediaSession.ts`로 옮긴다. 옮긴 뒤 줄 수를 보고한다.
- **테스트:** 곡 출처 시작 시 `repeatMode === 'one'`, 공연 출처 시작 시 `'off'`, 트랙 끝 이벤트 3가지, 큐 길이 1이면 `nexttrack` 핸들러가 `null`.

**M3. 전체 화면·미니 바·재생 목록 시트 디자인 (시안 `Player`, `PlayerQueue`)**
- `FullPlayer.tsx`를 시안대로 다시 배치한다(§3-3-3). 새 파일:
  - `src/components/audio/PlayerControls.tsx` (조작 1·2줄)
  - `src/components/audio/PieceTracksCard.tsx` ("이 곡의 음원")
  - `src/components/audio/QueueSheet.tsx` (§3-3-4)
- CSS는 `src/styles/v3/fullPlayer.css`·`player.css`에만. 색은 토큰만(인라인 hex 금지, R7). 아이콘은 인라인 SVG.
- 미니 바: "다음"은 큐 기준, × 유지(§3-3-2).
- **새 문구(이것만):** "재생 목록", "이 곡의 음원", "영상", `곡`, `공연`, "전체 재생", "대표", "영상은 플레이어를 열어야 재생돼요", `aria-label` 목록은 명세 §3-3 표 그대로.
- **테스트:** 반복 버튼 3번 누르면 `aria-label`이 명세 순서대로, 다음 버튼 비활성 조건, 재생 목록 시트 행 클릭 → `playQueueIndex`, 지나간 항목 흐림 클래스.

**M4. 연습실 "전체 재생" + 운영진 "대표" 표시**
- 연습실 목록: 범위가 공연이고 `buildPerformanceQueue` 결과가 1개 이상일 때만 버튼(§3-1). 누르면 `playQueue(..., 0, 'off')` 후 전체 화면 플레이어 열기(`navigate` OPEN player).
- 운영진 곡 편집 트랙 목록: `getRepresentativeTrack`이 고른 행에 "대표"(§4-2). **같은 함수**를 쓴다.
- **테스트:** 버튼 표시 조건(공연/전체 곡/공연 미정/대표 0개), 클릭 시 큐 내용과 순서, 트랙 순서를 바꾸면 "대표"가 옮겨 감.

**M5. 플레이어 안 유튜브 (시안 `PlayerVideo`, `PlayerMini`, 명세 §3-3-5)**
- 새 파일 `src/services/media/youtubeIframeApi.ts`: `loadYoutubeIframeApi(): Promise<YT>`. 스크립트 태그를 **한 번만** 넣고 `window.onYouTubeIframeAPIReady`를 기다린다. 이미 있으면 바로 돌려준다. 10초 안에 안 되면 실패로 돌려주고, 화면은 영상 대신 유튜브 앱으로 열기 버튼만 남긴다(`console.warn`, 빈 catch 금지).
  - 타입은 **필요한 메서드만 직접 선언**한다(`@types/youtube` 설치 금지).
- 새 컴포넌트 `src/components/audio/VideoStage.tsx`: 커버 자리에 `YT.Player` 생성, `playerVars`·`referrerPolicy`는 명세 그대로. 언마운트 시 `destroy()`.
- 상태: Provider에 `activeVideo: { track: PracticeTrack; pieceTitle: string; resumeAt: number } | null`. 영상 시작 시 앱 음원 `pause`. 영상이 있는 동안 이전·다음·반복 비활성, Media Session 핸들러 해제.
- 내릴 때: 위치 저장 → `destroy`. 다시 열면 저장 위치부터(명세 §3-3-5).
- 토스트: 내릴 때 `readPreference(YT_MINIMIZE_HINT_COUNT)`가 2 미만이면 3초 표시 후 +1 저장. 저장 실패 시 보이지 않게(실패 값 2).
- 속도: `getAvailablePlaybackRates()`에서 가장 가까운 값. 계산은 `practiceQueue.ts`에 `nearestRate(rates, target)`로 두고 테스트한다.
- **테스트:**
  - 스크립트 태그 1개만 생김(두 번 호출)
  - 영상 시작 시 음원 `pause` 호출
  - 내림 → `destroy`, 다시 열기 → 저장 위치로 `seekTo`
  - 토스트 0→1→2회 후 안 보임, 저장 실패 시 안 보임
  - `nearestRate([0.25,0.5,0.75,1,1.25,1.5,1.75,2], 0.8) === 0.75`
  - 첫 화면 청크에 `iframe_api` 문자열 없음(빌드 결과 grep, 보고)

**M6. 확인과 보고**
- 수용 기준 36~40을 번호별로 통과/미확인 보고.
- 캡처: 390×844로 전체 화면(음원), 재생 목록 시트, 영상 재생, 미니 바 + 토스트, 연습실 "전체 재생" 버튼, 운영진 "대표" 표시. 시안과 나란히 비교해 다른 점을 목록으로 적는다. 캡처를 못 했으면 "미확인"(R13).
- 실제 유튜브 재생·전체 화면·잠금 화면 동작은 **사용자 휴대폰 확인 항목**으로 남긴다.

**하지 말 것(V3-19):** 사용자 재생 목록(만들기·순서 바꾸기·저장), 공연별 대표 음원 지정 칸, 셔플, 숨긴 iframe으로 소리만 재생, DB 변경.

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
