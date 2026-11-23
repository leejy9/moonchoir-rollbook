# 18. v3 배포 전 데이터 관계·계산 검토 계획

> 작성: 리뷰어(Claude), 2026-11-23. 절차는 `.claude/skills/data-integrity-review` 스킬을 따른다.
> 목적: v3(홈·연습실·내 활동·운영진 연습곡)를 운영에 내보내기 전, 데이터 연결부에서 생길 수 있는 잘못된 숫자·오염을 미리 찾는다. 과거 실수의 대부분이 여기서 났다(병합 회원, 시간대, 보관 상태, 설정값 문자열, 출결 판정 중복).
> 대상 코드: `feat/v3-activity-2`(v3-A·B·C 전부 포함). 운영 DB는 읽기 전용, 개수만.
> 결과물: 발견 목록(§11 형식) → 리뷰어가 `spec-writer`로 수정 티켓(V3-21) 작성.

## 담당과 순서
| 단계 | 담당 | 산출물 |
|---|---|---|
| A. 관계 지도·상태 규칙표 작성(스킬 §1~§4) | 새 맥락 검토 에이전트(spec-auditor와 같은 방식) | 표 3개 |
| B. 단일 원천·조인·계약 대조(§5~§7) | 같은 에이전트 | 발견 목록 |
| C. 운영 불변식 쿼리(§8) | 리뷰어(Supabase 커넥터, 읽기 전용) | 숫자 표 |
| D. 골든 데이터셋 + 화면 대조(§9~§10) | 리뷰어(가짜 응답 주입 화면) + 개발 에이전트(테스트 픽스처) | 기대값 표, 캡처 |
| E. 수정 티켓 | 리뷰어(`spec-writer` → `spec-audit`) | V3-21 |

## 우선 점검 목록 (이 프로젝트에서 실제로 틀렸거나 틀리기 쉬운 곳)

### 1. 사람(회원) 정체성
- `members.merged_into_id`: 병합 회원의 **출석 로그·투표·투표 이력·재생 기록·상태 이력**이 내 활동의 모든 숫자(레벨, 출석률, 함께한 날, 연습 시간, 공연 수, 온도, 스티커)에 합쳐지는가. 서버 `fn_get_member_activity(text[])`에 별칭 집합이 실제로 넘어가는가.
- 기기에 묶인 프로필(`moonchoir_bound_device_v1`)이 병합 전 옛 id일 때: 화면 계산 기준 id, 재생 기록을 쓰는 id.
- 스태프 판정(`isActivityStaff`)과 운영진 판정(`isStaffMember`)이 섞여 쓰이는 곳이 없는가.
- 상태 이력(`member_status_history`, 휴단원·기간제 상태)이 필참 판정·출석률·레벨·온도 창에 일관되게 반영되는가.

### 2. 일정·출결
- 일정별 출결 상태의 원천이 `buildMemberScheduleRecords` 하나인가(관리자 화면, 출석 기록 시트, 온도, 스티커, 숫자 카드, 출석률).
- 취소(`isCancelled`), 보관(`isArchived`), 대상 외(필참 아님), 오늘 시작 전(`대기`)의 포함 규칙이 지표마다 명세와 같은가(스킬 §4 표로).
- 관리자 출결 취소 로그(초기화)·수동 결석 로그 뒤의 상태가 모든 화면에서 같은가.
- `lateGraceMinutes`가 모든 경로에서 설정값(숫자 변환 후)으로 쓰이는가.
- 연습 시간: `end_time`이 비었거나 시작보다 이른 일정, 공연 수: `performanceCategories`(기본 `['연주']`) 적용.

### 3. 투표·투표 이력
- `rsvp_votes`(현재 상태, 유일키 일정+회원)와 `rsvp_events`(이력, 2026-11-23 운영 적용, 백필 90건)의 관계: 백필 제외 규칙(V27)이 온도·스티커 모든 항목에서 지켜지는가, "3시간 안에 바꿈"만 백필을 이전 상태로 쓰는가.
- 투표 시각 비교: 일정 시작 `{date}T{startTime}:00+09:00` vs `occurred_at`. 사유결석 판정은 현재 투표(`rsvp_votes`의 사유) 기준인데, 온도의 약속 판정은 이벤트 기준 — 둘이 엇갈리는 입력이 있는가.
- `fn_import_sheets_snapshot` 재실행 금지(ARCHITECTURE_RECOVERY 운영 주의).

### 4. 연습곡·공연·재생
- `practice_pieces` ↔ `practice_tracks` ↔ `practice_performance_pieces` ↔ `performances`: 보관된 곡·트랙·공연·연결의 4가지 조합에서 연습실 목록, 공연 전체 재생 목록, 대표 음원, 관리자 "대표" 표시, 곡 수 표시가 같은 결과인가.
- 삭제 함수(V22)와 재생 기록(`practice_listen_sessions`, FK `on delete restrict`): 재생 기록이 있는 곡·트랙 삭제 거부, 회원 물리 삭제 시 재생 기록 cascade.
- 재생 기록: 하루 21,600초 상한(KST 날짜), 120초 상한, chunk 중복, 유튜브 제외, 탭 숨김 시 전송.
- 저장 공간 합계(`fn_get_media_usage`)와 실제 파일 크기 열의 일치, 교체·삭제 뒤 R2 키 정리.

### 5. 설정값·분류
- `app_config.value`는 text: 숫자·배열 키가 모두 `normalizeAppConfig`를 거치는가(새로 생긴 키 포함: `performanceCategories`, `practiceTrackKinds`, `mediaPublicBaseUrl`).
- 파트·상태·일정 구분이 설정 목록에 없는 원문 값일 때 화면이 깨지지 않고 원문을 보존하는가.

### 6. 서버↔화면 계약
- RPC 응답 키: `fn_get_practice_catalog`(새 키 `performances`, `performancePieces`, `scoreStorageKey`, `sizeBytes`), `fn_get_member_activity`(`daily`, `perPiece.reached60At`), 스냅숏(`fn_get_initial_snapshot`). 옛 응답에서 키가 없을 때의 기본값.
- 클라이언트 캐시(localStorage)의 옛 형식 데이터가 새 코드에서 읽힐 때.

### 7. 화면 간 일관성
- 출석률: 내 활동 링(최근 90일) vs 관리자 화면 출석률(기간이 다르면 다른 게 정상인지 명세 확인).
- 공연 수: 내 활동 숫자 카드 vs 무대 스티커 vs 온도 공연 항목.
- 출결 상태: 출석 기록 시트 vs 관리자 매트릭스 vs 온도 내역의 일정 목록.

## 운영 불변식 쿼리 초안 (§8, 리뷰어 실행, 개수만)
- 고아: 없는 회원·일정을 가리키는 `attendance_logs`, `rsvp_votes`, `rsvp_events` 수
- 병합 회원 id로 2026-11-23 이후 새로 쌓인 로그·투표·이벤트 수
- 보관된 곡·공연을 가리키는 활성 연결 수, 트랙이 0개인 활성 곡 수
- `rsvp_votes` 일정+회원 중복 수(유일키 확인), `rsvp_events`의 일정+회원 중 백필 2건 이상 수
- `schedules.end_time` 빈 값·시작보다 이른 값 수, 미래 시각 출석 로그 수
- 분류 원문 중 설정 목록에 없는 값의 종류 수(파트, 상태, 일정 구분)

## 완료 기준
- 표 3개(관계 지도, 시간 열, 상태 포함 규칙)와 발견 목록이 이 문서 아래에 붙는다.
- 치명·중요 발견은 V3-21 티켓이 되고, 기계로 막을 수 있는 것은 CI 가드나 `supabase/tests/*.sql` 검증 항목이 된다.
- 배포는 V3-21의 치명 항목이 0이 된 뒤에 한다.
