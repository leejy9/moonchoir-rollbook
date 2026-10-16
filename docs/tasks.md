# Moonchoir Rollbook — PIV Execution Tasks (`tasks.md`)

> **Spec Reference**: [docs/PRD.md](file:///Users/grasshop/Desktop/Antigravity/Moonchoir_rollbook/docs/PRD.md)  
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

### Phase 3: 단원 경험(UX), 세션 안전성 & 자동화 백로그 (Planned)
- [ ] **Task 14**: 출석 QR 화면 UX & 사전 투표(RSVP) 시계 기반 상태 머신
  - 카카오톡 투표 연동 기술 한계 검토 및 웹앱 단일 채널 집중 전략
  - 시간 윈도우 기반 상태 전환: [연습 D-N일 ~ 연습 1시간 전: RSVP 투표] -> [연습 1시간 전 ~ 종료: 현장 QR 스캐너 활성화]
- [ ] **Task 15**: 단원 전용 출결 포털 & 기기 명부 통신/파트 선택 오류 개선
  - 일반 단원용 [내 출결 성적표 & 원천 로그 히스토리] 모달
  - 앱 기동 시 구글 시트 원천 동기화(`fetchRemoteData`) 누락 해결 및 하드코딩 완전 제거
  - `BindingModal` 내 동적 파트 필터링 오류 수정 (동적 taxonomy 반영)
- [ ] **Task 16**: 홈 화면 캘린더 중심 레이아웃 재배치
  - 상단: 당월 인터랙티브 캘린더 기본 렌더링
  - 하단: 오늘/다가오는 연습 일정 리스트 큐로 재배치
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
  - 관리자 진입 시 세션 유효시간(예: 30분) 만료 검증 및 안전한 비밀번호 검증.
  - 관리자의 모든 데이터 생성/수정/삭제 작업을 구글 시트 `AdminAuditLog` 탭에 Append-only로 기록.
  - 단원이 사파리/크롬/카카오 인앱 브라우저 전환 등으로 기기 바인딩이 풀렸을 때, [이름 + 전화번호 뒤 4자리] 입력만으로 기존 멤버 세션 즉시 복구.

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
