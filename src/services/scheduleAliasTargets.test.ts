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
