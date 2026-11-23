#!/usr/bin/env bash
# 반복된 실수를 기계적으로 막는 검사 (docs/agent/LESSONS.md 참고).
# 기준 브랜치 대비 "이번에 바뀐 줄·파일"만 검사한다(예전 코드는 대상 아님).
# 사용: BASE_REF=origin/main ./scripts/ci/guards.sh
set -uo pipefail

BASE_REF="${BASE_REF:-origin/main}"
BASE="$(git merge-base "$BASE_REF" HEAD)"
fail=0
report() { echo "FAIL [$1] $2"; fail=1; }

is_prod_code() {   # 테스트·타입 선언이 아닌 운영 코드
  [[ "$1" =~ \.(ts|tsx|js|mjs)$ ]] && [[ ! "$1" =~ \.test\.|/__tests__/|\.d\.ts$|^scripts/ ]]
}

changed="$(git diff --name-only --diff-filter=AM "$BASE" HEAD)"
added="$(git diff --name-only --diff-filter=A "$BASE" HEAD)"

# R9: 오류 숨기기 금지 (운영 코드에 새로 추가된 줄)
for f in $changed; do
  is_prod_code "$f" || continue
  git diff -U0 "$BASE" HEAD -- "$f" | grep -E '^\+[^+]' | grep -nE 'as any\b|:\s*any\b|<any>|eslint-disable|oxlint-disable|@ts-ignore|@ts-expect-error' \
    | while read -r line; do echo "FAIL [R9 오류 숨기기] $f: $line"; done
done | tee /tmp/guards-r9.txt
[[ -s /tmp/guards-r9.txt ]] && fail=1

# R9/R10: 테스트 건너뛰기·단독 실행 금지 (테스트 파일)
for f in $changed; do
  [[ "$f" =~ \.test\.(ts|tsx|js)$ ]] || continue
  git diff -U0 "$BASE" HEAD -- "$f" | grep -E '^\+[^+]' | grep -nE '\b(it|test|describe)\.(skip|only|todo)\b|\bx(it|describe)\(' \
    | while read -r line; do echo "FAIL [R9 테스트 건너뛰기] $f: $line"; done
done | tee /tmp/guards-skip.txt
[[ -s /tmp/guards-skip.txt ]] && fail=1

# R20: 새 운영 코드 파일은 400줄 이하
for f in $added; do
  is_prod_code "$f" || continue
  [[ -f "$f" ]] || continue
  n=$(wc -l < "$f")
  (( n > 400 )) && report "R20 파일 크기" "$f: ${n}줄 (새 파일 400줄 이하)"
done

# R21: src/index.css에는 디자인 토큰만 추가 (이번 변경에서 순증 40줄 초과 금지)
if git diff --name-only "$BASE" HEAD | grep -qx 'src/index.css'; then
  plus=$(git diff --numstat "$BASE" HEAD -- src/index.css | awk '{print $1-$2}')
  (( plus > 40 )) && report "R21 index.css" "순증 ${plus}줄. 새 화면 스타일은 src/styles/v3/*.css에 둔다"
fi

# 라이브러리 전제 조건: pdf.js 공식 뷰어는 불러오기 전에 globalThis.pdfjsLib 등록이 필요하다
# (등록 없이 import하면 TypeError. 테스트 환경엔 DOM이 없어 단위 테스트로는 못 잡는다 — LESSONS 2026-11-22)
for f in $(git ls-files 'src/*.ts' 'src/*.tsx' | grep -v '\.test\.'); do
  if grep -q "pdfjs-dist/web/pdf_viewer" "$f" && ! grep -qE "globalThis[^;]*pdfjsLib[^=]*=" "$f"; then
    report "라이브러리 전제" "$f: pdf_viewer를 불러오기 전에 globalThis.pdfjsLib = pdfjs 를 등록해야 한다"
  fi
done

# 규칙 11: 출결 상태는 buildMemberScheduleRecords 결과만 쓴다 (LESSONS 2026-11-23, V3-20 R2)
# 엔진 내부(attendanceStats.ts), 레코드 조립(memberRecords.ts) 외에서 새로 직접 호출 금지.
for f in $changed; do
  is_prod_code "$f" || continue
  [[ "$f" =~ src/utils/attendanceStats\.ts$|src/utils/memberRecords\.ts$ ]] && continue
  git diff -U0 "$BASE" HEAD -- "$f" | grep -E '^\+[^+]' | grep -nE 'reconcileSingleMemberAttendance\(' \
    | while read -r line; do echo "FAIL [규칙 11 출결 직접 계산] $f: $line → buildMemberScheduleRecords 결과를 쓴다"; done
done | tee /tmp/guards-reconcile.txt
[[ -s /tmp/guards-reconcile.txt ]] && fail=1

# 규칙 12: 시간대 없는 KST 문자열을 ::timestamptz로 바로 읽지 않는다 (LESSONS 2026-11-23, V3-20 R4)
for f in $changed; do
  [[ "$f" =~ ^supabase/(migrations|tests)/.*\.sql$ ]] || continue
  git diff -U0 "$BASE" HEAD -- "$f" | grep -E '^\+[^+]' | grep -E '::timestamptz' | grep -vE "tz-checked|at time zone|[+-][0-9]{2}(:[0-9]{2})?'::timestamptz|Z'::timestamptz" \
    | while read -r line; do echo "FAIL [규칙 12 시간대] $f: $line → ::timestamp at time zone 'Asia/Seoul' 또는 -- tz-checked(이유)"; done
done | tee /tmp/guards-tz.txt
[[ -s /tmp/guards-tz.txt ]] && fail=1

# R18: 패키지 파일 변경은 사람이 확인 (실패는 아님)
if git diff --name-only "$BASE" HEAD | grep -qE '^package(-lock)?\.json$'; then
  echo "NOTE [R18] package.json / package-lock.json이 바뀌었다. 승인된 패키지인지 리뷰어가 확인한다."
fi

if (( fail )); then echo "== guards: 실패"; exit 1; fi
echo "== guards: 통과"
