import { describe, it, expect } from 'vitest';
import {
  computeMemberLevel,
  computeDaysTogether,
  computePracticeHours,
  computePerformanceCount,
  computeAttendance90Days,
  formatStaffTenure,
  classifyAttendanceStatus,
  filterRecordsByPeriod,
} from './memberProgress';
import type { Member, RawAttendanceLog, Schedule } from '../types/rollbook';
import type { MemberScheduleRecord } from './memberRecords';

describe('memberProgress utilities (Spec §5-1 ~ §5-4, §5-7)', () => {
  describe('computeMemberLevel (§5-3)', () => {
    it('calculates levels and boundary transitions correctly (9/10, 99/100)', () => {
      // 0 attendance
      const lv1_0 = computeMemberLevel(0, 'Soprano');
      expect(lv1_0.level).toBe(1);
      expect(lv1_0.name).toBe('새내기 Soprano');
      expect(lv1_0.remainingForNext).toBe(10);
      expect(lv1_0.summaryText).toBe('Lv.2까지 10회');
      expect(lv1_0.progressPercent).toBe(0);

      // 9 attendance (Lv.1 boundary)
      const lv1_9 = computeMemberLevel(9, 'Soprano');
      expect(lv1_9.level).toBe(1);
      expect(lv1_9.remainingForNext).toBe(1);
      expect(lv1_9.summaryText).toBe('Lv.2까지 1회');
      expect(lv1_9.progressPercent).toBe(90);

      // 10 attendance (Lv.2 start)
      const lv2_10 = computeMemberLevel(10, 'Soprano');
      expect(lv2_10.level).toBe(2);
      expect(lv2_10.name).toBe('첫걸음 Soprano');
      expect(lv2_10.remainingForNext).toBe(10);
      expect(lv2_10.summaryText).toBe('Lv.3까지 10회');
      expect(lv2_10.progressPercent).toBe(0);

      // 99 attendance (Lv.5 boundary)
      const lv5_99 = computeMemberLevel(99, 'Alto');
      expect(lv5_99.level).toBe(5);
      expect(lv5_99.name).toBe('기둥 Alto');
      expect(lv5_99.remainingForNext).toBe(1);
      expect(lv5_99.summaryText).toBe('Lv.6까지 1회');

      // 100 attendance (Lv.6 max)
      const lv6_100 = computeMemberLevel(100, 'Tenor');
      expect(lv6_100.level).toBe(6);
      expect(lv6_100.name).toBe('문콰이어의 목소리');
      expect(lv6_100.remainingForNext).toBe(0);
      expect(lv6_100.summaryText).toBe('');
      expect(lv6_100.progressPercent).toBe(100);

      // Beyond 100
      const lv6_150 = computeMemberLevel(150, 'Tenor');
      expect(lv6_150.level).toBe(6);
      expect(lv6_150.summaryText).toBe('');
    });

    it('falls back to "단원" when part is empty or whitespace', () => {
      const emptyPart = computeMemberLevel(5, '');
      expect(emptyPart.name).toBe('새내기 단원');

      const wsPart = computeMemberLevel(15, '   ');
      expect(wsPart.name).toBe('첫걸음 단원');

      const lv6 = computeMemberLevel(100, '');
      expect(lv6.name).toBe('문콰이어의 목소리');
    });
  });

  describe('computeDaysTogether (§5-2)', () => {
    const baseMember: Member = {
      id: 'mem_1',
      name: '단원',
      part: 'Alto',
      phoneLast4: '1234',
      role: 'MEMBER',
      status: 'ACTIVE',
      createdAt: '2026-01-01',
      joinedAt: '2026-01-01',
      memberStatus: '정단원',
    };

    it('calculates days together from joinedAt correctly', () => {
      // 2026-01-01 to 2026-01-01 -> 1일째
      expect(computeDaysTogether(baseMember, [], '2026-01-01')).toBe(1);

      // 2026-01-01 to 2026-01-31 -> 31일
      expect(computeDaysTogether(baseMember, [], '2026-01-31')).toBe(31);
    });

    it('falls back to first attendance log date when joinedAt is missing or invalid', () => {
      const memberWithoutJoinedAt: Member = {
        ...baseMember,
        joinedAt: '',
      };
      const logs: RawAttendanceLog[] = [
        {
          id: 'l2',
          memberId: 'mem_1',
          scheduleId: 's2',
          memberName: '단원',
          part: 'Alto',
          authMethod: 'QR_WEB_CAM',
          isVerifiedLocation: true,
          timestamp: '2026-03-01 19:30:00',
        },
        {
          id: 'l1',
          memberId: 'mem_1',
          scheduleId: 's1',
          memberName: '단원',
          part: 'Alto',
          authMethod: 'QR_WEB_CAM',
          isVerifiedLocation: true,
          timestamp: '2026-02-01 19:30:00',
        },
      ];

      // earliest log is 2026-02-01. On 2026-02-05 -> 5 days
      expect(computeDaysTogether(memberWithoutJoinedAt, logs, '2026-02-05')).toBe(5);
    });

    it('resolves merged member logs (R17)', () => {
      const canonicalMember: Member = {
        ...baseMember,
        id: 'mem_canonical',
        joinedAt: '',
      };
      const aliasMember: Member = {
        ...baseMember,
        id: 'mem_alias_old',
        joinedAt: '',
        mergedIntoId: 'mem_canonical',
      };
      const allMembers = [canonicalMember, aliasMember];
      const logs: RawAttendanceLog[] = [
        {
          id: 'l_old',
          memberId: 'mem_alias_old',
          scheduleId: 's_old',
          memberName: '단원',
          part: 'Alto',
          authMethod: 'QR_WEB_CAM',
          isVerifiedLocation: true,
          timestamp: '2026-01-10 19:30:00',
        },
      ];

      expect(computeDaysTogether(canonicalMember, logs, '2026-01-12', allMembers)).toBe(3);
    });

    it('returns 0 when neither joinedAt nor logs exist, or if joinedAt is in the future', () => {
      const memberFuture: Member = {
        ...baseMember,
        joinedAt: '2026-12-31',
      };
      expect(computeDaysTogether(memberFuture, [], '2026-05-01')).toBe(0);

      const emptyMember: Member = {
        ...baseMember,
        joinedAt: '',
      };
      expect(computeDaysTogether(emptyMember, [], '2026-05-01')).toBe(0);
    });
  });

  describe('computePracticeHours (§5-2)', () => {
    it('sums practice duration for attended/manual/late sessions and floors to hours', () => {
      const dummySchedule: Schedule = {
        id: 's1',
        title: '연습',
        date: '2026-03-01',
        startTime: '19:30',
        endTime: '21:30', // 120 min
        locationName: '연습실',
        category: '정기연습',
      };

      const records: MemberScheduleRecord[] = [
        {
          id: 's1',
          schedule: dummySchedule,
          title: '연습 1',
          date: '2026-03-01',
          category: '정기연습',
          voteStatus: null,
          voteReason: '',
          voteTimestamp: '',
          isAttended: true,
          finalStatus: '출석',
          checkInTime: '19:25',
          isPast: true,
          isToday: false,
          isExempt: false,
        },
        {
          id: 's2',
          schedule: { ...dummySchedule, id: 's2', startTime: '19:00', endTime: '20:30' }, // 90 min
          title: '연습 2',
          date: '2026-03-08',
          category: '정기연습',
          voteStatus: null,
          voteReason: '',
          voteTimestamp: '',
          isAttended: true,
          finalStatus: '지각',
          checkInTime: '19:40',
          isPast: true,
          isToday: false,
          isExempt: false,
        },
        {
          id: 's3',
          schedule: { ...dummySchedule, id: 's3', startTime: '19:00', endTime: '21:00' }, // 120 min
          title: '연습 3 (사유결석 - 제외)',
          date: '2026-03-15',
          category: '정기연습',
          voteStatus: null,
          voteReason: '출장',
          voteTimestamp: '',
          isAttended: false,
          finalStatus: '사유결석',
          checkInTime: '',
          isPast: true,
          isToday: false,
          isExempt: false,
        },
        {
          id: 's4',
          schedule: { ...dummySchedule, id: 's4', startTime: '19:00', endTime: '20:00' }, // 60 min
          title: '연습 4 (수동인정)',
          date: '2026-03-22',
          category: '정기연습',
          voteStatus: null,
          voteReason: '',
          voteTimestamp: '',
          isAttended: true,
          finalStatus: '수동인정',
          checkInTime: '',
          isPast: true,
          isToday: false,
          isExempt: false,
        },
      ];

      // Total attended minutes: 120 + 90 + 60 = 270 minutes -> 4 hours (floored)
      expect(computePracticeHours(records)).toBe(4);
    });

    it('ignores invalid or negative duration sessions', () => {
      const records: MemberScheduleRecord[] = [
        {
          id: 's1',
          schedule: { id: 's1', title: '역전 시간', date: '2026-01-01', startTime: '21:00', endTime: '19:00', locationName: '연습실', category: '정기연습' },
          title: '오류 1',
          date: '2026-01-01',
          category: '정기연습',
          voteStatus: null,
          voteReason: '',
          voteTimestamp: '',
          isAttended: true,
          finalStatus: '출석',
          checkInTime: '',
          isPast: true,
          isToday: false,
          isExempt: false,
        },
      ];
      expect(computePracticeHours(records)).toBe(0);
    });
  });

  describe('computePerformanceCount (§5-2)', () => {
    it('counts performances when category matches and status is attended/late/manual', () => {
      const dummySchedule: Schedule = {
        id: 'p1',
        title: '정기연주회',
        date: '2026-05-01',
        startTime: '19:00',
        endTime: '21:00',
        locationName: '콘서트홀',
        category: '연주',
      };

      const records: MemberScheduleRecord[] = [
        {
          id: 'p1',
          schedule: dummySchedule,
          title: '연주회 1',
          date: '2026-05-01',
          category: '연주',
          voteStatus: null,
          voteReason: '',
          voteTimestamp: '',
          isAttended: true,
          finalStatus: '출석',
          checkInTime: '',
          isPast: true,
          isToday: false,
          isExempt: false,
        },
        {
          id: 'p2',
          schedule: { ...dummySchedule, id: 'p2', category: '녹음' },
          title: '음원 녹음',
          date: '2026-06-01',
          category: '녹음',
          voteStatus: null,
          voteReason: '',
          voteTimestamp: '',
          isAttended: true,
          finalStatus: '지각',
          checkInTime: '',
          isPast: true,
          isToday: false,
          isExempt: false,
        },
        {
          id: 'p3',
          schedule: { ...dummySchedule, id: 'p3', category: '연주' },
          title: '결석한 연주회',
          date: '2026-07-01',
          category: '연주',
          voteStatus: null,
          voteReason: '',
          voteTimestamp: '',
          isAttended: false,
          finalStatus: '결석',
          checkInTime: '',
          isPast: true,
          isToday: false,
          isExempt: false,
        },
      ];

      expect(computePerformanceCount(records)).toBe(1);
      expect(computePerformanceCount(records, ['연주', '녹음'])).toBe(2);
    });
  });

  describe('computeAttendance90Days (§5-2)', () => {
    const member: Member = {
      id: 'mem_1',
      name: '단원',
      part: 'Bass',
      phoneLast4: '0000',
      role: 'MEMBER',
      status: 'ACTIVE',
      createdAt: '2026-01-01',
      memberStatus: '정단원',
    };

    it('excludes absences older than 90 days from the 90-day rate', () => {
      const todayStr = '2026-05-01';
      // 91 days before 2026-05-01: 2026-01-30
      // 90 days before: 2026-01-31
      const schedules: Schedule[] = [
        {
          id: 's_old',
          title: '95일 전 연습 (결석)',
          date: '2026-01-20',
          startTime: '19:30',
          endTime: '21:30',
          locationName: '연습실',
          category: '정기연습',
        },
        {
          id: 's_recent',
          title: '최근 연습 (출석)',
          date: '2026-04-10',
          startTime: '19:30',
          endTime: '21:30',
          locationName: '연습실',
          category: '정기연습',
        },
      ];

      const logs: RawAttendanceLog[] = [
        {
          id: 'log_recent',
          memberId: 'mem_1',
          scheduleId: 's_recent',
          memberName: '단원',
          part: 'Bass',
          authMethod: 'QR_WEB_CAM',
          isVerifiedLocation: true,
          timestamp: '2026-04-10 19:30:00',
        },
      ];

      const result = computeAttendance90Days({
        member,
        schedules,
        logs,
        rsvpVotes: [],
        lateGraceMinutes: 10,
        allMembers: [member],
        todayStr,
      });

      // Old absence must be filtered out! Only s_recent is in 90d window.
      expect(result.totalSessions).toBe(1);
      expect(result.attended).toBe(1);
      expect(result.absent).toBe(0);
      expect(result.attendanceRate).toBe(100);
    });

    it('returns attendanceRate null when totalSessions in 90 days is 0 (for dash "—" display)', () => {
      const todayStr = '2026-05-01';
      const schedules: Schedule[] = [
        {
          id: 's_old',
          title: '오래된 연습',
          date: '2025-01-01',
          startTime: '19:30',
          endTime: '21:30',
          locationName: '연습실',
          category: '정기연습',
        },
      ];

      const result = computeAttendance90Days({
        member,
        schedules,
        logs: [],
        rsvpVotes: [],
        allMembers: [member],
        todayStr,
      });

      expect(result.totalSessions).toBe(0);
      expect(result.attendanceRate).toBeNull();
    });
  });

  describe('formatStaffTenure (§5-7)', () => {
    it('formats tenure boundaries: 29일, 1개월, 12개월, 13개월', () => {
      // 1. 29일 (< 1 month)
      expect(formatStaffTenure(29)).toBe('함께한 지 29일');

      // 2. 1개월 (30 days ~ 31 days)
      expect(formatStaffTenure(30)).toBe('함께한 지 1개월');

      // 3. 12개월 (360 ~ 365 days) -> 1년
      expect(formatStaffTenure(360)).toBe('함께한 지 1년');
      expect(formatStaffTenure(365)).toBe('함께한 지 1년');

      // 4. 13개월 (390 ~ 395 days) -> 1년 1개월
      expect(formatStaffTenure(390)).toBe('함께한 지 1년 1개월');
      expect(formatStaffTenure(395)).toBe('함께한 지 1년 1개월');
    });

    it('formats tenure from date strings correctly', () => {
      // 29 days difference: 2026-01-01 to 2026-01-29 (diff is 28 + 1 = 29 days, months < 1)
      expect(formatStaffTenure('2026-01-01', '2026-01-29')).toBe('함께한 지 29일');

      // 1 month: 2026-01-01 to 2026-02-01
      expect(formatStaffTenure('2026-01-01', '2026-02-01')).toBe('함께한 지 1개월');

      // 12 months: 2025-01-01 to 2026-01-01
      expect(formatStaffTenure('2025-01-01', '2026-01-01')).toBe('함께한 지 1년');

      // 13 months: 2025-01-01 to 2026-02-01
      expect(formatStaffTenure('2025-01-01', '2026-02-01')).toBe('함께한 지 1년 1개월');
    });
  });

  describe('classifyAttendanceStatus & filterRecordsByPeriod (§5-4)', () => {
    it('classifies finalStatus into 4 key categories + other', () => {
      expect(classifyAttendanceStatus('출석')).toBe('ATTENDED');
      expect(classifyAttendanceStatus('수동인정')).toBe('ATTENDED');
      expect(classifyAttendanceStatus('지각')).toBe('LATE');
      expect(classifyAttendanceStatus('사유결석')).toBe('EXCUSED');
      expect(classifyAttendanceStatus('결석')).toBe('ABSENT');
      expect(classifyAttendanceStatus('미참')).toBe('OTHER');
      expect(classifyAttendanceStatus('대기')).toBe('OTHER');
    });

    it('filters records by period (3M, YEAR, ALL)', () => {
      const todayStr = '2026-06-01';
      const records: MemberScheduleRecord[] = [
        { id: '1', date: '2026-05-15' } as MemberScheduleRecord, // 3M, YEAR, ALL
        { id: '2', date: '2026-02-01' } as MemberScheduleRecord, // YEAR, ALL (older than 90d)
        { id: '3', date: '2025-12-01' } as MemberScheduleRecord, // ALL only
      ];

      expect(filterRecordsByPeriod(records, '3M', todayStr).map((r) => r.id)).toEqual(['1']);
      expect(filterRecordsByPeriod(records, 'YEAR', todayStr).map((r) => r.id)).toEqual(['1', '2']);
      expect(filterRecordsByPeriod(records, 'ALL', todayStr).map((r) => r.id)).toEqual(['1', '2', '3']);
    });
  });
});
