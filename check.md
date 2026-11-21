# check.md — PR #20 2차 리뷰 후속 작업 지시서

> **이 문서를 읽는 개발 에이전트에게**
> PR #20(`fix/review-followups`, C2~C16)을 검수한 결과, 남은 수정 작업 **N1~N4**의 실행 계획입니다. 이 문서의 순서와 규칙대로만 작업합니다.
> 기본 규칙은 [구현 작업 지시서](docs/plans/16_member_ux_studio_implementation_guide.md) §0(절대 규칙)·§6(자주 하는 실수)을 그대로 따르고, 이 문서가 더 구체적인 경우 이 문서를 따릅니다.
>
> - 작성: 2026-11-21 (리뷰어)
> - **이 문서는 작업이 모두 끝나면 마지막 커밋에서 삭제합니다**(§6).

---

## 0. PR #20 검수 결과 요약 (참고)
- C2~C16 15개 항목은 **모두 의도대로 동작합니다.** 리뷰어가 직접 확인한 내용:
  - Green Bar: 70개 파일, 542개 테스트 통과
  - 로컬 PostgreSQL에서 전체 마이그레이션 2회 적용, 검증 스크립트 41개 항목 PASS
  - 지난번 재현한 버그(C3·C6·C9·C15)를 다시 재현해 모두 해결됨을 확인
- 남은 문제는 아래 4개입니다. 그중 **N1은 연습실 공개 전에 반드시** 고쳐야 합니다.

## 1. 확정 사항 (다시 묻지 말 것)
| 항목 | 상태 |
|---|---|
| 관리자·최고관리자 PIN 6~8자리 | 확정. 변경 금지 |
| 현장 PIN 출석 수정(`20261121010000_…`) | 운영 적용 완료. 건드리지 않음 |
| **최고관리자 PIN 변경이 반영되지 않는 문제** | 리뷰어가 원인을 찾아 `supabase/migrations/20261122020000_fix_save_config_secret_routing.sql`로 수정함(사용자가 운영 DB에 적용). **이 파일과 `fn_save_config` 관련 코드는 건드리지 않는다.** (§5 참고) |
| 단원 본인 인증(Task 76), 레벨·배지 | 범위 밖 |

---

## 2. 작업 환경 (순서대로)

1. **브랜치**: 기존 `fix/review-followups`에서 계속 작업한다. 새 브랜치를 만들지 않는다. 커밋을 푸시하면 PR #20에 자동으로 추가된다.
2. **먼저 `main`을 합친다** (이 문서와 새 마이그레이션을 가져오기 위해):
   ```bash
   git fetch origin
   git switch fix/review-followups
   git merge origin/main
   ```
   - `check.md`에서 충돌이 나면(이 브랜치는 check.md를 지웠고 main은 새로 썼기 때문) **main의 새 문서를 남긴다**:
     ```bash
     git checkout origin/main -- check.md
     git add check.md
     git commit --no-edit
     ```
   - 다른 파일에서 충돌이 나면 **멈추고 보고**한다. 임의로 해결하지 않는다.
   - 합친 뒤 `npm run typecheck && npm run lint && npm test && npm run build`가 통과하는지 먼저 확인하고 보고한다.
3. **커밋**: 항목 하나 = 커밋 하나. 메시지에 항목 ID(N1 등)를 넣는다.
4. **Green Bar**: 매 커밋 전 4개 명령 통과.
5. **금지**: `@ts-ignore`, `@ts-expect-error`, `as any`(운영 코드), `eslint-disable`·`oxlint-disable` 주석 새로 추가, 빈 `catch`, 테스트 삭제·skip·기대값 맞추기, `package.json`·설정 파일 수정, PR 머지, 배포, 운영 DB 실행.
6. **멈출 때**: 이 문서의 수정 방향이 실제 코드와 맞지 않을 때, 적힌 파일 외의 파일을 고쳐야 할 때, 같은 오류를 3번 고쳐도 안 될 때. 멈춘 뒤에는 답을 받을 때까지 다음 항목으로 넘어가지 않는다.

---

## 3. 작업 목록

| 순서 | ID | 내용 | 심각도 | 파일 |
|---|---|---|---|---|
| 1 | **N1** | Worker의 `Content-Range` 계산 오류(열린 구간·끝 구간 요청) | **P1 — 연습실 공개 전 필수** | `workers/media/index.js`, `workers/media/index.test.js`(신규), `workers/media/README.md` |
| 2 | **N4** | 관리자 화면에서 무시된 OPEN이 기록을 쌓음 | P3 | `src/hooks/useHashRoute.ts`, `src/hooks/useHashRoute.test.ts` |
| 3 | **N3** | 상세 시트 선택 유지(C7) 테스트가 실제 시나리오를 검사하지 않음 | P2 | `src/components/ScheduleDetailSheet.test.tsx` |
| 4 | **N2** | 린트 경고를 끄는 주석으로 덮은 10곳 정리 | P2 | 아래 표 |
| 5 | 마무리 | 문서 갱신 + check.md 삭제 + 푸시 | — | §6 |

---

### N1. Worker `Content-Range` 계산 오류 — P1
**문제**: `workers/media/index.js`는 `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${object.size}`로 응답 범위를 적습니다. R2가 돌려주는 `range`는 요청 형식에 따라 모양이 다릅니다.
- `Range: bytes=0-` 같은 **열린 구간**에서는 `length`가 없을 수 있습니다. 그러면 `bytes 0-NaN/…`이 됩니다.
- `Range: bytes=-500` 같은 **끝 구간**에서는 `{ suffix: 500 }`만 있고 `offset`이 없습니다. 그러면 `bytes undefined-NaN/…`이 됩니다.
- 아이폰 Safari는 음원을 `bytes=0-1`로 먼저 요청한 뒤 `bytes=0-` 형태로 이어서 요청합니다. 응답 범위가 잘못되면 **재생이나 탐색이 실패**할 수 있습니다.

**수정**
1. 파일 안에 범위 계산을 순수 함수로 분리하고 **이름 있는 export**로 내보낸다.
```js
/** R2 range와 전체 크기로 응답 범위를 계산한다. 계산할 수 없으면 null. */
export function computeContentRange(range, size) {
  if (!range || !Number.isFinite(size) || size <= 0) return null;
  let start;
  let end;
  if (range.suffix !== undefined) {
    start = Math.max(size - range.suffix, 0);
    end = size - 1;
  } else {
    start = range.offset ?? 0;
    end = range.length !== undefined ? start + range.length - 1 : size - 1;
  }
  end = Math.min(end, size - 1);
  if (start > end) return null;
  return { start, end, header: `bytes ${start}-${end}/${size}`, length: end - start + 1 };
}
```
2. `fetch` 본문에서 이 함수를 쓴다.
   - 결과가 있으면 `Content-Range`를 `header`로, `Content-Length`를 `String(length)`로 설정하고 206을 돌려준다.
   - `object.range`는 있는데 결과가 `null`이면 **416**(`Range Not Satisfiable`)과 `Content-Range: bytes */${object.size}`를 돌려준다.
   - range가 없으면 지금처럼 200.
3. 기존 동작(GET/HEAD만, OPTIONS 204, 400·404·405, `Vary: Origin`, 304, `Cache-Control`)은 그대로 유지한다.
4. 파일 길이 제한을 **60줄**로 완화한다(기존 50줄). 넘으면 보고한다.

**테스트 (신규 `workers/media/index.test.js`)** — vitest가 이 파일도 자동으로 실행하는지 `npm test` 출력에서 확인하고 보고한다. 실행되지 않으면 멈추고 보고한다(설정 파일 수정 금지).
- `{offset: 0, length: 2}`, size 1000 → `bytes 0-1/1000`, length 2
- `{offset: 0}`(length 없음), size 1000 → `bytes 0-999/1000`
- `{offset: 500}`, size 1000 → `bytes 500-999/1000`
- `{suffix: 100}`, size 1000 → `bytes 900-999/1000`
- `{suffix: 5000}`, size 1000 → `bytes 0-999/1000`
- `{offset: 2000}`, size 1000 → `null`
- `{offset: 990, length: 100}`, size 1000 → `bytes 990-999/1000`(끝에서 잘림)
- range 없음 → `null`

**README 보완** (`workers/media/README.md` 확인 절차에 추가):
1. `curl -sI -H 'Range: bytes=0-1' <주소>/<키>` → `206`, `Content-Range: bytes 0-1/<크기>`
2. `curl -sI -H 'Range: bytes=0-' <주소>/<키>` → `206`, `Content-Range: bytes 0-<크기-1>/<크기>`
3. `curl -sI -H 'Range: bytes=-100' <주소>/<키>` → `206`, 마지막 100바이트
4. `curl -sI -H 'Range: bytes=999999999-' <주소>/<키>` → `416`

---

### N4. 관리자 화면에서 무시된 OPEN이 기록을 쌓음 — P3
**문제**: `src/hooks/useHashRoute.ts`의 `navigate`는 `action.type === 'OPEN'`이면 무조건 `pushState({ mcOverlay: true }, …)`를 호출합니다. 그런데 `navReducer`는 관리자 영역(`area !== 'member'`)에서 OPEN을 무시하고 `history: 'none'`을 돌려줍니다. 그 결과 라우트는 그대로인데 뒤로 가기 기록만 하나 쌓입니다.

**수정**: OPEN 분기를 `if (action.type === 'OPEN' && historyAction === 'push')`로 바꾼다. `historyAction === 'none'`이면 history도 `setRoute`도 호출하지 않는다.

**테스트**: 관리자 영역(`#/admin`)에서 OPEN → `pushState` 미호출, 라우트 변화 없음.

---

### N3. 상세 시트 선택 유지 테스트 보강 — P2
**문제**: `src/components/ScheduleDetailSheet.test.tsx`의 `'preserves single schedule direct render across new array reference rerenders'`는 `renderToString`을 두 번 호출합니다. 이건 **서로 다른 두 번의 첫 렌더**라서, 사용자가 고른 일정이 다시 그릴 때 유지되는지(C7의 원래 버그)는 검사하지 못합니다.

**수정**: 같은 파일에 테스트 2개를 **추가**한다(기존 테스트는 지우지 않는다). `src/App.test.tsx`가 쓰는 `createRoot` + `act` 방식을 그대로 복사한다.
1. `'keeps the user-picked schedule when schedules are re-sent as a new array'`
   - 같은 날짜에 일정 2개를 넘겨 렌더 → 목록이 보임
   - 두 번째 일정 버튼 클릭 → 두 번째 일정 상세가 보임
   - **같은 내용의 새 배열**(`[...schedules]`)로 다시 렌더 → 여전히 두 번째 일정 상세가 보임
2. `'returns to the list when the picked schedule disappears'`
   - 위와 같이 두 번째를 고른 뒤, 두 번째를 뺀 배열(일정 1개만 남음)로 다시 렌더 → 남은 1개의 상세가 보임(일정이 1개면 바로 상세라는 기존 규칙)

**완료 조건**: 두 테스트가 현재 구현에서 통과한다. 통과하지 않으면 구현 버그이므로 멈추고 보고한다.

---

### N2. 린트 경고 끄기 주석 정리 — P2
**문제**: PR #20에서 린트 경고 0개를 만들면서, 경고를 고치지 않고 끄는 주석을 10곳에 추가했습니다. 지난 지시서가 금지한 방식입니다.

**원칙**: **운영 코드에는 0개.** 테스트 파일에서 전역 객체를 모의하느라 꼭 필요한 경우만, 주석 바로 위에 이유를 한 줄 적고 남길 수 있다.

| 파일 | 현재 주석 | 처리 |
|---|---|---|
| `src/components/QRScannerModal.tsx` 39행 부근 | `eslint-disable-next-line react-hooks/exhaustive-deps` | **제거.** "마운트 시 1회 일시정지"를 `const pausedOnceRef = useRef(false)`로 구현: effect 안에서 `if (!pausedOnceRef.current) { pausedOnceRef.current = true; audioPlayer?.pause(); }`, 의존성 `[audioPlayer]`. `audioPlayer` 객체가 바뀌어도 다시 멈추지 않는다 |
| `src/components/CalendarTab.tsx` 53행 부근 | `oxlint-disable-next-line react/set-state-in-effect` | **제거.** 라우트의 `month`가 바뀔 때 state를 맞추는 effect를 없앤다. 표시할 연·월은 **렌더 중 계산**: `routeMonth`가 올바르면 그 값, 아니면 내부 state. 월 이동 버튼은 내부 state를 바꾸는 대신 `onNavigate({ type: 'TAB', tab: 'calendar', month })`로 라우트를 바꾸는 방식으로 통일한다. 이 방식이 `navReducer`의 TAB/month 처리와 맞지 않으면 **멈추고 보고** |
| `src/components/StudioTab.tsx` 38행 부근 | `oxlint-disable-next-line react/set-state-in-effect` | **제거.** 탭을 바꾸면 컴포넌트가 새로 마운트되므로 `isLoading` 초기값을 `backendKind !== 'gas'`로 두고, effect 안의 `setIsLoading(true)` 줄을 삭제한다(완료·실패 시 `false`로 바꾸는 코드는 유지) |
| `src/components/audio/AudioPlayerProvider.tsx` 51·60·65행 (3개) | `oxlint-disable-next-line react/only-export-components` | **제거.** 컴포넌트 파일에서 훅을 함께 내보내서 생기는 경고다. 컨텍스트 객체와 훅(`useAudioPlayer`, `useOptionalAudioPlayer`, `useAudioPosition`)을 새 파일 `src/components/audio/audioPlayerContext.ts`로 옮기고, Provider 파일은 컴포넌트만 내보낸다. 기존 import 경로를 쓰는 파일(App, StudioTab, MiniPlayer, QRScannerModal, 테스트 등)을 **전부** 새 경로로 바꾼다. `grep -rn "from './components/audio/AudioPlayerProvider'\|from '../audio/AudioPlayerProvider'\|from './audio/AudioPlayerProvider'\|from './AudioPlayerProvider'" src`로 빠짐없이 찾는다 |
| `src/components/audio/AudioPlayer.test.tsx` (3개) | `react/refs`, `react/globals` 등 | ref 읽기는 effect 안에서 하도록 고쳐서 제거한다. 전역 모의 때문에 꼭 필요한 것만 이유 주석과 함께 남긴다 |
| `src/hooks/useMasterEntryGesture.test.ts` (1개) | `react/globals` | 꼭 필요하면 이유 주석과 함께 남긴다. 아니면 제거 |

**검증**: 아래 명령 결과를 보고한다. 운영 코드(테스트 파일 제외) 결과는 **0줄**이어야 한다.
```bash
grep -rn "eslint-disable\|oxlint-disable" src --include=*.ts --include=*.tsx | grep -v "\.test\."
```
`npm run lint` 경고 0개를 유지한다.

---

## 4. 하지 말 것 (이번 작업 한정)
- `supabase/migrations/` 아래 파일 수정·추가 (이번 작업에는 DB 변경이 없다)
- `fn_save_config`, `SuperAdminDashboard`의 PIN 변경 로직 수정 (리뷰어가 DB에서 고침)
- 관리자 PIN 길이 규칙 변경
- PR #14~#17 브랜치 수정, PR 머지, `npm run deploy`, 운영 DB 실행
- 이 문서에 없는 리팩터링·기능 추가

## 5. 참고: 최고관리자 PIN이 바뀌지 않던 원인 (리뷰어가 처리함)
- 운영 DB의 설정 저장 함수가 예전 버전이라 `superAdminPin`을 비밀값 테이블(`app_secrets`)이 아니라 **공개 설정 테이블(`app_config`)**에 저장했습니다. 화면에는 "변경 완료"가 뜨지만, 로그인은 계속 비밀값 테이블의 옛 PIN을 읽었습니다. 입력한 값은 공개 키로 읽을 수 있는 곳에 남았습니다.
- 수정 파일 `20261122020000_fix_save_config_secret_routing.sql`이 하는 일:
  1. 저장 함수(`__impl`)를 고쳐 4개 비밀 키를 모두 비밀값 테이블로 보냅니다.
  2. 공개 테이블에 새어 나간 비밀 키를 지웁니다.
  3. 앞으로 공개 테이블에 비밀 키가 들어오면 거부하는 트리거를 추가합니다.
- 부작용: 시트→Supabase 일괄 이관 함수(`fn_import_sheets_snapshot`, service_role 전용)는 `superAdminPin`을 공개 테이블에 넣으려 하므로, 시트에 그 키가 있으면 이제 오류로 멈춥니다. 이관은 끝난 작업이라 지금은 영향이 없습니다. 다시 이관할 일이 생기면 그때 고칩니다.

## 6. 마무리 (마지막 커밋)
1. `docs/DEV_LOG.md`에 N1~N4 요약(문제와 해결 한 줄씩)을 추가한다.
2. `docs/plans/16b_execution_plan.md`의 "리뷰 후속 수정" 섹션에 N1~N4 상태를 추가한다.
3. **`check.md`를 삭제한다**(`git rm check.md`). 커밋 메시지: `docs: record second review follow-ups (N1-N4) and remove check.md`
4. `fix/review-followups`를 푸시한다(PR #20에 반영). **머지하지 않는다.**
5. 보고: N1~N4 표(ID / 결과 / 커밋 해시), §3 N2 검증 명령 결과, `npm test`에서 `workers/media/index.test.js`가 실행됐는지 여부.
