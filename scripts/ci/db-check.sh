#!/usr/bin/env bash
# DB 변경 파일과 검증 스크립트를 빈 PostgreSQL에서 실제로 실행한다.
# - 모든 마이그레이션을 파일명 순서대로 적용한다(오류 즉시 중단).
# - RERUN_FROM(기본 20261123000000, v3부터) 이후 마이그레이션은 한 번 더 적용해
#   다시 실행해도 안전한지 확인한다. 그 이전 파일은 운영에 이미 한 번 적용된 기록이라 제외한다.
# - supabase/tests/*.sql 검증 스크립트를 전부 실행한다(오류 즉시 중단).
# 사용: PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE 환경 변수를 설정한 뒤 실행.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PSQL=(psql -v ON_ERROR_STOP=1 -q -X)

echo "== Supabase 기본 역할·확장 준비"
"${PSQL[@]}" <<'SQL'
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
create schema if not exists extensions;
create extension if not exists pgcrypto;
SQL

shopt -s nullglob
migrations=("$ROOT"/supabase/migrations/*.sql)
tests=("$ROOT"/supabase/tests/*.sql)

RERUN_FROM="${RERUN_FROM:-20261123000000}"

apply() {
  local f="$1" label="$2"
  echo "  - $(basename "$f")"
  "${PSQL[@]}" -f "$f" >/dev/null 2>/tmp/db-check.err || { grep -v '^NOTICE' /tmp/db-check.err; echo "FAIL: $(basename "$f") ($label)"; exit 1; }
}

echo "== 마이그레이션 적용 (전체)"
for f in "${migrations[@]}"; do apply "$f" "1회차"; done

echo "== 다시 실행해도 안전한지 확인 (${RERUN_FROM} 이후)"
for f in "${migrations[@]}"; do
  name="$(basename "$f")"
  if [[ "${name:0:14}" > "$RERUN_FROM" || "${name:0:14}" == "$RERUN_FROM" ]]; then apply "$f" "2회차"; fi
done

echo "== 검증 스크립트 실행"
failed=0
for t in "${tests[@]}"; do
  if "${PSQL[@]}" -f "$t" >/dev/null 2>/tmp/db-check.err; then
    echo "  PASS $(basename "$t")"
  else
    echo "  FAIL $(basename "$t")"
    grep -v '^NOTICE' /tmp/db-check.err | head -20
    failed=1
  fi
done
exit $failed
