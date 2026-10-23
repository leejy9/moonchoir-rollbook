import { describe, it, expect } from 'vitest';
import { formatMatrixHeaderDate, normalizeDateToYYYYMMDD, getKSTTimestampString, parseKSTDate, getKSTDateString, addDaysKST, normalizeToKSTTimestamp, getKSTClock, formatShortDate } from './date';

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

describe('getKSTDateString & addDaysKST', () => {
  it('자정 직후(새벽 시간) UTC 시점이어도 KST 기준의 올바른 날짜를 반환한다', () => {
    // UTC 2026-10-17 15:30:00 -> KST 2026-10-18 00:30:00 (새벽 0시 반)
    const midnightUtc = new Date('2026-10-17T15:30:00.000Z');
    expect(getKSTDateString(midnightUtc)).toBe('2026-10-18');
  });

  it('addDaysKST로 날짜를 더하거나 뺄 수 있다', () => {
    expect(addDaysKST('2026-10-18', -1)).toBe('2026-10-17');
    expect(addDaysKST('2026-10-18', 1)).toBe('2026-10-19');
    expect(addDaysKST('2026-10-31', 1)).toBe('2026-11-01');
  });
});

describe('KST 시각 정규화 (normalizeToKSTTimestamp / getKSTClock)', () => {
  it('KST 표준 문자열은 그대로 시각을 읽는다 (공백/T 구분 모두)', () => {
    expect(normalizeToKSTTimestamp('2026-10-21 19:25:10')).toBe('2026-10-21 19:25:10');
    expect(normalizeToKSTTimestamp('2026-10-21T19:25:10')).toBe('2026-10-21 19:25:10');
    expect(getKSTClock('2026-10-21 19:25:10')).toBe('19:25');
  });

  it('과거 UTC(Z) 기록은 9시간을 더해 KST로 변환한다', () => {
    expect(normalizeToKSTTimestamp('2026-10-17T13:15:36.799Z')).toBe('2026-10-17 22:15:36');
    expect(getKSTClock('2026-10-17T13:15:36.799Z')).toBe('22:15');
    // 날짜가 넘어가는 경우
    expect(normalizeToKSTTimestamp('2026-10-17T20:30:00Z')).toBe('2026-10-18 05:30:00');
  });

  it('+09:00 오프셋 표기도 같은 순간의 KST로 맞춘다', () => {
    expect(getKSTClock('2026-10-21T12:00:00+09:00')).toBe('12:00');
    expect(getKSTClock('2026-10-21T12:00:00+00:00')).toBe('21:00');
  });

  it('HH:mm만 있는 값은 그대로, 해석 불가·빈 값은 빈 문자열', () => {
    expect(getKSTClock('19:30')).toBe('19:30');
    expect(getKSTClock('19:30:45')).toBe('19:30');
    expect(getKSTClock('')).toBe('');
    expect(getKSTClock(undefined)).toBe('');
    expect(getKSTClock('날짜아님')).toBe('');
  });
});

describe('formatShortDate', () => {
  it('YYYY-MM-DD를 YY-MM-DD로 줄인다', () => {
    expect(formatShortDate('2026-10-23')).toBe('26-10-23');
  });

  it('시각이 붙은 값도 날짜 부분만 줄인다', () => {
    expect(formatShortDate('2026-10-23 19:30:00')).toBe('26-10-23');
  });

  it('형식이 다르거나 비어 있으면 원문을 그대로 돌려준다', () => {
    expect(formatShortDate('')).toBe('');
    expect(formatShortDate('미정')).toBe('미정');
  });
});
