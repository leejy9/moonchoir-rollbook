import { describe, expect, it } from 'vitest';
import type { Schedule } from '../types/rollbook';
import { isScheduleOver } from './scheduleTiming';

const schedule: Schedule = {
  id: 'schedule',
  title: '연습',
  date: '2026-10-10',
  startTime: '19:30',
  endTime: '22:00',
  locationName: '연습실',
  category: '정기연습',
};

describe('isScheduleOver', () => {
  it.each([
    ['10:00', false],
    ['19:45', false],
    ['21:59', false],
    ['22:00', true],
    ['22:01', true],
  ] as const)('compares today against the configured end time at %s', (clock, expected) => {
    expect(isScheduleOver(schedule, new Date(`2026-10-10T${clock}:00+09:00`))).toBe(expected);
  });

  it.each([
    ['21:29', false],
    ['21:30', true],
    ['21:31', true],
  ] as const)('uses start plus two hours when end time is missing at %s', (clock, expected) => {
    expect(
      isScheduleOver(
        { ...schedule, endTime: '' },
        new Date(`2026-10-10T${clock}:00+09:00`)
      )
    ).toBe(expected);
  });

  it('treats past schedules as over and future schedules as not over', () => {
    const now = new Date('2026-10-10T22:01:00+09:00');
    expect(isScheduleOver({ ...schedule, date: '2026-10-09' }, now)).toBe(true);
    expect(isScheduleOver({ ...schedule, date: '2026-10-11' }, now)).toBe(false);
  });

  it('keeps an overnight schedule open until its next-day end time', () => {
    const overnightSchedule = { ...schedule, startTime: '23:00', endTime: '01:00' };
    expect(isScheduleOver(overnightSchedule, new Date('2026-10-11T00:59:00+09:00'))).toBe(false);
    expect(isScheduleOver(overnightSchedule, new Date('2026-10-11T01:00:00+09:00'))).toBe(true);
  });

  it('accepts stored clock values that include seconds', () => {
    expect(
      isScheduleOver(
        { ...schedule, startTime: '19:30:00', endTime: '22:00:00' },
        new Date('2026-10-10T22:01:00+09:00')
      )
    ).toBe(true);
  });
});
