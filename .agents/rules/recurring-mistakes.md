---
trigger: always_on
---

# 반복 실수 금지 (Moonchoir Rollbook)

이 저장소에서 **실제로 여러 번 반려된 실수**만 모았다. 전체 기록과 근거는 `docs/agent/LESSONS.md`에 있다.
아래 항목은 GitHub CI(`.github/workflows/ci.yml`)가 자동으로 검사한다. CI가 빨간불이면 보고하지 말고 먼저 고친다.

1. **DB 이름을 지어내지 않는다.** SQL(마이그레이션·검증 스크립트)에 쓰는 테이블·열·함수 이름은 모두 `supabase/migrations/`에서 `grep`으로 찾아 확인한다. 예: `practice_program_pieces`의 열은 `program_id`다(`card_id` 아님). `app_config`에는 `id`, `admin_hash` 열이 없다. 관리자 토큰이 필요하면 `admin_sessions`에 `fn_admin_token_hash('32자 이상')`으로 행을 넣는다.
2. **운영 DB에 SQL을 실행하지 않고, 사용자에게 실행을 요청하지도 않는다.** 마이그레이션 파일만 커밋한다. 적용은 리뷰어가 한다.
3. **실행하지 않은 결과를 쓰지 않는다.** 시험·명령을 실제로 실행하지 않았거나 결과를 확인할 수 없으면 "미실행"이라고 쓴다. 존재하지 않는 주소(예: `media.moonchoir.org`)로 시험했다고 쓰면 PR 전체를 반려한다.
4. **기존 SQL 함수는 가장 최신 정의를 복사해서 필요한 줄만 바꾼다.** 처음부터 다시 쓰지 않는다. 복사 원본(파일:행)과 diff를 보고한다.
5. **오류를 숨기지 않는다.** 운영 코드에 `as any`, `: any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, `oxlint-disable`, 빈 `catch`, 테스트 `skip`/`only`를 새로 넣지 않는다. 라이브러리 타입을 쓴다.
6. **테스트는 실제 결과를 검사한다.** "함수가 불렸다"만 보지 말고 "무엇이 저장·표시됐는가"를 검사한다. 버그 수정은 수정 전에 실패하는 것을 먼저 확인한다.
7. **저장 후 화면을 다시 불러오는 것을 잊지 않는다.** 업로드·저장·삭제가 끝나면 목록을 갱신한다. 부분 데이터로 저장할 때는 최신 값을 펼친 뒤 바꿀 필드만 바꾼다(빈 값으로 덮어쓰기 금지).
8. **CSS는 `src/index.css`에 정의된 변수만 쓴다.** `--color-*` 이름 금지, 컴포넌트에 hex 직접 쓰기 금지. 새 화면 스타일은 `src/styles/v3/*.css`.
9. **새 파일 400줄 이하**, `src/index.css`·`src/services/sheets.ts`에 로직·스타일을 쌓지 않는다.
10. **범위 밖 수정·설치·머지·배포를 하지 않는다.** 승인되지 않은 npm 패키지, `package.json` 수동 수정, PR 머지, `npm run deploy` 금지.

보고하기 전에는 반드시 `/report-ready` 워크플로를 실행한다.
