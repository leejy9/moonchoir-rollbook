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

## 검토 결과 (A·B 단계)

검토 범위는 저장소의 마이그레이션 14개, v3 명세, 현재 클라이언트·SQL 연결부다. 운영 DB에는 접속하지 않았고 SQL을 실행하지 않았다. 따라서 운영 행 개수, 실제 text 시각 형식, 운영 데이터에서의 고아·중복 여부는 확인하지 않았다. 아래 재현 테스트는 임시 파일로 실행한 뒤 삭제했다.

### A1. 관계 지도

| 테이블 | 키 | 참조(FK)와 삭제 규칙 | 생애 상태 열 | 쓰는 함수 | 읽는 함수 |
|---|---|---|---|---|---|
| `members` | `id` PK | `merged_into_id` 자기 참조 FK 없음. `practice_listen_sessions.member_id`에서 참조(`ON DELETE CASCADE`) | `status`, `merged_into_id`; 소프트 삭제는 `DELETED`, 병합은 `MERGED` | `fn_register_member`, `fn_register_and_bind_member`, `fn_update_member`, `fn_delete_member`, `fn_merge_members`, `fn_import_sheets_snapshot` | `fn_get_initial_snapshot`, `members_public`; `parseRemoteMembers` |
| `member_status_history` | `id` PK | `member_id`는 FK가 아닌 text | `start_date`, `end_date`로 기간 표현; 별도 보관·삭제 열 없음 | `fn_add_member_history`, `fn_import_sheets_snapshot` | `fn_get_initial_snapshot.memberHistory`; `parseRemoteMembers`, `getEffectiveMemberStatus` |
| `program_cards` | `id` PK | `default_location_id`, `schedules.program_id`, `practice_program_pieces.program_id`에 FK 없음. 연결 행은 별도 보관 가능 | `is_archived` | `fn_save_program_card`, `fn_delete_program_card__impl`, `fn_import_sheets_snapshot` | `fn_get_initial_snapshot` |
| `locations` | `id` PK | `schedules.location_id`, `program_cards.default_location_id`에 FK 없음 | 삭제 열 없음 | `fn_save_location`, `fn_delete_location`, `fn_import_sheets_snapshot` | `fn_get_initial_snapshot` |
| `schedules` | `id` PK | `location_id`, `program_id`는 FK 없음. 출결·투표·댓글 원천 테이블도 FK 없음 | `is_archived`, `is_cancelled` | `fn_create_schedule`, `fn_update_schedule`, `fn_delete_schedule`, batch RPC, `fn_import_sheets_snapshot` | `fn_get_initial_snapshot`; 클라이언트 일정 투영 |
| `rsvp_votes` | `id` PK; `(schedule_id, member_id)` UNIQUE | 회원·일정 FK 없음 | 현재 상태 행; 수정·삭제 가능. 트리거가 변경 이벤트를 추가 | `fn_submit_rsvp`, `fn_cancel_rsvp`, `fn_import_sheets_snapshot`; `trg_rsvp_votes_log` | `fn_get_initial_snapshot`; RSVP 상태 투영 |
| `attendance_logs` | `seq` identity PK; `id` UNIQUE | 회원·일정 FK 없음 | 보관 열 없음. UPDATE/DELETE 트리거로 append-only | `fn_record_attendance`, `fn_clear_attendance`, `fn_import_sheets_snapshot` | `fn_get_initial_snapshot`; 출결 투영 함수 |
| `schedule_comment_events` | `seq` identity PK; `id` UNIQUE | 회원·일정 FK 없음 | append-only 트리거; 편집·삭제는 이벤트로 기록 | `fn_add_comment`, `fn_edit_comment`, `fn_delete_comment`, `fn_import_sheets_snapshot` | `fn_get_initial_snapshot`; 댓글 이벤트 투영 |
| `app_config` | `key` PK | 없음 | `updated_at`; 값은 text | `fn_save_config__impl` 및 보안 래퍼 | `fn_get_initial_snapshot.config`; `normalizeAppConfig` |
| `app_secrets` | `key` PK | 없음 | `updated_at`; 비공개 값 | 설정 저장의 secret 경로 | `fn_get_admin_secrets` 계열 |
| `admin_sessions` | `token_hash` PK | 없음 | `tier`, `expires_at`, `last_used_at` | `fn_issue_admin_session`, `fn_admin_logout` | `fn_check_admin_token`, 관리자 인증 함수 |
| `auth_failures` | `id` identity PK | 없음 | `kind`, `failed_at` | `fn_auth_record_failure` | `fn_auth_is_locked`, PIN 인증 함수 |
| `practice_pieces` | `id` PK | 직접 FK 없음. `practice_tracks`, 연결 테이블, 재생 기록이 참조하며 삭제는 FK·보호 RPC로 제한 | `archived_at`; 일반 DELETE 차단 트리거(검증된 삭제 RPC만 트랜잭션 설정으로 우회) | `fn_save_practice_piece`, `fn_set_practice_piece_archived`, `fn_delete_practice_piece` | `fn_get_practice_catalog`, `fn_get_media_usage` |
| `practice_program_pieces` | `(program_id, piece_id)` PK | `program_id → program_cards.id`, `piece_id → practice_pieces.id`, 양쪽 `ON DELETE RESTRICT` | 연결 행 자체 `archived_at`; 양쪽 본체의 보관과 별도 | `fn_set_program_pieces`; 곡 삭제 RPC | `fn_get_practice_catalog` |
| `practice_tracks` | `id` PK | `piece_id → practice_pieces.id ON DELETE RESTRICT`; `practice_listen_sessions.track_id`도 `RESTRICT` | `archived_at`; 일반 DELETE 차단, 조건부 삭제 RPC | `fn_save_practice_track`, reorder/archive/delete RPC | `fn_get_practice_catalog`, `fn_get_media_usage` |
| `performances` | `id` PK | 본체 FK 없음. `practice_performance_pieces`가 참조(`ON DELETE RESTRICT`) | `archived_at`; 일반 DELETE 차단, 연결을 지우는 삭제 RPC 있음 | `fn_save_performance`, `fn_set_performance_archived`, `fn_delete_performance` | `fn_get_practice_catalog`, `buildPerformanceScopes` |
| `practice_performance_pieces` | `(performance_id, piece_id)` PK | 공연·곡 양쪽 `ON DELETE RESTRICT` | 연결 행 `archived_at`; 공연·곡 본체 보관과 별도 | `fn_set_performance_pieces`; 공연/곡 삭제 RPC | `fn_get_practice_catalog`, `buildPerformanceScopes` |
| `rsvp_events` | `seq` identity PK | 회원·일정 FK 없음 | `action`(insert/update/delete/backfill); UPDATE/DELETE 트리거 차단 | `rsvp_votes` 트리거 및 최초 backfill | `fn_get_member_activity` |
| `practice_listen_sessions` | `chunk_id` PK | 회원 `ON DELETE CASCADE`; 곡·트랙 `ON DELETE RESTRICT` | UPDATE 트리거 차단; 회원 삭제 cascade 가능 | `fn_log_listen_session` | `fn_get_member_activity` |

연결 테이블의 `archived_at`은 연결 행만 숨긴다. 예를 들어 곡·공연·공연 연결의 보관 여부는 각각 별도로 확인해야 한다. 핵심 출결·투표·댓글 이벤트는 스키마상 회원/일정 FK가 없으므로 원천 로그의 append-only 보호와 참조 무결성은 별개다.

### A2. 시간 열 표

| 열 | 저장 타입 | 쓰는 쪽의 확인된 형식 | 읽는 쪽 해석·비교 상대 |
|---|---|---|---|
| `members.joined_at` | `text` | 신규 등록은 KST `YYYY-MM-DD`; 스냅숏 import는 원문 보존 | `computeDaysTogether`는 날짜 형식만 허용하고 `todayStr`과 문자열 비교 |
| `members.bound_device_at`, `member_status_history.created_at`, `program_cards.created_at` | `text` | 단말/상태 이력 작성은 KST `YYYY-MM-DD HH:mm:ss`; 프로그램 카드 값·구버전 import의 분포는 미확인 | 이력 정렬은 text `localeCompare`; 다른 사용처의 시각 정규화는 `normalizeToKSTTimestamp` |
| `member_status_history.start_date`, `end_date` | `text` | 날짜 경계 `YYYY-MM-DD`; 종료 기본값 `2999-12-31` | `getEffectiveMemberStatus`가 대상 일정의 `YYYY-MM-DD`와 사전순 비교 |
| `program_cards.default_start_time`, `default_end_time`; `schedules.start_time`, `end_time` | `text` | 현지 벽시계 `HH:mm` 입력 | 출결·일정 표시와 연습 시간 계산은 clock 값으로 해석. RSVP 마감 비교는 `{date} {start_time}:00+09`로 시점화 |
| `schedules.date` | `text` | 날짜 입력·스냅숏 문자열; 파서가 `YYYY-MM-DD`로 정규화 | 다수 일정 범위는 문자열 비교. 현재 출석률은 `todayStr` 이하 날짜를 포함 |
| `rsvp_votes.timestamp`, `attendance_logs.timestamp`, `schedule_comment_events.timestamp` | `text` | 앱 작성은 KST `YYYY-MM-DD HH:mm:ss`(시간대 없음); import/구형 행은 시간대 포함 형식도 허용 | `normalizeToKSTTimestamp`는 오프셋/Z가 있으면 KST 변환, 없으면 KST 벽시계로 취급. 출결은 시작 시각과 비교 |
| `performances.performance_date` | `text` | 빈 문자열 또는 `YYYY-MM-DD` 제약 | `buildPerformanceScopes`가 KST 오늘 날짜와 문자열 비교 |
| `rsvp_events.occurred_at` | `timestamptz` | RSVP 트리거는 `now()`; backfill은 `fn_safe_timestamptz`로 기존 text 해석(시간대 명시값은 instant, 미표기값은 Asia/Seoul) | 이벤트·일정 시작 시점 비교, 내역은 KST 날짜로 표시 |
| `practice_listen_sessions.started_at`, `received_at` | `timestamptz` | 클라이언트 `startedAt`은 ISO UTC(`toISOString()`); `received_at`은 DB `now()` | 세션은 instant로 처리; 일별 누적은 `received_at AT TIME ZONE 'Asia/Seoul'` 기준 |
| `created_at`, `updated_at`, `received_at`, `archived_at`, `failed_at`, `expires_at`, `last_used_at` 등 나머지 시각 열 | 대체로 `timestamptz` | DB `now()` 기본값 또는 SQL 함수에서 생성 | SQL/클라이언트가 instant로 읽고, 달력 날짜가 필요할 때 KST로 변환. `members`와 일부 구형 테이블의 `created_at`은 위와 같이 예외적으로 text |

운영 데이터의 text 시각 길이·시간대 표기·잘못된 날짜 수 분포는 **미확인 — 운영 DB 접근 금지**. 특히 import 경로가 구형 원문을 유지하므로 코드가 지원하는 형식과 운영 실제 분포가 일치하는지는 이 단계에서 결론 내릴 수 없다.

### A3. 지표별 상태 포함 규칙 대조

| 지표/목록 | 취소·보관 | 병합·기간 상태 | 필참 아님·스태프 | 오늘 시작 전 | 기록 없음 |
|---|---|---|---|---|---|
| 레벨(누적 출석) | 취소 일정은 `buildMemberScheduleRecords`에서 제외. 프로필은 `includeArchived: true`라 보관 일정은 포함 | 출결 로그 alias는 현재 기준 ID에서 옛 ID 방향으로 모음. `getEffectiveMemberStatus`는 기준 회원 자체의 이력만 사용 | 비필참 일정도 실제 출석이면 포함. 스태프는 레벨 대신 칭호 | 미체크인은 `대기`라 제외; 선행 체크인이 있으면 출석 상태로 카운트 | Lv.1 |
| 출석률(90일) | 취소·보관 제외 | 날짜별 회원 이력·필참 판정을 사용. alias 로그는 기준 ID에서 옛 ID 방향으로 모음 | 비필참은 자발적 출석만 분자·분모에 포함. 스태프는 숨김 | 명세대로 오늘 날짜를 포함하며, 시작 전 시각은 따로 비교하지 않음. 그래서 일정 목록의 `대기`와 달리 미출석으로 모수에 들어갈 수 있음 | `null`, 화면은 `—` |
| 함께한 날 | 일정 상태와 무관 | `joinedAt`이 유효하면 기준 회원 값 사용. 없을 때만 alias 로그 중 첫 날짜 사용; 휴단원 기간은 차감하지 않음 | 역할 구분 없이 계산 | 기준일은 KST 날짜 | 기준 날짜·로그가 모두 없으면 0 |
| 연습 시간·공연 수(일정 category) | 취소 제외, 보관 포함(프로필이 `includeArchived: true` 전달) | 출석 상태가 alias 로그를 사용하나 기간 상태는 기준 회원으로 판정 | 비필참 일정도 체크인 인정이면 포함. 스태프도 숫자 표시 | 미체크인은 `대기`여서 제외; 체크인 있으면 포함 | 0 |
| 열정 온도 | 취소·보관 제외(명세 §5-5) | 시작시각 기준 최근 12개; RSVP alias는 기준 ID에서 옛 ID 방향. 상태 이력은 기준 회원으로 판정 | 필참 외 일정은 실제 체크인했을 때 포함; 스태프는 숨김 | 시작 시각 이전 일정은 제외 | 기준 온도 36.5°C, “아직 기록이 없어요” |
| 칭찬 스티커 | 취소·보관 제외 | 출결 alias 기반; 약속 이벤트는 배포 전 backfill 제외(빠른 변경의 이전 상태 탐색 예외). RSVP RPC는 최근 400건만 반환 | 스티커별 필참 조건 적용; 스태프는 명세의 8개만 | 일정 기반 조건은 상태 엔진을 거침 | 획득 0개. 약속·재생 데이터가 없으면 해당 묶음 미획득 |
| 연습실 곡/공연 목록 | 보관 공연·연결·곡·트랙을 각각 제외; 활성 공연에 보관되지 않은 곡 연결이 1개 이상일 때 목록 노출 | 회원·출석 상태와 무관 | 회원 역할과 무관 | 일정 날짜와 무관; 공연 날짜로 다가오는/지난 항목 분류 | 활성 공연·곡이 없으면 해당 목록/범위 없음 |
| 공연 전체 재생 | 활성 공연·활성 연결·활성 곡·재생 가능한 비보관 트랙을 사용 | 회원·출석 상태와 무관 | 회원 역할과 무관 | 일정 시작 시각과 무관 | 대표 음원이 없는 곡은 재생 목록에서 제외 |

명세와 대조해 **미정인 규칙**: §5-2는 누적 레벨·연습 시간·공연 수의 보관 일정 처리를 명시하지 않는다. 현재 구현은 이 세 지표에서 보관 일정을 포함하지만 출석률·온도·스티커는 제외한다. 보관이 “화면에서 숨김”인지 “모든 역사 지표에서 제외”인지 명세 결정을 확인해야 하며, 이 표만으로 버그라고 단정하지 않았다. 오늘 미시작 일정도 명세상 출석률은 날짜 기준으로 포함하지만, 일정별 출결 목록은 `대기`로 보여 주는 차이가 있다.

관리자 출결 매트릭스는 별도 상태 칸이다. 현재 `sheetsService.reconcileAttendance`가 `reconcileSingleMemberAttendance`를 직접 호출해 `buildMemberScheduleRecords`의 당일 `대기` 변환을 거치지 않는다(F-8).

### B. 연결부 대조

| 우선 점검 | 확인 결과 |
|---|---|
| 1. 회원 정체성·상태 이력 | 병합된 옛 ID에서 대표 ID 방향으로 조회하지 않는 재현을 확인(F-1). 사용자 지정 대상 ID와 대표 ID 비교도 별칭을 해석하지 않음(F-2). 상태 이력은 `member_id`별로만 붙여 대표 회원 계산에 병합 이력을 합치지 않음(F-3). 재생 기록 쓰기는 bound profile ID 사용 여부가 실기기/운영 연결에서 확인되지 않아 미확인 |
| 2. 출결 상태·일정 생애주기 | 일정 상태 원천은 단일 조립 함수가 아님: 프로필·온도·스티커는 `buildMemberScheduleRecords`, 관리자 매트릭스는 `sheetsService.reconcileAttendance`→`reconcileSingleMemberAttendance`; 출석률은 `calculateCumulativeAttendanceWithLifecycle`를 사용. 프로필의 연습 시간·공연 수와 레벨은 보관 일정 포함 옵션을 전달한다(함께한 날은 joinedAt/로그 기반). `lateGraceMinutes`는 config에서 숫자 정규화 후 전달. end_time 유효성/자정 넘김은 계산에서 0분 처리 |
| 3. RSVP·backfill | 백필은 `rsvp_events.action='backfill'`; 온도·약속 스티커의 점수 계산에서 제외하고 빠른 상태 변경의 이전 상태 확인에만 쓰는 경로를 확인. 다만 activity RPC가 최근 400건만 반환해 장기 누적/최초일 계산은 잘릴 수 있음(F-4). 운영 backfill 분포는 미확인 |
| 4. 연습곡·공연·재생 | 본체·연결 보관 상태를 각기 필터링. 공연 목록은 활성 공연 + 활성 연결 + 활성 곡 기준이며, 대표 음원은 playable 오디오 트랙 순서로 계산. FK 삭제 규칙과 재생 기록 보호 RPC 확인. 저장소 실제 파일/R2 정리 결과는 운영 인프라 접근 없이 미확인 |
| 5. 설정값·분류 | `app_config.value` text를 `normalizeAppConfig`가 숫자·배열로 변환. 공연 기본값은 `performanceCategories.ts`의 `DEFAULT_PERFORMANCE_CATEGORIES=['연주']`를 프로필·연습 시간·온도·스티커·설정 화면에서 공유. 코드 내 기본값 중복 불일치 미발견 |
| 6. RPC↔화면 계약 | `fn_get_initial_snapshot()`의 `data` 키와 `RemoteSnapshot` 소비 경로가 일치하고, `memberHistory`는 `parseRemoteMembers`로 연결. `fn_get_member_activity(p_member_ids text[])` 인자와 `p_member_ids` 매핑이 일치하며 응답 `rsvpEvents`, `listen.totalSeconds/firstAt/daily/perPiece.reached60At`를 파서가 읽음. 구형 응답에서 빠진 배열은 빈 배열, 수치 필드는 0/null 기본값. `fn_get_practice_catalog(p_include_archived, p_token)`의 `performances`, `performancePieces`, `scoreStorageKey`, `sizeBytes`가 파서와 일치하고, 구형 카탈로그의 공연 키 누락은 빈 배열 처리 |
| 7. 화면 간 일관성 | 출석률 링은 최근 90일, 관리자 통계는 별도 기간 입력이라 기간이 다르면 수치 차이는 명세상 허용. 출결 매트릭스와 단원 기록의 당일 시작 전 상태 차이를 재현(F-8). 출석률 엔진은 오늘 날짜만으로 모수에 들어갈 수 있음(위 표). |

### 발견 목록

#### 치명

1. **병합 전 옛 ID에 묶인 단원은 대표 ID의 활동 원천을 놓칠 수 있음**
   - 위치: `src/components/ProfileTab.tsx:97`, `src/utils/attendanceStats.ts:187`, `src/App.tsx:223-241`, `supabase/migrations/20261124000000_v3_activity.sql:255-288`.
   - 재현 입력 → 기대 → 실제: `old.merged_into_id=new`, 기기 프로필 ID가 `old`, 활동 원천이 `new`에 있음 → 화면 계산에 `[old,new]`가 전달되어야 함 → ProfileTab은 `[old]`만 요청하고 `resolveMergedMemberIds(old, members)` 결과도 `[old]`여서 대표 기록이 빠짐. 임시 테스트에서 `new` 포함 기대가 실패했고 결과는 `['member-old']`였음.
   - 근거: `fn_get_member_activity`는 전달된 `p_member_ids`만 조회하며 역방향 alias 집합을 만들지 않음. App의 프로필 동기화는 이름·파트만 갱신하고 memberId는 대표 ID로 바꾸지 않음.
   - 고칠 방향: RPC 호출 전 대표 ID를 정규화하고, 대표·옛 ID 전체를 한 번만 만드는 공용 resolver를 출결·RSVP·재생 기록 읽기/쓰기 경로에서 공유.
   - CI 방지: 가능. 옛 ID bound profile + 대표 ID 원천 데이터를 둔 통합 단위 테스트.

2. **대표 회원의 필참 판정이 병합된 옛 사용자 지정 ID를 인식하지 않음**
   - 위치: `src/utils/attendanceStats.ts:48-75`.
   - 재현 입력 → 기대 → 실제: 대표 회원 `new`, 병합 별칭 `old`, `targetAudienceType='CUSTOM_MEMBERS'`, `targetMemberIds=['old']` → 같은 사람인 대표에게 필참 적용 → `targetMemberIds.includes(member.id)`만 검사해 `false` 반환. 임시 테스트 결과 기대 `true`, 실제 `false`.
   - 근거: `fn_merge_members`는 과거 일정의 `target_member_ids`를 갱신하지 않고 `isMemberRequiredForSchedule`는 배열에 대표 ID가 직접 있는지만 검사. 필참 모수·결석·스티커 조건에 영향.
   - 고칠 방향: 사용자 지정 대상 비교에 병합 ID 별칭 집합을 사용하거나, 병합 시 과거 일정 대상 ID를 안전하게 정규화하는 단일 정책을 정함.
   - CI 방지: 가능. 병합 alias가 지정된 과거 일정의 대표 회원 필참 판정 테스트.

3. **병합된 회원의 기간 상태 이력이 대표 회원 계산에 합쳐지지 않음**
   - 위치: `src/services/sheetsParser.ts:70-109`, `src/utils/attendanceStats.ts:16-40,48-61`, `supabase/migrations/20261119000001_rpc_functions.sql:656-673`.
   - 재현 입력 → 기대 → 실제: 대표 회원은 정단원, 병합된 옛 회원은 2026년 동안 휴단원 이력 → 같은 사람의 기간 상태를 대표 집계에 반영 → 대표의 `getEffectiveMemberStatus`는 자체 이력이 없으므로 기본 `정단원` 반환. 임시 테스트에서 상태 일치 기대가 실패(대표 `정단원`, 옛 회원 `휴단원`).
   - 근거: 스냅숏 파서는 history를 각 `member_id`에만 붙이고, 병합 RPC는 회원 행의 `merged_into_id`만 변경. 출결 엔진은 대상 회원 한 명의 `statusHistory`만 검사.
   - 고칠 방향: 병합 이력의 유효 기간·충돌 우선순위를 명시하고, 같은 사람의 기간 상태를 단일 기준으로 집계.
   - CI 방지: 가능. 대표/별칭에 서로 다른 기간 상태를 둔 필참 모수 테스트.

4. **약속 스티커의 장기 누적·첫 획득일이 400개 이후 이력에서 잘릴 수 있음**
   - 위치: `supabase/migrations/20261124000000_v3_activity.sql:280-288`, `src/utils/praiseStickerEvaluators.ts:180-215`.
   - 재현 입력 → 기대 → 실제: RSVP 이벤트 401개, 가장 오래된 이벤트가 첫 투표 → 첫 투표일은 2025-01-01이어야 함 → RPC의 최근 400개 창을 모사해 첫 이벤트를 빼면 evaluator 결과는 2025-01-02. 임시 테스트에서 기대 `2025-01-01`, 실제 `2025-01-02`.
   - 근거: SQL은 `occurred_at DESC, seq DESC LIMIT 400` 후 오름차순 응답. 클라이언트는 반환된 이벤트 전체를 생애 누적/최초일로 사용.
   - 고칠 방향: lifetime 집계를 서버에서 계산해 반환하거나, 전체 이력을 페이지네이션해 집계. 단순히 limit만 늘리면 장기 사용 후 다시 잘릴 수 있음.
   - CI 방지: 가능. 401개 이상 입력을 둔 RPC/파서 계약 테스트와 서버 집계 SQL 검증.

#### 중요

5. **일정·회원 물리 삭제가 참조 로그를 고아로 남길 수 있음**
   - 위치: `supabase/migrations/20261119000001_rpc_functions.sql:628-654,755-762`; 스키마의 `attendance_logs`, `rsvp_votes`, `schedule_comment_events`, `rsvp_events` 정의에는 해당 본체 FK 없음.
   - 재현 입력 → 기대 → 실제: 출석 로그/RSVP 이력/댓글이 있는 일정을 `fn_delete_schedule`로 삭제 → 원천을 지우지 않으면서 일정 참조가 유지되거나 삭제가 거부되어야 함 → 함수는 일정 행을 바로 삭제하고 성공 반환, append-only 로그는 남아 `schedule_id`가 고아가 됨. 회원도 attendance/current RSVP가 없고 RSVP 이벤트만 남은 경우 `fn_delete_member`의 존재 검사에는 걸리지 않아 회원을 물리 삭제할 수 있음.
   - 근거: append-only 로그 테이블의 `schedule_id`/`member_id`는 text이며 FK 없음. 삭제 함수는 관련 이벤트 행을 검사·보존하지 않음. 운영 DB 쿼리는 실행하지 않았으므로 실제 고아 수는 미확인.
   - 고칠 방향: 과거 로그가 있는 본체는 soft-delete/취소만 허용하거나, 고아를 만들지 않는 보존·참조 정책을 설계. append-only 불변식은 유지.
   - CI 방지: 가능. 빈 PostgreSQL에서 원천 로그 생성 후 삭제 RPC가 고아를 만드는지 확인하는 DB 테스트.

6. **병합 RPC가 존재하지 않는 대표 ID를 검증하지 않고 성공 반환할 수 있음**
   - 위치: `supabase/migrations/20261119000001_rpc_functions.sql:656-673`; `members.merged_into_id` FK는 마이그레이션에서 제거됨(`20261119000002_migration_function.sql:26-27`).
   - 재현 입력 → 기대 → 실제: `mergedMemberIds=['기존회원']`, `representativeId='없는-ID'` → 존재하는 활성 대표가 아니면 거부 → 함수는 `members` UPDATE 후 성공 메시지를 반환하며 FK가 없어 dangling `merged_into_id`를 막지 못함. DB 실행은 하지 않았고 함수·스키마로 정적 판정.
   - 근거: RPC 본문에 대표 존재/상태 검사 없음, `merged_into_id` 외래키 없음.
   - 고칠 방향: 대표 존재·활성 상태·병합 순환 여부를 서버에서 검증하고, 실패는 success-shaped 응답이 아닌 오류로 반환.
   - CI 방지: 가능. DB 함수 검증에 없는 대표·이미 병합된 대표·순환 입력을 추가.

7. **오늘 시작 전 일정이 관리자 매트릭스에서 결석으로 보일 수 있음**
   - 위치: `src/services/sheets.ts:1826-1867`, `src/utils/attendanceStats.ts:211-238`, `src/utils/memberRecords.ts:74-130`, 호출 경로 `src/hooks/useAttendanceAdmin.ts:119`, `src/components/AdminMatrixGrid.tsx:67`.
   - 재현 입력 → 기대 → 실제: 기준 시각 `2026-11-24 10:00 KST`, 필참 일정 `2026-11-24 19:30`, 로그 없음 → 명세의 단일 일정 상태 원천대로 두 화면 모두 `대기` → `buildMemberScheduleRecords`는 `대기`, 관리자 경로의 `reconcileSingleMemberAttendance`는 `결석`. 임시 비교 테스트 결과 기대 `대기`, 실제 `결석`.
   - 근거: 관리자 매트릭스가 `reconcileAttendance`를 통해 저수준 판정 함수를 직접 호출하고, 날짜·시작 시각 기준의 `대기` 변환은 `buildMemberScheduleRecords`에만 있음.
   - 고칠 방향: 관리자 매트릭스 포함 일정별 상태 표시는 공통 조립 함수로 통일해 날짜/시각 경계 처리를 한 곳에서 수행.
   - CI 방지: 가능. 고정 KST 시각의 당일 시작 전 일정에 대해 프로필/관리자 결과 일치 테스트.

#### 낮음 — 정책 확인 필요

8. **보관 일정의 생애 지표 포함 기준이 명세에 완전히 고정되지 않음**
   - 위치: `src/components/ProfileTab.tsx:131-183`, `src/utils/memberRecords.ts:53-80`, `src/utils/memberProgress.ts:119-157`; 대조 명세 `docs/MEMBER_UX_V3_SPEC.md:393-396,438`.
   - 재현 입력 → 기대 → 실제: 출석한 보관 일정 1건(2시간, category `연주`) → §5-2는 보관 처리 결과를 명시하지 않아 기대가 확정되지 않음 → 프로필은 보관 일정을 포함해 연습 2시간·공연 1회·레벨 출석 1회로 계산. 반면 출석률·온도·스티커는 보관 일정을 제외. 임시 테스트에서 0 기대는 각각 2시간/1회/레벨 기록 1개로 실패했으나, 명세에 기대값이 명시되지 않아 이를 버그로 단정하지 않음.
   - 근거: §5-5만 취소·보관 제외를 명시하고 §5-2 lifetime 숫자 규칙은 보관 처리를 설명하지 않음.
   - 고칠 방향: 보관의 의미(활성 목록에서만 숨김 vs 모든 지표에서 제외)를 명세에 결정하고 지표별 테스트 기대값을 고정.
   - CI 방지: 가능. 결정 후 보관 일정의 지표별 경계 테스트.

### 확인하지 못한 것

- 미확인 — 운영 DB 접근 금지: 고아 회원/일정 참조, 병합 회원 ID로 새로 쌓인 기록, 중복 RSVP, backfill 중복, 잘못된 text 날짜·시각, 미래 로그의 실제 개수와 분포.
- 미확인 — 운영 DB 접근 금지: `fn_safe_timestamptz` fallback이 실제 데이터에 적용되는 행의 수.
- 미확인 — 운영 인프라 접근 금지: R2 객체가 삭제·교체 뒤 실제로 정리되는지, 실기기에서 병합 전 profile의 재생 기록이 어떤 member ID로 쓰이는지.
- 미실행 — 운영 DB/SQL 실행 금지: §8 운영 불변식 쿼리, Supabase RPC를 실제 DB에 연결한 통합 검증.
- 미실행 — 이번 범위가 A·B 단계: §9 화면 교차 검토, §10 골든 데이터셋·브라우저 대조, C·D 단계.

### C 단계 결과 (리뷰어, 운영 DB 읽기 전용·개수만, 2026-11-23)

| 항목 | 개수 | 관련 발견 |
|---|---|---|
| 회원 상태 | ACTIVE 24, 병합 0, 삭제 0 | F-1·2·3·6: 지금은 해당 사례 없음(잠재 위험) |
| 병합 대표가 없는/병합된 경우, 병합 id로 쌓인 로그·투표·이력, 병합 회원의 상태 이력 | 모두 0 | 〃 |
| 지정 대상(`CUSTOM_MEMBERS`) 일정 / 그중 병합 id 포함 | 9 / 0 | F-2 |
| 주인 없는 기록: 출석(일정 없음) / 투표(일정 없음) / 투표(회원 없음) / 투표 이력(일정 없음) / 댓글 | 10(일정 3개, 2026-10-16~20) / 5 / 2(테스트 회원 id 형태) / 5 / 0 | F-5: 실제로 있음 |
| 보관 일정 / 기록 있는 보관 일정 / 취소 일정 | 0 / 0 / 0 | F-8: 지금은 영향 없음 |
| 회원별 투표 이력 최대 | 18 | F-4: 400 한도와 거리 멂 |
| 종료가 시작보다 이른 일정 / 종료 빈 일정 / 미래 시각 출석 | 0 / 0 / 0 | — |
| 출석 로그 시각 형식 | 190건 모두 19자, 시간대 없음(KST) | A2 시간 표: 코드 가정과 일치 |
| `members.joined_at` 형식 | 24건 모두 `YYYY-MM-DD` | — |
| 운영 `__impl` 본문 vs 저장소 | `fn_delete_schedule`, `fn_batch_delete_schedules`, `fn_delete_member`, `fn_merge_members` 모두 `20261119000001_rpc_functions.sql`과 md5 일치 | V3-21 복사 원본 |

**판단:** 배포를 막는 "지금 틀린 숫자"는 F-7(관리자 매트릭스의 오늘 시작 전 결석 표시) 하나다. 병합·보관 관련은 사례 0이라 잠재 위험이지만, 사용자 결정(V31·V33)에 따라 배포 전에 함께 고친다. 수정 지시는 `docs/plans/17_v3_implementation_guide.md` V3-21.
