# [계획서 01] 네이버 지도 위치 픽커 & 구글 시트 장소정보 동기화 및 일정 일괄 관리

> **작성 일자**: 2026-10-16  
> **상태**: 완료 (Completed)  
> **관련 커밋/브랜치**: `main` (`ff693be` 등)

---

## 1. 개발 목표 및 기획 의도
1. **네이버 지도 + 도로명 주소 연동**:
   - 관리자가 위도/경도 좌표를 몰라도 도로명 주소 검색과 지도 클릭으로 연습실/공연장 위치를 지정하고 출석 반경(50m~500m)을 시각적으로 설정할 수 있도록 함.
2. **구글 시트 5번째 탭(`장소정보`) 동기화**:
   - 로컬스토리지에만 갇혀 있던 장소 정보를 구글 시트와 양방향 동기화하여 다중 관리자 환경 지원.
3. **일정 일괄 관리(Batch Actions)**:
   - 잘못 대량 생성된 정기 연습 일정을 체크박스 다중 선택으로 한꺼번에 삭제/수정할 수 있는 전용 뷰 제공.

---

## 2. 도메인 불변식 및 아키텍처 제약
- **하위 호환성**: 기존 4대 탭(`단원명부`, `일정캘린더`, `사전투표_RSVP`, `출석원천로그`) 구조를 깨뜨리지 않고 5번째 탭 `장소정보`를 조건부 자동 생성(`ensureSheetStructure`).
- **단일 어댑터 원칙**: UI 컴포넌트에서 직접 시트를 호출하지 않고 반드시 `src/services/sheets.ts`를 경유.
- **모바일 터치 타깃**: 최소 44px 이상 유지.

---

## 3. 세부 구현 단계 (Plan & Implementation)
1. **Google Apps Script (`google-apps-script.js`)**:
   - `SHEET_NAMES.LOCATIONS = '장소정보'` 추가.
   - `SAVE_LOCATION`, `DELETE_LOCATION` 핸들러 추가.
   - `BATCH_DELETE_SCHEDULES` (Bottom-to-Top 역순 행 삭제로 인덱스 보존).
   - `BATCH_UPDATE_SCHEDULES` (복수 일정 속성 일괄 갱신).
2. **시트 서비스 어댑터 (`src/services/sheets.ts`)**:
   - `deleteSchedules(scheduleIds)` 구현.
   - `batchUpdateSchedules(scheduleIds, updates)` 구현.
   - `fetchRemoteData()`에 `장소정보` 파싱 및 로컬 프리셋 병합.
3. **UI 컴포넌트 개발**:
   - `LocationPickerMap.tsx`: 도로명 주소 검색, 네이버 지도 인터랙티브 마커 & 원형 반경 오버레이, 상세주소/입구안내 필드.
   - `ScheduleEditModal.tsx`: 단일 일정 수정/삭제 및 동일 명칭 전체 회차 일괄 삭제/수정 옵션.
   - `BatchScheduleEditModal.tsx`: 다중 선택 일정 장소/시간/카테고리/설명 일괄 변경 모달.
   - `AdminDashboard.tsx`: 캘린더 보기 / 전체 목록 보기 뷰 모드 스위처 제공.

---

## 4. 직면했던 문제 & 트러블슈팅 (Troubleshooting)
1. **문제: 장소 삭제 시 팝업이 닫히며 삭제 컨펌이 오작동**
   - **원인**: 버튼 클릭 시 이벤트 버블링으로 부모 모달 오버레이의 `onClose`가 함께 트리거됨.
   - **해결**: `e.stopPropagation()` 추가 및 삭제 확인 로직 격리.
2. **문제: 스프레드시트 일괄 삭제 시 아래쪽 일정이 엉뚱하게 지워짐**
   - **원인**: 위에서부터 행을 지우면 스프레드시트 엔진이 아래쪽 행들을 위로 당기면서(Row Shifting) 나머지 타겟 행들의 인덱스가 1씩 밀림.
   - **해결**: 대상 행 번호 목록을 내림차순(역순)으로 정렬하여 맨 아래 행부터 지우도록 GAS 코드 수정.
3. **문제: 모달 조건부 렌더링 내 React Hook 규칙 위반 경고**
   - **원인**: `if (!schedule) return null;` 뒤에 `useState`가 선언되어 Hook 호출 순서가 가변적이었음.
   - **해결**: 모든 Hook을 컴포넌트 최상단에 선언하고, `key={editingSchedule?.id || 'none'}`를 부여하여 모달 대상 변경 시 깔끔하게 unmount/remount 처리.

---

## 5. 결정론적 검증 결과 (Verification)
- `npm run typecheck`: 0 errors
- `npm run lint` (oxlint): 0 errors, 0 warnings
- `npm test`: 30/30 단위 테스트 통과 (장소 동기화, 일괄 삭제, 일괄 수정 테스트 추가 완료)
- GitHub Pages 배포 완료 (`gh-pages`)
