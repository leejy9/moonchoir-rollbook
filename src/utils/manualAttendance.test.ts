import { describe, it, expect } from 'vitest';
import { getLateThresholdTime, resolveManualAttendanceTimestamp } from './manualAttendance';

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
