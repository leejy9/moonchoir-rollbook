import { describe, it, expect } from 'vitest';
import { getDefaultArrivalTime, getLateThresholdTime, getNowKSTTime, resolveManualAttendanceTimestamp } from './manualAttendance';

const schedule = { date: '2026-10-23', startTime: '19:30' };
const base = { schedule, lateGraceMinutes: 10, defaultTimestamp: '2026-10-23T19:30:00' };

describe('getLateThresholdTime', () => {
  it('시작 시각에 유예 분을 더한다', () => {
    expect(getLateThresholdTime('19:30', 10)).toBe('19:40');
    expect(getLateThresholdTime('19:55', 10)).toBe('20:05');
  });
});

describe('resolveManualAttendanceTimestamp', () => {
  it('시각을 비우면 기존 기본값을 그대로 쓴다', () => {
    expect(resolveManualAttendanceTimestamp({ ...base, status: '출석', inputTime: '' })).toEqual({
      timestamp: '2026-10-23T19:30:00',
    });
  });

  it('입력한 도착 시각을 일정 날짜와 합쳐 로그 시각으로 쓴다', () => {
    expect(resolveManualAttendanceTimestamp({ ...base, status: '출석', inputTime: '19:38' })).toEqual({
      timestamp: '2026-10-23T19:38:00',
    });
    expect(resolveManualAttendanceTimestamp({ ...base, status: '지각', inputTime: '19:52' })).toEqual({
      timestamp: '2026-10-23T19:52:00',
    });
  });

  it('시작 전에 도착한 시각도 출석으로 기록할 수 있다', () => {
    expect(resolveManualAttendanceTimestamp({ ...base, status: '출석', inputTime: '19:10' }).error).toBeUndefined();
  });

  it('지각 기준 시각 이후를 출석으로 기록하려 하면 막는다', () => {
    const result = resolveManualAttendanceTimestamp({ ...base, status: '출석', inputTime: '19:41' });
    expect(result.error).toContain('19:40');
  });

  it('지각 기준 시각 이전·정각을 지각으로 기록하려 하면 막는다', () => {
    expect(resolveManualAttendanceTimestamp({ ...base, status: '지각', inputTime: '19:40' }).error).toContain('19:40');
    expect(resolveManualAttendanceTimestamp({ ...base, status: '지각', inputTime: '19:35' }).error).toBeDefined();
  });

  it('형식이 올바르지 않으면 막는다', () => {
    expect(resolveManualAttendanceTimestamp({ ...base, status: '출석', inputTime: '7시반' }).error).toBeDefined();
  });
});

describe('getDefaultArrivalTime', () => {
  const opts = { schedule, lateGraceMinutes: 10 };
  // 2026-10-23 19:35 KST
  const today = new Date('2026-10-23T10:35:00Z');

  it('한국 시각 HH:mm을 돌려준다', () => {
    expect(getNowKSTTime(today)).toBe('19:35');
  });

  it('오늘 일정의 출석은 지금 시각을 미리 채운다', () => {
    expect(getDefaultArrivalTime({ ...opts, status: '출석', now: today })).toBe('19:35');
  });

  it('오늘 일정의 지각은 지각 기준 직후보다 이르면 기준 직후(19:41)로 올린다', () => {
    expect(getDefaultArrivalTime({ ...opts, status: '지각', now: today })).toBe('19:41');
  });

  it('오늘 일정의 지각은 지각 기준을 이미 지났으면 지금 시각을 쓴다', () => {
    const late = new Date('2026-10-23T10:55:00Z');
    expect(getDefaultArrivalTime({ ...opts, status: '지각', now: late })).toBe('19:55');
  });

  it('다른 날 일정은 출석은 시작 시각, 지각은 지각 기준 직후를 쓴다', () => {
    const other = { schedule: { date: '2026-10-30', startTime: '19:30' }, lateGraceMinutes: 10, now: today };
    expect(getDefaultArrivalTime({ ...other, status: '출석' })).toBe('19:30');
    expect(getDefaultArrivalTime({ ...other, status: '지각' })).toBe('19:41');
  });
});
