# [Plan 09] 데이터 릴레이션·스키마 무결성 확립 & 동시성 락 & 환경설정 시트화 (09_schema_relation_integrity_and_concurrency.md)

> **상태**: ✅ 구현 및 검증 완료 (Implemented & Verified)  
> **작성일**: 2026-10-18  
> **연관 문서**: [docs/DATA_SCHEMA.md](file:///Users/grasshop/Desktop/Antigravity/Moonchoir_rollbook/docs/DATA_SCHEMA.md), [docs/PRD.md](file:///Users/grasshop/Desktop/Antigravity/Moonchoir_rollbook/docs/PRD.md), [docs/tasks.md](file:///Users/grasshop/Desktop/Antigravity/Moonchoir_rollbook/docs/tasks.md), [AGENTS.md](file:///Users/grasshop/Desktop/Antigravity/Moonchoir_rollbook/AGENTS.md)  
> **핵심 목표**: 프론트엔드와 구글 시트 간의 9대 스키마·릴레이션 불일치를 근본 해결하고, 합창 현장 20~30명 동시 스캔 시 데이터 덮어쓰기를 방지하는 GAS 스크립트 락 및 중앙 환경설정 시트화 완료.

---

## 1. 배경 및 문제 의식 (9대 불일치 & 숨겨진 복병)

기존 시스템은 구글 시트와 프론트엔드가 연동되었으나, 정밀 분석 결과 다음과 같은 치명적 정합성 결함이 존재했음:

1. **출결 취소 시 원천 로그 행 물리 삭제**: Event Sourcing 불변식 위반 및 감사 추적성 단절.
2. **단원 삭제 시 시트 행 물리 삭제**: 과거 출석/투표 로그의 외래키 고아화 및 역대 통계 왜곡.
3. **일정 삭제 시 시트 행 물리 삭제**: 과거 출결 데이터 소실 위험.
4. **GAS 통신의 `no-cors` 침묵 실패**: 시트 처리 실패 시 프론트엔드가 이를 알지 못함.
5. **일정캘린더 탭의 필수 필드 누락**: `locationId, latitude, longitude, radiusMeters, isCancelled`.
6. **출석원천로그 탭의 실측 거리 누락**: `distanceMeters` 컬럼 누락.
7. **열 순서 하드코딩 의존 (`rows[i][0]`)**: 구글 시트에서 열을 추가하거나 위치를 바꾸면 데이터 파싱 붕괴.
8. **통신 프로토콜 규격 불일치**: GET은 파싱하면서 POST는 맹목 전송.
9. **환경설정의 `localStorage` 격리**: 지각 유예시간, 관리자 PIN, 파트 분류가 다른 기기나 단원과 공유되지 않음.
10. **(숨겨진 복병) 동시성 레이스 컨디션**: 20~30명이 1분 사이에 동시 QR 스캔 시 구글 시트 행 덮어쓰기 발생.

---

## 2. 세부 설계 및 해결 아키텍처

### 1) 출결 취소 Event Sourcing 원복 (#1)
- 관리자가 출석을 취소/초기화할 때, 기존 출석 행을 물리 삭제하지 않음.
- 직전 로그 시각보다 1초 뒤인 **취소 전용 로그 (`adminNote: '관리자 출결 취소 (결석 처리)'`)**를 새로 Append 적재.
- 투영 엔진(`reconcileAttendance`)이 시계열 정렬된 로그를 재생(Replay)하여 마지막이 취소 로그이면 출석을 무효화하고 원래 결석/사유결석/미참으로 복원.

### 2) 이력 보호 소프트 삭제 / 취소 분기 (#2, #3)
- **단원 삭제 (`deleteMember`)**:
  - 출석/투표 이력이 있는 단원 $\rightarrow$ `status = 'DELETED'`로 소프트 삭제(명부에서 숨기되 역대 통계는 100% 보존).
  - 이력이 없는 오등록 단원 $\rightarrow$ 시트 행 물리 삭제.
- **일정 삭제 (`deleteSchedule`)**:
  - 출석/투표 이력이 있는 일정 $\rightarrow$ `isCancelled = true`로 소프트 취소(출석률 모수 분모에서 제외, 캘린더 취소선 표시).
  - 이력이 없는 오등록 일정 $\rightarrow$ 시트 행 물리 삭제.

### 3) 8번째 시트 탭: `환경설정` (`CONFIG`) 신설 (#9)
- 구글 시트에 Key-Value 형태의 `환경설정` 탭 신설.
- 관리자 PIN, 지각 유예시간(분), 동적 파트/상태/카테고리 배열, A4 인쇄 서식을 시트에 저장하고 `doGet` 시 전역 로드.

### 4) 열 순서 무관 헤더 키 기반 동적 매핑 (#7)
- GAS `readSheetData(sheet)` 및 쓰기 핸들러 전체를 헤더 이름 기반 맵 객체로 개편.
- 컬럼 순서가 바뀌거나 중간에 새 열이 삽입되어도 영향 없음.

### 5) GAS `LockService` 15초 스크립트 락 (+α 복병)
- `doPost` 전체에 `LockService.getScriptLock().waitLock(15000)` 및 `try-finally` 락 해제 적용.
- 현장 20~30명 동시 요청을 순차 큐잉하여 시트 행 충돌 원천 방지.

---

## 3. 구현 내역 및 파일 매핑

| 구현 컴포넌트 | 변경 파일 | 주요 변경 내용 |
| :--- | :--- | :--- |
| **GAS 백엔드** | [`google-apps-script.js`](file:///Users/grasshop/Desktop/Antigravity/Moonchoir_rollbook/google-apps-script.js) | LockService 락, CONFIG 탭, 헤더 키 기반 매핑, 소프트 삭제/취소 분기 |
| **도메인 모델** | [`src/types/rollbook.ts`](file:///Users/grasshop/Desktop/Antigravity/Moonchoir_rollbook/src/types/rollbook.ts) | `Member.status`에 `'DELETED'` 추가, `Schedule.isCancelled` 추가 |
| **날짜 유틸** | [`src/utils/date.ts`](file:///Users/grasshop/Desktop/Antigravity/Moonchoir_rollbook/src/utils/date.ts) | `parseKSTDate`의 정규식 확장 (`T` 및 공백 구분자 둘 다 완벽 지원) |
| **시트 어댑터** | [`src/services/sheets.ts`](file:///Users/grasshop/Desktop/Antigravity/Moonchoir_rollbook/src/services/sheets.ts) | Event Sourcing 취소 로그 Append, 소프트 삭제/취소 분기, 밀리초 숫자 정렬 |
| **출결 매트릭스** | [`src/components/AdminMatrixGrid.tsx`](file:///Users/grasshop/Desktop/Antigravity/Moonchoir_rollbook/src/components/AdminMatrixGrid.tsx) | 취소된 일정 모수 제외, 취소 헤더 뱃지/취소선 표시, CSV 익스포트 반영 |
| **캘린더 뷰** | [`src/components/CalendarView.tsx`](file:///Users/grasshop/Desktop/Antigravity/Moonchoir_rollbook/src/components/CalendarView.tsx) | 취소된 일정 `🚫 연습 취소` 뱃지 및 취소선 스타일 적용 |
| **어드민 센터** | [`src/components/AdminDashboard.tsx`](file:///Users/grasshop/Desktop/Antigravity/Moonchoir_rollbook/src/components/AdminDashboard.tsx) | 비동기 `updateConfig` 및 시트 동기화 완료 알림 |
| **스타일 시트** | [`src/index.css`](file:///Users/grasshop/Desktop/Antigravity/Moonchoir_rollbook/src/index.css) | `.matrix-cell.cell-cancelled`, `.matrix-session-col.col-cancelled` |

---

## 4. 검증 결과 (Verification)

- `npm run typecheck`: 0 errors
- `npm run lint`: 0 warnings, 0 errors
- `npm test`: 14개 테스트 스위트, 91개 테스트 전체 PASS (100%)
- `npm run build`: 프로덕션 번들 빌드 성공
