# Moonchoir Rollbook — PIV Execution Tasks (`tasks.md`)

> **Spec Reference**: [docs/PRD.md](file:///Users/grasshop/Desktop/Antigravity/Moonchoir_rollbook/docs/PRD.md)  
> **Master Dev Log**: [docs/DEV_LOG.md](file:///Users/grasshop/Desktop/Antigravity/Moonchoir_rollbook/docs/DEV_LOG.md)  
> **Dedicated Plans**: [docs/plans/](file:///Users/grasshop/Desktop/Antigravity/Moonchoir_rollbook/docs/plans/)  
> **Harness Constitution**: [AGENTS.md](file:///Users/grasshop/Desktop/Antigravity/Moonchoir_rollbook/AGENTS.md)  
> **Workflow Rule**: 1 Task = 1 Commit / Verification (Green Bar: `typecheck`, `lint`, `test`)

---

## Task Progress Overview

### Phase 1: MVP Core (Completed)
- [x] **Task 1**: Domain Models & Contract Definitions (`src/types/rollbook.ts`)
- [x] **Task 2**: Offline Mock Database & Google Sheets Adapter (`src/services/sheets.ts`, `src/services/mockData.ts`)
- [x] **Task 3**: Device Fingerprint Binding & Onboarding Modal (`src/services/auth.ts`, `src/components/BindingModal.tsx`)
- [x] **Task 4**: Zero-Install Web Camera QR Scanner Component (`src/components/QRScannerModal.tsx`)
- [x] **Task 5**: Unified Mobile Landing View with Today Rehearsal & RSVP Card (`src/components/HomeView.tsx`, `src/components/RSVPModal.tsx`)
- [x] **Task 6**: Interactive Calendar Scheduler & Month Overview (`src/components/CalendarView.tsx`)
- [x] **Task 7**: Master Admin Dashboard & Audit Trail Projection (`src/components/AdminDashboard.tsx`)
- [x] **Task 8**: End-to-End Integration, Style Polish & Production Build Verification

### Phase 2: Professional Admin & Recurring Calendar Engine (Completed)
- [x] **Task 9**: 영구 상설 마스터 QR 코드 & 인쇄 커스텀 & 외부 일정 현장 PIN 발급
  - 연습실 벽면 부착용 영구 상설 QR 생성 및 관리자 [QR 리프레시하기] 지원
  - 네이버 QR코드 만들기 스타일 커스텀 인쇄 (제목, 안내문구 직접 편집)
  - 외부 일정/장소 변경용 당일 4자리 PIN 발급 및 단원 입력 UI (GPS 100m 검증 병행)
- [x] **Task 10**: 네이버/애플 캘린더 스타일 반복 일정 등록 엔진 & 장소 프리셋
  - [매일/매주/평일/매월/사용자 지정 요일 다중 선택] 반복 UI 및 3~6개월 자동 전개 유틸
  - 연습 장소 프리셋(제1연습실, 제2연습실 등) 위경도 좌표/반경 자동 바인딩
  - 상세 설명 & 연습 곡목 텍스트에어리어 확장
- [x] **Task 11**: 기간별 누적 출결 통계 & 토스식 대원별 종합 성적표
  - 기간 필터 (최근 1개월, 3개월, 6개월, 올해 전체, 직접 지정)
  - 파트/태그 필터 및 단원 이름 실시간 검색
  - 체크박스 복수 선택 (Multi-select) 및 상단 핀포인트 집중 비교 분석 카드
  - 대원별 출석률(%), 지각/결석/공결 집계, 개근/우수/주의 뱃지, 최근 회차 도트
- [x] **Task 12**: 4대 전문 어드민 센터 구축
  - ① 출결 정책 및 연습실 장소 프리셋(좌표/반경 등록·수정·삭제)
  - ② 단원 명부 관리 (입단일 `joinedAt`, 회원 상태 `memberStatus`: 정단원/준단원/휴단원/퇴단원/선생님/객원, 비고 `note`, 기기 바인딩 초기화 리셋, 신규 단원 추가)
  - ③ 구글 시트 실시간 연결 진단 & 데이터 수신
  - ④ 관리자 마스터 PIN 변경
- [x] **Task 13**: 전수 검증 및 브라우저 시연
  - `typecheck`, `lint`, `test`, `build` 무결성 검증 (0 errors, 17/17 tests pass) 및 실제 모바일 브라우저 시연 완료

### Phase 2.5: 네이버 지도 픽커 & 구글 시트 장소정보 동기화 & 일정 일괄 관리 (Completed - [계획서 01](file:///Users/grasshop/Desktop/Antigravity/Moonchoir_rollbook/docs/plans/01_location_picker_and_sheets_sync.md))
- [x] **Task 20**: 네이버 지도 + 도로명 주소 검색 + 출석 반경 오버레이 (`LocationPickerMap.tsx`)
- [x] **Task 21**: 구글 시트 5번째 탭(`장소정보`) 양방향 동기화 및 역순 일괄 삭제 알고리즘 (`google-apps-script.js`, `sheets.ts`)
- [x] **Task 22**: 다중 일정 일괄 수정/삭제 모달 (`ScheduleEditModal.tsx`, `BatchScheduleEditModal.tsx`, `AdminDashboard.tsx`)

### Phase 3: 정기 일정 3단 제어, 시즌 복제, 인라인 UX & QR 매칭 안정화 (Completed - [계획서 02](file:///Users/grasshop/Desktop/Antigravity/Moonchoir_rollbook/docs/plans/02_schedule_batch_management_and_ux.md))
- [x] **Task 23**: 인라인 '직접 입력' (파트/카테고리) 및 일정 창에서 바로 새 장소 픽커(도로명/지도) 등록 연동
- [x] **Task 24**: QR 스캐너 상단 실시간 출석 일정 매칭 배지 표시 (상설/회차별 QR 자동 매칭 확인)
- [x] **Task 25**: `seriesId` 기반 정기 일정 3단 수정/삭제 (이 일정만 / 향후 모든 일정 / 전체 반복 일정)
- [x] **Task 26**: 시즌 일정 템플릿 복제 (`Duplicate Season`) 및 아카이빙(표시/숨기기) 필터
- [x] **Task 27**: 전수 검증 (Green Bar: `typecheck`, `lint`, `test`) 및 배포, DEV_LOG 업데이트

### Phase 3.5: 단원 생애주기 이력, 일정 카드 컨테이너 & 데이터 계약 검증 (Completed - [계획서 03](file:///Users/grasshop/Desktop/Antigravity/Moonchoir_rollbook/docs/plans/03_member_lifecycle_and_program_card.md) & [데이터 스키마](file:///Users/grasshop/Desktop/Antigravity/Moonchoir_rollbook/docs/DATA_SCHEMA.md))
- [x] **Task 28**: 마스터 데이터 계약 검증 테스트 구축 (`src/types/schema.test.ts`)
- [x] **Task 29**: 단원 생애주기 이력 모델 및 기간제(`startDate`~`endDate` + '영구') UI (`MemberProfileModal.tsx`)
- [x] **Task 30**: 입단일 및 이력 기반 출결 모수 필터링 & 옵트인 게스트 출석 엔진 (`attendanceStats.ts`)
- [x] **Task 31**: 회차 번호 제거 및 일정 카드(Program Card) 컨테이너 묶음 관리 UI (`AdminDashboard.tsx`)
- [x] **Task 32**: 센서 검증(Green Bar) 및 실서버 배포, `DEV_LOG.md` 업데이트

### Phase 4: 단원 경험(UX), 세션 안전성 & 자동화 백로그 (Planned)
- [ ] **Task 14**: 출석 QR 화면 UX & 사전 투표(RSVP) 시계 기반 상태 머신
  - 카카오톡 투표 연동 기술 한계 검토 및 웹앱 단일 채널 집중 전략
  - 시간 윈도우 기반 상태 전환: [연습 D-N일 ~ 연습 1시간 전: RSVP 투표] -> [연습 1시간 전 ~ 종료: 현장 QR 스캐너 활성화]
- [x] **Task 15**: 단원 전용 출결 포털 & 기기 명부 통신/파트 선택 오류 개선 (Completed - [계획서 04](file:///Users/grasshop/Desktop/Antigravity/Moonchoir_rollbook/docs/plans/04_member_portal_and_unified_calendar_home.md))
  - 일반 단원용 [내 출결 성적표 & 원천 로그 히스토리] 모달 (`MemberPortalModal.tsx`)
  - 실시간 누적 출석률, 입단일/생애주기 이력 반영, 출석 원천로그 타임스탬프 및 RSVP 이력 투영
  - 원클릭 구글 시트 동기화 및 기기 재바인딩 지원
- [x] **Task 16**: 홈 화면 캘린더 일체형 레이아웃 재배치 (Completed - [계획서 04](file:///Users/grasshop/Desktop/Antigravity/Moonchoir_rollbook/docs/plans/04_member_portal_and_unified_calendar_home.md))
  - 상단: 인터랙티브 월간 미니 캘린더 일체형 렌더링 (날짜별 연습 점, 내 출석 체크 점 표시)
  - 날짜 탭 시 해당 날짜의 연습 카드로 실시간 포커스 및 액션(QR/RSVP) 연계
  - 하단: 오늘 및 다가오는 연습 일정 연속 리스트 큐 배치
- [ ] **Task 17**: 연습 일정 공지 & 다중 첨부(악보 링크/드라이브) 시스템
  - 일정 스키마에 공지사항 텍스트 및 다중 첨부 링크/파일(`attachments: { title, url }[]`) 확장
  - 출석 전/후 단원 안내 모달 및 일정 상세 카드 내 퀵 링크 지원
- [ ] **Task 18**: 관리자 계정 보안 & 단원 세션 복구 체계 (SSO / 간편 인증)
  - 관리자 ID/PW (SHA-256 해시) 및 구글 시트 세션 만료 정책
  - 관리자 변경 작업 감사 로그 (`AdminAuditLog` 탭 Append-only 원천 기록)
  - 일반 단원 세션 복구: 브라우저 캐시 삭제 시 [이름 + 전화번호 뒤 4자리(또는 개인 PIN)] 간편 복원
- [ ] **Task 19**: 단원 상태별(정단원/준단원/휴단원/퇴단원/선생님) 타겟 일정 & 출석률 모수 정책
  - 일정별 대상자(전체, 파트별, 임원 등) 선택 및 설명 기재
  - 휴단원/퇴단원/선생님의 출석률 분모(모수) 자동 제외 및 사유불참 분류

### Phase 4.5: 단원 마이페이지(MemberPortalModal) 2탭 구조 개편 (Completed - [계획서 05](file:///Users/grasshop/Desktop/Antigravity/Moonchoir_rollbook/docs/plans/05_member_scorecard_streamline.md))
- [x] **Task 41**: 마이페이지 2탭 구조화 (`[연습명칭 / 연습일 / 투표 상태 / 출결 시간]` 표 + 개인 대시보드 & 기기 관리)
  - 불일치 유발 자연어 출결 브리핑 글 완전 배제 및 간결한 4열 대조 테이블 구현
  - 기기 연동 해제(로그아웃) 및 원클릭 구글 시트 동기화 액션 배치

### Phase 4.6: 데이터 파이프라인 정합성 복원 & 3대 구조 개혁 (Completed - [계획서 06](file:///Users/grasshop/Desktop/Antigravity/Moonchoir_rollbook/docs/plans/06_data_pipeline_reform.md))
- [x] **Task 42**: 단원 식별자(PK) 무결성 & 전화번호 뒷자리 자가 치유(Self-healing)
  - 시트 `phoneLast4 = '0000'` 고착 단원 로그인 시 실제 번호(4240)로 자동 시트 갱신(`UPDATE_MEMBER`)
  - 신규 등록 시 동일 단원 존재 시 기존 ID 재사용하여 다중 ID 생성 원천 차단
- [x] **Task 43**: Apps Script 타임스탬프 포맷 패치 및 고아 로그/투표 2단계 구출 Fallback 어댑터
  - `headerKey.includes('time')`로 인한 날짜 잘림(`HH:mm`) 버그 수정 (`google-apps-script.js`)
  - 일정 ID 불일치(`sch_20261022` vs `sch_20261022_klyd`) 시 ID prefix 및 `timestamp` 날짜 매칭 2단계 Fallback 어댑터 구현
- [x] **Task 44**: `reconcileAttendance` 중앙 엔진 SSOT 일원화 및 최신 관리자 액션 우선 판정 (Recency Resolution)
  - 마이페이지, 프로필 모달, 홈 화면 모두 `reconcileAttendance` 엔진으로 출결 판정 통합
  - 동일 일정 다중 로그 시 최신 관리자 수동 인정(`findLast`)을 최종 상태로 채택하고 모수제외(`isExempt`) 지원

### Phase 4.7: 단원 식별자 검토형 무결성, 2대 출결 지표 & 일정/QR 전면 개편 (Completed - [계획서 07](file:///Users/grasshop/Desktop/Antigravity/Moonchoir_rollbook/docs/plans/07_streamlined_attendance_and_program_cards.md) & [계획서 07-B](file:///Users/grasshop/Desktop/Antigravity/Moonchoir_rollbook/docs/plans/07_realtime_testing_and_ux_refinement.md))
- [x] **Task 45**: 단원 식별자(PK) 중복 감지 및 관리자 검토 기반 안전 통합 UI/엔진 (Completed)
- [x] **Task 46**: 마이페이지 게이미피케이션 개편(누적 출석 횟수 & 레벨 뱃지) 및 출결 데이터 정상화 (Completed)
- [x] **Task 47**: 대시보드 일정 관리 Master-Detail 2열 인라인 바인딩 & [지난 일정 보기]/[복제] 개편 (Completed)
- [x] **Task 48**: 4대 다채널 일정 추가 엔진(다중 날짜 픽 포함) 및 일정 카드 구글 시트 저장 연동 (Completed)
- [x] **Task 49**: 출석 QR 코드 워딩 단일화 & PIN 보조 UI 슬림화 (Completed)
- [x] **Task 50**: 실시간 시간 윈도우 기반 실전 테스트 시나리오 및 프로토콜 구축 (Completed)

### Phase 4.8: 관계형 데이터, 카카오맵 장소 검색 및 실전 UX 전면 개편 (Planned - [계획서 08](file:///Users/grasshop/Desktop/Antigravity/Moonchoir_rollbook/docs/plans/08_relational_data_kakao_places_and_ux_overhaul.md))
- [ ] **Task 51**: 카카오맵 키워드/장소 검색 & 주소 지오코딩 및 엄격한 좌표 검증 (Strict Geocoding Guard)
- [ ] **Task 52**: 장소 프리셋 관계형 단일 진실 공급원(SSOT) 및 중복 버튼 제거
- [ ] **Task 53**: 대시보드 Master-Detail 카드 클릭 즉시 바인딩 & 간결한 `[저장]` 버튼
- [ ] **Task 54**: 단원 명부 불변 식별자(PK) 유지 & 선발 단원 릴레이션 동기화
- [ ] **Task 55**: 부드러운 워딩(`[🌿 자율 참여 연습]`) & 담백한 미응답자 토글 명단 UI
- [ ] **Task 56**: 현장 출석 PIN 단일화 & 전수 통합 검증 (Green Bar)

### Phase 5: Architecture Recovery & 정식 운영 전 보안 관문 ([복구 계획 10](file:///Users/grasshop/Desktop/Antigravity/Moonchoir_rollbook/docs/plans/10_architecture_recovery_roadmap.md))
- [x] **Task 73**: Step 1 — 불순물·추측성 매칭 제거 및 엄격한 기본키(PK)·원천 로그 불변성 복원 (`sheets.ts`, `google-apps-script.js`, `HomeView.tsx`)
  - `getMembers()` 읽기 부수효과, `v2` 스토리지 마이그레이션, `memberName`·`scheduleId prefix`·`date` 추측 매칭 전면 제거
  - 단원 병합(`MERGE_MEMBERS`) 시 `RawAttendanceLog.memberId` 불변 보존 및 `mergedIntoId` 체인 기반 조회 확립
  - 구버전 5대 탭 `gas/Code.gs` 삭제 및 8대 탭 `google-apps-script.js` 단일화 (초기 시드 `phone` 열 밀림 버그 수정)
- [x] **Task 74**: Step 2 — 4곳으로 쪼개진 출결·통계 수식 엔진 단일화 (`src/utils/attendanceStats.ts`)
  - `reconcileSingleMemberAttendance`, `calculateCumulativeAttendanceWithLifecycle`, `resolveMergedMemberIds` 단일 순수 엔진으로 `sheets.ts`, `MemberPortalModal.tsx`, `MemberProfileModal.tsx`, `AdminMatrixGrid.tsx` 통합
  - 확정 기준 반영: 사유결석 분모 포함, 지각 출석률 100% 인정(지각 횟수 별도), 비대상자 자율 참여(`[🌿 자율 참여 연습]`) 시 미출석은 분모 제외·출석 시 분모+1/출석+1(`guestAttended`)
- [x] **Task 75**: Step 3 — 시트 동기화 확증, 출석 멱등성(`log.id`), 1시간 전 RSVP 마감 및 1인 1기기 잠금 일관성 보장
  - `sendToGoogleSheet()`의 `no-cors` 가짜 성공 폴백 제거, `RECORD_ATTENDANCE` `log.id` 중복 방지, `REGISTER_MEMBER` 락 내부 중복 검사, `isRsvpOpenForSchedule()` 1시간 전 마감 강제, `BindingModal` 중복 안내 경로에서도 1인 1기기 잠금 유지
- [ ] **Task 76**: 공개 Apps Script API 서버 인증 및 개인정보 최소 공개 (정식 운영 전 필수)
  - 현재 프로토타입의 링크 공개는 소유자가 위험을 인지하고 허용한 상태로 유지한다.
  - 정식 운영 전에는 회원 조회와 출석/RSVP/관리자 변경 요청을 서버에서 사용자 역할에 따라 확인한다.
  - 공개 조회 응답에서 관리자 PIN, 전체 전화번호, 기기 식별자 등 불필요한 민감 정보를 제거하고 역할별 필요한 데이터만 반환한다.
  - 권한 없는 요청의 조회/수정/삭제가 거부되는 통합 검증을 통과해야 정식 운영 가능으로 표시한다.
  - 구현 방식(로그인/세션/권한 보관 위치)은 별도 설계 및 소유자 승인 후 확정한다.

---

## Detailed Task Specifications

### Task 9: 영구 상설 마스터 QR & 인쇄 커스텀 & 현장 PIN
- **Goal**: 매주 QR을 다시 인쇄할 필요 없이 벽에 붙여두는 상설 마스터 QR을 구축하고, 장소 변경 시 폰 QR 또는 일회성 PIN 발급(위치검증 필수) 지원.
- **Touched Files**:
  - `src/types/rollbook.ts`
  - `src/utils/qr.ts`
  - `src/services/sheets.ts`
  - `src/components/AdminDashboard.tsx`
  - `src/components/QRScannerModal.tsx`
- **Acceptance Criteria**:
  - 상설 QR 스캔 시 현재 시각 기준 진행 중인 연습 일정으로 자동 매칭.
  - 관리자가 안내문구를 직접 편집하여 인쇄.
  - 단원이 당일 PIN을 입력할 때도 GPS 위치 반경 이내여야 출석 인정.
- **Verification**:
  - `npm test && npm run typecheck`

---

### Task 10: 반복 일정 등록 엔진 & 장소 프리셋
- **Goal**: 첨부된 네이버/애플 캘린더 이미지와 동일한 반복 주기 설정 UI와 장소별 위경도 프리셋 연동.
- **Touched Files**:
  - `src/types/rollbook.ts`
  - `src/utils/calendar.ts`
  - `src/components/AdminDashboard.tsx`
  - `src/utils/calendar.test.ts`
- **Acceptance Criteria**:
  - [간격 n주 + 요일 다중 선택] 시 지정 기간의 일정이 캘린더에 일괄 전개.
  - 장소 선택 시 위도, 경도, 반경이 자동 바인딩.
- **Verification**:
  - `npm test -- -t "Calendar"`

---

### Task 11: 기간별 누적 출결 통계
- **Goal**: 특정 날짜 하루만 보는 것을 넘어, 최근 1개월/3개월/분기/연간 누적 출석률과 대원별 성적표 제공.
- **Touched Files**:
  - `src/services/sheets.ts`
  - `src/components/AdminDashboard.tsx`
  - `src/services/sheets.test.ts`
- **Acceptance Criteria**:
  - 기간 선택 시 총 회차수, 개인별 출석 회수, 지각, 결석, 출석률(%)을 토스 리스트로 산출.
- **Verification**:
  - `npm test -- -t "Sheets Adapter"`

---

### Task 12: 4대 전문 어드민 센터
- **Goal**: 출결 정책/장소 프리셋, 단원 명부/기기 리셋, 시트 헬스체크, PIN 변경 등 토스 비즈니스급 어드민 구축.
- **Touched Files**:
  - `src/components/AdminDashboard.tsx`
  - `src/services/auth.ts`
  - `src/services/sheets.ts`
- **Acceptance Criteria**:
  - 장소 프리셋 추가/삭제, 단원 기기 바인딩 초기화, 관리자 PIN 변경 정상 작동.
- **Verification**:
  - `npm run typecheck && npm run lint`

---

### Task 14: 출석 QR 화면 UX & 사전 투표(RSVP) 시계 기반 상태 머신
- **Goal**: 연습일 이전에는 RSVP 사전 투표에 집중시키고, 당일 연습 시작 1시간 전부터 현장 QR 출석을 활성화하여 UX 혼선 방지.
- **Touched Files**:
  - `src/utils/timeWindow.ts`
  - `src/components/HomeView.tsx`
  - `src/components/QRScannerModal.tsx`
- **Acceptance Criteria**:
  - 카톡 투표 연동의 API 한계(단톡방 투표 웹훅 불가)를 명확히 하고 웹앱 링크 공유를 주 채널로 통일.
  - 연습 시작 1시간 전 이전에는 [사전 투표하기] 버튼이 메인으로 강조되며 QR 스캔은 비활성 안내.
  - 연습 시작 1시간 전부터 종료 시까지 [QR 출석 체크하기] 버튼이 주 액션으로 자동 승격.

---

### Task 15: 단원 전용 출결 포털 & 기기 명부 통신/파트 선택 오류 개선
- **Goal**: 일반 단원이 본인의 출석 로그와 누적 성적표를 조회할 수 있게 하고, 앱 기동 시 시트 동기화 누락 및 기기 바인딩 모달 내 파트 필터 오류를 해결.
- **Touched Files**:
  - `src/App.tsx`
  - `src/components/BindingModal.tsx`
  - `src/components/MemberPortalModal.tsx` (신규)
  - `src/services/sheets.ts`
- **Acceptance Criteria**:
  - 앱 시작 시 자동으로 `sheetsService.fetchRemoteData()` 호출하여 구글 시트 최신 명부 반영.
  - `BindingModal`에서 '전체, 소프라노, 알토, 테너, 베이스, 선생님, 객원' 및 동적 파트가 누락 없이 필터링.
  - 일반 단원이 헤더의 본인 프로필 버튼을 눌렀을 때 자신의 출석률, 출석 일시 타임스탬프 로그, 기기 바인딩 정보를 확인 가능.

---

### Task 16: 홈 화면 캘린더 중심 레이아웃 재배치
- **Goal**: 첫 진입 화면에서 이번 달 전체 일정을 캘린더 형태로 직관적으로 보여주고, 세부 일정 리스트를 하단에 배치.
- **Touched Files**:
  - `src/components/HomeView.tsx`
  - `src/components/CalendarView.tsx`
- **Acceptance Criteria**:
  - 홈 화면 상단에 미니/풀 인터랙티브 캘린더 배치 (연습일 뱃지 및 출결 상태 점 표시).
  - 캘린더 하단에 선택된 날짜 또는 다가오는 연습 일정 카드 리스트 스택 배치.

---

### Task 17: 연습 일정 공지 & 다중 첨부(악보 링크/드라이브) 시스템
- **Goal**: 연습 일정별로 공지사항 및 악보/음원 링크를 복수 첨부하고, 출석 전후 단원에게 효과적으로 전달.
- **Touched Files**:
  - `src/types/rollbook.ts`
  - `src/components/HomeView.tsx`
  - `src/components/QRScannerModal.tsx`
  - `src/components/AdminDashboard.tsx`
- **Acceptance Criteria**:
  - `Schedule` 인터페이스에 `noticeText?: string`, `attachments?: { id: string; title: string; url: string }[]` 추가.
  - QR 출석 성공 시 팝업에 "오늘의 공지사항 및 연습 안내" 모달 노출.
  - 홈 일정 카드에 악보 다운로드/외부 링크 버튼 제공.

---

### Task 18: 관리자 계정 보안 & 단원 세션 복구 체계 (SSO / 간편 인증)
- **Goal**: 관리자 권한 취약점(설정 버튼 클릭 시 무조건 진입)을 보완하고, 단원의 브라우저 세션 유실 시 손쉬운 복원 수단 마련.
- **Touched Files**:
  - `src/services/auth.ts`
  - `src/components/AdminPinModal.tsx`
  - `src/components/AdminDashboard.tsx`
  - `google-apps-script.js`
- **Acceptance Criteria**:
  - 관리자 진입 시 세션 유효시간(예: 30분) 만료 검증 및 안전한 인증을 수행하며, 권한은 브라우저가 아니라 서버에서도 확인한다.
  - 관리자의 모든 데이터 생성/수정/삭제 작업을 구글 시트 `AdminAuditLog` 탭에 Append-only로 기록.
  - 단원이 사파리/크롬/카카오 인앱 브라우저 전환 등으로 기기 바인딩이 풀렸을 때, [이름 + 전화번호 뒤 4자리] 입력만으로 기존 멤버 세션 즉시 복구.
  - 현재 공개 링크 허용은 프로토타입 범위에 한정하며, 정식 운영 보안 관문은 Task 76에서 별도 통과.

### Task 76: 공개 Apps Script API 서버 인증 및 개인정보 최소 공개
- **Goal**: 프로토타입의 공개 링크 사용을 정식 운영에 안전한 서버 권한 검사와 최소 데이터 공개로 전환.
- **Current Decision**: 현재 프로토타입은 공개 링크 접근을 소유자가 위험을 인지하고 허용한다. 이 결정은 정식 운영 승인으로 간주하지 않는다.
- **Touched Files**: `google-apps-script.js`, `src/services/sheets.ts`, `src/services/auth.ts`, 관리자/회원 인증 흐름, 관련 통합 테스트 및 보안 문서.
- **Acceptance Criteria**:
  - 회원/운영진 조회와 쓰기 권한을 Apps Script 서버에서 확인하며, 브라우저의 관리자 PIN 판정만으로 권한을 부여하지 않는다.
  - 공개 응답에는 요청 역할에 필요한 필드만 포함하며 `adminPin`, 불필요한 전체 전화번호, 기기 식별자를 공개하지 않는다.
  - 인증되지 않은 사용자는 제한된 공개 데이터 외의 회원/출석 조회와 모든 관리자 변경 요청을 수행할 수 없다.
  - 권한 거부, 정상 회원 출석/RSVP, 운영진의 허용된 작업을 실제 배포 환경에서 검증한다.
  - 운영 배포 승인 전 Task 76의 보안 테스트와 접근 검토가 완료되어야 한다.
- **Verification**: 인증/권한 통합 테스트, `npm run typecheck`, `npm run lint`, `npm test`, 실제 GAS 배포 권한 검토.

---

### Task 19: 단원 상태별(정단원/준단원/휴단원/퇴단원/선생님) 타겟 일정 & 출석률 모수 정책
- **Goal**: 파트별 추가 연습 등 특정 대상 한정 일정을 지원하고, 휴단원/퇴단원이 전체 출석률 통계를 왜곡하지 않도록 모수 분리.
- **Touched Files**:
  - `src/types/rollbook.ts`
  - `src/services/sheets.ts`
  - `src/components/AdminDashboard.tsx`
- **Acceptance Criteria**:
  - 일정 생성 시 대상자(`targetAudience`: `ALL`, 특정 파트, `정단원만` 등) 지정 기능.
  - 통계 집계 시 휴단원/퇴단원은 전체 모수(분모)에서 자동 제외되거나 사유불참으로 분리 집계.

---

### [Phase 3.5] 단원 생애주기 이력 관리 & 일정 카드 체계 개편

### Task 28: 단원 생애주기 이력(`MemberStatusHistory`) 모델 및 구글 시트 감사 DB 구축
- **Goal**: 단원의 회원상태(정단원/준단원/휴단원/퇴단원/객원) 및 파트 변경 이력을 날짜 구간(`startDate`~`endDate`)과 사유와 함께 구글 시트 `단원변경로그` 탭에 Append-only로 영구 보존.
- **Touched Files**:
  - `src/types/rollbook.ts`
  - `google-apps-script.js` & `docs/google_apps_script.js`
  - `src/services/sheets.ts`
- **Status**: [x] Completed

---

### Task 29: 입단일 및 생애주기 기반 출결 모수(분모) 산출 엔진 & 단위 테스트
- **Goal**: $Schedule.date < joinedAt$ 일정은 분모에서 완전 제외하고, 휴단원/퇴단원 기간은 기본 모수에서 제외하되 현장 출석 시 자발적 옵트인(분모+1, 분자+1) 인정 및 `[💡 게스트 N회]` 뱃지 부여.
- **Touched Files**:
  - `src/utils/attendanceStats.ts`
  - `src/utils/attendanceStats.test.ts`
  - `src/services/sheets.ts`
  - `src/components/AdminDashboard.tsx`
- **Status**: [x] Completed

---

### Task 30: 단원 프로필 수정 모달 내 기간제 이력 관리 & 영구 적용 UI
- **Goal**: 상태/파트 변경 시 적용 기간(`historyStartDate`~`historyEndDate`), `[♾️ 영구 적용]`(2999-12-31) 퀵 버튼, 사유 인풋 제공 및 하단 타임라인 이력 카드 뷰 구현.
- **Touched Files**:
  - `src/components/MemberProfileModal.tsx`
- **Status**: [x] Completed

---

### Task 31: 일정 카드(Program Card) 컨테이너 중심 관리 UI 개편
- **Goal**: 16개 행이 흩어진 캘린더에서 벗어나 학기/시즌별 일정 카드 묶음 뷰(`PROGRAM_CARDS`)를 제공하고, 회차 번호 없는 단순 표기, 카드별 추가연습 등록 및 다음 학기 복제 지원.
- **Touched Files**:
  - `src/types/rollbook.ts`
  - `src/components/AdminDashboard.tsx`
- **Status**: [x] Completed

---

### Task 32: 마스터 데이터 스키마 & 연쇄 영향도 매트릭스(`DATA_SCHEMA.md`) 및 정합성 테스트
- **Goal**: 7대 엔티티의 모든 필드에 대해 무슨 값인지, 어디로 연결되는지(PK/FK), 수정/삭제 시 연쇄 영향도(Cascade Rule), 구글 시트 7대 탭 매핑을 SSOT로 문서화하고 `schema.test.ts`로 정합성 자동 검증.
- **Touched Files**:
  - `docs/DATA_SCHEMA.md`
  - `src/types/schema.test.ts`
- **Status**: [x] Completed

---

### Phase 4.3: 1인 1투표 보장, 1인 1기기 락 & 대형 팝업 QR 긍정 경험 (Completed)
- [x] **Task 33**: 1인 1투표 엄격 보장 및 구글 시트 RSVP 중복 행 방지 (`google-apps-script.js`, `sheets.ts`, `sheets.test.ts`)
  - `String(scheduleId).trim() && String(memberId).trim()` 복합 키로 In-place Upsert 보장
- [x] **Task 34**: 1인 1기기 락(Device Locking) 시스템 및 대리 바인딩 차단 (`auth.ts`, `sheets.ts`, `BindingModal.tsx`, `MemberProfileModal.tsx`)
  - 브라우저 고유 UUID 발급, 시트 `단원명부`의 `boundDeviceId` 영구 등록, 타 기기 중복 바인딩 차단, 관리자 `[🔓 기기 연동 초기화]` 지원
- [x] **Task 35**: 대형 팝업 QR 스캐너 개편 & 긍정 경험 중심 축하 화면 (`QRScannerModal.tsx`)
  - 부정 출석 방지를 위한 갤러리/앨범 사진 파일 업로드(`<input type="file">`) 완전 제거
  - 320px 대형 뷰파인더, 인증 성공 시 🎉 축하 애니메이션 및 `[오늘 연습 힘차게 시작하기 🎵]` 버튼
- [x] **Task 36**: QR 관리 하드코딩 텍스트 제거 및 인쇄 설정 영구 저장 (`AdminDashboard.tsx`, `sheets.ts`)
  - "명동 제1연습실" 등 하드코딩 제거, 등록된 장소 프리셋 연동, `[💾 문구 영구 저장]` 지원
- [x] **Task 37**: 연습 일정 아카이브 3종 기능 신설 (`AdminDashboard.tsx`, `ScheduleEditModal.tsx`)
  - 단일 일정 `[📦 보관]` / `[📂 복원]`, 다중 선택 일괄 아카이브, 프로그램 카드 묶음 전체 아카이브

---

### Phase 4.5: 단원 마이페이지(MemberPortalModal) 2탭 구조 개편

### Task 41: 마이페이지 2탭 구조화 및 실시간 출결 대조 표 구현
- **Goal**: 번잡했던 마이페이지를 2개 탭(`[연습명칭 / 연습일 / 투표 상태 / 출결 시간]` 표 + `개인 대시보드 & 기기 연동 관리`)으로 전면 재구성하고, 자연어 브리핑 글을 완전 배제하여 투명성 확보.
- **Touched Files**:
  - `src/components/MemberPortalModal.tsx`
  - `docs/plans/05_member_scorecard_streamline.md`
- **Acceptance Criteria**:
  - 탭 1: 회차별 연습명칭, 일자, 나의 사전투표 상태(참석/불참/미응답), 출결 인정 상태 및 체크인 시간(`HH:mm`)을 한 줄에 대조.
  - 탭 2: 단원 인적사항 확인, `[🚪 기기 연동 해제]`, `[🔄 시트 동기화]` 제공.
  - 자연어 출결 브리핑 글을 완전히 제거.
- **Status**: [x] Completed

---

### Phase 4.6: 데이터 파이프라인 정합성 복원 & 3대 구조 개혁

### Task 42: 단원 식별자(PK) 무결성 & 전화번호 뒷자리 자가 치유(Self-healing)
- **Goal**: 구글 시트에 `phoneLast4 = '0000'`으로 고착된 단원이 로그인 시도시 입력한 본인 뒷자리로 자동 갱신하고, 동일 단원에 대한 다중 ID 생성을 원천 차단.
- **Touched Files**:
  - `src/components/BindingModal.tsx`
  - `src/services/sheets.ts`
  - `src/services/sheets.test.ts`
- **Acceptance Criteria**:
  - `BindingModal`에서 대상 단원의 `phoneLast4`가 `'0000'`이거나 비어있을 경우, 입력한 유효 4자리로 시트에 `UPDATE_MEMBER`를 쏘고 즉시 바인딩 성공.
  - `buildNewMember` 헬퍼를 분리하여 React 컴포넌트 순수성 린트 규칙 준수.
- **Status**: [x] Completed

---

### Task 43: Apps Script 타임스탬프 포맷 패치 및 고아 로그/투표 2단계 구출 Fallback 어댑터
- **Goal**: GAS 웹앱에서 `timestamp` 날짜가 `HH:mm`으로 잘리던 치명적 버그를 수정하고, 일정 ID가 변경되어 분리된 고아 로그/투표를 2단계 Fallback 어댑터로 복원.
- **Touched Files**:
  - `google-apps-script.js` & `docs/google_apps_script.js`
  - `src/services/sheets.ts`
  - `src/services/sheets.test.ts`
- **Acceptance Criteria**:
  - GAS `readSheetData`: `timestamp` 열에 대해 온전한 ISO 타임스탬프(`yyyy-MM-dd'T'HH:mm:ssXXX`) 보존.
  - `getLogs` 및 `getRSVPVotes`: 1단계 ID Prefix 일치 확인 $\rightarrow$ 2단계 일정 날짜(`YYYY-MM-DD`) 일치 확인으로 고아 레코드 구출.
- **Status**: [x] Completed

---

### Task 44: `reconcileAttendance` 중앙 엔진 SSOT 일원화 및 최신 관리자 액션 우선 판정 (Recency Resolution)
- **Goal**: 4대 UI(관리자 매트릭스, 단원 마이페이지, 프로필 팝업, 메인 홈)의 출결 판정 로직을 `reconcileAttendance` 중앙 엔진으로 100% 통합.
- **Touched Files**:
  - `src/services/sheets.ts`
  - `src/components/MemberPortalModal.tsx`
  - `src/components/MemberProfileModal.tsx`
  - `src/components/HomeView.tsx`
- **Acceptance Criteria**:
  - 관리자가 임의로 결석을 출석(수동인정)으로 변경한 최신 액션이 단원 마이페이지 표에 즉시 반영.
  - 동일 일정에 여러 개의 로그가 쌓였을 때 최신 로그(`findLast`)를 최종 상태로 판정.
  - `isExempt`(모수 제외) 플래그를 지원하여 입단일 이전/휴단 기간의 일정이 결석으로 잡히지 않음.
- **Status**: [x] Completed

---

### Phase 4.7: 단원 식별자 검토형 무결성, 2대 출결 지표 & 일정/QR 전면 개편

### Task 45: 단원 식별자(PK) 중복 감지 및 관리자 검토 기반 안전 통합 UI/엔진
- **Goal**: 기계적 자동 통합이나 맹목적 차단 대신, [이름 + 전화번호 뒤4자리] 기준 중복 의심 단원을 감지하여 관리자에게 안내하고, 회차별 행동로그를 대조하여 관리자 확인 하에 최신값 기준으로 안전하게 원천로그 외래키를 정규화.
- **Touched Files**:
  - `src/services/sheets.ts`
  - `src/components/AdminDashboard.tsx`
  - `src/components/BindingModal.tsx`
- **Acceptance Criteria**:
  - 신규 등록 시 무조건 에러 차단 대신 "이미 등록된 이재연(4240) 단원님이 존재합니다. 이 계정으로 바인딩할까요?" 확인형 모달 제공.
  - 관리자 단원 명부에 "⚠️ 중복 등록 단원 감지" 뱃지 및 [이력 대조 및 통합] 모달 제공.
  - 과거 행이나 ID를 임의 삭제하지 않고, 불변 원천로그의 유효성을 보존하면서 통합된 뷰 제공.
- **Status**: [ ] Planned

---

### Task 46: 마이페이지 게이미피케이션 개편(누적 연습 참여 횟수 & 레벨 뱃지) 및 출결 데이터 정상화
- **Goal**: 복잡한 출석률(%)과 분모 왜곡으로 인한 단원의 죄책감을 걷어내고, "총 N회 연습 출석 누적 카운트 + 합창단 레벨 뱃지"로 전환하며, 10/16 경찰의날 녹음 등 과거 수동인정 로그의 정상 표기 보장.
- **Touched Files**:
  - `src/utils/attendanceStats.ts`
  - `src/services/sheets.ts`
  - `src/components/MemberPortalModal.tsx`
  - `src/components/AdminDashboard.tsx`
- **Acceptance Criteria**:
  - 단원 마이페이지 상단: 복잡한 비율(%) 완전 제거 $\rightarrow$ `🎵 이번 시즌 함께한 연습: 총 N회 출석` + `새싹 🌱 ➔ 성실 🥉 ➔ 빛나는 🥈 ➔ 개근 마스터 🌟` 칭호 뱃지 및 프로그레스 바 제공.
  - 마이페이지 표: `[연습명칭 / 연습일 / 투표 상태 / 출결 시간]` 4열 대조에서 10/16 경찰의날 녹음이 '수동인정'으로 정상 반영.
  - 관리자 결산: 연말 시상식/개근자 선발용 전체 통계는 어드민 대시보드에서만 시트 데이터 기반으로 산출.
- **Status**: [x] Completed

---

### Task 47: 대시보드 일정 관리 Master-Detail 2열 인라인 바인딩 & [지난 일정 보기]/[복제] 개편
- **Goal**: 별도 수정 팝업을 제거하고 좌측 목록 클릭 시 우측 인라인 입력창에 즉시 값이 연동되는 2열 UX를 구축하며, 지난 일정 자동 보관 및 오늘 날짜 기준 복제 지원.
- **Touched Files**:
  - `src/components/AdminDashboard.tsx`
  - `src/components/ScheduleEditModal.tsx` (인라인 대체 또는 슬림화)
- **Acceptance Criteria**:
  - 좌측 일정 카드 클릭/수정 선택 시 우측 상주 입력 폼에 필드 값 즉시 바인딩(In-place Edit).
  - 오늘 이전 일정은 자동으로 `[지난 일정 보기]` 토글 뒤로 배치(수정 불가 View-only).
  - 지난 일정에서 `[복제]` 클릭 시 "오늘 날짜"를 기본값으로 하여 우측 폼에 그대로 복사 채우기.
  - 제목 명칭 `[일정 등록]`으로 간소화, `세부내용(선택)` textarea 상하 높이 대폭 확장.
  - 장소 선택: `[기존 연습실 선택]` vs `[새 장소 직접 등록]` 토글 분리.
- **Status**: [x] Completed

---

### Task 48: 4대 다채널 일정 추가 엔진(다중 날짜 픽 포함) 및 일정 카드 구글 시트 저장 연동
- **Goal**: 애플/네이버 캘린더 스타일의 다채널 반복 엔진을 완비하고, 시트 저장이 누락되어 있던 `일정카드` 탭 양방향 동기화 파이프라인 정식 연결.
- **Touched Files**:
  - `src/utils/calendar.ts`
  - `src/services/sheets.ts`
  - `src/components/AdminDashboard.tsx`
  - `google-apps-script.js`
- **Acceptance Criteria**:
  - 4대 추가 옵션:
    1) 단일 일정
    2) 매 N일 / N주 / N개월 반복
    3) 요일 다중 선택 (월~일 칩)
    4) **캘린더 직접 날짜 복수 픽**: 하나의 일정 속성에 대해 달력에서 여러 날짜를 콕콕 찍어 한 번에 생성
  - 일정 카드(컨테이너) 생성/수정/삭제 시 구글 시트 `일정카드` 탭에 `SAVE_PROGRAM_CARD`가 실제로 호출되어 영구 저장.
- **Status**: [x] Completed

---

### Task 49: 출석 QR 코드 워딩 단일화 & PIN 보조 UI 슬림화
- **Goal**: 하드코딩된 회차별 QR 및 복잡한 버튼을 제거하고, 정기연습실 상설 QR을 `출석 QR 코드`로 단일화하며 PIN을 슬림한 보조 수단으로 재배치.
- **Touched Files**:
  - `src/components/AdminDashboard.tsx`
  - `src/components/QRScannerModal.tsx`
- **Acceptance Criteria**:
  - 명칭을 `출석 QR 코드`로 전면 통일.
  - "10-16 경찰의날 녹음" 등 하드코딩 회차 텍스트 삭제.
  - QR 코드가 메인 시각 중심이 되고, 하단에 "QR 스캔 불가 시 현장 PIN 인증" 1줄 슬림 카드 배치.
  - 외부 일정(공연/녹음 등)은 현장 PIN 출석으로 일원화.
- **Status**: [x] Completed

---

### Task 50: 실시간 시간 윈도우 기반 실전 테스트 시나리오 및 프로토콜 구축
- **Goal**: 테스트 바이패스 버튼을 없애고, 실제 서비스 시간 윈도우(연습 시작 1시간 전 ~ 종료)에 맞춰 일정이 등록되고 상태가 실시간 전환되는 테스트 프로토콜 수립.
- **Touched Files**:
  - `src/components/HomeView.tsx`
  - `src/utils/timeWindow.ts`
  - `docs/plans/07_realtime_testing_and_ux_refinement.md`
- **Acceptance Criteria**:
  - 관리자가 실시간으로 10분 뒤 일정을 생성하여 [사전투표] $\rightarrow$ [QR 활성화] $\rightarrow$ [출석 마감]의 상태 전이 정상 동작 검증.
- **Status**: [x] Completed

---

### Task 51: 카카오맵 키워드/장소 검색 & 주소 지오코딩 및 엄격한 좌표 검증 (Strict Geocoding Guard)
- **Goal**: 카카오맵 JavaScript SDK(`1465ed6063afca1d3ea91711cbdeb84a`)를 안전하게 로드하고, 건물/장소명 키워드 검색(`Places`) 및 도로명 주소 지오코더(`Geocoder`)를 일체형 팝업으로 제공. 좌표 미확보 시 명동 폴백을 원천 차단하고 저장 거부 경고를 출력하며, `[📍 내 현재 위치로 설정]` GPS 원터치 버튼 제공.
- **Touched Files**:
  - `src/components/LocationPickerMap.tsx`
  - `src/types/rollbook.ts`
- **Acceptance Criteria**:
  - "서해문화회관", "예술의전당", "인천 연수구 한나루로 158번길 31" 등 입력 시 카카오 API가 유효한 위경도 좌표(X, Y)를 실시간 반환.
  - 좌표 조회 실패 시 명동 좌표(`37.5665, 126.9780`)로 몰래 저장되지 않고, 저장을 막고 안내 모달 출력.
  - `[📍 내 현재 위치로 설정]` 클릭 시 스마트폰/브라우저 GPS로 실제 위치 좌표 즉시 획득.
- **Verification**: `npm test && npm run typecheck`
- **Status**: [ ] Planned

---

### Task 52: 장소 프리셋 관계형 단일 진실 공급원(SSOT) 및 중복 버튼 제거
- **목표**: 연습 장소 선택 방식을 복잡한 2분할 탭(`PRESET` vs `DIRECT`) 및 중복 버튼에서 단일 드롭다운 + `[+ 새 장소 등록]` 단일 버튼으로 일원화. `Schedule`이 `locationId` 외래키를 통해 `LocationPreset`의 최신 좌표와 반경을 동적으로 참조하도록 개편하여, 프리셋 수정 시 모든 기존/미래 일정이 즉시 최신 정보로 출석 판정되도록 보장.
- **Touched Files**:
  - `src/components/AdminDashboard.tsx`
  - `src/services/sheets.ts`
  - `src/utils/geo.ts`
- **Acceptance Criteria**:
  - 장소 등록 버튼 중복 제거 (단일 드롭다운 + `[+ 새 장소 등록]` 버튼 1개).
  - 프리셋의 반경을 100m에서 200m로 변경 시, 해당 장소를 쓰는 기존 일정의 출석 반경도 즉시 200m로 판정.
- **Verification**: `npm test && npm run typecheck`
- **Status**: [ ] Planned

---

### Task 53: 대시보드 Master-Detail 카드 클릭 즉시 바인딩 & 간결한 [저장] 버튼
- **Goal**: 좌측 일정 카드의 작은 [수정] 버튼을 없애고, 카드/목록 행 전체 클릭 시 즉시 우측 폼에 인라인 바인딩. 선택된 카드에 선명한 활성 테두리(Active Ring) 표시. 우측 폼 하단 제출 버튼을 장황한 문구 대신 담백하게 `[저장]` (신규 시 `[새 일정 등록]`)으로 변경. 상단 `[+ 새 일정 추가]` 버튼으로 신규 작성 모드 전환.
- **Touched Files**:
  - `src/components/AdminDashboard.tsx`
- **Acceptance Criteria**:
  - 좌측 일정 카드를 클릭하면 즉시 우측 폼에 해당 일정의 제목, 날짜, 시간, 장소, 대상자가 인라인 바인딩.
  - 우측 버튼이 `[저장]`으로 표시되고, 수정 완료 시 즉시 목록에 반영.
- **Verification**: `npm test && npm run typecheck`
- **Status**: [ ] Planned

---

### Task 54: 단원 명부 불변 식별자(PK) 유지 & 양방향 상태 전이(정단원 ↔ 휴단원) 동적 투영 뷰
- **Goal**:
  - 시스템 임의 자동 병합(Auto-merge) 완전 금지. `Member.id`를 변경 불가능한 고유 PK로 영구 보존하고 기기 바인딩(`moonchoir_bound_device`) 무결성 보호.
  - 이름/전화번호가 같은 중복 의심 계정이 발견될 경우 관리자 페이지 상단에 단순 검토 알림 배너만 노출.
  - **단원 명부 Join 기반 투영 뷰 (Ghost Record Purge)**:
    - 구글 시트의 `사전투표_기록` 및 `출석_로그`에 잔여하는 유령/테스트 데이터(예: `김하은`)는 현재 `단원_명부`(`status === 'ACTIVE'`)에 실존하는 단원과 교차 검증(Join)하여, 명부에 없는 레코드는 화면 집계에서 완전히 배제.
  - **단원 상태 전이(정단원 ↔ 휴단원)의 미래 일정 자동 반영 (Dynamic Projection)**:
    - **정단원 → 휴단원 전환 시**: 해당 시점 이후 미래 일정의 필수 대상자(`targetMembers`)에서 즉시 제외. 기존에 '참석' 투표를 해두었더라도 정규 분모/참석률에서 빠지고 정규 미응답 목록에서도 제외.
    - **휴단원 → 정단원 복단 시**: 복단일 이후 미래 일정의 필수 대상자(`targetMembers`)에 즉시 자동 편입. 총원 분모(`totalTargetCount`)가 1 증가하고, 미투표 시 미응답 목록에 자동 등재되며, 기투표 내역은 정규 참석으로 자동 승격. 과거 휴단 기간의 일정은 '모수제외'로 영구 보존되어 결석으로 오염되지 않음.
  - 선발 단원 리스트에서 파트와 뒷자리 4자리를 병기하여 정확한 식별자 매칭 지원 및 `targetMemberIds` 시트 CSV ↔ 배열 양방향 변환 보장.
- **Touched Files**:
  - `src/services/sheets.ts`
  - `src/components/AdminDashboard.tsx`
  - `src/components/HomeView.tsx`
  - `src/components/CalendarView.tsx`
  - `src/utils/attendanceStats.ts`
- **Acceptance Criteria**:
  - 시스템 임의 머지 없음. 단원 ID 불변 보존.
  - 단원 명부에 없는 김하은의 과거 투표가 홈 화면 사전투표 집계에 일절 노출되지 않음.
  - 이재연을 휴단원에서 정단원으로 전환 시, 다음주 정기연습 대상자 목록 및 분모에 즉시 자동 반영됨.
  - 선발 단원 지정 시 `이재연 (테너 · 1234)`와 같이 구별 표기되어 정확한 단원 지정 가능 및 시트 저장 후 상태 100% 보존.
- **Verification**: `npm test && npm run typecheck`
- **Status**: [x] Completed

---

### Task 55: 부드러운 워딩([🌿 자율 참여 연습]), 분모 정규화 & 담백한 미응답자 토글 명단 UI
- **Goal**:
  - **사전 투표 현황 분모 정규화**:
    - 기존의 비정상적 `Math.max(targetMembers.length, uniqueVotes.length)` 해킹 코드를 전면 제거하고, 분모를 순수 필수 대상자 수(`targetMembers.length`)로 고정.
    - 휴단원/객원 등 비대상자가 자율 참석을 투표한 경우, 정규 출결 모수를 오염시키지 않고 `🌿 자율/참관 참여 (N명)`으로 분리 표기.
  - **내 기기 프로필 실시간 상태 동기화**:
    - 관리자가 단원의 상태(휴단/정단)를 변경하면, 해당 단원의 스마트폰 홈 화면에서도 즉시 프로필 상태가 갱신되어 "공식 필참 일정이 아닙니다" 배너 노출 및 버튼이 "개인 연습으로 참여" / "사전 투표하기"로 즉시 전환.
  - **부드러운 워딩 & 담백한 토글 명단**:
    - 비대상 단원의 홈 화면에서 "출석 통계 모수" 등 난해한 개발 용어 전면 제거.
    - 배지 `[🌿 자율 참여 연습]`, 안내 "공식 필참 일정이 아닙니다. 참관이나 개인 연습으로 자유롭게 참여하실 수 있습니다.", 버튼 `[개인 연습으로 참여 투표]` / `[자율 출석 체크]`로 전환.
    - 일정 카드 하단에 담백한 회색 모노톤의 `참석 N명 · 불참 N명 · 미응답 N명 ▼` 요약 및 토글 명단 추가 (클릭 시 회색 박스에 미응답자/참석자 이름 나열).
- **Touched Files**:
  - `src/components/HomeView.tsx`
  - `src/components/CalendarView.tsx`
  - `src/index.css`
- **Acceptance Criteria**:
  - 정단원/휴단원 전환 시 분모와 참석률이 왜곡 없이 정확히 계산됨.
  - 비대상자가 로그인했을 때 소외감 없이 자율 연습 안내 및 개인 연습 참여 버튼 노출.
  - 일정 카드 하단 토글을 누르면 담백한 회색 박스에 미응답자, 참석자, 불참자 명단이 깔끔하게 표시.
- **Verification**: `npm test && npm run typecheck`
- **Status**: [x] Completed

---

### Task 56: 현장 출석 PIN 단일화 & 전수 통합 검증 (Green Bar)
- **Goal**: 상설 QR 서브탭에서 과거 일정 명칭(`(경찰의날 녹음)`) 꼬리표를 완전히 제거하고, `🔑 당일 현장 출석 PIN: [ 5 0 2 7 ]  [🔄 PIN 재발급]` 단일 블록으로 간결화. `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` 전수 통과 확인 및 `DEV_LOG.md` 갱신.
- **Touched Files**:
  - `src/components/AdminDashboard.tsx`
  - `docs/DEV_LOG.md`
  - `docs/tasks.md`
- **Acceptance Criteria**:
  - 과거 일정 명칭 없는 깨끗한 단일 현장 PIN 발급 및 검증 정상 동작.
  - 4대 정적/단위 센서(typecheck, lint, test, build) 0 error 무결성 확인.
- **Verification**: `npm test && npm run typecheck && npm run lint && npm run build`
- **Status**: [x] Completed

---

### Task 57: 하루 다중 일정(Multi-Schedule) 스마트 우선순위 정렬 & 캐러셀(스와이프/화살표) 스위처 및 고유 ID 바인딩
- **Goal**:
  - 하루에 2개 이상의 일정이 있을 때, 화면 배치를 세로로 늘리지 않고 단일 카드 슬롯 내에서 **[좌우 터치 스와이프 제스처] + [◀ N / M ▶ 화살표 버튼] + [도트 인디케이터]**로 매끄럽게 회차를 넘길 수 있는 캐러셀 스위처 구현.
  - **복합 가중치 스마트 우선순위 (Time State + Target Relevance)**:
    - `진행 중인 출석 체크(OPEN: 300점)` > `곧 시작할 다가오는 연습(UPCOMING: 200점)` > `종료된 연습(CLOSED: 100점)`
    - 내가 필수 대상자인 일정 가중치 `+50점`
    - 우선순위가 높은 일정이 1순위(기본 노출)로 자동 배치 (예: 현재 시각 기준 마감된 19:00 일정 대신 23:30 다가오는 일정이 첫 화면에 즉시 노출).
  - **4대 위험 방어책 완비**:
    - ① `onOpenQRScanner`, `onOpenRSVP`에 현재 렌더링 중인 활성 일정의 고유 ID 명시적 전달 (Context Drift 차단).
    - ② 세로 스크롤과 충돌 없는 안전한 가로 스와이프 임계값(Threshold: 40px) 및 물리 버튼 병행.
    - ③ 사용자 조작 우선 원칙(User-Intent Priority)으로 시간 틱에 의한 원치 않는 화면 점프 방지.
    - ④ 일정 삭제 또는 날짜 변경 시 인덱스 범위 초과(Out of Bounds) 방지 경계 클램핑 및 고유 `selectedScheduleId` 바인딩.
  - 하단 '다가오는 연습 일정' 리스트나 월간 캘린더에서 특정 회차를 클릭했을 때 해당 회차로 즉시 슬라이드 이동.
- **Touched Files**:
  - `src/components/HomeView.tsx`
  - `docs/DEV_LOG.md`
  - `docs/tasks.md`
- **Acceptance Criteria**:
  - 오늘 일정이 2개 이상일 때 상단에 `[◀] 1 / 2 (23:30) [▶]` 및 도트 표시.
  - 스와이프 또는 화살표 클릭 시 19:00 추가연습과 23:30 테스트 일정을 자유자재로 넘나들며 출석 체크 및 사전 투표 가능.
  - 현재 시각(23시 이후) 기준, 마감된 19:00 일정 대신 23:30 일정이 1순위로 자동 우선 노출.
  - 하단 리스트에서 다른 일정을 누르면 해당 카드로 즉시 이동.
  - 일정 삭제나 다른 날짜 클릭 시 인덱스 에러 0건.
- **Verification**: `npm test && npm run typecheck && npm run lint && npm run build`
- **Status**: [x] Completed

---

#### Task 58: 휴단원 CUSTOM_MEMBERS 직접 지정 시 필참 우선순위 & 전체 연락처(010) 필수화 & 구글 시트 KST 타임스탬프 표준화
- **User Needs & Motivation**:
  1. 관리자가 특정 일정에 '직접 지정(CUSTOM_MEMBERS)'한 경우, 휴단원이라도 관리자의 명시적 차출 의도를 최우선으로 인정하여 필참(모수 포함)으로 승격. 단, 퇴단원은 실수로 지정했더라도 절대 필참이 되지 않도록 안전 가드 유지.
  2. 단원 등록 및 기기 연동 시 휴대폰 번호 전체(010-XXXX-XXXX, 10~11자리)를 필수로 입력 및 저장하도록 변경하여, 시트 업데이트 시 기존 연락처가 지워지는 현상(이재연 케이스) 원천 방지 및 양방향 fallback 보호.
  3. 구글 시트에 기록되는 모든 시간 데이터(`2026-10-17T13:15:36.799Z` 등 UTC 형식)를 한국 표준시(KST: `YYYY-MM-DD HH:mm:ss`)로 완전 통일하고, 기존 데이터 일괄 변환 Apps Script 기능 추가.
- **Touched Files**:
  - `src/utils/date.ts`: `getKSTTimestampString(date?: Date): string` 추가 및 `parseKSTDate`에 공백 구분 포맷(`YYYY-MM-DD HH:mm:ss`) 파싱 지원
  - `src/utils/date.test.ts`: KST 변환 및 파싱 단위 테스트 6건 구축
  - `src/utils/attendanceStats.ts`: `isMemberRequiredForSchedule` 우선순위 개편 (퇴단원 제외 -> CUSTOM_MEMBERS 지정자 필참 승격 -> ALL/PARTS 정단원/준단원 판정)
  - `src/utils/attendanceStats.test.ts`: CUSTOM_MEMBERS 휴단원/퇴단원 판정 단위 테스트 추가
  - `src/components/BindingModal.tsx`: 뒷 4자리만 입력받던 방식 폐지 -> 전체 10~11자리 번호 입력 및 시트 영구 저장 연계
  - `src/components/MemberProfileModal.tsx`: 연락처 10~11자리 필수 유효성 검사 및 이력 타임스탬프 KST 적용
  - `src/services/sheets.ts`: 신규 생성/수정/연동/바인딩 타임스탬프 KST 표준화 및 원격 시트 동기화 시 로컬 연락처 유실 방지 fallback 탑재
  - `src/services/sheets.test.ts`: 연락처 fallback 보존 및 KST 타임스탬프 포맷 검증 단위 테스트 2건 추가
  - `src/components/QRScannerModal.tsx`, `src/components/RSVPModal.tsx`, `src/components/AdminDashboard.tsx`, `src/components/AdminMatrixGrid.tsx`, `src/services/auth.ts`: KST 타임스탬프 생성으로 통일
  - `google-apps-script.js`: `toKSTString` 헬퍼 함수 도입, `RECORD_ATTENDANCE`, `SUBMIT_RSVP`, `BIND_DEVICE`, `REGISTER_MEMBER`, `UPDATE_MEMBER` KST 저장 및 phone 누락 덮어쓰기 방지 보호, `convertExistingTimestampsToKST` 메뉴 기능 추가
  - `docs/DEV_LOG.md`, `docs/tasks.md`
- **Acceptance Criteria**:
  - `isMemberRequiredForSchedule`에서 `CUSTOM_MEMBERS`에 포함된 휴단원은 필참(`true`) 판정, 퇴단원은 포함되어도 필참 제외(`false`).
  - 기기 연동 모달 및 프로필 모달에서 휴대폰 번호는 전체(10~11자리)를 정확히 입력해야 저장 가능.
  - 구글 시트 원격 동기화 시 기존 연락처가 빈 문자열로 지워지지 않고 보존.
  - 출석 원천 로그, 사전 투표, 기기 바인딩, 단원 변경 이력 등 모든 일시가 `YYYY-MM-DD HH:mm:ss` (KST) 형식으로 시트에 저장.
- **Verification**: `npm test && npm run typecheck && npm run lint && npm run build` (68/68 tests pass, 0 errors)
- **Status**: [x] Completed

---

### Phase 4.9: 관리자 일정 카드 묶음, 다채널 반복 엔진 & 모던 터치 피커 개편 (Tasks 59~69)

#### Task 59: 단원 상태 구분 버튼형 토글 & 이력 기록 상태 표기 강화
- **Goal**: 셀렉트 드롭다운 방식에서 직관적인 칩 버튼형 토글(정단원, 준단원, 휴단원, 퇴단원, 선생님, 객원)로 개편하여 터치 실수 방지 및 상태 변경 시 이력 자동 기록.
- **Touched Files**: `src/components/MemberProfileModal.tsx`, `src/components/AdminDashboard.tsx`
- **Status**: [x] Completed

#### Task 60: 구글 시트 연락처 헤더 자동 복구 & 프로그램 카드 시딩 및 동기화
- **Goal**: 원격 구글 시트에 `연락처` 헤더가 누락되어도 자동으로 복구·동기화하고, `PROGRAM_CARDS` 탭 양방향 연동 및 기본 카드 3종 자동 시딩.
- **Touched Files**: `src/services/sheets.ts`, `google-apps-script.js`
- **Status**: [x] Completed

#### Task 61: 카카오 로컬 검색 키보드 엔터 부모 폼 서브밋 방지
- **Goal**: 장소 검색 모달에서 키보드 엔터 입력 시 상위 폼이 submit되어 홈 화면으로 튕기던 버그 원천 차단 (`e.preventDefault()` 및 button `type="button"`).
- **Touched Files**: `src/components/LocationPickerMap.tsx`, `src/components/LocationPickerModal.tsx`
- **Status**: [x] Completed

#### Task 62: 이력 기반 동적 출결 모수 판정 안정화 (statusHistory 최신 우선순위 & auto-close)
- **Goal**: 단원 상태 변경 시 이전 오픈 이력의 종료일을 자동 기록(`auto-close`)하고, 모수 판정 시 최신 이력 우선순위를 확립하여 출석률 분모 왜곡 방지.
- **Touched Files**: `src/utils/attendanceStats.ts`, `src/services/sheets.ts`
- **Status**: [x] Completed

#### Task 63: 자정 전후 날짜 불일치 방지 KST 날짜 표준화
- **Goal**: 브라우저 로컬 타임존과 UTC 변환 간 자정 직전/직후 날짜가 하루 전/후로 어긋나는 현상 방지 (`getKSTDateString` 전면 도입).
- **Touched Files**: `src/utils/date.ts`, `src/utils/timeWindow.ts`
- **Status**: [x] Completed

#### Task 64: 출결 매트릭스 '결석 오버라이드' 버튼 및 비참석자 '미참' 명확화
- **Goal**: 관리자 매트릭스에서 수동 출석/지각 외 결석 오버라이드 버튼 신설 및 대상자가 아닌 단원은 '결석'이 아닌 '미참'으로 명확히 구분.
- **Touched Files**: `src/components/AdminMatrixGrid.tsx`
- **Status**: [x] Completed

#### Task 65: 일정 회차 수(일정 N회차) 캘린더 반응형 렌더링 수정
- **Goal**: 필터바의 '일정 N회차' 지표가 캘린더 날짜/범위 변경 시 즉시 동적으로 재계산되도록 반응형 상태 연결.
- **Touched Files**: `src/components/AdminDashboard.tsx`, `src/components/AdminNotionFilterBar.tsx`
- **Status**: [x] Completed

#### Task 66: 일정 카드 묶음 인라인 에디터(Split-View) & 복제 UX 개선
- **Goal**: 팝업 모달 대신 우측 화면에 카드 데이터가 바로 뜨는 인라인 편집창 제공, '다음학기로 복제'를 '복제'로 간소화하고 대상 일정 및 카드 복제 격리 지원.
- **Touched Files**: `src/components/AdminDashboard.tsx`
- **Status**: [x] Completed

#### Task 67: 4대 다채널 일정 생성 엔진 (반복 주기 다중 선택 지원)
- **Goal**: 단일 일정, 주기 반복(매주 요일 복수 선택, 매달 일자 복수 선택, 매년 월/일 복수 선택), 요일 지정(N주간), 달력 직접 픽(복수 날짜 클릭) 다채널 엔진 구축.
- **Touched Files**: `src/utils/calendar.ts`, `src/utils/calendar.test.ts`, `src/components/AdminDashboard.tsx`
- **Status**: [x] Completed

#### Task 68: 감각적인 둥근 달력 & 상세설명창 (`RoundDatePicker` & Modern Textarea)
- **Goal**: 브라우저 기본 각진 date input을 대체하는 동글동글한 모던 달력 팝오버 컴포넌트(`RoundDatePicker`) 구축 및 글자 수 카운터가 포함된 모던 상세설명창 적용.
- **Touched Files**: `src/components/RoundDatePicker.tsx`, `src/components/AdminDashboard.tsx`, `src/index.css`
- **Status**: [x] Completed

#### Task 69: 감각적인 둥근 시간 선택기 (`RoundTimePicker`)
- **Goal**: 브라우저 기본 `<input type="time">`을 대체하는 감각적인 알약형 버튼 + 합창단 연습 퀵 프리셋(6종) + 오전/오후 토글 + 12시간/5분 터치 그리드 팝오버 구축 및 전면 교체.
- **Touched Files**: `src/components/RoundTimePicker.tsx`, `src/components/RoundTimePicker.test.tsx`, `src/components/AdminDashboard.tsx`, `src/components/ScheduleEditModal.tsx`, `src/components/BatchScheduleEditModal.tsx`, `src/index.css`
- **Status**: [x] Completed

### Phase 4.9: 데이터 릴레이션·스키마 무결성 확립 & 동시성 락 & 환경설정 시트화 (Completed - [계획서 09](file:///Users/grasshop/Desktop/Antigravity/Moonchoir_rollbook/docs/plans/09_schema_relation_integrity_and_concurrency.md))
- [x] **Task 70**: 구글 시트 8번째 탭 (`환경설정` CONFIG) 신설 및 중앙 설정 관리
  - 지각 유예시간(10분), 마스터 관리자 PIN(1234), 동적 파트/상태/카테고리 체계, A4 인쇄 서식을 시트에 영속 저장하고 `doGet`에서 전역 공급.
  - Touched: `google-apps-script.js`, `src/services/sheets.ts`, `src/components/AdminDashboard.tsx`
- [x] **Task 71**: Append-Only Event Sourcing 출결 취소/초기화 원복 로직
  - 물리 삭제 대신 직전 시각보다 1초 뒤인 `adminNote: '관리자 출결 취소 (결석 처리)'` 취소 로그 Append 적재.
  - `reconcileAttendance` 엔진이 시계열 로그를 재생(Replay)하여 마지막이 취소 로그일 경우 원래 결석/사유결석/미참으로 안전 원복.
  - Touched: `src/services/sheets.ts`, `google-apps-script.js`, `src/services/sheets.test.ts`
- [x] **Task 72**: 이력 보호 단원 소프트 삭제 (`status='DELETED'`)
  - 출석/투표 이력이 있는 단원은 삭제 시 시트 행을 지우지 않고 `status='DELETED'`로 소프트 삭제 처리하여 역대 통계 무결성 100% 보존.
  - Touched: `src/types/rollbook.ts`, `src/services/sheets.ts`, `google-apps-script.js`, `src/services/sheets.test.ts`
- [x] **Task 73**: 취소된 일정 소프트 취소 (`isCancelled=true`) & 모수 분모 제외
  - 이력이 있는 일정은 `isCancelled=true`로 전환하여 캘린더/매트릭스에 취소선 및 🚫 배지 표시, **모든 단원의 출석률 통계 모수(분모)에서 자동 제외**.
  - Touched: `src/types/rollbook.ts`, `src/services/sheets.ts`, `src/components/AdminMatrixGrid.tsx`, `src/components/CalendarView.tsx`, `src/index.css`
- [x] **Task 74**: GAS `LockService` 15초 스크립트 락 및 헤더 키 기반 동적 매핑
  - 현장 20~30명 동시 QR 스캔 시 행 덮어쓰기 방지를 위한 15초 배타적 락 적용.
  - `rows[i][0]` 하드코딩 제거하고 헤더 이름 기반 맵 매핑으로 열 순서 독립성 영구 보장.
  - Touched: `google-apps-script.js`, `docs/google_apps_script.js`
- [x] **Task 75**: 통합 테스트, 빌드 및 스키마 문서(DATA_SCHEMA.md v1.3.0) 갱신
  - 단위 테스트 2건 추가 (소프트 삭제 보존, 취소 일정 미참 투영), 91개 테스트 100% 통과, 프로덕션 빌드 무결성 확인.
  - Touched: `docs/DATA_SCHEMA.md`, `src/services/sheets.test.ts`

---

### Phase 5: [기획 & 백로그] 단원 음악적 역량 풀 & 맞춤형 코칭/격려 엔진 (Future RFC / Backlog)
> **사용자 요구사항**: "장기적인 관점에선 단원 관리 풀로 사용해볼 생각이야. 인적관리처럼 데이터화 할 수 있는 요소들(출석률, 음감, 피치, 호흡, 악보 리딩 능력, 악상 표현력)을 데이터화하고, 그에 맞춘 메시지나 조언/영상자료를 추천하려고 해. 아직 어떤 식으로 진행할지 미정이므로 코드는 추가하지 말고 기획 및 투두리스트로 정리해둘 것."

- [ ] **Task 38**: 단원 음악 역량 4대 척도 모델링 및 평가 체계 기획
  - **평가 항목 후보**:
    1. `음감 / 피치 정확도` (Pitch Intonation): 1~5점 척도 (1: 기초 필요 ~ 5: 정확한 피치)
    2. `호흡 지지력` (Breath Support): 1~5점 척도 (1: 호흡 짧음 ~ 5: 안정적 복식 지지)
    3. `시창 / 악보 리딩` (Sight-Reading): 1~5점 척도 (1: 청음 의존 ~ 5: 빠른 초견 독보)
    4. `악상 표현력` (Musical Expression): 1~5점 척도 (1: 평이함 ~ 5: 섬세한 프레이징 및 다이내믹)
  - **기획 결정 필요 사항 (Open Questions)**:
    - 5점 척도 슬라이더 vs 3단계 뱃지(초급/중급/고급) vs 키워드 태그형
    - 평가 주체: 지휘자/발성코치 단독 입력 vs 파트장 피드백 병행
    - 단원 공개 정책: 단원 본인에게 점수를 노출할 것인가(자기 성찰), 아니면 관리자/지휘자만 참고하는 비밀 지표로 둘 것인가?

- [ ] **Task 39**: 장기적 인적 관리 풀 & 발성/음색 분석 데이터베이스 설계
  - **수집 데이터 항목**:
    - `음색 및 발성 특징`: 서술형 (예: "맑고 서정적인 리릭 소프라노, 고음 전환 시 연구개 확장 필요")
    - `성악적 고민/약점 태그`: 다중 선택 (예: `#고음피치불안`, `#호흡부족`, `#성대긴장`, `#악보독보어려움`)
    - `추천 파트 및 솔로 적합도`: 파트장 추천 메모
  - **구글 시트 저장 방식 검토**:
    - 옵션 A: `단원명부` 시트 내 단일 JSON 컬럼 (`musicalProfile`)에 저장 (경량, 스키마 유연)
    - 옵션 B: 별도 `단원역량풀` 시트 탭 신설 (행 단위 이력 관리 가능, 지휘자의 회차별 코멘트 누적)

- [ ] **Task 40**: 출석 및 단원 포털 맞춤형 조언 & 영상/자료 추천 엔진 기획
  - **트리거 시나리오**:
    - **공백기 감지**: 14일 또는 3회 이상 불참 후 오랜만에 복귀한 단원 $\rightarrow$ *"오랜만에 오셨네요! 목 상하지 않게 발성부터 차근차근!"*
    - **고민 해결 큐레이션**: 단원의 고민 태그(`호흡부족`)에 맞춰 사전에 등록된 유튜브 보컬 트레이닝 영상 링크, 추천 호흡 연습법 카드 자동 매칭
    - **지휘자/파트장의 개별 격려 한마디**: 관리자가 프로필에 남겨둔 코칭 메모가 출석 완료 화면에 말풍선으로 전달
  - **노출 UX 위치 검토**:
    - 출석 완료 축하 팝업 화면 vs 단원 전용 출결 포털(`MemberPortalModal`) 내 '오늘의 코칭 카드' 탭


