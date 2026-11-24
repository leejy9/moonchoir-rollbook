/** 연도 선택 범위: 올해 기준 30년 전 ~ 2년 뒤. 보고 있는 연도가 범위 밖이면 그 연도도 넣는다. 오래된 순. */
const YEARS_BACK = 30;
const YEARS_AHEAD = 2;

export function buildYearOptions(currentYear: number, viewYear: number): number[] {
  const start = Math.min(currentYear - YEARS_BACK, viewYear);
  const end = Math.max(currentYear + YEARS_AHEAD, viewYear);
  const years: number[] = [];
  for (let y = start; y <= end; y += 1) years.push(y);
  return years;
}

/**
 * 직접 입력한 날짜를 'YYYY-MM-DD'로 바꾼다. 없는 날짜(2월 30일 등)나 해석할 수 없으면 null.
 * 받는 모양: 2024-03-14, 2024.3.14, 2024. 3. 14., 2024/03/14, 20240314
 */
export function parseDateInput(raw: string): string | null {
  const text = raw.trim();
  let m = text.match(/^(\d{4})[-./\s]+(\d{1,2})[-./\s]+(\d{1,2})\.?$/);
  if (!m) m = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return null;
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (d > daysInMonth) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
