# [계획서 02] 정기 일정 3단 제어, 시즌 복제, 인라인 UX & QR 매칭 안정화

> **작성 일자**: 2026-10-17  
> **상태**: 완료 (Completed)  
> **담당**: Moonchoir AI 하네스 에이전트  
> **핵심 헌법**: [AGENTS.md](file:///Users/grasshop/Desktop/Antigravity/Moonchoir_rollbook/AGENTS.md)

---

## 1. 개발 목표 및 기획 의도
1. **인라인 '직접 입력' UX 및 장소 등록 원스톱 연동**:
   - `MemberProfileModal`: 파트 선택 시 `기타(직접 입력)` 옵션 지원 및 인라인 텍스트 필드 활성화.
   - `AdminDashboard` & `ScheduleEditModal`: 카테고리 인라인 직접 추가 지원.
   - 장소 드롭다운에서 `🗺️ + 새 연습 장소 추가 (지도/주소 검색)` 선택 시, 장소 관리 탭으로 이동할 필요 없이 현재 화면 위에 바로 `LocationPickerMap` 모달을 띄워 등록 후 자동 선택.
2. **QR 스캐너 상단 실시간 출석 일정 매칭 배지 표시**:
   - 상설 마스터 QR이든 회차별 QR이든 단원이 스캔할 때 **[🎯 출석 대상: 2026-10-16 정기연습 (장소명)]**을 실시간으로 보여주어 불안감 해소.
   - 오늘 일정이 없는 경우 명확한 안내 렌더링.
3. **안전한 `seriesId` 기반 정기 일정 3단 제어**:
   - 구글 캘린더 스타일 3단 수정/삭제 팝업:
     - ① **[이 일정만 수정 / 삭제]**
     - ② **[이 일정 및 향후 모든 일정 일괄 수정 / 삭제]** (과거 출결 보존, 오늘 이후 미래 회차만 일괄 반영)
     - ③ **[전체 반복 일정 일괄 수정 / 삭제]**
4. **시즌 일정 템플릿 복제 (`Duplicate Season`) & 아카이빙**:
   - 관리자가 지난 학기 16회차 일정을 선택하여 새 학기 시작일만 지정하면 새로운 `seriesId`로 메타데이터 복제 (출결/투표 데이터는 깨끗한 빈 상태로 초기화).
   - 지난 시즌 일정 숨기기 / 표시 토글 지원.
5. **데이터 고아화(Orphan) 및 무결성 100% 방어**:
   - `출석원천로그`와 `사전투표_RSVP`는 오직 불변의 `scheduleId`만을 참조.
   - 일정 수정 시 새 ID를 발급하지 않고 In-place 갱신하여 기존 출결 데이터 연결 보존.

---

## 2. 도메인 불변식 및 아키텍처 제약 검토
- **Event Sourcing Invariant**: 출석 원천로그는 불변. 일정 수정이나 시리즈 분기 시 과거 로그 절대 삭제/수정 금지.
- **Foreign Key Invariant**: `scheduleId`는 일정별 고유 ID로 유지되며, `seriesId`는 순수 그룹핑 태그(Grouping Tag)로만 활용.
- **하위 호환성 (Fallback)**: `seriesId`가 없는 과거 일정은 `title` 기반으로 안전하게 fallback 처리.
- **모바일 터치 타깃**: 최소 44px 이상 보장.

---

## 3. 세부 구현 단계 (Action Plan)

### Step 1: 도메인 모델 확장 (`src/types/rollbook.ts`)
- `Schedule` 인터페이스에 필드 추가:
  - `seriesId?: string` (반복 그룹 고유 ID, 예: `series_20261017_xxxx`)
  - `seriesIndex?: number` (해당 시리즈 내 몇 번째 회차인지, 예: 1)
  - `seriesTotal?: number` (해당 시리즈 총 몇 회차인지, 예: 16)
  - `isArchived?: boolean` (지난 학기 숨김 처리 여부)

### Step 2: 캘린더 유틸리티 보강 (`src/utils/calendar.ts`)
- `expandRecurringSchedules`:
  - 생성되는 모든 인스턴스에 통일된 `seriesId` 발급.
  - `seriesIndex: i + 1`, `seriesTotal: totalCount` 부여.
- `duplicateScheduleSeries(schedules, seriesId, newStartDate)`:
  - 지정된 시리즈의 일정들을 새 시작일에 맞춰 날짜를 시프트하고 새 `seriesId`와 새 `scheduleId`를 발급하여 복제.

### Step 3: 인라인 '직접 입력' & 모달 내 장소 픽커 연동
- `MemberProfileModal.tsx`:
  - 파트에 `__CUSTOM__` 옵션 추가, 선택 시 인라인 입력창 출력, 저장 시 파트 반영.
- `AdminDashboard.tsx` & `ScheduleEditModal.tsx`:
  - 카테고리 드롭다운에 `__CUSTOM__` 인라인 추가.
  - 장소 드롭다운에 `__NEW_LOCATION__` 옵션 추가.
  - `isLocationPickerOpen` 모달 상태를 관리하여, 선택 시 `LocationPickerMap`을 모달-인-모달로 띄우고 저장 시 즉시 해당 일정의 장소로 자동 선택.

### Step 4: QR 스캐너 실시간 일정 매칭 배지 (`QRScannerModal.tsx`)
- 스캐너 화면 상단에 현재 타깃 일정 배지 렌더링:
  - `🎯 오늘 출석 일정: [일정명] | [장소명] ([시간])`
  - 오늘 일정이 없는 경우: `ℹ️ 오늘 등록된 연습 일정이 없습니다 (상설 QR 스캔 대기)` 안내 표시.

### Step 5: `ScheduleEditModal.tsx` 정기 일정 3단 제어 완성
- 수정 시 라디오/버튼 3단 선택:
  - `[이 일정만 변경]` (단일 날짜 In-place 업데이트)
  - `[이 일정 및 향후 모든 일정 일괄 변경]` (`seriesId === target.seriesId && date >= target.date`)
  - `[전체 N개 회차 모두 일괄 변경]` (`seriesId === target.seriesId`)
- 삭제 시 버튼 3단 분기:
  - `[이 회차만 삭제]`
  - `[이 회차 및 향후 회차 삭제]`
  - `[전체 시리즈 일괄 삭제]`

### Step 6: 시즌 복제 및 아카이브 필터 UI (`AdminDashboard.tsx`)
- 전체 목록 뷰 상단에:
  - `[지난 시즌 숨기기 / 전체 표시]` 토글.
  - 시리즈 그룹 헤더에 `[🔁 이 시즌 다음 학기로 복제]` 버튼 제공.

### Step 7: 결정론적 센서 검증 & 배포
- `npm run typecheck`
- `npm run lint`
- `npm test` (신규 유틸 및 서비스 단위 테스트 작성)
- 배포 및 DEV_LOG 업데이트

---

## 4. 직면한 문제 & 트러블슈팅 (Troubleshooting)
1. **문제: `LocationPickerMap`을 모달-인-모달로 호출할 때 장소명 입력 및 모달 헤더/푸터 누락**
   - **원인**: 기존 `LocationPickerMap`은 지도와 주소 입력만 담긴 인라인 필드 컴포넌트였음.
   - **해결**: `LocationPickerMap`을 감싸는 전용 모달 컴포넌트 `LocationPickerModal.tsx`를 신설하여 장소명 입력 필드, 확인/취소 버튼, `LocationPreset` 자동 생성 및 콜백을 캡슐화. 이를 `ScheduleEditModal`과 `AdminDashboard` 양쪽에서 재사용.
2. **문제: `AdminDashboard.tsx`에서 `LocationPreset` 타입 미임포트로 인한 빌드 오류**
   - **원인**: 신규 함수 `handleAddNewLocationPresetFromModal` 추가 시 타입 임포트 누락.
   - **해결**: `src/types/rollbook.ts`에서 `LocationPreset`을 명시적으로 임포트하여 정적 타입 검증 0 에러 달성.
3. **문제: 반복 일정 시리즈 복제 시 과거 출결/투표 데이터 오염 위험**
   - **원인**: 단순 객체 얕은 복사 시 과거 `id`와 연계된 출석 및 투표 기록이 새 학기 일정에 딸려올 위험.
   - **해결**: `duplicateScheduleSeries` 유틸에서 새로운 `scheduleId`, 신규 `seriesId`, 무작위 출석 PIN을 완전히 새로 생성하여 이전 학기 출결 로그 및 RSVP와의 외래키 무결성을 100% 격리.

---

## 5. 최종 검증 결과
- `npm run typecheck`: 통과 (0 errors)
- `npm run lint` (oxlint): 통과 (0 warnings, 0 errors)
- `npm test`: 통과 (31/31 tests pass)
- 프로덕션 빌드 & GitHub Pages 배포 완료 (`npm run deploy`)
