# check.md — 코드 리뷰 후속 수정·보완 작업 지시서

> **이 문서를 읽는 개발 에이전트에게**
> 이 문서는 PR #14~#17(Phase 1·2a·3·2b) 코드 리뷰에서 나온 **수정·보완 작업 전체**의 실행 계획입니다. 이 문서의 순서와 규칙대로만 작업합니다.
> 기본 규칙은 [구현 작업 지시서](docs/plans/16_member_ux_studio_implementation_guide.md)의 §0(절대 규칙)과 §6(자주 하는 실수)을 그대로 따르며, 이 문서가 그보다 구체적인 경우 이 문서를 따릅니다.
>
> - 작성: 2026-11-21 (리뷰어 최종본)
> - 리뷰 대상: `origin/feat/studio-player-phase2b` (Phase 1·2a·3·2b 전체 포함)
> - **이 문서는 작업이 모두 끝나면 마지막 커밋에서 삭제합니다**(§7).

---

## 0. 확정된 사항 (다시 묻지 말 것)

| 항목 | 결정 | 상태 |
|---|---|---|
| 현장 PIN 출석 장애 (`checkInPin`/`inputPin` 키 불일치) | `supabase/migrations/20261121010000_fix_onsite_pin_payload_key.sql` | **운영 DB 적용 완료 (사용자, 2026-11-21).** 이 문제는 건드리지 않는다 |
| 관리자·최고관리자 PIN 길이 | **6~8자리 유지** (사용자 확정) | 현재 코드가 이미 6~8자리. 이번 작업에서 이 규칙을 **완화하거나 바꾸지 않는다** |
| 단원 본인 인증(Task 76), 레벨·배지 | 범위 밖 | 발견해도 보고만 |
| 개인 이름·번호 하드코딩(이전 Q6) | Phase 3에서 해결됨 | 조치 불필요 |

---

## 1. 작업 환경

1. **브랜치**: `feat/studio-player-phase2b`에서 `fix/review-followups`를 새로 만든다. PR #14~#17 브랜치에는 커밋하지 않는다.
2. **PR**: 모든 작업이 끝나면 `fix/review-followups` → `main`으로 PR을 하나 만든다(PR #17 다음에 머지될 것). **머지하지 않는다.**
3. **커밋**: 작업 항목 하나 = 커밋 하나. 메시지에 항목 ID를 넣는다. 예: `fix(route): C8 pop overlay history on close`
4. **Green Bar**: 매 커밋 전 `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`가 모두 통과해야 한다. **린트 경고도 새로 늘리지 않는다**(현재 3개, C14에서 0개로 만든다).
5. **SQL**:
   - DB 변경은 전부 **새 파일 하나** `supabase/migrations/20261122010000_review_followups.sql`에 모은다(C3, C6, C9, C15). 이미 있는 `20261122000000_practice_catalog.sql`은 **수정하지 않는다.**
   - 새 파일은 `20261122000000` 다음에 적용된다는 전제로 작성하고, 두 번 실행해도 안전하게(`create or replace`, `if not exists`) 만든다.
   - 기존 관리자 래퍼(`fn_xxx`)를 `create or replace` 하지 않는다. 관리자 함수는 `fn_xxx__impl`만 고친다(지시서 §1-1, §6-1).
   - 새 함수가 내부용이면 `revoke all ... from public, anon, authenticated`. 클라이언트용이면 마지막에 `grant execute ... to anon, authenticated`.
   - **운영 DB에서 실행하지 않는다.** 로컬 PostgreSQL이 있으면 `supabase/migrations/*.sql`을 파일명 순서로 빈 DB에 적용하고, 새 파일을 두 번 적용한 뒤 `supabase/tests/security_hardening_check.sql`과 `supabase/tests/practice_catalog_check.sql`을 실행해 전부 PASS를 확인한다. 로컬 DB가 없으면 "SQL 실행 검증 못 함"이라고 보고한다.
6. **멈추고 물어야 하는 경우**: 이 문서에 적힌 수정 방향이 실제 코드와 맞지 않을 때, 적힌 파일 외의 파일을 고쳐야 할 때, 같은 오류를 3번 고쳐도 안 될 때. 오류를 `@ts-ignore`, `any`, 린트 비활성화 주석, 빈 `catch`, 테스트 삭제·skip으로 "통과"시키지 않는다.

---

## 2. 작업 순서 한눈에

| 순서 | ID | 내용 | 심각도 | 주요 파일 |
|---|---|---|---|---|
| 1 | **C8** | 해시 라우팅: 닫기 시 기록 정리, StrictMode 중복 push 제거 | P1(C2 선행) | `src/hooks/useHashRoute.ts`, `src/utils/route.ts` |
| 2 | **C2** | QR·투표 모달을 라우트에 연결(뒤로 가기 → 닫기 + 카메라 정지) | **P1** | `src/App.tsx`, `src/components/QRScannerModal.tsx` |
| 3 | **C3** | 사용 이력 있는 시즌 카드 삭제 시 DB 오류 노출 | **P1** | 새 마이그레이션 |
| 4 | **C9** | 트랙 순서 변경에 중복 ID 허용 | P2 | 새 마이그레이션 |
| 5 | **C15** | 카탈로그 RPC 입력 방어·응답 크기 | P2 | 새 마이그레이션, `src/services/sheetsParser.ts` |
| 6 | **C6** | 기기 연동 해제가 Supabase에서 항상 실패 | **P1** | 새 마이그레이션, `src/services/backend/supabaseBackend.ts` |
| 7 | **C4** | Worker 304·`Vary`·잘못된 경로 처리 | **P1** | `workers/media/index.js`, `workers/media/README.md` |
| 8 | **C5** | 비상 캐시 초기화가 아무것도 지우지 않음 | **P1** | `src/services/sheetsStorage.ts`, `src/components/admin/SuperAdminDashboard.tsx` |
| 9 | **C10** | "이번 주" 날짜 계산 UTC 밀림 + `addDaysKST` 시간대 버그 | P2 | `src/utils/date.ts`, `SuperAdminDashboard.tsx` |
| 10 | **C11** | 로고 롱프레스 스크롤 오발동, 36px 버튼 | P2 | `src/hooks/useMasterEntryGesture.ts`, `src/components/AppHeader.tsx` |
| 11 | **C7** | 상세 시트 선택이 실시간 갱신마다 초기화 | P2 | `src/components/ScheduleDetailSheet.tsx` |
| 12 | **C14** | 린트 경고 3개 0개로, 시트 애니메이션 reduced-motion | P2 | `ScheduleDetailSheet.tsx`, `src/components/audio/AudioPlayer.test.tsx` |
| 13 | **C16** | 오디오 컨텍스트 과다 렌더, MediaSession 정리, 로그아웃 시 정지 | P2 | `src/components/audio/*`, `src/App.tsx` |
| 14 | **C13** | 연습실 문구(파트 음원) 수정, 빈 시즌 카드 숨김 | P2 | `src/components/StudioTab.tsx` |
| 15 | **C12** | 새 컴포넌트의 맨 hex 색상 → CSS 변수 | P2 | `AdminPracticeTab.tsx`, `ProfileTab.tsx`, `StudioTab.tsx`, `MiniPlayer.tsx`, `AppHeader.tsx` |
| 16 | **마무리** | 문서 갱신 + **check.md 삭제** + PR | — | §7 |

> 순서 이유: C2는 C8의 "닫기 = 기록 되돌리기" 동작 위에 만들어야 합니다. SQL 항목(C3·C9·C15·C6)은 한 파일에 차례로 쌓습니다. 색상 정리(C12)는 다른 항목과 같은 파일을 많이 건드리므로 맨 뒤에 둡니다.

---

## 3. P1 — PR 머지 전에 반드시 고칠 것

### C8. 해시 라우팅: 닫기 시 기록 정리, StrictMode 중복 push 제거
**문제 (확인됨)**
1. `src/hooks/useHashRoute.ts` 52행: `history.pushState`/`replaceState`를 `setRoute((prev) => …)` **갱신 함수 안에서** 호출합니다. React StrictMode(`src/main.tsx`)는 개발 모드에서 갱신 함수를 두 번 실행하므로 기록이 두 번 쌓입니다. 갱신 함수에는 부수 효과가 없어야 합니다.
2. `src/utils/route.ts` 199행 `CLOSE`가 `replace`입니다. 열 때(`OPEN`)는 push했으므로, 닫기 버튼을 누를 때마다 기록이 하나씩 남습니다. 시트를 3번 열고 닫으면 뒤로 가기를 3번 더 눌러야 이전 탭으로 갑니다.

**수정**
1. `useHashRoute`에 `routeRef`(현재 라우트)를 두고, `navigate`는 다음 순서로 동작한다.
   - `const { route: next, history } = navReducer(routeRef.current, action)`
   - history 호출(갱신 함수 밖에서)
   - `routeRef.current = next; setRoute(next)`
2. 오버레이를 열 때는 `pushState({ mcOverlay: true }, '', hash)`로 **표시를 남긴다.**
3. `CLOSE` 처리: `window.history.state?.mcOverlay === true`이면 `window.history.back()`만 호출하고 라우트는 바꾸지 않는다(이어서 오는 `popstate`가 라우트를 갱신). 표시가 없으면(딥링크로 처음부터 오버레이가 열린 경우) 기존처럼 `replaceState`로 오버레이 없는 주소로 바꾼다.
4. `navReducer` 자체(순수 함수)의 반환 형식은 바꾸지 않는다. 판단은 훅에서 한다.

**테스트 (`src/hooks/useHashRoute.test.ts`에 추가)**
- `window.history.pushState`와 `back`을 `vi.spyOn`으로 감시한다. OPEN → CLOSE 시 `back`이 1번 호출되고 `pushState`는 1번만 호출되는지 확인(StrictMode에서 2번이 아님. `renderHook`을 `React.StrictMode` wrapper로 실행).
- 딥링크 상태(`history.state` 없음)에서 CLOSE → `back` 미호출, `replaceState` 호출.
- 시퀀스: 오늘 → 일정(push) → 시트 OPEN(push) → CLOSE(back) → `popstate`로 일정 복귀 → 뒤로 → 오늘.

**완료 조건**: 위 테스트 통과. 기존 `src/utils/route.test.ts` 수정 없이 통과.

---

### C2. QR·투표 모달을 라우트에 연결 (명세 §2-2, 수용 기준 §6-1-5)
**문제 (확인됨)**: `src/App.tsx` 452행 부근에서 QR 스캐너(`showQRScanner`, `qrTargetSchedule`)와 투표 모달(`rsvpSchedule`)이 일반 상태값으로만 열립니다. 안드로이드 뒤로 가기를 누르면 라우트만 바뀌고 **모달은 떠 있으며 카메라도 계속 켜져 있습니다.** 오늘 탭에서 누르면 앱이 종료될 수 있습니다. 명세 §6-1-5("QR 모달에서 뒤로 가기 → 카메라 트랙 `stop()`")를 충족하지 못했습니다.

**수정**
1. `src/utils/route.ts`에 이미 있는 `Overlay` 타입의 `{ kind: 'qr'; scheduleId }`, `{ kind: 'rsvp'; scheduleId }`를 쓴다. 없거나 형식이 다르면 **멈추고 보고**한다.
2. `App.tsx`에서 다음을 바꾼다.
   - `showQRScanner`, `qrTargetSchedule`, `rsvpSchedule` 상태를 **제거**한다.
   - 열기: `navigate({ type: 'OPEN', overlay: { kind: 'qr', scheduleId: sch.id } })` / `{ kind: 'rsvp', scheduleId }`. `TodayTab`(`HomeView` 어댑터), `CalendarTab`, `ProfileTab`, `ScheduleDetailSheet`에서 오는 모든 열기 콜백을 이 방식으로 통일한다. 콜백 이름과 시그니처는 그대로 둔다(App 내부만 수정).
   - 렌더: `route.area === 'member' && route.overlay?.kind === 'qr'`이면 `activeSchedules.find((s) => s.id === route.overlay.scheduleId)`로 일정을 찾는다. **찾지 못하면 모달을 렌더하지 않고 `navigate({ type: 'CLOSE' })`를 effect에서 호출**한다(숨김 일정·잘못된 딥링크 보호).
   - 닫기·성공: `onClose`/`onSuccess`에서 `navigate({ type: 'CLOSE' })`(C8의 back 동작). 성공 시에는 기존처럼 `triggerRefresh()`도 호출한다.
   - `onOpenQRScanner(null)`이 들어오는 기존 분기(오늘 탭으로 이동)는 그대로 둔다.
3. `QRScannerModal`의 카메라 정지가 **언마운트 cleanup에서 반드시 실행되는지** 확인한다(현재 248행, 313행 경로). 언마운트 시 정지되지 않는 경로가 있으면 cleanup에 `stream.getTracks().forEach((t) => t.stop())`를 추가하고, 위치 추적(`watchPosition`)을 쓰는 경우 `clearWatch`도 확인한다.
4. RSVP의 `currentVote` 계산은 기존 방식(`sheetsService.getRSVPVotes(id).find(...)`)을 유지한다.

**테스트**
- `src/App.test.tsx`(없으면 신규, 기존 컴포넌트 테스트의 목 방식 복사) 또는 `QRScannerModal` 단위 테스트에서 다음을 확인한다.
  - `navigator.mediaDevices.getUserMedia`를 모의 `MediaStream`(트랙의 `stop`은 `vi.fn()`)으로 대체하고, 해시를 `#/today` + qr 오버레이로 만든 뒤 `popstate`를 발생시키면 모달이 사라지고 `stop`이 호출되는지.
  - 숨김(TARGETS_ONLY 비대상) 일정 ID로 qr 오버레이 딥링크 → 모달이 렌더되지 않는지.
  - rsvp 오버레이에서 `popstate` → 투표 모달이 사라지는지.

**완료 조건**: 위 테스트 통과. `App.tsx`에 `showQRScanner`, `qrTargetSchedule`, `rsvpSchedule` 문자열 0건.

---

### C3. 사용 이력이 있는 시즌 카드 삭제 시 DB 오류 노출
**문제 (로컬 DB에서 재현함)**: `20261122000000_practice_catalog.sql` 542행 `fn_delete_program_card__impl`은 **활성** 연결(`archived_at is null`)만 검사합니다. 연결을 해제(보관)한 카드를 삭제하면 검사는 통과하지만, `practice_program_pieces`의 외래키(`on delete restrict`)가 보관된 행 때문에 삭제를 거부해 SQL 오류가 납니다. 화면에는 "Supabase 통신 오류 (HTTP 4xx)"만 보입니다.

**수정** (새 마이그레이션 파일)
```sql
create or replace function fn_delete_program_card__impl(p_payload jsonb)
returns jsonb
security definer
set search_path = public
language plpgsql as $$
begin
  if exists (select 1 from practice_program_pieces where program_id = p_payload->>'id') then
    return jsonb_build_object(
      'success', false,
      'message', '연습곡 사용 이력이 있는 카드는 삭제할 수 없습니다. 대신 보관 처리하세요.'
    );
  end if;
  delete from program_cards where id = p_payload->>'id';
  return jsonb_build_object('success', true, 'message', '일정 카드가 삭제되었습니다.');
end;
$$;
revoke all on function fn_delete_program_card__impl(jsonb) from public, anon, authenticated;
```
- 사용 이력 보존이 목적(명세 D5)이므로, 보관된 연결이 있어도 삭제하지 않는다.
- 화면에서 이 메시지가 그대로 보이는지 확인한다. 관리자 일정 카드 삭제 흐름(`CardGroupDeleteModal` 등)이 서버 메시지를 버리고 다른 문구를 띄우면 **보고만 한다**(이번 범위에서는 수정하지 않음).

**테스트**: `supabase/tests/practice_catalog_check.sql`에 데이터를 바꾸지 않는 확인 항목을 추가한다. `pg_get_functiondef('fn_delete_program_card__impl(jsonb)'::regprocedure)`에 `archived_at is null`이 **없는지**, 그리고 "사용 이력" 문구가 있는지 확인한다.

---

### C6. 기기 연동 해제가 Supabase에서 항상 실패
**문제 (확인됨)**: `src/services/sheets.ts`의 `unbindMemberDevice()`가 `UNBIND_DEVICE` 액션을 보내지만, `supabaseBackend.ts`에 매핑이 없어 `success:false`("지원되지 않는 작업입니다")가 돌아옵니다. 최고 관리자 화면의 "기기 연동 해제"가 항상 오류를 냅니다. 기존 `fn_update_member__impl`은 `bound_device_id`/`bound_device_at`을 다루지 않으므로 재사용할 수 없습니다(확인함).

**수정**
1. 새 마이그레이션에 관리자 전용 RPC를 추가한다.
```sql
create or replace function fn_unbind_member_device(p_payload jsonb)
returns jsonb
security definer
set search_path = public, extensions
language plpgsql as $$
declare
  v_member_id text := trim(coalesce(p_payload->>'memberId', ''));
begin
  if not fn_check_admin_token(p_payload->>'adminToken', 'admin') then
    return fn_admin_auth_required();
  end if;
  if v_member_id = '' then
    return jsonb_build_object('success', false, 'message', '단원 ID가 필요합니다.');
  end if;
  update members
     set bound_device_id = '',
         bound_device_at = '',
         updated_at = now()
   where id = v_member_id;
  if not found then
    return jsonb_build_object('success', false, 'message', '단원을 찾을 수 없습니다.');
  end if;
  return jsonb_build_object('success', true, 'message', '기기 연동이 해제되었습니다.');
end;
$$;
revoke all on function fn_unbind_member_device(jsonb) from public;
grant execute on function fn_unbind_member_device(jsonb) to anon, authenticated;
```
   - `bound_device_id`, `bound_device_at`은 `text default ''` 컬럼이다(스키마 확인됨). `null`이 아니라 `''`로 비운다.
   - 출석 원천 로그의 `device_id`는 **건드리지 않는다**(append-only).
2. `supabaseBackend.ts` `mapActionToRpc`에 `case 'UNBIND_DEVICE': return 'fn_unbind_member_device';`를 추가한다. 본문은 기존 기본 경로(`p_payload` + 자동 `adminToken`)를 그대로 쓴다.
3. `security_hardening_check.sql` 형식으로 `practice_catalog_check.sql` 또는 새 확인 스크립트에 "토큰 없이 `fn_unbind_member_device` → `ADMIN_AUTH_REQUIRED`" 항목을 추가한다.

**테스트**: `supabaseBackend.test.ts`에서 `UNBIND_DEVICE` → `fn_unbind_member_device`로 호출되는지, 토큰이 있으면 `p_payload.adminToken`이 실리는지 확인.

---

### C4. Worker: 304 처리, `Vary: Origin`, 잘못된 경로
**문제 (확인됨)**: `workers/media/index.js`
1. `onlyIf: request.headers`를 쓰는데, 조건이 맞아 R2가 **본문 없는 객체**를 돌려주는 경우(브라우저의 `If-None-Match` 재검증)를 처리하지 않습니다. `object.body`가 없으니 빈 200이 나갑니다.
2. 출처별로 `Access-Control-Allow-Origin`을 다르게 주면서 `Cache-Control: public, … immutable`인데 `Vary: Origin`이 없습니다. 캐시가 다른 출처용 응답을 재사용할 수 있습니다.
3. `decodeURIComponent`가 잘못된 `%` 경로에서 예외를 던지면 Worker가 500으로 끝납니다.

**수정** (50줄 제한 유지)
```js
let key;
try {
  key = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
} catch {
  return new Response('Bad Request', { status: 400, headers: corsHeaders });
}
// ...get 이후 headers 구성까지 동일...
headers.set('Vary', 'Origin');
if (!('body' in object)) {
  return new Response(null, { status: 304, headers });
}
```
- `corsHeaders` 객체에도 `Vary: Origin`을 넣어 404·405 응답에도 붙게 한다.

**README 보완** (`workers/media/README.md`): 배포 후 확인 절차에 다음을 추가한다.
1. `curl -sI <주소>/<키>`로 `ETag` 확인
2. `curl -sI -H 'If-None-Match: <ETag 값>' <주소>/<키>` → `304`
3. `curl -sI <주소>/%E0%A4%A` → `400`

---

### C5. 비상 캐시 초기화가 아무것도 지우지 않음
**문제 (확인됨)**: `src/components/admin/SuperAdminDashboard.tsx` 186행이 더 이상 쓰지 않는 v1 키만 지웁니다. 실제 사용 중인 `moonchoir_*_v3` 키와 `moonchoir_practice_catalog_v1`은 남습니다.

**주의 — `resetStorage()`를 쓰면 안 됩니다**: `src/services/sheetsStorage.ts`의 `resetStorage()`는 `localStorage.clear()`라서 **기기 연동 정보(로그인 상태), 관리자 토큰, 화면 설정까지 전부 지웁니다.** 이전 리뷰본의 제안은 틀렸으므로 따르지 않습니다.

**수정**
1. `sheetsStorage.ts`에 데이터 캐시만 지우는 함수를 추가한다.
```ts
/** 서버에서 다시 받을 수 있는 데이터 캐시만 지운다. 기기 연동·관리자 토큰·화면 설정은 유지한다. */
export function clearDataCache(): void {
  const storage = getStorage();
  Object.values(STORAGE_KEYS).forEach((key) => storage.removeItem(key));
}
```
2. `STORAGE_KEYS`에 기기 연동이나 토큰 키가 **들어 있지 않은지** 확인한다. 들어 있다면 멈추고 보고한다.
3. `SuperAdminDashboard.tsx`의 수동 키 목록을 `clearDataCache()` 호출로 바꾼다(`sheets.ts`를 통해 다시 내보내 쓰거나 직접 import. 기존 import 관례를 따름).

**테스트** (`sheetsStorage` 관련 테스트 파일에 추가)
- `STORAGE_KEYS`의 모든 키, `moonchoir_bound_device_v1`, `moonchoir_admin_token_v1`에 값을 넣는다.
- `clearDataCache()` 후 데이터 키는 비고, 연동·토큰 키는 남는지 확인한다.

---

## 4. P2 — 머지 후 정리지만 이번 PR에 포함

### C9. 트랙 순서 변경에 중복 ID 허용
**문제 (재현함)**: `fn_reorder_practice_tracks`는 개수만 비교해서, 트랙이 a·b일 때 `['a','a']`도 통과합니다. b의 순서는 갱신되지 않습니다.
**수정** (새 마이그레이션에서 함수 전체를 `create or replace`, 이 함수는 래퍼가 아님):
- 개수 비교 전에 입력 배열의 고유 개수(`select count(distinct value) from jsonb_array_elements_text(...)`)가 전체 개수와 다르면 `{success:false, message:'중복된 트랙이 있습니다.'}`를 돌려준다.
- 객체 배열(`{id}`) 입력도 지원하므로, 문자열 배열과 객체 배열 모두에서 ID를 뽑아 중복을 검사한다.
- 나머지 동작(토큰 검사, 원자적 처리, 메시지)은 그대로 유지한다.
**테스트**: 확인 스크립트에 함수 정의에 `distinct`가 포함됐는지 확인하는 항목. `src/services/sheets.test.ts`에서 서버가 실패를 돌려주면 로컬 순서가 바뀌지 않는지(기존 테스트가 이미 있으면 생략하고 그 이름을 보고).

### C15. 카탈로그 RPC 입력 방어·응답 크기
1. `fn_save_practice_track`: `durationSeconds`가 빈 문자열이면 정수 변환 오류로 500이 납니다(재현함). `nullif(trim(p_payload->>'durationSeconds'), '')::integer`로 바꾼다. 숫자가 아닌 문자열이면 `{success:false, message:'재생 시간은 숫자로 입력해 주세요.'}`(`~ '^\d+$'` 검사).
2. `fn_set_practice_piece_archived`, `fn_set_practice_track_archived`: 없는 ID에도 성공을 돌려줍니다. `update` 뒤 `if not found then return {success:false, message:'…을(를) 찾을 수 없습니다.'}`.
3. `fn_get_practice_catalog`: 응답에 camelCase와 snake_case 키를 **둘 다** 넣어 크기가 2배입니다. **camelCase만** 남긴다. 클라이언트 파서(`parsePracticeCatalog`)는 두 형식을 모두 받으므로 호환된다. 바꾸기 전에 `sheetsParser.test.ts`에 camelCase만 있는 응답 파싱 테스트가 있는지 확인하고, 없으면 추가한다.
- 1~3 모두 같은 새 마이그레이션 파일에서 해당 함수를 `create or replace` 한다. 함수 전체 본문을 옮겨 적을 때 **토큰 검사 첫 줄을 빠뜨리지 않는다**(확인 스크립트로 검증).

### C10. "이번 주" 날짜 계산 UTC 밀림 + `addDaysKST` 시간대 버그
**문제 (확인됨)**
1. `SuperAdminDashboard.tsx` 310~311행 `mon.toISOString().slice(0, 10)`은 UTC 날짜라서, KST 월요일 00:00~08:59에는 전날(일요일)이 됩니다. 요일 계산(`d.getDay()`)도 기기 시간대 기준입니다.
2. `src/utils/date.ts`의 `addDaysKST()`는 `new Date(y, m-1, d+days, 12)`(기기 시간대 정오)를 KST로 변환합니다. 기기 시간대가 UTC−10 같은 곳이면 정오가 KST 다음 날 아침이 되어 **하루가 밀립니다.**

**수정**
1. `date.ts`에 시간대와 무관한 순수 달력 계산을 둔다.
```ts
/** 'YYYY-MM-DD' 달력 날짜에 days를 더한다(시간대 무관). */
function shiftCalendarDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
/** 'YYYY-MM-DD' 달력 날짜의 요일(0=일). 시간대 무관. */
export function getWeekdayOfDate(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
```
   `addDaysKST`의 본문을 `shiftCalendarDate` 사용으로 바꾼다(입력 검증과 잘못된 입력 시 `getKSTDateString()` 반환 동작은 유지).
2. `SuperAdminDashboard`의 THIS_WEEK 계산: `diffToMonday = (getWeekdayOfDate(todayStr) + 6) % 7`, `start = addDaysKST(todayStr, -diffToMonday)`, `end = addDaysKST(start, 6)`.

**테스트** (`src/utils/date.test.ts`)
- `addDaysKST('2026-11-30', 1) === '2026-12-01'`, `addDaysKST('2028-02-28', 1) === '2028-02-29'`(윤년), `addDaysKST('2026-01-01', -1) === '2025-12-31'`.
- `getWeekdayOfDate('2026-11-23') === 1`(월요일).
- `TZ=Pacific/Honolulu npm test -- -t "addDaysKST"`와 `TZ=UTC`에서 결과가 같은지 실행해 보고한다.
- `addDaysKST`를 쓰는 기존 테스트가 전부 그대로 통과해야 한다.

### C11. 로고 롱프레스 스크롤 오발동, 36px 버튼
**문제 (확인됨)**: `src/hooks/useMasterEntryGesture.ts`의 롱프레스 타이머에 `touchmove`·`touchcancel` 취소가 없습니다. 스크롤 중 손가락이 로고를 지나면 숨은 메뉴가 열립니다. `src/components/AppHeader.tsx` 85행 "Get in" 버튼이 `minHeight: '36px'`로 44px 규칙 위반입니다.
**수정**
- 터치 시작 좌표를 저장하고, `onTouchMove`에서 이동 거리가 10px를 넘으면 타이머를 취소한다. `onTouchCancel`도 타이머를 취소한다. 훅이 돌려주는 핸들러 묶음에 두 핸들러를 추가하고, `AppHeader`에서 로고 요소에 연결한다.
- 우클릭·3연타·햅틱 동작은 그대로 둔다.
- 버튼 `minHeight: '44px'`, `minWidth: '44px'`.
**테스트**: 훅 테스트(없으면 신규 `src/hooks/useMasterEntryGesture.test.ts`, 가짜 타이머) — touchstart → 20px 이동 → 600ms 경과 시 메뉴가 열리지 않음 / 움직임 없이 600ms면 열림 / touchcancel 후 열리지 않음.

### C7. 상세 시트 선택이 실시간 갱신마다 초기화
**문제 (확인됨)**: `App.tsx`가 매 렌더마다 `getSchedulesForMember()`의 **새 배열**을 넘깁니다. 그래서 `ScheduleDetailSheet.tsx`의 `daySchedules`(useMemo)가 매번 다시 계산되고, 45~54행 effect가 실행돼 `selectedScheduleId`를 되돌립니다. 하루 일정이 여러 개인 날, 사용자가 하나를 고른 뒤 실시간 갱신이 오면 목록 화면으로 튕깁니다. 린트 경고(set-state-in-effect)의 원인이기도 합니다.
**수정**
- effect를 없애고 **렌더 중 파생값**으로 바꾼다. 사용자가 고른 ID(`userPickedId` state)를 따로 두고, 실제 표시할 ID를 다음 순서로 계산한다.
  1. `scheduleId` prop이 있으면 그것
  2. `userPickedId`가 현재 `daySchedules` 안에 있으면 그것
  3. `daySchedules.length === 1`이면 그 하나
  4. 아니면 `null`(목록)
- `date` prop이 바뀌면 `userPickedId`를 초기화한다. `key={date}`로 시트를 다시 마운트하는 방식도 된다(App에서 `key` 지정).
**테스트**: 일정 2개인 날 → 두 번째 선택 → 같은 내용의 **새 배열**로 `rerender` → 여전히 두 번째 상세가 보이는지. 선택한 일정이 목록에서 사라지면 목록으로 돌아가는지.

### C14. 린트 경고 0개, 시트 애니메이션 reduced-motion
- `ScheduleDetailSheet.tsx` 176행: 렌더 중 `isDraggingRef.current` 읽기 → 드래그 여부를 `useState`로 바꾼다(드래그 시작·끝에서만 갱신, 이동 중에는 `dragOffsetY`만 갱신).
- 같은 파일의 인라인 `transition`이 `@media (prefers-reduced-motion: reduce)`를 무시한다. `window.matchMedia('(prefers-reduced-motion: reduce)').matches`이면 `transition: 'none'`. 판정은 마운트 시 한 번만 하고, `matchMedia`가 없는 환경에서는 false.
- `src/components/audio/AudioPlayer.test.tsx` 50행: 렌더 중 ref 읽기 → 테스트 컴포넌트에서 ref를 effect 안에서 읽어 콜백으로 넘기는 방식으로 바꾼다. **테스트가 검증하는 내용(같은 `<audio>` 요소 유지)은 약하게 만들지 않는다.**
- C7에서 set-state-in-effect 경고가 사라진다.
**완료 조건**: `npm run lint` 출력에 경고 0개.

### C16. 오디오 컨텍스트 과다 렌더, MediaSession 정리, 로그아웃 시 정지
**문제 (확인됨)** — `src/components/audio/AudioPlayerProvider.tsx`
1. `currentTime`이 메인 컨텍스트 값에 들어 있어, 재생 중 초당 약 4회 모든 소비 컴포넌트가 다시 그려집니다. 특히 `QRScannerModal`의 `useEffect(() => audioPlayer?.pause(), [audioPlayer])`는 컨텍스트 객체가 바뀔 때마다 실행돼, **QR 화면이 열린 동안 사용자가 다시 재생해도 바로 멈춥니다.**
2. `closePlayer()` 후에도 잠금화면의 MediaSession 정보와 핸들러가 남습니다.
3. 로그아웃해도 음악이 계속 재생됩니다.

**수정**
1. 재생 위치(`currentTime`, `duration`)를 별도 컨텍스트 `AudioPositionContext`와 훅 `useAudioPosition()`으로 분리한다. 메인 컨텍스트에서 이 두 값을 빼고, 위치가 필요한 컴포넌트(`MiniPlayer`의 진행 바 등)만 새 훅을 쓴다.
2. `QRScannerModal`의 effect는 **마운트 시 한 번만** pause한다(`useRef`로 최초 1회 보장, 또는 `pause` 함수 참조만 의존성으로 두고 `pause`가 안정적인 `useCallback`인지 확인).
3. `closePlayer()`에서 `navigator.mediaSession.metadata = null`, 다섯 액션 핸들러를 `setActionHandler(action, null)`로 해제한다(`try/catch`, 미지원 환경은 건너뜀).
4. `App.tsx` 로그아웃 처리(`onLogout`)에서 `closePlayer()`를 호출한다. `MainApp`은 Provider 안에 있으므로 `useOptionalAudioPlayer()`를 쓴다.

**테스트**
- 재생 위치가 바뀌어도 `useAudioPlayer()`만 쓰는 테스트 컴포넌트의 렌더 횟수가 늘지 않는지(렌더 카운터).
- QR 모달이 열린 상태에서 `resume()` → 다시 `pause`되지 않는지.
- `closePlayer()` 후 `mediaSession.metadata === null`, 핸들러 해제 호출 확인(모의 `navigator.mediaSession`).

### C13. 연습실 문구·빈 시즌 카드
**문제 (확인됨)**: `src/components/StudioTab.tsx` 134행의 "시즌별 연습곡과 **파트 음원**을 재생하고…"는 결정 D1(파트별 음원 없음)과 모순입니다. 곡이 하나도 연결되지 않은 시즌 카드(일반 정기연습 카드 포함)도 모두 빈 상자로 나열됩니다.
**수정**
- 문구를 "시즌별 연습곡을 듣고 악보를 확인합니다."로 바꾼다.
- `section.pieces.length > 0`인 섹션만 렌더한다. 모두 비었으면 "아직 등록된 연습곡이 없습니다." 한 줄을 보여 준다(기존 빈 상태 영역 재사용).
- `buildStudioView`(순수 함수)는 바꾸지 않는다. 걸러내는 건 화면에서 한다.
**테스트** (`StudioTab.test.tsx`): 곡이 없는 시즌 카드가 렌더되지 않음, 전부 비면 안내 한 줄, "파트 음원" 문자열 0건.

### C12. 새 컴포넌트의 맨 hex 색상 → CSS 변수 (지시서 절대 규칙 10번)
**문제 (확인됨)**: 아래 파일에 `var()` 밖의 맨 색상값(`'#ffffff'`, `'#DC2626'` 등)이 남아 다크 모드에서 깨집니다. 대략적인 개수입니다.
- `src/components/admin/AdminPracticeTab.tsx`: 약 72개
- `src/components/ProfileTab.tsx`: 약 38개 (기존 `MemberPortalModal`에서 옮겨 온 것)
- `src/components/audio/MiniPlayer.tsx`: 1개
- `src/components/StudioTab.tsx`: 2개
- `src/components/AppHeader.tsx`: 3개

**수정 규칙**
- `src/index.css` `:root`에 이미 있는 변수만 쓴다: `--bg-app`, `--bg-card`, `--bg-subtle`, `--bg-input`, `--bg-hover`, `--text-main`, `--text-sub`, `--text-muted`, `--text-white`, `--brand-primary`, `--brand-accent`, `--brand-primary-hover`, `--brand-primary-light`, `--status-success`·`-light`, `--status-warning`·`-light`, `--status-danger`·`-light`, `--status-info`·`-light`, `--border-subtle`, `--border-default`, `--border-focus`, 파트 색상 변수 등.
- 의미로 대응시킨다: 흰 배경 → `--bg-card`, 연회색 배경 → `--bg-subtle`, 본문 글자 → `--text-main`, 보조 글자 → `--text-muted`, 빨간 경고 → `--status-danger`, 초록 성공 → `--status-success`, 테두리 → `--border-subtle`, 강조 버튼 배경 → `--brand-primary`, 그 위의 흰 글자 → `--text-white`.
- **대응되는 변수가 없는 색은 임의로 새 변수를 만들지 말고**, 파일·줄·색상값 목록을 보고한 뒤 그대로 둔다.
- `var(--x, #hex)` 형태의 대체값은 변수가 존재하므로 그대로 둬도 된다.
- 레이아웃·간격·문구는 바꾸지 않는다. 색만 바꾼다.
**검증**:
- 아래 명령의 결과(맨 hex 개수)를 수정 전후로 보고한다.
  ```bash
  for f in src/components/admin/AdminPracticeTab.tsx src/components/ProfileTab.tsx src/components/audio/MiniPlayer.tsx src/components/StudioTab.tsx src/components/AppHeader.tsx; do
    echo "$f $(grep -oE "#[0-9A-Fa-f]{3,8}\b" "$f" | wc -l) $(grep -oE "var\(--[a-z0-9-]+, ?#[0-9A-Fa-f]{3,8}\)" "$f" | wc -l)"
  done
  ```
  (첫 숫자 − 둘째 숫자 = 맨 hex 개수, 목표 0 또는 보고된 예외만)
- `npm run dev`에서 다크 모드로 전환해 연습실, 내 활동, 운영진 연습곡 화면을 확인했는지 보고한다. 확인하지 못했으면 "확인 못 함".

---

## 5. 하지 말 것 (이번 작업 한정)
- 관리자 PIN 길이 규칙 변경 (6~8자리 확정)
- `fn_record_attendance` 수정 (긴급 수정이 운영에 적용됨)
- `20261122000000_practice_catalog.sql`, `20261121000000_security_hardening.sql`, `20261121010000_fix_onsite_pin_payload_key.sql` 수정
- PR #14~#17 브랜치 직접 수정, PR 머지, `npm run deploy`, 운영 DB 실행
- 이 문서에 없는 리팩터링·기능 추가

---

## 6. 보고 형식
항목마다:
```
## [C번호] 제목
- 바꾼 파일:
- 한 일: (3줄 이내)
- 추가한 테스트: (테스트 이름)
- Green Bar: typecheck ✓ / lint ✓ (경고 N개) / test "Tests N passed (N)" / build ✓
- 하지 못한 것·확인 필요:
```
전체 완료 시 C2~C16 표(ID / 결과: 완료·보류·질문 / 커밋 해시)와, SQL Editor용 **주석 제거 복사 블록**(새 마이그레이션 + 확인 쿼리)을 붙인다.

---

## 7. 마무리 (마지막 커밋)
1. `docs/ARCHITECTURE_RECOVERY.md`의 "Decisions Agreed With The Owner"에 한 줄 기록: "2026-11 코드 리뷰 후속 수정(C2~C16) 완료, 관리자 PIN 6~8자리 유지 확정, 비상 캐시 초기화는 데이터 캐시만 삭제".
2. `docs/DEV_LOG.md`에 이번 작업 요약(항목 ID와 한 줄 설명)을 추가한다. **check.md를 지우면 근거가 사라지므로, 각 항목의 문제와 해결을 DEV_LOG에 남긴다.**
3. `docs/plans/16b_execution_plan.md`에 "리뷰 후속 수정" 섹션을 추가하고 항목별 상태를 적는다.
4. **이 파일 `check.md`를 삭제한다**(`git rm check.md`). 커밋 메시지: `docs: record review follow-ups and remove check.md`
5. `fix/review-followups` 브랜치를 푸시하고 PR을 만든다. PR 본문에는 §6의 완료 표와 SQL 적용 안내(새 마이그레이션은 `20261122000000` 적용 **후** 실행)를 넣는다. **머지하지 않는다.**
