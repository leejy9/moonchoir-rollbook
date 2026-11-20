import { describe, expect, it } from 'vitest';
import type { AttendanceReconciliation, RSVPVote, Schedule } from '../types/rollbook';
import { deriveTodayCta } from './todayCta';

describe('deriveTodayCta Pure Function', () => {
  const baseSchedule: Schedule = {
    id: 'sch_cta_1',
    title: '정기 연습',
    date: '2026-10-15',
    startTime: '19:30',
    endTime: '21:30',
    locationName: '문콰이어 연습실',
    category: '정기연습',
  };

  const createReconciled = (
    partial: Partial<AttendanceReconciliation>
  ): AttendanceReconciliation => ({
    memberId: 'mem_1',
    memberName: '김단원',
    part: '소프라노',
    rsvpStatus: 'UNVOTED',
    finalStatus: '결석',
    isManualOverride: false,
    ...partial,
  });

  const createVote = (status: 'ATTEND' | 'ABSENT', reason?: string): RSVPVote => ({
    id: 'vote_1',
    scheduleId: 'sch_cta_1',
    memberId: 'mem_1',
    memberName: '김단원',
    part: '소프라노',
    status,
    reason,
    timestamp: '2026-10-14T10:00:00+09:00',
  });

  // 1. CANCELLED
  it('returns CANCELLED state when schedule is cancelled', () => {
    const res = deriveTodayCta({
      schedule: { ...baseSchedule, isCancelled: true },
      now: new Date('2026-10-15T20:00:00+09:00'),
      isRequired: true,
      isOnline: true,
    });
    expect(res).toEqual({
      kind: 'CANCELLED',
      label: '취소된 일정',
      isButton: false,
    });
  });

  // 2. ATTENDED
  it('returns ATTENDED state with clock when check-in is reconciled as 출석', () => {
    const res = deriveTodayCta({
      schedule: baseSchedule,
      now: new Date('2026-10-15T20:00:00+09:00'),
      isRequired: true,
      myReconciled: createReconciled({
        finalStatus: '출석',
        checkInTime: '2026-10-15T19:24:00+09:00',
      }),
      isOnline: true,
    });
    expect(res).toEqual({
      kind: 'ATTENDED',
      time: '19:24',
      label: '출석 완료 19:24',
      isButton: false,
    });
  });

  // 3. LATE
  it('returns LATE state with clock when check-in is reconciled as 지각', () => {
    const res = deriveTodayCta({
      schedule: baseSchedule,
      now: new Date('2026-10-15T20:00:00+09:00'),
      isRequired: true,
      myReconciled: createReconciled({
        finalStatus: '지각',
        checkInTime: '2026-10-15T19:52:00+09:00',
      }),
      isOnline: true,
    });
    expect(res).toEqual({
      kind: 'LATE',
      time: '19:52',
      label: '출석(지각) 19:52',
      isButton: false,
    });
  });

  // 4. MANUAL_OK
  it('returns MANUAL_OK state when manually marked as attended or present by admin', () => {
    const res = deriveTodayCta({
      schedule: baseSchedule,
      now: new Date('2026-10-15T20:00:00+09:00'),
      isRequired: true,
      myReconciled: createReconciled({
        finalStatus: '출석',
        isManualOverride: true,
        adminNote: '운영진 직권 인정',
      }),
      isOnline: true,
    });
    expect(res).toEqual({
      kind: 'MANUAL_OK',
      label: '운영진 인정',
      isButton: false,
    });
  });

  // 5. MANUAL_ABSENT
  it('returns MANUAL_ABSENT state with note when admin overrides as absent', () => {
    const res = deriveTodayCta({
      schedule: baseSchedule,
      now: new Date('2026-10-15T20:00:00+09:00'),
      isRequired: true,
      myReconciled: createReconciled({
        finalStatus: '결석',
        isManualOverride: true,
        adminNote: '사전 연락 없는 노쇼',
      }),
      isOnline: true,
    });
    expect(res).toEqual({
      kind: 'MANUAL_ABSENT',
      note: '사전 연락 없는 노쇼',
      label: '운영진 확인: 결석 (사전 연락 없는 노쇼)',
      isButton: false,
    });
  });

  // 6. CHECKIN_OPEN & OFFLINE
  it('returns OFFLINE when checkin window is open but offline', () => {
    const res = deriveTodayCta({
      schedule: baseSchedule,
      now: new Date('2026-10-15T19:00:00+09:00'), // inside window (18:30~21:30)
      isRequired: true,
      isOnline: false,
    });
    expect(res).toEqual({
      kind: 'OFFLINE',
      label: '인터넷 연결 후 출석할 수 있어요',
      isButton: true,
      disabled: true,
    });
  });

  it('returns CHECKIN_OPEN for required member when online and window is open', () => {
    const res = deriveTodayCta({
      schedule: baseSchedule,
      now: new Date('2026-10-15T19:00:00+09:00'),
      isRequired: true,
      isOnline: true,
    });
    expect(res).toEqual({
      kind: 'CHECKIN_OPEN',
      isRequired: true,
      label: 'QR 찍기 / PIN 출석',
      isButton: true,
      disabled: false,
    });
  });

  it('returns CHECKIN_OPEN with voluntary label for non-required member', () => {
    const res = deriveTodayCta({
      schedule: baseSchedule,
      now: new Date('2026-10-15T19:00:00+09:00'),
      isRequired: false,
      isOnline: true,
    });
    expect(res).toEqual({
      kind: 'CHECKIN_OPEN',
      isRequired: false,
      label: '자율 참여 출석',
      isButton: true,
      disabled: false,
    });
  });

  // 7. RSVP_NEW & RSVP_EDIT
  it('returns RSVP_NEW when voting is open and no vote exists', () => {
    const res = deriveTodayCta({
      schedule: baseSchedule,
      now: new Date('2026-10-14T10:00:00+09:00'), // 1 day before
      isRequired: true,
      isOnline: true,
    });
    expect(res).toEqual({
      kind: 'RSVP_NEW',
      label: '참석 투표하기',
      isButton: true,
      disabled: false,
    });
  });

  it('returns RSVP_EDIT when voting is open and member previously voted', () => {
    const resAttend = deriveTodayCta({
      schedule: baseSchedule,
      now: new Date('2026-10-14T10:00:00+09:00'),
      isRequired: true,
      myVote: createVote('ATTEND'),
      isOnline: true,
    });
    expect(resAttend.kind).toBe('RSVP_EDIT');
    expect(resAttend.label).toBe('투표 수정 · 현재 참석');

    const resAbsent = deriveTodayCta({
      schedule: baseSchedule,
      now: new Date('2026-10-14T10:00:00+09:00'),
      isRequired: true,
      myVote: createVote('ABSENT', '개인 사정'),
      isOnline: true,
    });
    expect(resAbsent.kind).toBe('RSVP_EDIT');
    expect(resAbsent.label).toBe('투표 수정 · 현재 불참');
  });

  // 8. EXCUSED, CLOSED_ABSENT, CLOSED_EXEMPT
  it('returns EXCUSED when schedule is closed and member was excused', () => {
    const res = deriveTodayCta({
      schedule: baseSchedule,
      now: new Date('2026-10-15T22:00:00+09:00'), // past 21:30
      isRequired: true,
      myReconciled: createReconciled({
        finalStatus: '사유결석',
      }),
      isOnline: true,
    });
    expect(res.kind).toBe('EXCUSED');
    expect(res.label).toBe('사유 결석 처리됨');
    expect(res.isButton).toBe(false);
  });

  it('returns CLOSED_ABSENT when schedule is closed, member is required, and did not attend', () => {
    const res = deriveTodayCta({
      schedule: baseSchedule,
      now: new Date('2026-10-15T22:00:00+09:00'),
      isRequired: true,
      myReconciled: createReconciled({
        finalStatus: '결석',
      }),
      isOnline: true,
    });
    expect(res.kind).toBe('CLOSED_ABSENT');
    expect(res.label).toBe('출석 마감 · 미출석');
    expect(res.isButton).toBe(false);
  });

  it('returns CLOSED_EXEMPT when schedule is closed, member is not required, and did not attend', () => {
    const res = deriveTodayCta({
      schedule: baseSchedule,
      now: new Date('2026-10-15T22:00:00+09:00'),
      isRequired: false,
      myReconciled: createReconciled({
        finalStatus: '미참',
      }),
      isOnline: true,
    });
    expect(res.kind).toBe('CLOSED_EXEMPT');
    expect(res.label).toBe('필참 대상 아님');
    expect(res.isButton).toBe(false);
  });

  // 9. Exact 60m boundary test
  it('transitions from RSVP to CHECKIN_OPEN exactly at 60m boundary', () => {
    // 19:30 start time. 60m before is 18:30:00.
    const justBefore60m = new Date('2026-10-15T18:29:59+09:00');
    const exact60m = new Date('2026-10-15T18:30:00+09:00');

    const resBefore = deriveTodayCta({
      schedule: baseSchedule,
      now: justBefore60m,
      isRequired: true,
      isOnline: true,
    });
    expect(resBefore.kind).toBe('RSVP_NEW');

    const resAt60m = deriveTodayCta({
      schedule: baseSchedule,
      now: exact60m,
      isRequired: true,
      isOnline: true,
    });
    expect(resAt60m.kind).toBe('CHECKIN_OPEN');
  });

  // 10. Already attended while window is still open -> ATTENDED (no re-checkin button)
  it('maintains ATTENDED state without checkin button even while window is open', () => {
    const res = deriveTodayCta({
      schedule: baseSchedule,
      now: new Date('2026-10-15T19:00:00+09:00'), // window is open
      isRequired: true,
      myReconciled: createReconciled({
        finalStatus: '출석',
        checkInTime: '2026-10-15T18:45:00+09:00',
      }),
      isOnline: true,
    });
    expect(res.kind).toBe('ATTENDED');
    expect(res.label).toBe('출석 완료 18:45');
    expect(res.isButton).toBe(false);
  });

  // 11. Offline + already attended -> ATTENDED
  it('retains ATTENDED state even when offline after attending', () => {
    const res = deriveTodayCta({
      schedule: baseSchedule,
      now: new Date('2026-10-15T19:00:00+09:00'),
      isRequired: true,
      myReconciled: createReconciled({
        finalStatus: '출석',
        checkInTime: '2026-10-15T18:45:00+09:00',
      }),
      isOnline: false,
    });
    expect(res.kind).toBe('ATTENDED');
    expect(res.label).toBe('출석 완료 18:45');
    expect(res.isButton).toBe(false);
  });
});
