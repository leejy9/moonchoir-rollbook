# [계획서 04] 단원 출결 포털(내 성적표 & 원천 로그) & 캘린더 일체형 홈 화면 구축 (Task 15 & 16)

> **작성 일자**: 2026-10-17  
> **상태**: 계획 수립 및 착수 (In Progress)  
> **담당**: Moonchoir AI 하네스 에이전트  
> **관련 문서**: [DATA_SCHEMA.md](file:///Users/grasshop/Desktop/Antigravity/Moonchoir_rollbook/docs/DATA_SCHEMA.md), [tasks.md](file:///Users/grasshop/Desktop/Antigravity/Moonchoir_rollbook/docs/tasks.md)  
> **핵심 헌법**: [AGENTS.md](file:///Users/grasshop/Desktop/Antigravity/Moonchoir_rollbook/AGENTS.md)

---

## 1. 개발 배경 및 목적

### 1) 단원 본인 출결 포털 부재 해소 (Task 15)
- **현재 상황**: 헤더 상단 우측의 `[파트 | 이름]` 알약 버튼을 누르면 무조건 기기 재바인딩 모달(`BindingModal`)이 열려 다른 단원으로 변경하라는 창만 뜸.
- **문제점**:
  - 일반 단원이 "내가 지금까지 연습 몇 번 출석했지?", "지난주 연습 몇 시 몇 분에 출석 처리됐지?", "다음 연습에 투표는 제대로 들어갔나?"를 스스로 확인할 수 있는 화면이 전무함.
- **해결 방안**:
  - `[파트 | 이름]` 클릭 시 단원 전용 출결 포털(`MemberPortalModal.tsx`)을 오픈.
  - 내 누적 출석률(%), 인정 출석 회수, 지각/결석, 뱃지(`[개근 🌟]`, `[우수 👍]`, `[💡 게스트 N회]`)를 토스 모바일 카드 스타일로 시각화.
  - 구글 시트에 Append-only로 보존된 나의 **원천 출석 로그 타임라인(일시, 인증수단, 위치검증)**과 **사전 투표 이력**을 투영 뷰로 투명하게 열람.
  - 필요할 때만 하단 서브 메뉴를 통해 `[기기 바인딩 변경]` 또는 `[시트 데이터 동기화]`를 수행하도록 개선.

### 2) 캘린더 일체형 홈 화면 레이아웃 (Task 16)
- **현재 상황**: 홈 화면에는 대형 단일 연습 카드 1개만 노출되고, 이번 달 전체 일정을 보려면 별도의 `CALENDAR` 뷰로 화면을 전환해야 함.
- **해결 방안**:
  - 홈 화면 상단에 인터랙티브 월간 미니 캘린더를 일체형으로 배치.
  - 날짜별로 연습일(보라색 점), 내가 출석한 날(초록색 체크 점)을 직관적으로 표기.
  - 날짜를 탭하면 바로 아래의 메인 일정 카드가 해당 일자로 동적 전환되어 일정 상세, 시간 윈도우 기반 액션(RSVP 투표 vs 현장 QR 출석)을 즉시 수행.
  - 하단에 "다가오는 연습 일정 목록"을 배치하여 다음 주, 다다음 주 일정을 스크롤로 연속 확인 가능.

---

## 2. 세부 구현 단계 (Action Plan)

### Step 1: `MemberPortalModal.tsx` 컴포넌트 신규 구현
- **프로필 정보**: 이름, 파트, 회원상태, 입단일(`joinedAt`)
- **출결 요약 카드**:
  - `attendanceStats.ts`의 `calculateCumulativeAttendanceWithLifecycle`를 활용하여 입단일 이전 모수 제외 및 휴단원 옵트인이 완벽히 반영된 개인 출결 통계 산출.
  - 누적 출석률(%), 출석 회수 / 총 모수 회차, 뱃지 시각화.
- **원천 출석 로그 타임라인 (Event Sourcing Projection)**:
  - 본인의 `RawAttendanceLog` 목록을 최신순으로 정렬.
  - 일정명, 출석 일시(KST `YYYY-MM-DD HH:mm:ss`), 출석 수단(QR, PIN, 관리자 수동), 위치 검증 여부(`📍 위치 인증 통과` vs `⚠️ 원격 체크`).
- **사전 투표(RSVP) 이력 및 바로가기**:
  - 향후 일정에 대한 내 투표 상태(참석/불참) 확인 및 투표 수정 연결.
- **하단 유틸리티 액션**:
  - `[🔄 최신 정보 동기화]`, `[⚙️ 기기 바인딩 변경]`, `[✕ 닫기]`.

### Step 2: `HomeView.tsx` 캘린더 일체형 레이아웃 개편
- 상단: `InteractiveMiniCalendar` 컴포넌트/인라인 그리드 통합
  - 이전/다음 달 이동
  - 연습일 점 표시 및 내가 출석한 날 체크 표시
  - 날짜 선택 시 `selectedSchedule` 동적 변경
- 중앙: `ActiveScheduleCard` (선택된 일정 상세 + 시간 윈도우 액션)
- 하단: `UpcomingScheduleList` (다가오는 일정 큐)
- 헤더 프로필 버튼 클릭 시 `MemberPortalModal` 열기 연결.

### Step 3: `App.tsx` 상태 흐름 연결
- `showMemberPortalModal` 상태 추가 및 연동.
- 기기 바인딩 모달과의 분리 및 시트 새로고침 트리거 연계.

### Step 4: 검증 및 테스트
- `src/components/MemberPortalModal.test.tsx` 작성
- `npm run lint` $\rightarrow$ 0 warnings, 0 errors
- `npm run typecheck` $\rightarrow$ 0 errors
- `npm test` $\rightarrow$ 전원 통과
- `npm run build && npm run deploy` 배포 완료

---

## 3. 사전 트러블슈팅 및 엣지 케이스 대응
1. **신입 단원의 통계 표시**:
   - 입단일 이전 일정이 모두 모수에서 제외되어 총 회차가 0회인 경우 `출석률 100% (신입 단원)`으로 방어하여 0으로 나누기(NaN) 에러 방지.
2. **오프라인/로컬 캐시 동기화**:
   - 포털 열람 시 로컬 스토리지에 캐시된 로그와 시트 최신 로그를 안전하게 병합 표시.
3. **모바일 터치 타깃 44px 이상 유지**:
   - 캘린더 날짜 셀 및 포털 탭 버튼의 최소 터치 영역을 44px로 확보.
