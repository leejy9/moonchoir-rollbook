/** 연도 선택 범위: 올해 기준 30년 전 ~ 2년 뒤. 보고 있는 연도가 범위 밖이면 그 연도도 넣는다. */
const YEARS_BACK = 30;
const YEARS_AHEAD = 2;

export function buildYearOptions(currentYear: number, viewYear: number): number[] {
  const start = Math.min(currentYear - YEARS_BACK, viewYear);
  const end = Math.max(currentYear + YEARS_AHEAD, viewYear);
  const years: number[] = [];
  for (let y = end; y >= start; y -= 1) years.push(y);
  return years;
}
