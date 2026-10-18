# [계획서 03] 단원 생애주기 이력 관리, 일정 카드(컨테이너) 체계 & 데이터 계약 검증

> **작성 일자**: 2026-10-17  
> **상태**: ✅ 완료 (Completed) — [Plan 09](file:///Users/grasshop/Desktop/Antigravity/Moonchoir_rollbook/docs/plans/09_schema_relation_integrity_and_concurrency.md)에서 DELETED 소프트 삭제 및 취소 일정 모수 제외 보강 완료  
> **담당**: Moonchoir AI 하네스 에이전트  
> **데이터 계약 스펙**: [docs/DATA_SCHEMA.md](file:///Users/grasshop/Desktop/Antigravity/Moonchoir_rollbook/docs/DATA_SCHEMA.md)  
> **핵심 헌법**: [AGENTS.md](file:///Users/grasshop/Desktop/Antigravity/Moonchoir_rollbook/AGENTS.md)

---

## 1. 개발 목표 및 배경

### 1) 단원 생애주기 이력 관리 (Member Status Timeline)
- **배경**: 10월 중순에 입단한 신입 단원이나 도중에 휴단/퇴단한 단원이 지난 연습의 결석자로 누적되어 전체 출석률이 왜곡되는 문제 해결.
- **요구사항**:
  - 단원 프로필 수정 시 **상태(정단원/준단원/휴단원/퇴단원/객원) 및 파트 변경 이력**을 기간(`startDate` ~ `endDate`)과 사유(`reason`)를 포함하여 기록.
  - 종료일 선택기에는 **[영구 (2999-12-31)]** 퀵 버튼을 두어 향후 영구 적용 지원.
  - 날짜 입력은 캘린더 피커와 직접 숫자 타이핑(`YYYY-MM-DD`)을 모두 지원.

### 2) 입단일 & 기간제 상태 기반 출결 모수(분모) 산출 엔진
- **판정 룰**:
  - `연습일자 < 입단일(joinedAt)`: **출결 의무 없음 (모수 제외)**
  - `startDate <= 연습일자 <= endDate` 구간의 상태가 `정단원` 또는 `준단원`: **필수 출결 대상 (모수 포함)**
  - `휴단원` 또는 `퇴단원`: **기본 모수 제외**
  - **휴단원/객원의 자발적 옵트인 출석**: 출석한 날에 한해서만 모수(분모) +1, 출석(분자) +1을 가산하여 통계 왜곡 없이 인정하고, 대시보드에서 `[💡 게스트 참여]` 뱃지 부여.

### 3) 일정 카드(Program Card) 컨테이너 중심 개편
- **배경**: 캘린더에 흩어진 16개 행을 일일이 체크해서 수정하는 피로를 줄이고, '정기연습 16회 + 중간 추가연습 2회'를 하나의 프로젝트 카드로 통합 관리.
- **요구사항**:
  - 정기연습은 회차 번호 없이 단순 표기 (예: `가을 정기연습`). 휴일 결항이나 일정 취소 시 회차 번호가 꼬이는 문제 원천 방지.
  - 추가 연습은 그때그때 네이밍을 새로 붙여 등록하되, [일정카드 목록]에서 해당 카드를 선택하면 그 카드의 일정표에 자연스럽게 소속됨.
  - 관리자 화면은 **[일정 카드 목록 & 카드 상세 일정 리스트]**로 제어하고, 단원 화면은 **[시간순 캘린더/타임라인]**을 유지하여 역할별 최적 UX 제공.

### 4) 데이터 계약(Contract) 무결성 검증 자동화
- `docs/DATA_SCHEMA.md`에 명시된 7대 엔티티의 컬럼명, 타입, 외래키 관계가 프론트엔드와 구글 시트 어댑터에서 어긋나지 않도록 데이터 정합성 단위 테스트(`schema.test.ts`) 구축.

---

## 2. 세부 구현 단계 (Action Plan)

### Step 1: 데이터 모델 및 타입 확장 (`src/types/rollbook.ts`)
- `MemberStatusHistory` 인터페이스 정의:
  ```typescript
  export interface MemberStatusHistory {
    id: string;
    memberId: string;
    status: MemberStatus;
    part: string;
    startDate: string; // YYYY-MM-DD
    endDate: string;   // YYYY-MM-DD (영구: 2999-12-31)
    reason?: string;
    createdAt: string;
  }
  ```
- `Member`에 `statusHistory?: MemberStatusHistory[]` 필드 추가.
- `ProgramCard` 인터페이스 정의 및 `Schedule`의 `programId` (`seriesId`) 릴레이션 연계.

### Step 2: 출결 모수 판정 유틸리티 구현 및 단위 테스트
- `src/utils/attendanceStats.ts`:
  - `isMemberRequiredForSchedule(member, scheduleDate)`: 특정 일자에 해당 단원이 필참 대상인지 판정.
  - `calculateMemberAttendanceSummary(member, schedules, rawLogs)`:
    - 입단일 이전 일정 자동 제외.
    - 휴단 기간 제외하되 실제 출석 기록이 있으면 옵트인 가산.
    - 정규 출석률(%)과 게스트 참여 횟수 분리 산출.
- `src/utils/attendanceStats.test.ts`: 10월 입단자, 11월 휴단자, 옵트인 출석자 등 다양한 시나리오에 대한 100% 그린 바 테스트 작성.

### Step 3: 단원 프로필 수정 모달 내 기간제 이력 관리 UI (`MemberProfileModal.tsx`)
- 상태 또는 파트 변경 시 [이력 추가] 섹션 활성화:
  - 적용 기간: `시작일 (YYYY-MM-DD)` ~ `종료일 (YYYY-MM-DD)`
  - [영구 적용] 버튼 클릭 시 종료일을 `2999-12-31`로 자동 세팅.
  - 변경 사유 인풋 필드 제공.
  - 하단에 [타임라인 이력 목록] 아코디언/리스트 제공 (과거 변경 내역 열람 가능).

### Step 4: 일정 카드(Program Card) 관리 UI 구축 (`AdminDashboard.tsx`)
- 어드민 일정 관리 탭에 **[📦 일정 카드 뷰]** 추가:
  - 새 일정 카드 생성: 카드명, 기본 설명, 기본 연습실, 기본 시간 설정.
  - 카드 내에서 `[+ 정기 반복 생성]` 또는 `[+ 추가 연습 등록]` 지원.
  - 카드 상세 모달: 해당 카드에 속한 모든 연습 일정이 날짜순으로 나열되며, 카드 단위 일괄 수정/삭제/복제 지원.

### Step 5: 데이터 계약 무결성 검증 테스트 구축 (`src/types/schema.test.ts`)
- `DATA_SCHEMA.md`에 정의된 컬럼 키와 실제 구글 시트 어댑터(`sheets.ts`), 목 데이터(`mockData.ts`)의 속성명 일치 여부를 정적으로 검증하는 테스트 추가.

### Step 6: 검증 및 DEV_LOG 업데이트
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run deploy`
- `docs/DEV_LOG.md` 업데이트

---

## 3. 사전 트러블슈팅 및 엣지 케이스 대비
1. **과거 레코드 하위 호환성 (Fallback)**:
   - 기존 단원들은 `statusHistory`가 비어있음. 이 경우 `joinedAt`부터 현재까지 기존 `memberStatus`가 유지된 것으로 안전하게 fallback 처리하여 에러 방지.
2. **구글 시트 탭 추가 시 마찰 방지**:
   - `일정카드` 탭이 아직 시트에 생성되지 않았더라도, 기존 `연습일정`의 `seriesId`를 기반으로 가상 프로그램 카드를 클라이언트에서 조합(Virtual Program Card)하여 기존 시트 데이터와 100% 호환되도록 구성.
