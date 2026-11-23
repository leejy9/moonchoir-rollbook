# v3 배포 절차서 (2026-11-24 아침)

> 작성: 리뷰어(Claude), 2026-11-23 밤. **이 문서의 순서·명령·기대값을 그대로 따른다.** 기대값과 다르면 그 자리에서 멈추고 사용자에게 보고한다(추측해서 고치지 않는다).
> 실행자가 누구든 `AGENTS.md`와 `.agents/rules/recurring-mistakes.md`를 먼저 읽는다.

## 0. 누가 무엇을 하나

| 단계 | Claude(Supabase 커넥터 있음) | Antigravity·Copilot 등 개발 에이전트 |
|---|---|---|
| 1. 사전 점검 | 함 | 함(DB 점검 1-4는 건너뛰고 "미실행"으로 적음) |
| 2. 코드 합치기 | 함 | 함 |
| **3. 운영 DB 적용** | **함** | **하지 않음.** 멈추고 사용자에게 "3단계는 Claude에게 맡겨 주세요"라고 보고 |
| 4. 앱 배포 | 함(맥에서 실행) | 함 |
| 5. 배포 확인 | 함 | 함(DB 확인 5-4는 "미실행") |
| 6. 보고 | 함 | 함 |

- 운영 DB에는 **저장소에 커밋된 마이그레이션 파일 원본만** 적용한다. 채팅으로 만든 SQL을 운영에 넣지 않는다. 아래의 점검 쿼리는 전부 **읽기 전용(select)**이다.
- 명령은 사용자 맥의 프로젝트 폴더(`~/Desktop/Antigravity/Moonchoir_rollbook`)에서 실행한다. `gh`, `git push`, `npm run deploy`는 사용자 맥의 로그인을 쓴다.
- 이 절차서가 기준으로 삼는 값(2026-11-23 밤):
  - `feat/v3-activity-2` 최신 커밋: `1954821db2d181078e6290a8e5ce1b38094f8706`
  - 적용할 마이그레이션: `supabase/migrations/20261124010000_v3_record_guards.sql`, sha256 `df5302562a5e69d8cf5e7b018d3fa6c6c2a3fa42b806650e04951bbbbae517e6`
  - 배포 주소: `https://leejy9.github.io/moonchoir-rollbook/`

---

## 1. 사전 점검 (아무것도 바꾸지 않음)

```bash
git fetch origin
git rev-parse origin/feat/v3-activity-2
git merge-tree --write-tree origin/main origin/feat/v3-activity-2 > /dev/null && echo NO_CONFLICT
gh pr checks 46
git status --short
```

| # | 기대값 | 다르면 |
|---|---|---|
| 1-1 | `rev-parse`가 `1954821db2d1…f8706` | 밤사이 누가 푸시했다. 멈추고 보고(새 커밋 목록 `git log --oneline 1954821..origin/feat/v3-activity-2` 첨부) |
| 1-2 | `NO_CONFLICT` 출력 | 멈추고 보고 |
| 1-3 | PR #46 체크 6개 모두 pass | 멈추고 보고 |
| 1-4 | `git status --short` 출력 없음(작업 트리 깨끗) | 멈추고 보고. 남은 변경을 지우지 않는다 |

**1-5 (Claude만) 운영 DB 상태** — Supabase 커넥터 `execute_sql`, 읽기 전용:

```sql
select json_build_object(
 'activity_fn', (select count(*) from pg_proc where proname = 'fn_get_member_activity'),
 'guards_applied', (select position('SCHEDULE_HAS_RECORDS' in prosrc) > 0 from pg_proc where proname = 'fn_delete_schedule__impl' limit 1),
 'impl_count', (select count(*) from pg_proc where proname in ('fn_delete_schedule__impl','fn_batch_delete_schedules__impl','fn_delete_member__impl','fn_merge_members__impl')),
 'members_active', (select count(*) from members where status = 'ACTIVE'),
 'schedules', (select count(*) from schedules),
 'logs', (select count(*) from attendance_logs),
 'votes', (select count(*) from rsvp_votes)
) r;
```

기대값: `activity_fn = 1`, `guards_applied = false`, `impl_count = 4`. 나머지 숫자는 **적어 둔다**(5단계에서 비교). `guards_applied`가 `true`면 이미 적용된 것이니 3단계를 건너뛴다. `impl_count`가 4가 아니면 멈춘다.

---

## 2. 코드 합치기

```bash
gh pr create --base main --head feat/v3-activity-2 \
  --title "release: v3 (홈·연습실·플레이어·내 활동·운영진 연습곡)" \
  --body "v3 전체 배포. 포함: PR #14~#20, #27, #45, #46의 모든 커밋. 절차: docs/DEPLOY_RUNBOOK_v3.md"
```

- 만든 PR 번호를 적는다. `gh pr checks <번호> --watch`로 3개 체크가 모두 pass가 될 때까지 기다린다. 실패하면 멈추고 보고한다(고치려 하지 않는다).
- **사용자에게 "PR #<번호> CI 통과, 합쳐도 될까요?"라고 묻고, 승인을 받은 뒤에만** 합친다:

```bash
gh pr merge <번호> --merge
git fetch origin && git log --oneline -1 origin/main
```

- 기대값: `origin/main` 최신 커밋 메시지가 `Merge pull request #<번호> from leejy9/feat/v3-activity-2`.
- 옛 PR(#14, #15, #16, #17, #20, #27, #45, #46)은 **이 단계에서 닫지 않는다.** 배포 확인(5단계)이 끝난 뒤 6단계에서 처리한다.

---

## 3. 운영 DB 적용 — **Claude만**

> Antigravity·Copilot이면 여기서 멈추고 사용자에게 보고한다: "2단계까지 끝났습니다. 3단계(운영 DB 적용)는 Supabase 커넥터가 있는 Claude가 해야 합니다."
> 1-5에서 `guards_applied = true`였으면 이 단계를 건너뛴다.

3-1. main에 들어간 파일이 기준 파일과 같은지 확인한다.

```bash
git show origin/main:supabase/migrations/20261124010000_v3_record_guards.sql | shasum -a 256
```

기대값: `df5302562a5e69d8cf5e7b018d3fa6c6c2a3fa42b806650e04951bbbbae517e6`. **다르면 멈춘다**(밤사이 파일이 바뀜. 리뷰어 검토 필요).

3-2. 위 파일의 **내용 전체를 한 글자도 바꾸지 않고** 커넥터 `apply_migration`으로 적용한다. `name`은 `v3_record_guards`.

3-3. 적용 후 확인(읽기 전용):

```sql
select json_build_object(
 'del_guard', (select position('SCHEDULE_HAS_RECORDS' in prosrc) > 0 from pg_proc where proname = 'fn_delete_schedule__impl' limit 1),
 'batch_guard', (select position('SCHEDULE_HAS_RECORDS' in prosrc) > 0 from pg_proc where proname = 'fn_batch_delete_schedules__impl' limit 1),
 'batch_ids', (select position('''ids''' in prosrc) > 0 from pg_proc where proname = 'fn_batch_delete_schedules__impl' limit 1),
 'merge_guard', (select position('INVALID_MERGE' in prosrc) > 0 from pg_proc where proname = 'fn_merge_members__impl' limit 1),
 'merge_canonical', (select position('canonicalId' in prosrc) > 0 from pg_proc where proname = 'fn_merge_members__impl' limit 1),
 'anon_can_exec_impl', (select bool_or(has_function_privilege('anon', p.oid, 'execute')) from pg_proc p where proname in ('fn_delete_schedule__impl','fn_batch_delete_schedules__impl','fn_delete_member__impl','fn_merge_members__impl')),
 'wrappers', (select count(*) from pg_proc where proname in ('fn_delete_schedule','fn_batch_delete_schedules','fn_delete_member','fn_merge_members')),
 'members_active', (select count(*) from members where status = 'ACTIVE'),
 'schedules', (select count(*) from schedules),
 'logs', (select count(*) from attendance_logs),
 'votes', (select count(*) from rsvp_votes)
) r;
```

기대값: `del_guard`, `batch_guard`, `batch_ids`, `merge_guard`, `merge_canonical` 모두 `true` / `anon_can_exec_impl = false` / `wrappers = 4` / 숫자 4개가 1-5와 **같다**(적용이 데이터를 건드리지 않음).

3-4. 토큰 없는 호출이 막히는지(데이터 변경 없음 — 없는 id로 호출):

```sql
select fn_delete_schedule('{"id":"__runbook_nonexistent__"}'::jsonb) as r;
```

기대값: 결과에 `ADMIN_AUTH_REQUIRED`가 들어 있다.

하나라도 다르면 **멈추고 리뷰어를 부른다.** 되돌리기 SQL을 직접 만들지 않는다. (이 변경은 삭제·병합을 더 엄격하게 할 뿐 기존 데이터를 바꾸지 않으므로, 멈춘 채로 두어도 데이터가 망가지지 않는다.)

3-5. `docs/ARCHITECTURE_RECOVERY.md` 끝에 적용 기록을 남길 내용(커밋은 6단계에서 한 번에): 적용 시각, 파일 sha256, 3-3 결과 요약.

---

## 4. 앱 배포 (사용자 맥)

```bash
git checkout main
git pull --ff-only
npm ci
npm run typecheck && npm run lint && npm test
npm run deploy
```

| 기대값 | 다르면 |
|---|---|
| `git pull`이 2단계의 merge 커밋까지 받음(`git log --oneline -1`) | 멈춤 |
| typecheck·lint 오류 0, `npm test` 전부 통과(2026-11-23 기준 테스트 파일 129개) | 멈춤. 배포하지 않는다 |
| `npm run deploy` 마지막에 `Published` | 멈추고 오류 전문 보고 |

- `main`이 아닌 브랜치에서 `npm run deploy`를 실행하지 않는다.
- 배포 후 GitHub Pages 반영까지 1~3분 걸릴 수 있다.

---

## 5. 배포 확인

5-1. 새 버전이 올라갔는지(3분 뒤):

```bash
curl -s https://leejy9.github.io/moonchoir-rollbook/ | grep -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1
ls dist/assets | grep -o 'index-[A-Za-z0-9_-]*\.js' | head -1
```

기대값: 두 줄의 파일 이름이 같다. 다르면 3분 더 기다렸다가 한 번 더. 그래도 다르면 보고.

5-2. 사용자에게 휴대폰에서 아래를 확인해 달라고 요청한다(실행자가 직접 못 하면 "사용자 확인 대기"로 적는다).

- [ ] 앱이 열리고 아래 탭이 **홈 / 연습실 / 내 활동** 3개다
- [ ] 홈: 오늘·다음 일정 카드, 주간/월간 전환
- [ ] 연습실: 공연을 고르면 곡 목록과 "전체 재생" 버튼, 음원 재생, 미니 플레이어
- [ ] 곡 상세: 악보 열기(쪽 넘김·두 손가락 확대)
- [ ] 내 활동: 레벨·출석률·열정 온도·칭찬 스티커가 보이고 가로로 잘리지 않음
- [ ] 출석 체크(QR 또는 PIN) 한 번 — **오늘 일정이 있을 때만**
- [ ] 운영진: 연습곡 탭에서 곡·공연 목록이 보임(새로 만들거나 지우지는 않는다)

5-3. 문제가 보이면 **되돌리지 말고** 증상·화면을 보고한다. 앱이 아예 열리지 않는 경우에만 사용자 승인 후 이전 버전으로 되돌린다:

```bash
git checkout <2단계 직전 main 커밋>   # 1단계에서 적어 둔 origin/main 값
npm ci && npm run deploy
git checkout main
```

5-4. (Claude만) 활동 조회가 운영에서 되는지:

```sql
select jsonb_typeof(fn_get_member_activity(array['__runbook_nonexistent__'])->'rsvpEvents') as t;
```

기대값: `array`.

---

## 6. 마무리와 보고

6-1. 3-5의 적용 기록을 `docs/ARCHITECTURE_RECOVERY.md`에 추가해 별도 브랜치로 PR을 만들고, CI 통과 후 사용자 승인을 받아 합친다(Claude만. 개발 에이전트면 건너뜀).

6-2. 옛 PR 정리: 사용자에게 "옛 PR #14, #15, #16, #17, #20, #27, #45, #46을 '릴리스 PR #<번호>에 포함됨'으로 닫을까요?"라고 묻고, 승인받으면 닫는다.

```bash
gh pr close 46 --comment "릴리스 PR #<번호>에 포함되어 main에 반영됨."
```

6-3. 사용자에게 아래 형식으로 보고한다.

```
[배포 결과]
- 1 사전 점검: 통과 / (멈춘 경우 이유)
- 2 코드 합치기: PR #__ 머지 커밋 ______
- 3 운영 DB: 적용 / 건너뜀 / 미실행(개발 에이전트) — 3-3 결과
- 4 앱 배포: Published, 테스트 __개 통과
- 5 확인: 번들 파일명 일치 여부, 사용자 확인 항목
- 남은 일: 단원 공지, (있으면) 이상 증상
```

---

## 부록 A. 단원 공지 초안 (사용자가 보냄)

> 문콰이어 출석부 앱이 새로 바뀌었어요!
> - **홈:** 오늘 일정과 이번 주·이번 달 일정을 한 화면에서 봐요.
> - **연습실:** 공연별 연습곡과 파트 음원을 듣고, 악보도 앱 안에서 바로 열어요. 공연 곡을 순서대로 "전체 재생"할 수도 있어요.
> - **내 활동:** 레벨, 출석률, 열정 온도, 칭찬 스티커를 볼 수 있어요.
>
> 안내: 지각 판정 기준을 바로잡으면서, 그동안 출석으로 잘못 보이던 일부 기록이 **지각**으로 표시될 수 있어요. 기록이 이상하면 운영진에게 알려 주세요.
> 앱이 예전 화면으로 보이면 한 번 새로고침해 주세요.

## 부록 B. 하지 않는 것
- 테스트로 만든 곡·공연·일정 데이터 삭제(사용자가 따로 지시할 때만)
- 이 절차서에 없는 운영 DB 변경, 마이그레이션 수정
- 실패한 단계를 추측으로 고치기
