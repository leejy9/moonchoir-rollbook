/**
 * 서버 시각 문자열(UTC ISO 또는 Postgres timestamptz 실시간 문자열)을 epoch ms로 해석한다.
 * 공백 구분자, `+00`, `+00:00`, `Z`, 소수 6자리(마이크로초)를 지원한다.
 * 잘못된 값이거나 빈 값이면 NaN을 반환한다.
 */
export function parseServerTimeMs(text?: string | null): number {
  if (!text) return NaN;
  const trimmed = text.trim();
  if (!trimmed) return NaN;

  // 예: 2026-11-27 02:30:00.123456+00:00 -> 2026-11-27T02:30:00.123Z
  const match =
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)?$/.exec(
      trimmed
    );
  if (!match) return NaN;

  const [, datePart, timePart, fracPart, tzPart] = match;
  if (!tzPart) return NaN; // 시간대 없는 문자열은 서버 시각으로 취급하지 않음

  const msPart = fracPart ? `.${fracPart.slice(0, 3).padEnd(3, '0')}` : '';
  let normalizedTz = tzPart;
  if (tzPart === '+00' || tzPart === '+00:00' || tzPart === '+0000') {
    normalizedTz = 'Z';
  } else if (/^[+-]\d{2}$/.test(tzPart)) {
    normalizedTz = `${tzPart}:00`;
  } else if (/^[+-]\d{4}$/.test(tzPart)) {
    normalizedTz = `${tzPart.slice(0, 3)}:${tzPart.slice(3)}`;
  }

  return Date.parse(`${datePart}T${timePart}${msPart}${normalizedTz}`);
}
