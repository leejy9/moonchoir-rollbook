import { describe, it, expect } from 'vitest';
import { formatMatrixHeaderDate, normalizeDateToYYYYMMDD, getKSTTimestampString, parseKSTDate } from './date';

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

describe('getKSTTimestampString & parseKSTDate', () => {
  it('UTC 시점을 한국 표준시(KST, UTC+9) YYYY-MM-DD HH:mm:ss 형식으로 정확히 변환한다', () => {
    // 2026-10-17T13:15:30.000Z -> KST 2026-10-17 22:15:30
    const utcDate = new Date('2026-10-17T13:15:30.000Z');
    const kstStr = getKSTTimestampString(utcDate);
    expect(kstStr).toBe('2026-10-17 22:15:30');
  });

  it('YYYY-MM-DD HH:mm:ss 형식 문자열을 parseKSTDate로 정확하게 파싱한다', () => {
    const parsed = parseKSTDate('2026-10-17 22:15:30');
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(9); // 0-indexed 10월
    expect(parsed.getDate()).toBe(17);
    expect(parsed.getHours()).toBe(22);
    expect(parsed.getMinutes()).toBe(15);
    expect(parsed.getSeconds()).toBe(30);
  });
});
