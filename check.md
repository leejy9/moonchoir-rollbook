# Moonchoir Rollbook — 코드 리뷰 최종본 (check.md)

> **이 문서의 역할**: 단원 UX 개편·연습실 개발 결과(PR #14~#17)와, 이전 `check.md`(Q1~Q7, 다른 에이전트 검수본)를 함께 검증해 **고쳐야 할 것 전체**를 한곳에 모은 최종본입니다. 이전 버전을 대체합니다.
>
> - 작성일: 2026-11-21
> - 검토 대상: `origin/feat/studio-player-phase2b` (Phase 1·2a·3·2b 전체를 포함하는 최종 브랜치, `main` 대비 46커밋)
> - 함께 확인: `main`의 Phase 0 보안 코드, 이전 `check.md` Q1~Q7
> - 기준 문서: [명세](docs/MEMBER_UX_AUDIO_SPEC.md) · [구현 작업 지시서](docs/plans/16_member_ux_studio_implementation_guide.md) · [AGENTS.md](AGENTS.md)

---

## 0. 결론 요약

| 항목 | 결과 |
|---|---|
| Green Bar (최종 브랜치) | typecheck ✓ · lint ✓ (경고 3개) · test **67개 파일, 516개 테스트 통과** · build ✓ |
| 패키지 / 설정 파일 변경 | 없음 (`package.json`, `package-lock.json`, `tsconfig`, `vite.config` 변경 0건) ✓ |
| DB 마이그레이션 보안 규칙 | 새 쓰기 RPC 6개 모두 토큰 검사 ✓, 기존 래퍼 대신 `fn_delete_program_card__impl`만 수정 ✓, 검증 스크립트 18/18 PASS ✓ (로컬 PostgreSQL 16에서 2회 적용 확인) |
| 실기기 테스트 기록표 | 결과를 지어내지 않고 전부 "대기"로 둠 ✓ |
| **운영 중 장애** | **현장 PIN 출석 전부 실패 (C1)** — 긴급 수정 SQL 준비됨, 사용자 적용 필요 |
| 머지 전 수정 필요 (P1) | 5건 (C2~C6) |
| 머지 후 정리 가능 (P2) | 10건 (C7~C16) |
| 사용자 결정 필요 | 1건 (Q2 PIN 길이) |

**판정**: 구조와 테스트는 지시서를 대체로 잘 따랐습니다. 다만 **P1 5건은 PR을 머지하기 전에 고쳐야** 합니다. 특히 C2(뒤로 가기 시 QR 카메라가 꺼지지 않음)는 명세 §2-2 / §6-1-5의 수용 기준을 충족하지 못했는데도 완료로 보고됐습니다.

---

## 1. 지금 바로 해야 할 일 (사용자)

### 1-1. [긴급] 현장 PIN 출석 장애 수정 SQL 적용
- **원인**: Phase 0 보안 마이그레이션(제가 작성)이 현장 PIN을 `inputPin` 키로 읽는데, 앱은 `checkInPin` 키로 보냅니다. 보안 수정 전에는 PIN이 비어 있으면 검사를 건너뛰어 출석이 됐지만, 보안 수정에서 "빈 PIN은 실패"를 추가하면서 **현재 운영에서 모든 현장 PIN 출석이 실패하고 실패 횟수까지 쌓이고 있습니다.** QR 출석은 영향이 없습니다.
- **수정 파일**: `supabase/migrations/20261121010000_fix_onsite_pin_payload_key.sql` (`checkInPin`을 먼저 읽고 `inputPin`도 허용, 쌓인 실패 기록 초기화)
- **검증**: 로컬 PostgreSQL 16에서 재현 → 수정 후 확인했습니다.
  - 올바른 PIN: 성공
  - 틀린 PIN / PIN 없음: 실패
  - QR: 영향 없음
  - 관리자 출석은 여전히 토큰 필요
  - 보안 검증 스크립트 14/14 PASS
- **적용 방법**: Supabase SQL Editor에 아래를 붙여넣고 Run합니다. "Success. No rows returned"가 나오면 완료입니다.

```sql
create or replace function fn_record_attendance(p_payload jsonb)
returns jsonb
security definer
set search_path = public, extensions
language plpgsql as $$
declare
  v_log_id text := p_payload->>'id';
  v_auth_method text := p_payload->>'authMethod';
  v_input_pin text := coalesce(nullif(p_payload->>'checkInPin', ''), p_payload->>'inputPin');
  v_active_pin text;
begin
  if v_log_id is null or v_log_id = '' then
    return jsonb_build_object('success', false, 'message', '출석 로그 ID가 누락되었습니다.');
  end if;
  if v_auth_method = 'MANUAL_BY_ADMIN'
     and not fn_check_admin_token(p_payload->>'adminToken', 'admin') then
    return fn_admin_auth_required();
  end if;
  if exists (select 1 from attendance_logs where id = v_log_id) then
    return jsonb_build_object('success', true, 'message', '이미 출석이 기록되었습니다.');
  end if;
  if v_auth_method = 'MANUAL_PIN' then
    if fn_auth_is_locked('activeOnSitePin', 60) then
      return jsonb_build_object('success', false, 'message', '시도 횟수가 너무 많습니다. QR로 출석하거나 15분 후 다시 시도해 주세요.');
    end if;
    select value into v_active_pin from app_secrets where key = 'activeOnSitePin';
    if v_active_pin is null or trim(coalesce(v_input_pin, '')) = ''
       or trim(v_input_pin) <> trim(v_active_pin) then
      perform fn_auth_record_failure('activeOnSitePin');
      return jsonb_build_object('success', false, 'message', '현장 출석 PIN 번호가 일치하지 않습니다.');
    end if;
  end if;
  insert into attendance_logs (
    id, timestamp, schedule_id, member_id, member_name, part,
    auth_method, is_verified_location, admin_note, distance_meters, device_id
  ) values (
    v_log_id,
    coalesce(p_payload->>'timestamp', fn_get_kst_now_string()),
    p_payload->>'scheduleId',
    p_payload->>'memberId',
    p_payload->>'memberName',
    p_payload->>'part',
    v_auth_method,
    coalesce((p_payload->>'isVerifiedLocation')::boolean, false),
    coalesce(p_payload->>'adminNote', ''),
    (p_payload->>'distanceMeters')::numeric,
    coalesce(p_payload->>'deviceId', '')
  );
  return jsonb_build_object('success', true, 'message', '출석이 성공적으로 저장되었습니다.');
end;
$$;
revoke all on function fn_record_attendance(jsonb) from public;
grant execute on function fn_record_attendance(jsonb) to anon, authenticated;
delete from auth_failures where kind = 'activeOnSitePin';
notify pgrst, 'reload schema';
```

### 1-2. 결정 필요: 관리자 PIN 길이 (이전 Q2)
- 이전 검수본은 "사용자가 `1004`, `2315`를 유지하길 원한다"며 4자리 허용을 제안했습니다.
- **권장: 6자리 이상 유지.** 이유는 두 가지입니다.
  - **`1004`와 `2315`는 공개 저장소의 git 이력에 평문으로 남아 있습니다.** 이 값으로 되돌리면 PIN이 없는 것과 같습니다. 누구나 저장소에서 읽어 관리자 화면에 들어올 수 있습니다.
  - 4자리(1만 가지)는 현재 시도 제한(15분에 20회)으로도 약 5일이면 전부 시도할 수 있습니다. 6자리는 수백 년이 걸립니다.
- 그래도 4자리를 원하시면, **공개된 적 없는 새 4자리 값**을 쓰는 조건으로 DB와 화면의 길이 검사를 `< 4`로 완화할 수 있습니다. 이 경우 위험을 감수하는 결정으로 구조 복구 기록에 남겨야 합니다.

### 1-3. PR 머지 순서
- PR #14(Phase 1) → #15(Phase 2a) → #16(Phase 3) → #17(Phase 2b) 순서로 쌓여 있습니다. 반드시 이 순서로 머지합니다.
- **아래 §2의 P1 5건을 고친 뒤** 머지합니다.
- #15 머지 후 `supabase/migrations/20261122000000_practice_catalog.sql`을 SQL Editor에 적용하고 `supabase/tests/practice_catalog_check.sql`이 전부 PASS인지 확인합니다. 단, C3·C9를 고친 버전으로 적용해야 합니다.
- 전체 머지 후 `npm run deploy`. 연습실은 R2 버킷과 Worker 배포, 앱 설정 `mediaPublicBaseUrl` 입력 전까지 "음원 서버 주소가 설정되지 않았습니다"로 표시됩니다(정상).

---

## 2. 머지 전 수정 필요 (P1) — 개발 에이전트 작업

### C2. QR·투표 모달이 뒤로 가기와 연결되지 않음 (명세 §2-2, §6-1-5 미충족)
- **위치**: `src/App.tsx` 452행 부근 (`showQRScanner && currentSchedule && profile`), `RSVPModal` 렌더 부분
- **현상**: QR 스캐너와 투표 모달이 라우트(해시)가 아니라 일반 상태값으로만 열립니다. 안드로이드 뒤로 가기를 누르면 라우트만 바뀌고 **모달은 그대로 떠 있으며 카메라도 계속 켜져 있습니다.** 오늘 탭에서 누르면 앱이 종료될 수도 있습니다.
- **명세 요구**: 시트·모달은 `pushState`, 뒤로 가기는 모달 닫기, QR이 닫히면 카메라 스트림 정지(§2-2). 수용 기준 §6-1-5는 "QR 모달에서 뒤로 가기를 누르면 카메라 트랙의 `stop()`이 호출되어야 함"입니다.
- **수정 방향**:
  1. 이미 정의된 `Overlay` 타입의 `{ kind: 'qr', scheduleId }`, `{ kind: 'rsvp', scheduleId }`를 사용합니다. 열 때는 `navigate({ type: 'OPEN', overlay })`, 렌더 조건은 `route.overlay?.kind === 'qr'`로 바꿉니다.
  2. 대상 일정은 `route.overlay.scheduleId`로 `activeSchedules`에서 찾습니다. 못 찾으면 모달을 열지 않습니다(숨김 일정 보호).
  3. `QRScannerModal` 언마운트 시 스트림 정지가 보장되는지 확인합니다(현재 cleanup 248행과 313행 경로).
- **테스트 (필수)**: 모의 `MediaStream`으로 QR을 연 뒤 `popstate`를 발생시키면 모달이 사라지고 `track.stop()`이 호출되는지 확인. RSVP도 뒤로 가기로 닫히는지 확인.

### C3. 연습곡 연결이 보관된 카드 삭제 시 DB 오류 원문 노출
- **위치**: `supabase/migrations/20261122000000_practice_catalog.sql` 542행 부근 `fn_delete_program_card__impl`
- **현상(재현함)**: 연결을 해제(보관)한 뒤 카드를 삭제하면, 함수는 활성 연결만 검사해 통과시킵니다. 그런데 실제 `delete`는 보관된 연결 행의 외래키(`on delete restrict`) 때문에 SQL 오류가 납니다. 화면에는 "HTTP 4xx 통신 오류"로만 보입니다.
- **수정**: `archived_at is null` 조건을 빼서, **보관된 연결이 하나라도 있으면** "연습곡 사용 이력이 있는 카드는 삭제할 수 없습니다. 대신 보관하세요."를 돌려줍니다. 사용 이력 보존이 목적이므로 삭제 대신 보관이 맞습니다.
- **테스트**: SQL 검증 스크립트에 "보관된 연결만 있는 카드 삭제 → `success:false` + 안내 문구" 항목을 추가합니다. 데이터를 바꾸지 않는 방식이 어렵다면, 함수 본문에 조건이 들어 있는지 `pg_get_functiondef`로 확인하는 방식도 됩니다.

### C4. Worker: 캐시 재검증 시 빈 응답, `Vary: Origin` 누락
- **위치**: `workers/media/index.js` 30~45행
- **현상 1**: `onlyIf: request.headers`를 쓰면, 브라우저가 `If-None-Match`로 재검증할 때 R2가 **본문 없는 객체**를 돌려줍니다. 지금 코드는 그대로 `object.body`(undefined)를 200으로 보내서 빈 응답이 됩니다.
- **현상 2**: 출처별로 `Access-Control-Allow-Origin`을 바꾸면서 `Cache-Control: public, immutable`을 주는데 `Vary: Origin`이 없습니다. 캐시가 localhost용 응답을 실제 사이트에 내줄 수 있습니다.
- **현상 3**: `decodeURIComponent`가 잘못된 `%` 경로에서 예외를 던지면 Worker가 500으로 죽습니다.
- **수정**:
  ```js
  if (!('body' in object)) {
    return new Response(null, { status: 304, headers });  // headers에 ETag 포함
  }
  ```
  `headers.set('Vary', 'Origin')`을 추가하고, `decodeURIComponent`는 `try/catch`로 감싸 실패 시 400을 돌려줍니다. 50줄 제한은 유지합니다.
- **확인**: README의 `curl` 확인 절차에 `If-None-Match` 재요청 → 304 확인을 추가합니다.

### C5. (이전 Q3 — 유효) 최고 관리자 "비상 캐시 초기화"가 아무것도 지우지 않음
- **위치**: `src/components/admin/SuperAdminDashboard.tsx` 186행
- **현상**: 이미 쓰지 않는 v1 키만 지우고, 실제 사용 중인 `moonchoir_*_v3` 키(`src/services/sheetsStorage.ts`)는 그대로 둡니다. 새로고침 후에도 옛 캐시가 남습니다.
- **수정**: `src/services/sheets.ts`가 내보내는 `resetStorage()`를 호출합니다. 연습곡 캐시 키 `moonchoir_practice_catalog_v1`이 `resetStorage` 대상에 포함되는지도 확인합니다. **관리자 토큰 키(`moonchoir_admin_token_v1`, `moonchoir_super_admin_token_v1`)는 지우지 않습니다.** 지우면 화면에서 바로 튕깁니다.
- **테스트**: 초기화 후 v3 키 전부와 연습곡 캐시 키가 비었는지 확인.

### C6. (이전 Q4 — 유효, 설명은 정정) 기기 연동 해제가 Supabase에서 항상 실패
- **위치**: `src/services/sheets.ts` 1092행 `unbindMemberDevice` → `UNBIND_DEVICE` 액션
- **현상**: `supabaseBackend.ts`에 `UNBIND_DEVICE` 매핑이 없습니다. 이전 검수본은 "성공으로 건너뛴다"고 했지만, **실제로는 `success:false`("지원되지 않는 작업입니다")를 돌려줘 화면에 오류가 뜨고 해제되지 않습니다.**
- **수정 (택1, 사용자 확인 후 진행)**:
  - A(권장): 새 RPC를 만들지 않고 기존 관리자 RPC `UPDATE_MEMBER`로 `{ id, boundDeviceId: '', boundDeviceAt: '' }`를 보냅니다. 먼저 `fn_update_member__impl`이 이 필드를 비우는지 확인합니다. 비우지 못하면 B로 갑니다.
  - B: 새 RPC `fn_unbind_member_device`. 첫 줄에 토큰 검사를 넣고, 마이그레이션 규칙(지시서 §1-1, §6-1·2)을 따릅니다.
- 참고: 1인 1기기 잠금은 중지되어 기기 ID가 접근을 막지 않습니다. 이 기능은 표시용 정리입니다. 꼭 필요한 기능이 아니라면 버튼을 숨기는 것도 선택지입니다.

---

## 3. 머지 후 정리 가능 (P2)

| ID | 위치 | 문제 | 수정 방향 |
|---|---|---|---|
| **C7** | `src/components/ScheduleDetailSheet.tsx` 45~54행 | `App.tsx`가 매 렌더마다 새 배열(`getSchedulesForMember` 결과)을 넘기므로 `daySchedules`가 매번 다시 계산됩니다. 그 결과 **실시간 갱신이 올 때마다 사용자가 고른 일정이 목록 화면으로 되돌아갑니다**(하루 일정 여러 개인 날). | 효과(effect)를 `scheduleId`·`date`가 바뀔 때만 실행하고, 선택된 ID가 목록에서 사라졌을 때만 초기화. 린트 경고(set-state-in-effect)도 함께 해소 |
| **C8** | `src/hooks/useHashRoute.ts` 52행, `src/utils/route.ts` 199행 | ① `history.pushState`를 `setRoute` 갱신 함수 **안에서** 호출합니다. 개발 모드 StrictMode에서 두 번 실행돼 기록이 중복됩니다. ② 닫기 버튼(CLOSE)이 `replace`라서, 열 때 쌓인 기록이 남습니다. 시트를 열고 닫을 때마다 뒤로 가기를 한 번 더 눌러야 합니다. | ① 다음 라우트를 먼저 계산한 뒤 history를 호출하고 `setRoute`. ② 오버레이가 push로 열린 경우 닫기는 `history.back()`으로 처리(popstate가 라우트를 갱신). 시퀀스 테스트 추가: 열기→X→뒤로 = 이전 탭 |
| **C9** | 카탈로그 마이그레이션 `fn_reorder_practice_tracks` | 중복 ID 목록(`['a','a']`)이 개수 검사를 통과합니다(재현함). 한 트랙의 순서가 갱신되지 않습니다. | 입력 ID의 중복을 검사(`count(distinct)`)해 실패 처리. 검증 스크립트에 항목 추가 |
| **C10** | `SuperAdminDashboard.tsx` 310~311행 (이전 Q5 — 유효) | `toISOString().slice(0,10)`은 UTC 기준이라, 한국 월요일 오전에는 "이번 주"가 하루 밀립니다. | `getKSTDateString()` 사용. KST 월요일 00:30 고정 시각 테스트 |
| **C11** | `src/hooks/useMasterEntryGesture.ts`, `src/components/AppHeader.tsx` 85행 (이전 Q7 — 유효, 위치 이동) | 롱프레스 타이머에 `touchmove`·`touchcancel` 취소가 없습니다. 스크롤 중 손가락이 로고를 지나면 숨은 메뉴가 열립니다. "Get in" 버튼은 36px로 44px 규칙 위반입니다. | 손가락이 10px 이상 움직이면 타이머 취소, `minHeight: 44px` |
| **C12** | `AdminPracticeTab.tsx`(색상 리터럴 약 72개), `ProfileTab.tsx`(약 38개), `StudioTab.tsx`, `MiniPlayer.tsx`(`#ffffff` 등) | 지시서 절대 규칙 10번(인라인 hex 금지) 위반으로, 다크 모드에서 깨집니다. `var(--x, #hex)` 대체값은 변수가 존재하므로 허용하되, 맨 hex 값은 토큰으로 교체 | `src/index.css` 기존 변수로 교체. 없는 색은 보고 후 변수 추가 |
| **C13** | `StudioTab.tsx` 134행, 섹션 렌더 | ① 안내 문구 "시즌별 연습곡과 **파트 음원**을 재생"은 결정 D1(파트별 음원 없음)과 모순됩니다. ② 곡이 하나도 연결되지 않은 시즌 카드(일반 정기연습 카드 포함)도 빈 상자로 모두 나열됩니다. | ① "시즌별 연습곡을 듣고 악보를 확인합니다." ② 곡이 1개 이상인 섹션만 표시, 전부 비면 "등록된 연습곡이 없습니다" 한 줄 |
| **C14** | `ScheduleDetailSheet.tsx` 176행, `AudioPlayer.test.tsx` 50행 | 린트 경고 3개(렌더 중 ref 접근, effect 내 setState). 인라인 `transition`이 `prefers-reduced-motion`을 무시합니다. | 드래그 중 여부를 state로, reduced-motion이면 transition `none` |
| **C15** | 카탈로그 마이그레이션 | ① `durationSeconds`에 빈 문자열이 오면 정수 변환 오류로 500이 납니다(재현함, 현재 화면은 이 값을 보내지 않음). ② 없는 ID를 보관해도 성공을 돌려줍니다. ③ 조회 응답이 camelCase·snake_case 키를 모두 담아 크기가 2배입니다. | ① `nullif(…, '')::integer` ② `found` 확인 후 실패 메시지 ③ camelCase만 반환(파서가 둘 다 받으므로 호환) |
| **C16** | `src/components/audio/AudioPlayerProvider.tsx` | ① `currentTime`이 컨텍스트에 있어, 재생 중 초당 약 4회 모든 소비 컴포넌트(QR 모달 포함)가 다시 그려집니다. ② 플레이어를 닫아도 잠금화면 MediaSession 정보와 핸들러가 남습니다. ③ 로그아웃해도 음악이 계속 재생됩니다. | ① 재생 위치를 별도 컨텍스트로 분리 ② 닫을 때 `metadata = null`, 핸들러 `null` ③ 로그아웃 시 `closePlayer()` |

---

## 4. 이전 check.md(Q1~Q7) 판정

| 이전 항목 | 판정 | 최종 처리 |
|---|---|---|
| Q1 현장 PIN 키 불일치 | **유효 (P0, 운영 장애)** | C1 → §1-1 긴급 SQL. 원인은 Phase 0 마이그레이션(제 실수) |
| Q2 PIN 6자리 강제 | 사실은 맞음. **완화 제안에는 동의하지 않음** | §1-2 사용자 결정. 공개된 `1004`·`2315` 재사용은 금지 |
| Q3 캐시 초기화 키 | 유효 | C5 |
| Q4 기기 연동 해제 미매핑 | 유효, 단 "성공으로 건너뜀"은 사실과 다름(실제로는 실패 반환) | C6 |
| Q5 이번 주 UTC 밀림 | 유효 | C10 |
| Q6 개인 이름·번호 하드코딩 | **Phase 3에서 해결됨**(`src/utils/staff.ts`, 남은 것은 검색창 예시 문구뿐) | 조치 불필요 |
| Q7 롱프레스 오발동·36px | 유효 (코드가 `AppHeader`/`useMasterEntryGesture`로 이동) | C11 |

---

## 5. 잘된 점 (유지할 것)
- 판정 로직(`todayFocus`, `todayCta`, `timeWindow` KST, `route`, `practiceMedia`, `memberRecords`)을 순수 함수와 테스트로 먼저 고정한 뒤 화면을 옮겼습니다. 테스트가 351개에서 516개로 늘었습니다.
- `timeWindow`가 KST(`+09:00`)로 해석하고, 파싱 실패 시 닫힘으로 바뀌었습니다. 투표·출석 60분 상수도 통합됐습니다.
- 새 관리자 RPC 6개가 모두 토큰 검사로 시작합니다. 래퍼가 아니라 `__impl`만 고쳤고, 내부 함수 권한도 회수했습니다. `fn_set_program_pieces`는 중간 실패 시 전체를 되돌립니다(재현 확인).
- 오디오가 단일 `<audio>` 요소를 App 루트에 두고 src만 교체합니다. 한 곡 반복은 켜짐, 자동 다음 곡은 꺼짐이 기본이고, Web Audio를 쓰지 않으며, QR이 열리면 일시정지합니다.
- YouTube·Drive는 외부 링크로만 처리합니다. `http:`, `javascript:` 링크는 막습니다.
- `CalendarView.tsx` 폐기, 운영진 판정 하드코딩 제거, 레벨 카드 미표시(함수와 테스트는 보존).
- 실기기 테스트 결과를 지어내지 않았습니다.

---

## 6. 개발 에이전트에게 전달할 작업 지시

```
check.md(최종본)의 §2 P1 항목(C2~C6)을 먼저 처리하고, 이어서 §3 P2 항목(C7~C16)을 처리해줘.

규칙
- docs/plans/16_member_ux_studio_implementation_guide.md 의 §0 절대 규칙, §6 자주 하는 실수를 그대로 따른다.
- 항목 하나 = 커밋 하나. 커밋 메시지에 항목 ID(C2 등)를 넣는다.
- 작업 브랜치: feat/studio-player-phase2b 에서 fix/review-followups 브랜치를 새로 만들어 진행한다.
  (PR #14~#17을 수정하지 말고, 이 브랜치로 PR을 하나 더 만든다. 머지는 하지 않는다.)
- 각 항목의 "테스트" 칸에 적힌 테스트를 반드시 추가한다. 매 커밋 전 typecheck / lint / test / build 통과.
- C6은 수정 방향 A/B 중 무엇으로 할지 먼저 확인할 것(fn_update_member__impl 동작을 확인해 보고하고 내 답을 기다린다).
- SQL은 새 마이그레이션 파일(20261122010000_review_followups.sql)로 작성한다. 이미 만든 20261122000000 파일을
  고쳐도 되는 경우는 그 파일이 아직 운영 DB에 적용되지 않았을 때뿐이다. 어느 쪽으로 할지 먼저 나에게 묻는다.
  운영 DB에는 실행하지 않는다. 완료 후 SQL Editor용 복사 블록(주석 제거)을 보고에 붙인다.
- C1(현장 PIN 장애)은 이미 별도로 수정됐으니 건드리지 않는다.
- 끝나면 C2~C16 각각의 처리 결과(완료/보류/질문)를 표로 보고한다.
```
