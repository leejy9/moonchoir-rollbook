# 16b. 단원 UX 개편 · 연습실 전체 실행 계획표 (Execution Plan)

> 관련 문서: [AGENTS.md](../../AGENTS.md) 시스템 헌장 · [MEMBER_UX_AUDIO_SPEC.md](../MEMBER_UX_AUDIO_SPEC.md) (최우선 명세 v2) · [16_member_ux_studio_implementation_guide.md](16_member_ux_studio_implementation_guide.md) (작업 지시서) · [DEPLOYMENT.md](../DEPLOYMENT.md) §0

---

## 1. 지시서 §0 "절대 규칙" 및 §6 "자주 하는 실수" 요약

### 1-1. 절대 규칙 (Zero Tolerance Rules)
1. **티켓 1개 = 커밋 1개**: 티켓 간 작업을 섞지 않으며, 각 티켓에 명시된 파일만 수정한다. "수정하는 김에" 임의 리팩터링/이름 변경 절대 금지.
2. **명세 범위 엄격 준수**: 명세 v2에 없는 기능·문구·색상·애니메이션을 추가하지 않으며, 화면 문구에 이모지를 넣지 않는다. 색상은 인라인 hex 대신 `src/index.css`의 CSS 변수(`var(--brand-primary)` 등)만 쓴다.
3. **결정론적 센서(Green Bar) 4종 필수 통과**: 커밋 전 매번 `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`를 100% 통과시킨다. 테스트를 삭제하거나 `skip`/`only`를 붙이거나 임의로 기대값을 왜곡하지 않는다.
4. **패키지 설치 및 운영 DB 직접 실행 금지**: 새 npm 패키지 설치 금지(`package.json`/`package-lock.json` 무변경). 운영 Supabase DB에 직접 SQL을 실행하지 않으며(마이그레이션 파일 작성 후 사용자가 실행), 시크릿(PIN/토큰/키)을 코드·문서·커밋·채팅에 노출하지 않는다.
5. **Phase 0 보안 구조 보호**: 기존 관리자 함수 수정 시 반드시 `fn_xxx__impl`만 `create or replace`하고 `fn_xxx` 래퍼는 건드리지 않는다. 신규 내부 SQL 함수는 anon 실행 권한을 즉시 취소(`revoke all`)한다.
6. **Task 76(본인 인증) 및 레벨·배지 구현 보류**: 이번 작업 범위가 아니며 임의 구현하지 않는다.

### 1-2. 자주 하는 실수 방지 체크리스트
1. **DB 보안 래퍼 훼손 금지**: `fn_xxx` 래퍼를 덮어쓰면 서버 토큰 검사가 풀리므로 본문 수정 시 반드시 `fn_xxx__impl`만 수정.
2. **숨김 일정 누출 방지**: 단원 화면의 일정 조망은 반드시 `sheetsService.getSchedulesForMember(memberId)`를 통해서만 접근(`getSchedules()` 단원 화면 직접 호출 금지).
3. **동일인 판정 원칙**: 이름이 아닌 `id`와 `resolveMergedMemberIds`로만 판정.
4. **시간대 고정**: 일정 날짜/시각은 KST 파싱 함수, 오늘 날짜는 `getKSTDateString()`만 사용(`new Date('YYYY-MM-DDTHH:mm')` 금지).
5. **서버 확정 기반 출결 표시**: 낙관적 완료 표기를 지양하고 서버가 확정한 데이터(`reconcileAttendance`)로만 출석 완료를 표기.
6. **동적 메타데이터 보존**: 파트, 상태, 일정구분, 트랙 종류를 닫힌 enum으로 막지 않고 모르는 문자열도 원문 그대로 보존.
7. **테스트 시간 고정**: `new Date()`를 함수 내부에서 직접 호출하지 않고 `now: Date` 인자로 주입받아 결정론적으로 테스트.

---

## 2. 전체 티켓 실행 계획표

진행 순서: **Phase 1 (P1-01 ~ P1-12) → Phase 2a (P2a-01 ~ P2a-05) → Phase 3 (P3-01 ~ P3-04) → Phase 2b (P2b-01 ~ P2b-06)**

| 순서 | 티켓 ID | 한 줄 설명 | 고칠 파일 | 선행 티켓 | 사용자 확인 필요 | 상태 |
| :---: | :---: | :--- | :--- | :---: | :---: | :---: |
| **[Phase 1]** | | **셸, 오늘, 일정 (브랜치: `feat/member-ux-phase1`)** | | | | |
| 1 | `P1-01` | 출석 창·투표 마감 시간을 KST로 고정하고 60분 상수 통합 | `src/utils/timeWindow.ts`, `src/utils/timeWindow.test.ts` | 없음 | 아니오 | 완료 (04f5c99) |
| 2 | `P1-02` | 해시 라우팅 순수 함수(`parseRoute`, `formatRoute`, `navReducer`) 구현 | `src/utils/route.ts`(신규), `src/utils/route.test.ts`(신규) | P1-01 | 아니오 | 완료 (862d227) |
| 3 | `P1-03` | 오늘 집중 일정 선택을 순수 함수로 추출 (`selectTodayFocus`) | `src/utils/todayFocus.ts`(신규), `src/utils/todayFocus.test.ts`(신규), `src/components/HomeView.tsx` | P1-01 | 아니오 | 완료 (da19229) |
| 4 | `P1-04` | CTA 상태 판정 순수 함수 구현 (`deriveTodayCta`) | `src/utils/todayCta.ts`(신규), `src/utils/todayCta.test.ts`(신규) | P1-01 | 판정 매핑 확인 | 완료 (95fd72b) |
| 5 | `P1-05` | 지도 링크, D-Day, 출석 인원 집계 등 순수 함수 묶음 | `src/utils/kakaoMaps.ts`, `src/utils/date.ts`, `src/utils/rsvpTally.ts`, `src/utils/calendar.ts` 및 각 `.test.ts` | P1-01 | 아니오 | 완료 (f4f92af) |
| 6 | `P1-06` | 앱 셸, 헤더(`AppHeader`), 하단 탭(`BottomNav`), 라우팅 연결 | `src/App.tsx`, `src/components/AppHeader.tsx`(신규), `src/components/BottomNav.tsx`(신규), `src/hooks/useMasterEntryGesture.ts`(신규), `src/hooks/useHashRoute.ts`(신규), `src/components/HomeView.tsx`, `src/index.css` | P1-02, P1-05 | 아니오 | 완료 (110398f) |
| 7 | `P1-07` | 오늘 탭(`TodayTab`) 구현 및 카드 경량화 | `src/components/TodayTab.tsx`(신규), `src/components/home/HomeActiveScheduleCard.tsx`, `src/components/TodayTab.test.tsx` | P1-03, P1-04, P1-06 | 뷰포트 확인 | 완료 (84a1ee7) |
| 8 | `P1-08` | 일정 상세 바텀시트(`ScheduleDetailSheet`, `ScheduleDetailBody`) | `src/components/ScheduleDetailSheet.tsx`(신규), `src/components/ScheduleDetailBody.tsx`(신규) 및 테스트 | P1-06 | 아니오 | 완료 (e7133c1) |
| 9 | `P1-09` | 일정 탭(`CalendarTab`) 구현 및 기존 `CalendarView.tsx` 폐기 | `src/components/MonthCalendarGrid.tsx`(승격), `src/components/CalendarTab.tsx`(신규), `src/components/CalendarView.tsx`(삭제), `src/App.tsx` 등 | P1-08 | 아니오 | 완료 (1c1156c) |
| 10 | `P1-10` | QR 대상 일정 명시(`scheduleId`) 및 RSVP `alert()` 인라인화 | `src/App.tsx`, `src/components/RSVPModal.tsx` | P1-07 | 아니오 | 완료 (877cfc4) |
| 11 | `P1-11` | Supabase 백그라운드 새로고침 비용 최적화 (실시간 중 5분) | `src/App.tsx`, `src/services/realtime/supabaseRealtime.ts` | P1-06 | **질문 필수** (A/B 선택) | 완료 (aa4104b) |
| 12 | `P1-12` | Phase 1 문서 갱신 | `docs/ARCHITECTURE_RECOVERY.md`, `docs/tasks.md`, `docs/DEV_LOG.md` | P1-01~11 | 아니오 | 완료 (44e119c) |
| **[Phase 2a]** | | **연습곡 데이터 (브랜치: `feat/practice-catalog-phase2a`)** | | | | |
| 13 | `P2a-01` | 연습곡 및 트랙 도메인 타입 정의 | `src/types/rollbook.ts`, `src/types/schema.test.ts` | P1 완료 (또는 main) | 아니오 | 완료 (1997df6) |
| 14 | `P2a-02` | 마이그레이션 SQL 및 검증 스크립트 작성 | `supabase/migrations/20261122000000_practice_catalog.sql`(신규), `supabase/tests/practice_catalog_check.sql`(신규) | P2a-01 | **사용자 적용 필수** | 완료 (19312bc) |
| 15 | `P2a-03` | Supabase 백엔드 매핑, 카탈로그 파서, 재생 방식 판정 | `src/services/backend/supabaseBackend.ts`, `src/services/sheetsParser.ts`, `src/utils/practiceMedia.ts`(신규) 및 테스트 | P2a-01 | 아니오 | 완료 (e0efd46) |
| 16 | `P2a-04` | `SheetsService` 카탈로그 조회 및 편집 메서드 추가 | `src/services/sheets.ts`, `src/services/sheetsStorage.ts`, `src/services/sheets.test.ts` | P2a-03 | 아니오 | 완료 (ade7900) |
| 17 | `P2a-05` | 관리자 화면 연습곡 관리 탭(`AdminPracticeTab`) 신설 | `src/components/admin/AdminPracticeTab.tsx`(신규), `src/components/AdminDashboard.tsx` | P2a-04 | 아니오 | 완료 (6dc1986) |
| **[Phase 3]** | | **내 활동 (브랜치: `feat/member-profile-phase3`)** | | | | |
| 18 | `P3-01` | 회차별 출결 기록 조립 순수 함수 추출 (`buildMemberScheduleRecords`) | `src/utils/memberRecords.ts`(신규) 및 테스트, `src/components/MemberPortalModal.tsx` | P1-06 | 아니오 | 완료 (962b6b0) |
| 19 | `P3-02` | 운영진 판정 하드코딩 제거 및 `isStaffMember()` 구현 | `src/utils/staff.ts`(신규) 및 테스트, `src/components/TodayTab.tsx`, `src/components/MemberPortalModal.tsx` | P3-01 | **질문 필수** (판정 기준) | 완료 (7aa2683) |
| 20 | `P3-03` | `MemberPortalModal` → `ProfileTab` 탭 화면 전환 | `src/components/ProfileTab.tsx`(신규), `src/components/MemberPortalModal.tsx`, `src/App.tsx`, `src/components/BottomNav.tsx` | P3-02 | 아니오 | 완료 (60b5d13) |
| 21 | `P3-04` | 과거 보관 일정(Archived) 출결 기록 포함 옵션 적용 | `src/components/ProfileTab.tsx`, `src/utils/memberRecords.ts` 및 테스트 | P3-03 | 아니오 | 완료 (435c11d) |
| **[Phase 2b]** | | **R2, Worker, 연습실, 플레이어 (브랜치: `feat/studio-player-phase2b`)** | | | | |
| 22 | `P2b-01` | Cloudflare Worker 스트리밍 소스 및 설치 안내서 작성 | `workers/media/index.js`(신규), `workers/media/README.md`(신규) | P2a-04 | **질문 필수** (CORS 주소) | 완료 (c02ef12) |
| 23 | `P2b-02` | 전역 오디오 플레이어 Provider 및 미니 플레이어 바 구현 | `src/components/audio/AudioPlayerProvider.tsx`(신규), `src/components/audio/MiniPlayer.tsx`(신규), `src/utils/audioQueue.ts`(신규), `src/App.tsx` | P1-06, P2a-04 | 아니오 | 완료 (3fa8bbc) |
| 24 | `P2b-03` | 연습실 탭(`StudioTab`) 신설 및 QR 스캔 시 일시정지 연동 | `src/components/StudioTab.tsx`(신규), `src/components/BottomNav.tsx`, `src/utils/route.ts`, `src/components/QRScannerModal.tsx` | P2b-02 | 아니오 | 완료 (0cfb942) |
| 25 | `P2b-04` | iOS 홈 화면 PWA 독립 앱 안내 배너 | `src/components/StudioTab.tsx` | P2b-03 | 아니오 | 대기 |
| 26 | `P2b-05` | 운영진 음원 인코딩 및 업로드 가이드 작성 | `docs/user-guide/practice_audio_upload.md`(신규) | P2b-01 | 아니오 | 대기 |
| 27 | `P2b-06` | 실기기 13개 항목 테스트 기록표 작성 및 검수 요청 | `docs/plans/16a_studio_device_test_log.md`(신규) | P2b-04 | **사용자 테스트 필수** | 대기 |

---

## 3. 사용자 확인 및 사전 질문 지점 (지시서 §5 기준)

다음 4가지 질문에 대해 답변을 주시면, 작업 도중 멈추지 않고 즉시 반영하여 진행할 수 있습니다.

### 질문 1: [P1-11] 백그라운드 30초 전체 스냅샷 폴링 주기 최적화
- **현상**: Supabase 모드에서 화면이 켜져 있을 때 웹소켓 실시간 리스너가 살아있음에도 불구하고 30초마다 전체 데이터를 다시 폴링합니다(`App.tsx:108-112`).
- **선택지**:
  - **선택지 A (권장)**: 웹소켓 실시간 연결이 정상일 때는 폴링 주기를 **5분**으로 늘리고, 웹소켓 연결이 끊겼을 때만 30초 백업 폴링으로 동작하게 변경.
  - **선택지 B**: 현재대로 30초 폴링 유지.

### 질문 2: [P3-02] 운영진 메뉴 노출 판정 기준 (`isStaffMember`)
- **현상**: 현재 코드에는 `'이재현'` 및 전화번호 뒷자리 `'2440'`이 하드코딩되어 있습니다.
- **질문**: 운영진 메뉴(`운영진 콘솔 진입`)를 노출할 단원의 판정 기준을 무엇으로 할까요?
  - **옵션 A (권장)**: 명부의 역할 기준 `member.role === 'ADMIN' || member.role === 'MASTER'`
  - **옵션 B**: 위 조건에 `member.memberStatus === '선생님'` 포함
  - **옵션 C**: 기타 지정할 조건 (의견 제시 가능)
  *(참고: 이 판정은 메뉴 노출용일 뿐이며, 실제 관리자 진입 시에는 PIN 검증 및 서버 토큰 검사가 수행됩니다.)*

### 질문 3: [P2b-01] Cloudflare Worker CORS 허용 출처 (앱 주소)
- **질문**: R2 음원 스트리밍을 제공할 Worker에서 CORS로 허용할 도메인 목록은 다음과 같이 설정하면 될까요?
  - `https://leejy9.github.io` (프로덕션 GitHub Pages)
  - `http://localhost:5173`, `http://localhost:4173` (로컬 개발 및 프리뷰)
  - 혹시 향후 연결할 별도의 커스텀 도메인이 있다면 미리 알려주세요.

### 질문 4: [P2a-02] 마이그레이션 적용 방식 확인
- 에이전트는 `supabase/migrations/20261122000000_practice_catalog.sql`과 검증 쿼리만 작성하며 운영 DB에는 절대 실행하지 않습니다.
- 티켓 완료 보고 시 사용자가 Supabase 대시보드의 SQL Editor에 직접 복사-붙여넣기하여 실행할 수 있도록 정갈한 SQL 블록을 전달하는 절차로 진행함을 확인해 주세요.

---

## 4. 명세와 지시서, 문서와 실제 코드 간 차이점 보고

문서를 정밀 검토한 결과 발견된 차이점과 대응 방식입니다:

1. **Phase 진행 순서의 명시**:
   - 지시서 본문 §3은 `Phase 1 → Phase 2a → Phase 2b → Phase 3` 순서로 적혀 있으나, 사용자 요청 사항에서 **`Phase 1 → Phase 2a → Phase 3 → Phase 2b`** 순서로 명시되었습니다.
   - **대응**: Phase 3(`내 활동`)은 P1-06(라우팅/셸)에만 의존하므로 Phase 2a 완료 후 즉시 진행 가능하며, Cloudflare 인프라 배포가 필요한 Phase 2b를 마지막에 배치하는 것이 작업 흐름상 훨씬 매끄럽고 완벽히 호환됩니다.
2. **`CalendarView.tsx` 폐기 영향도 확인**:
   - 지시서 P1-09에서 `CalendarView.tsx`를 삭제하도록 지시하여 코드베이스 전체 검색(`grep -rn "CalendarView" src`)을 수행했습니다.
   - **결과**: `src/components/CalendarView.tsx`는 오직 `src/App.tsx:6`에서만 import되고 있었으며, 관리자용인 `src/components/admin/AdminCalendarView.tsx`는 완전히 독립적이어서 영향이 없습니다. 따라서 P1-09에서 안전하게 삭제 가능합니다.
3. **P1-04 CTA 상태와 `reconcileSingleMemberAttendance` 결과 매핑 일치**:
   - `attendanceStats.ts`의 `finalStatus`(`'출석'`, `'지각'`, `'결석'`, `'사유결석'`, `'미참'`) 및 `isManualOverride` 플래그와 명세 §2-3의 CTA 판별 유니언(`ATTENDED`, `LATE`, `MANUAL_OK`, `MANUAL_ABSENT`, `EXCUSED`, `CLOSED_ABSENT`, `CLOSED_EXEMPT` 등)이 1:1로 정확히 대응됨을 확인했습니다.
4. **Phase 0 보안 기반 선반영 상태 확인**:
   - 최근 main 브랜치 pull(`dba3a56`)을 통해 Phase 0 보안 강화(`adminSession.ts`, `20261121000000_security_hardening.sql`, `supabaseBackend.ts` 토큰 자동 주입)가 이미 완료되어 있으며 52개 테스트 파일 362개 테스트가 100% 통과(Green Bar) 상태임을 확인했습니다.
