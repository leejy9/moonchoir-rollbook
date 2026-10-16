import { describe, expect, it } from 'vitest';
import type { Schedule } from '../types/rollbook';
import { getCheckInWindowState } from './timeWindow';

describe('CheckInWindowState - 2 Hour Window Logic', () => {
  const mockSchedule: Schedule = {
    id: 'sch_window_test',
    title: '정기 연습',
    date: '2026-10-15',
    startTime: '19:30',
    endTime: '22:00',
    locationName: '문콰이어 연습실',
    targetLat: 37.5,
    targetLon: 127.0,
    radiusMeters: 100,
    category: '정기연습',
  };

  it('reports UPCOMING_DATE when current date is days before rehearsal', () => {
    const fakeNow = new Date('2026-10-12T10:00:00');
    const state = getCheckInWindowState(mockSchedule, fakeNow);
    expect(state.isOpen).toBe(false);
    expect(state.status).toBe('UPCOMING_DATE');
    expect(state.windowStartTimeStr).toBe('17:30');
  });

  it('reports TODAY_BEFORE_WINDOW when current time is on rehearsal day but earlier than 2 hours before start', () => {
    // 19:30 - 2hr is 17:30. At 14:00, window is closed.
    const fakeNow = new Date('2026-10-15T14:00:00');
    const state = getCheckInWindowState(mockSchedule, fakeNow);
    expect(state.isOpen).toBe(false);
    expect(state.status).toBe('TODAY_BEFORE_WINDOW');
    expect(state.message).toContain('17:30');
  });

  it('reports WINDOW_OPEN when current time is within 2 hours before start and end time', () => {
    // 18:00 (1.5 hours before start) -> open!
    const fakeNow1 = new Date('2026-10-15T18:00:00');
    const state1 = getCheckInWindowState(mockSchedule, fakeNow1);
    expect(state1.isOpen).toBe(true);
    expect(state1.status).toBe('WINDOW_OPEN');

    // 20:00 (during rehearsal) -> open!
    const fakeNow2 = new Date('2026-10-15T20:00:00');
    const state2 = getCheckInWindowState(mockSchedule, fakeNow2);
    expect(state2.isOpen).toBe(true);
    expect(state2.status).toBe('WINDOW_OPEN');
  });

  it('reports WINDOW_CLOSED when current time is past rehearsal end time', () => {
    // 22:30 (after 22:00 end) -> closed
    const fakeNow = new Date('2026-10-15T22:30:00');
    const state = getCheckInWindowState(mockSchedule, fakeNow);
    expect(state.isOpen).toBe(false);
    expect(state.status).toBe('WINDOW_CLOSED');
  });

  it('allows bypass in test mode', () => {
    const fakeNow = new Date('2026-10-12T10:00:00');
    const state = getCheckInWindowState(mockSchedule, fakeNow, true);
    expect(state.isOpen).toBe(true);
    expect(state.status).toBe('WINDOW_OPEN');
  });
});
