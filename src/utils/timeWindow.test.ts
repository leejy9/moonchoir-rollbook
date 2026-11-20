import { describe, expect, it } from 'vitest';
import type { Schedule } from '../types/rollbook';
import {
  CHECKIN_OPEN_BEFORE_MIN,
  RSVP_CUTOFF_BEFORE_MIN,
  getCheckInWindowState,
  isRsvpOpenForSchedule,
} from './timeWindow';

describe('CheckInWindowState - 1 Hour Service Window Logic & KST Protocols', () => {
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

  it('unifies checkin window and rsvp cutoff to 60 minutes constant', () => {
    expect(CHECKIN_OPEN_BEFORE_MIN).toBe(60);
    expect(RSVP_CUTOFF_BEFORE_MIN).toBe(60);
    expect(CHECKIN_OPEN_BEFORE_MIN).toBe(RSVP_CUTOFF_BEFORE_MIN);
  });

  it('reports UPCOMING_DATE when current date is days before rehearsal', () => {
    const fakeNow = new Date('2026-10-12T10:00:00+09:00');
    const state = getCheckInWindowState(mockSchedule, fakeNow);
    expect(state.isOpen).toBe(false);
    expect(state.status).toBe('UPCOMING_DATE');
    expect(state.windowStartTimeStr).toBe('18:30');
    expect(state.message).toBe('18:30부터');
  });

  it('reports TODAY_BEFORE_WINDOW when current time is on rehearsal day but earlier than 1 hour before start', () => {
    // 19:30 - 1hr is 18:30. At 17:00, window is closed.
    const fakeNow = new Date('2026-10-15T17:00:00+09:00');
    const state = getCheckInWindowState(mockSchedule, fakeNow);
    expect(state.isOpen).toBe(false);
    expect(state.status).toBe('TODAY_BEFORE_WINDOW');
    expect(state.windowStartTimeStr).toBe('18:30');
    expect(state.message).toBe('18:30부터');
  });

  it('reports WINDOW_OPEN when current time is within 1 hour before start and until endTime', () => {
    // 18:30 (exactly 1 hour before start) -> open!
    const fakeNow1 = new Date('2026-10-15T18:30:00+09:00');
    const state1 = getCheckInWindowState(mockSchedule, fakeNow1);
    expect(state1.isOpen).toBe(true);
    expect(state1.status).toBe('WINDOW_OPEN');

    // 19:00 (30 mins before rehearsal) -> open!
    const fakeNow2 = new Date('2026-10-15T19:00:00+09:00');
    const state2 = getCheckInWindowState(mockSchedule, fakeNow2);
    expect(state2.isOpen).toBe(true);
    expect(state2.status).toBe('WINDOW_OPEN');

    // 21:00 (during rehearsal) -> open!
    const fakeNow3 = new Date('2026-10-15T21:00:00+09:00');
    const state3 = getCheckInWindowState(mockSchedule, fakeNow3);
    expect(state3.isOpen).toBe(true);
    expect(state3.status).toBe('WINDOW_OPEN');
  });

  it('reports WINDOW_CLOSED when current time is past rehearsal end time', () => {
    // 22:05 (after 22:00 end) -> closed
    const fakeNow = new Date('2026-10-15T22:05:00+09:00');
    const state = getCheckInWindowState(mockSchedule, fakeNow);
    expect(state.isOpen).toBe(false);
    expect(state.status).toBe('WINDOW_CLOSED');
    expect(state.message).toContain('마감');
  });

  it('supports custom openBeforeMinutes options and test bypass mode', () => {
    // Custom 30 minutes: 19:30 - 30m = 19:00
    const fakeNowAt1845 = new Date('2026-10-15T18:45:00+09:00');
    const state30m = getCheckInWindowState(mockSchedule, fakeNowAt1845, { openBeforeMinutes: 30 });
    expect(state30m.isOpen).toBe(false);
    expect(state30m.status).toBe('TODAY_BEFORE_WINDOW');
    expect(state30m.windowStartTimeStr).toBe('19:00');
    expect(state30m.message).toBe('19:00부터');

    // Test bypass mode
    const bypassed = getCheckInWindowState(mockSchedule, new Date('2026-10-01T10:00:00+09:00'), true);
    expect(bypassed.isOpen).toBe(true);
    expect(bypassed.status).toBe('WINDOW_OPEN');
  });

  it('verifies real-time 3-stage state progression: [사전투표] -> [QR 활성화] -> [출석 마감]', () => {
    const liveSchedule: Schedule = {
      id: 'sch_live_sim',
      title: '현장 실전 테스트 일정',
      date: '2026-10-17',
      startTime: '14:30',
      endTime: '16:00',
      locationName: '문콰이어 연습실',
      category: '정기연습',
    };

    // Stage 1: 13:10 (1 hour 20 minutes before start) -> Before window, Pre-voting (RSVP)
    const stage1Time = new Date('2026-10-17T13:10:00+09:00');
    const stage1State = getCheckInWindowState(liveSchedule, stage1Time);
    expect(stage1State.isOpen).toBe(false);
    expect(stage1State.status).toBe('TODAY_BEFORE_WINDOW');
    expect(stage1State.windowStartTimeStr).toBe('13:30');

    // Stage 2: 13:35 (55 minutes before start) -> QR Check-in active!
    const stage2Time = new Date('2026-10-17T13:35:00+09:00');
    const stage2State = getCheckInWindowState(liveSchedule, stage2Time);
    expect(stage2State.isOpen).toBe(true);
    expect(stage2State.status).toBe('WINDOW_OPEN');

    // Stage 3: 16:05 (5 minutes after rehearsal ended) -> Attendance closed!
    const stage3Time = new Date('2026-10-17T16:05:00+09:00');
    const stage3State = getCheckInWindowState(liveSchedule, stage3Time);
    expect(stage3State.isOpen).toBe(false);
    expect(stage3State.status).toBe('WINDOW_CLOSED');
  });

  it('correctly handles cross-midnight schedules in KST', () => {
    const midnightSchedule: Schedule = {
      id: 'sch_night',
      title: '심야 리허설',
      date: '2026-10-17',
      startTime: '23:00',
      endTime: '01:00',
      locationName: '대연습실',
      category: '특별연습',
    };

    // 00:30 next day KST should still be WINDOW_OPEN
    const fakeNow = new Date('2026-10-18T00:30:00+09:00');
    const state = getCheckInWindowState(midnightSchedule, fakeNow);
    expect(state.isOpen).toBe(true);
    expect(state.status).toBe('WINDOW_OPEN');

    // 01:10 next day KST should be WINDOW_CLOSED
    const pastMidnight = new Date('2026-10-18T01:10:00+09:00');
    const closedState = getCheckInWindowState(midnightSchedule, pastMidnight);
    expect(closedState.isOpen).toBe(false);
    expect(closedState.status).toBe('WINDOW_CLOSED');
  });

  it('enforces check-in opening and RSVP cutoff simultaneously at exact 60m boundary', () => {
    // 18:29:59 KST (1 second before 60m cutoff for 19:30 start) -> RSVP open, Checkin closed
    const oneSecBeforeCutoff = new Date('2026-10-15T18:29:59+09:00');
    expect(isRsvpOpenForSchedule(mockSchedule, oneSecBeforeCutoff)).toBe(true);
    const checkinBefore = getCheckInWindowState(mockSchedule, oneSecBeforeCutoff);
    expect(checkinBefore.isOpen).toBe(false);
    expect(checkinBefore.status).toBe('TODAY_BEFORE_WINDOW');

    // 18:30:00 KST (exactly 60m before 19:30 start) -> RSVP closed, Checkin OPEN
    const exactCutoff = new Date('2026-10-15T18:30:00+09:00');
    expect(isRsvpOpenForSchedule(mockSchedule, exactCutoff)).toBe(false);
    const checkinExact = getCheckInWindowState(mockSchedule, exactCutoff);
    expect(checkinExact.isOpen).toBe(true);
    expect(checkinExact.status).toBe('WINDOW_OPEN');
  });

  it('correctly interprets UTC instant in KST timezone (e.g. 2026-11-20T10:00:00Z = KST 19:00)', () => {
    const kstRehearsal: Schedule = {
      id: 'sch_kst_spec',
      title: 'KST 검증 연습',
      date: '2026-11-20',
      startTime: '19:30',
      endTime: '21:30',
      locationName: '사당 연습실',
      category: '정기연습',
    };

    // UTC 10:00:00Z is KST 19:00:00 (+09:00).
    // Rehearsal starts at 19:30 KST, window opens at 18:30 KST.
    // At KST 19:00 (UTC 10:00), checkin window should be OPEN.
    const utcNow = new Date('2026-11-20T10:00:00.000Z');
    const state = getCheckInWindowState(kstRehearsal, utcNow);
    expect(state.isOpen).toBe(true);
    expect(state.status).toBe('WINDOW_OPEN');
    expect(state.windowStartTimeStr).toBe('18:30');

    // RSVP cutoff was at 18:30 KST (09:30 UTC). At 10:00 UTC, RSVP is CLOSED.
    expect(isRsvpOpenForSchedule(kstRehearsal, utcNow)).toBe(false);
  });

  it('returns closed error states on invalid or unparseable start/end times', () => {
    const invalidFormats = ['7시', '', '25:99', 'abc:def', '12:'];

    for (const badTime of invalidFormats) {
      const badSchedule: Schedule = {
        ...mockSchedule,
        startTime: badTime,
      };

      const checkinState = getCheckInWindowState(badSchedule, new Date('2026-10-15T19:00:00+09:00'));
      expect(checkinState.isOpen).toBe(false);
      expect(checkinState.status).toBe('WINDOW_CLOSED');
      expect(checkinState.message).toBe('일정 시간 오류, 운영진에게 문의해 주세요.');

      const rsvpOpen = isRsvpOpenForSchedule(badSchedule, new Date('2026-10-15T15:00:00+09:00'));
      expect(rsvpOpen).toBe(false);
    }
  });
});
