---
description: 작업 완료 보고 전에 실제 명령을 실행하고 그 출력을 그대로 붙인다
---

# /report-ready — 보고 전 점검

결과를 요약하거나 지어내지 않는다. 아래 명령을 **실제로 실행**하고, 각 출력의 마지막 몇 줄을 **그대로** 보고서에 붙인다. 실행할 수 없는 단계는 "미실행 — 이유"라고 쓴다.

1. Green Bar
   ```bash
   npm run typecheck && npm run lint && npm test && npm run build
   ```
2. 반복 실수 검사 (기준 브랜치는 PR의 대상 브랜치)
   ```bash
   BASE_REF=origin/<PR 대상 브랜치> ./scripts/ci/guards.sh
   ```
3. DB 검사 (로컬에 PostgreSQL이 있을 때만. 없으면 "미실행 — 로컬 PostgreSQL 없음, CI에서 확인")
   ```bash
   PGHOST=... PGPORT=... PGUSER=... PGDATABASE=<빈 DB> ./scripts/ci/db-check.sh
   ```
4. SQL을 고쳤다면, 쓴 테이블·열·함수 이름마다 정의 위치를 찾은 명령과 결과를 붙인다.
   ```bash
   grep -n "<이름>" supabase/migrations/*.sql
   ```
5. 푸시 후 GitHub PR 화면의 CI 결과(초록·빨강)를 적는다. 빨간불이면 보고하지 말고 고친다.
6. `.agents/rules/recurring-mistakes.md`의 10개 항목을 하나씩 확인하고, 해당 없음·지킴·어김을 적는다.
