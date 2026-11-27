import { describe, it, expect } from 'vitest';
import { buildMemberScheduleRecords } from './memberRecords';
import type { Member, RawAttendanceLog, RSVPVote, Schedule } from '../types/rollbook';

describe('buildMemberScheduleRecords', () => {
  const mockMember: Member = {
    id: 'mem_1',
    name: '김단원',
    part: 'Soprano',
    phoneLast4: '1234',
    role: 'MEMBER',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00Z',
    joinedAt: '2026-01-01',
    memberStatus: '정단원',
  };

  const mockSchedules: Schedule[] = [
    {
      id: 'sch_future',
      title: '미래 연습',
      date: '2026-12-01',
      startTime: '19:30',
      endTime: '21:30',
      locationName: '연습실',
      category: '정기연습',
    },
    {
      id: 'sch_past_1',
      title: '과거 정기연습 1',
      date: '2026-10-18',
      startTime: '19:30',
      endTime: '21:30',
      locationName: '연습실',
      category: '정기연습',
    },
    {
      id: 'sch_past_2',
      title: '과거 정기연습 2',
      date: '2026-10-11',
      startTime: '19:30',
      endTime: '21:30',
      locationName: '연습실',
      category: '정기연습',
    },
    {
      id: 'sch_cancelled',
      title: '취소된 연습',
      date: '2026-10-04',
      startTime: '19:30',
      endTime: '21:30',
      locationName: '연습실',
      category: '정기연습',
      isCancelled: true,
    },
    {
      id: 'sch_archived',
      title: '보관된 과거 연습',
      date: '2026-05-01',
      startTime: '19:30',
      endTime: '21:30',
      locationName: '연습실',
      category: '정기연습',
      isArchived: true,
    },
  ];

  const mockLogs: RawAttendanceLog[] = [
    {
      id: 'log_1',
      memberId: 'mem_1',
      memberName: '김단원',
      part: 'Soprano',
      scheduleId: 'sch_past_1',
      timestamp: '2026-10-18T19:25:00+09:00',
      authMethod: 'QR_WEB_CAM',
      isVerifiedLocation: true,
    },
    {
      id: 'log_archived',
      memberId: 'mem_1',
      memberName: '김단원',
      part: 'Soprano',
      scheduleId: 'sch_archived',
      timestamp: '2026-05-01T19:20:00+09:00',
      authMethod: 'QR_WEB_CAM',
      isVerifiedLocation: true,
    },
  ];

  const mockRsvps: RSVPVote[] = [
    {
      id: 'rsvp_1',
      memberId: 'mem_1',
      memberName: '김단원',
      part: 'Soprano',
      scheduleId: 'sch_past_1',
      status: 'ATTEND',
      timestamp: '2026-10-17T12:00:00+09:00',
    },
    {
      id: 'rsvp_2',
      memberId: 'mem_1',
      memberName: '김단원',
      part: 'Soprano',
      scheduleId: 'sch_past_2',
      status: 'ABSENT',
      reason: '가족 행사',
      timestamp: '2026-10-10T12:00:00+09:00',
    },
  ];

  const mockNow = new Date('2026-10-25T12:00:00+09:00');

  it('sorts schedules descending by date and excludes cancelled schedules', () => {
    const records = buildMemberScheduleRecords({
      member: mockMember,
      members: [mockMember],
      schedules: mockSchedules,
      logs: mockLogs,
      rsvpVotes: mockRsvps,
      now: mockNow,
      includeArchived: false,
    });

    const ids = records.map((r) => r.id);
    expect(ids).toEqual(['sch_future', 'sch_past_1', 'sch_past_2']);
    expect(ids).not.toContain('sch_cancelled');
    expect(ids).not.toContain('sch_archived');
  });

  it('includes archived schedules when includeArchived is true', () => {
    const records = buildMemberScheduleRecords({
      member: mockMember,
      members: [mockMember],
      schedules: mockSchedules,
      logs: mockLogs,
      rsvpVotes: mockRsvps,
      now: mockNow,
      includeArchived: true,
    });

    const ids = records.map((r) => r.id);
    expect(ids).toContain('sch_archived');
    const archivedRec = records.find((r) => r.id === 'sch_archived');
    expect(archivedRec?.finalStatus).toBe('출석');
  });

  it('correctly reconciles attended, excused, absent, and pending status', () => {
    const records = buildMemberScheduleRecords({
      member: mockMember,
      members: [mockMember],
      schedules: mockSchedules,
      logs: mockLogs,
      rsvpVotes: mockRsvps,
      now: mockNow,
    });

    const past1 = records.find((r) => r.id === 'sch_past_1');
    expect(past1?.finalStatus).toBe('출석');
    expect(past1?.isAttended).toBe(true);
    expect(past1?.checkInTime).toBe('19:25');
    expect(past1?.voteStatus).toBe('ATTEND');

    const past2 = records.find((r) => r.id === 'sch_past_2');
    expect(past2?.finalStatus).toBe('사유결석');
    expect(past2?.isAttended).toBe(false);
    expect(past2?.voteStatus).toBe('ABSENT');
    expect(past2?.voteReason).toBe('가족 행사');

    const future = records.find((r) => r.id === 'sch_future');
    expect(future?.isPast).toBe(false);
    expect(future?.finalStatus).toBe('대기');
  });

  it.each([
    ['10:00', '대기'],
    ['19:45', '대기'],
    ['21:59', '대기'],
    ['22:01', '결석'],
  ] as const)('uses the end time for today attendance at %s', (clock, expected) => {
    const todaySchedule = { ...mockSchedules[1], endTime: '22:00' };
    const records = buildMemberScheduleRecords({
      member: mockMember,
      members: [mockMember],
      schedules: [todaySchedule],
      now: new Date(`2026-10-18T${clock}:00+09:00`),
    });

    expect(records[0].finalStatus).toBe(expected);
  });

  it.each([
    ['21:29', '대기'],
    ['21:31', '결석'],
  ] as const)('uses start plus two hours when the end time is missing at %s', (clock, expected) => {
    const todaySchedule = { ...mockSchedules[1], endTime: '' };
    const records = buildMemberScheduleRecords({
      member: mockMember,
      members: [mockMember],
      schedules: [todaySchedule],
      now: new Date(`2026-10-18T${clock}:00+09:00`),
    });

    expect(records[0].finalStatus).toBe(expected);
  });

  it('resolves merged member alias IDs when reconciling', () => {
    const canonicalMember: Member = {
      ...mockMember,
      id: 'mem_canonical',
    };
    const mergedMember: Member = {
      ...mockMember,
      id: 'mem_merged',
      status: 'MERGED',
      mergedIntoId: 'mem_canonical',
    };

    const logsWithOldId: RawAttendanceLog[] = [
      {
        id: 'log_merged',
        memberId: 'mem_merged',
        memberName: '김단원',
        part: 'Soprano',
        scheduleId: 'sch_past_1',
        timestamp: '2026-10-18T19:20:00+09:00',
        authMethod: 'QR_WEB_CAM',
        isVerifiedLocation: true,
      },
    ];

    const records = buildMemberScheduleRecords({
      member: canonicalMember,
      members: [canonicalMember, mergedMember],
      schedules: [mockSchedules[1]],
      logs: logsWithOldId,
      now: mockNow,
    });

    expect(records[0].finalStatus).toBe('출석');
    expect(records[0].checkInTime).toBe('19:20');
  });

  it('resolves activity in both directions between an old ID and its representative', () => {
    const canonicalMember: Member = { ...mockMember, id: 'mem_canonical' };
    const mergedMember: Member = {
      ...mockMember,
      id: 'mem_merged',
      status: 'MERGED',
      mergedIntoId: 'mem_canonical',
    };
    const schedule = mockSchedules[1];
    const canonicalLog: RawAttendanceLog = {
      ...mockLogs[0],
      id: 'log_canonical',
      memberId: 'mem_canonical',
      scheduleId: schedule.id,
    };
    const mergedLog: RawAttendanceLog = {
      ...mockLogs[0],
      id: 'log_merged',
      memberId: 'mem_merged',
      scheduleId: schedule.id,
    };

    const oldProfileRecords = buildMemberScheduleRecords({
      member: mergedMember,
      members: [canonicalMember, mergedMember],
      schedules: [schedule],
      logs: [canonicalLog],
      now: mockNow,
    });
    const representativeRecords = buildMemberScheduleRecords({
      member: canonicalMember,
      members: [canonicalMember, mergedMember],
      schedules: [schedule],
      logs: [mergedLog],
      now: mockNow,
    });

    expect(oldProfileRecords[0].finalStatus).toBe('출석');
    expect(representativeRecords[0].finalStatus).toBe('출석');
  });

  it('counts a representative as required when only an old ID is explicitly targeted', () => {
    const canonicalMember: Member = { ...mockMember, id: 'mem_canonical' };
    const mergedMember: Member = {
      ...mockMember,
      id: 'mem_merged',
      status: 'MERGED',
      mergedIntoId: 'mem_canonical',
    };
    const customSchedule: Schedule = {
      ...mockSchedules[1],
      targetAudienceType: 'CUSTOM_MEMBERS',
      targetMemberIds: ['mem_merged'],
    };

    const records = buildMemberScheduleRecords({
      member: canonicalMember,
      members: [canonicalMember, mergedMember],
      schedules: [customSchedule],
      logs: [],
      now: mockNow,
    });

    expect(records[0].finalStatus).toBe('결석');
  });

  it('uses merged-member status history when the representative has no history', () => {
    const canonicalMember: Member = { ...mockMember, id: 'mem_canonical' };
    const mergedMember: Member = {
      ...mockMember,
      id: 'mem_merged',
      status: 'MERGED',
      mergedIntoId: canonicalMember.id,
      statusHistory: [
        {
          id: 'history_leave',
          memberId: 'mem_merged',
          status: '휴단원',
          part: mockMember.part,
          startDate: '2026-10-01',
          endDate: '2026-10-31',
          createdAt: '2026-10-01T00:00:00Z',
        },
      ],
    };

    const records = buildMemberScheduleRecords({
      member: canonicalMember,
      members: [canonicalMember, mergedMember],
      schedules: [mockSchedules[1]],
      now: mockNow,
    });

    expect(records[0].finalStatus).toBe('미참');
  });

  it('prefers representative status history over overlapping merged-member history', () => {
    const canonicalMember: Member = {
      ...mockMember,
      id: 'mem_canonical',
      statusHistory: [
        {
          id: 'history_active',
          memberId: 'mem_canonical',
          status: '정단원',
          part: mockMember.part,
          startDate: '2026-10-01',
          endDate: '2026-10-31',
          createdAt: '2026-10-01T00:00:00Z',
        },
      ],
    };
    const mergedMember: Member = {
      ...mockMember,
      id: 'mem_merged',
      status: 'MERGED',
      mergedIntoId: canonicalMember.id,
      statusHistory: [
        {
          id: 'history_leave',
          memberId: 'mem_merged',
          status: '휴단원',
          part: mockMember.part,
          startDate: '2026-10-01',
          endDate: '2026-10-31',
          createdAt: '2026-10-01T00:00:00Z',
        },
      ],
    };

    const records = buildMemberScheduleRecords({
      member: canonicalMember,
      members: [canonicalMember, mergedMember],
      schedules: [mockSchedules[1]],
      now: mockNow,
    });

    expect(records[0].finalStatus).toBe('결석');
  });

  it('excludes the representative when a merged member has a withdrawn history', () => {
    const canonicalMember: Member = { ...mockMember, id: 'mem_canonical' };
    const mergedMember: Member = {
      ...mockMember,
      id: 'mem_merged',
      status: 'MERGED',
      mergedIntoId: canonicalMember.id,
      statusHistory: [
        {
          id: 'history_withdrawn',
          memberId: 'mem_merged',
          status: '퇴단원',
          part: mockMember.part,
          startDate: '2026-10-01',
          endDate: '2026-10-31',
          createdAt: '2026-10-01T00:00:00Z',
        },
      ],
    };

    const records = buildMemberScheduleRecords({
      member: canonicalMember,
      members: [canonicalMember, mergedMember],
      schedules: [mockSchedules[1]],
      now: mockNow,
    });

    expect(records[0].finalStatus).toBe('미참');
  });
});
