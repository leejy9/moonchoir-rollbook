import { afterEach, describe, expect, it } from 'vitest';
import type { Member, Schedule } from '../types/rollbook';
import { resetStorage, SheetsService } from './sheets';

afterEach(() => {
  resetStorage();
});

describe('schedule targets for merged members', () => {
  it('shows and requires a representative on a schedule targeted to an old ID', () => {
    const representative: Member = {
      id: 'representative',
      name: '대표',
      part: '소프라노',
      phoneLast4: '',
      role: 'MEMBER',
      status: 'ACTIVE',
      createdAt: '',
      joinedAt: '2020-01-01',
      memberStatus: '정단원',
    };
    const oldMember: Member = {
      ...representative,
      id: 'old',
      status: 'MERGED',
      mergedIntoId: representative.id,
    };
    const schedule: Schedule = {
      id: 'targeted',
      title: '지정 연습',
      date: '2026-01-02',
      startTime: '19:00',
      endTime: '21:00',
      locationName: '연습실',
      category: '추가연습',
      visibility: 'TARGETS_ONLY',
      targetAudienceType: 'CUSTOM_MEMBERS',
      targetMemberIds: ['old'],
    };
    const service = new SheetsService();
    service.seedTestData({
      members: [representative, oldMember],
      schedules: [schedule],
      logs: [],
      rsvpVotes: [],
    });

    expect(service.getSchedulesForMember(representative.id)).toContainEqual(schedule);
    expect(service.reconcileMemberAttendance(representative.id, schedule.id)?.finalStatus).toBe(
      '결석'
    );

    const reconciledMembers = service.reconcileAttendance(schedule.id);
    expect(reconciledMembers).toHaveLength(1);
    expect(reconciledMembers[0]).toMatchObject({
      memberId: representative.id,
      finalStatus: '결석',
    });
  });

  it.each([
    ['10:00', '대기'],
    ['19:45', '대기'],
    ['21:59', '대기'],
    ['22:01', '결석'],
  ] as const)('uses the end time for attendance reconciliation at %s', (clock, expected) => {
    const member: Member = {
      id: 'member-today',
      name: '오늘 단원',
      part: '소프라노',
      phoneLast4: '',
      role: 'MEMBER',
      status: 'ACTIVE',
      createdAt: '',
      joinedAt: '2020-01-01',
      memberStatus: '정단원',
    };
    const todaySchedule: Schedule = {
      id: 'today-schedule',
      title: '오늘 연습',
      date: '2026-10-10',
      startTime: '19:30',
      endTime: '22:00',
      locationName: '연습실',
      category: '정기연습',
    };
    const service = new SheetsService();
    service.seedTestData({
      members: [member],
      schedules: [todaySchedule],
      logs: [],
      rsvpVotes: [],
    });

    expect(
      service.reconcileAttendance(
        todaySchedule.id,
        new Date(`2026-10-10T${clock}:00+09:00`)
      )[0]?.finalStatus
    ).toBe(expected);
  });

  it.each([
    ['21:29', '대기'],
    ['21:31', '결석'],
  ] as const)('uses start plus two hours when end time is missing at %s', (clock, expected) => {
    const member: Member = {
      id: 'member-no-end',
      name: '종료 시각 없음',
      part: '소프라노',
      phoneLast4: '',
      role: 'MEMBER',
      status: 'ACTIVE',
      createdAt: '',
      joinedAt: '2020-01-01',
      memberStatus: '정단원',
    };
    const scheduleWithoutEnd: Schedule = {
      id: 'schedule-no-end',
      title: '종료 시각 없는 연습',
      date: '2026-10-10',
      startTime: '19:30',
      endTime: '',
      locationName: '연습실',
      category: '정기연습',
    };
    const service = new SheetsService();
    service.seedTestData({
      members: [member],
      schedules: [scheduleWithoutEnd],
      logs: [],
      rsvpVotes: [],
    });

    expect(
      service.reconcileAttendance(
        scheduleWithoutEnd.id,
        new Date(`2026-10-10T${clock}:00+09:00`)
      )[0]?.finalStatus
    ).toBe(expected);
  });

  it('uses merged-member period status for schedule visibility and reconciliation', () => {
    const representative: Member = {
      id: 'representative',
      name: '대표',
      part: '소프라노',
      phoneLast4: '',
      role: 'MEMBER',
      status: 'ACTIVE',
      createdAt: '',
      joinedAt: '2020-01-01',
      memberStatus: '정단원',
    };
    const oldMember: Member = {
      ...representative,
      id: 'old',
      status: 'MERGED',
      mergedIntoId: representative.id,
      statusHistory: [
        {
          id: 'old-withdrawn',
          memberId: 'old',
          status: '퇴단원',
          part: '소프라노',
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
    };
    const targetedSchedule: Schedule = {
      id: 'targeted-old-member',
      title: '지정 연습',
      date: '2026-01-02',
      startTime: '19:00',
      endTime: '21:00',
      locationName: '연습실',
      category: '추가연습',
      visibility: 'TARGETS_ONLY',
      targetAudienceType: 'CUSTOM_MEMBERS',
      targetMemberIds: [oldMember.id],
    };
    const service = new SheetsService();
    service.seedTestData({
      members: [representative, oldMember],
      schedules: [targetedSchedule],
      logs: [],
      rsvpVotes: [],
    });

    expect(service.getSchedulesForMember(representative.id)).not.toContainEqual(targetedSchedule);
    expect(service.reconcileAttendance(targetedSchedule.id)).toMatchObject([
      { memberId: representative.id, finalStatus: '미참' },
    ]);
  });
});
