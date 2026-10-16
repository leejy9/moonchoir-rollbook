import { describe, it, expect } from 'vitest';
import { formatMatrixHeaderDate, normalizeDateToYYYYMMDD } from './date';

describe('formatMatrixHeaderDate', () => {
  it('YYYY-MM-DD 형식을 10/08 (목) 형식으로 올바르게 변환한다', () => {
    // 2026년 10월 8일은 목요일
    const result = formatMatrixHeaderDate('2026-10-08');
    expect(result.dateLabel).toBe('10/08');
    expect(result.dayLabel).toBe('(목)');
    expect(result.fullDate).toBe('2026-10-08');
  });

  it('구글 시트의 UTC ISO 문자열을 KST 기준 10/08 (목)으로 올바르게 변환한다', () => {
    // 2026-10-07T15:00:00.000Z 는 한국 시간(UTC+9)으로 2026-10-08 00:00:00 (목요일)
    const result = formatMatrixHeaderDate('2026-10-07T15:00:00.000Z');
    expect(result.dateLabel).toBe('10/08');
    expect(result.dayLabel).toBe('(목)');
    expect(result.fullDate).toBe('2026-10-08');
  });

  it('빈 문자열이나 잘못된 형식에 대해 안전하게 fallback을 반환한다', () => {
    const resultEmpty = formatMatrixHeaderDate('');
    expect(resultEmpty.dateLabel).toBe('--/--');

    const resultInvalid = formatMatrixHeaderDate('invalid-date');
    expect(resultInvalid.dateLabel).toBeDefined();
  });
});

describe('normalizeDateToYYYYMMDD', () => {
  it('이미 YYYY-MM-DD 형태인 경우 그대로 반환한다', () => {
    expect(normalizeDateToYYYYMMDD('2026-10-08')).toBe('2026-10-08');
  });
});
