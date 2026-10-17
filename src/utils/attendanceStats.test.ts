import { describe, it, expect } from 'vitest';
import {
  isMemberRequiredForSchedule,
  calculateCumulativeAttendanceWithLifecycle,
  getGamifiedAttendanceLevel,
} from './attendanceStats';
import type { Member, Schedule, RawAttendanceLog } from '../types/rollbook';

describe('Member Lifecycle & Attendance Eligibility Engine', () => {
  const sampleSchedules: Schedule[] = [
    {
      id: 's_oct_10',
      title: '가을 정기연습',
      date: '2026-10-10',
      startTime: '19:30',
      endTime: '22:00',
      locationName: '제1연습실',
      category: '정기연습',
    },
    {
      id: 's_oct_20',
      title: '가을 정기연습',
      date: '2026-10-20',
      startTime: '19:30',
      endTime: '22:00',
      locationName: '제1연습실',
      category: '정기연습',
    },
    {
      id: 's_nov_10',
      title: '가을 정기연습',
      date: '2026-11-10',
      startTime: '19:30',
      endTime: '22:00',
      locationName: '제1연습실',
      category: '정기연습',
    },
  ];

  it('10-16에 합류한 신입 단원은 10-10 연습에 대한 출결 의무가 없어야 한다 (모수 제외)', () => {
    const newMember: Member = {
      id: 'm_new',
      name: '신입단원',
      part: '소프라노',
      phoneLast4: '1234',
      role: 'MEMBER',
      createdAt: '2026-10-16T00:00:00Z',
      status: 'ACTIVE',
      joinedAt: '2026-10-16',
      memberStatus: '정단원',
    };

    // 10-10 연습: 입단 전이므로 의무 없음
    expect(isMemberRequiredForSchedule(newMember, '2026-10-10')).toBe(false);
    // 10-20 연습: 입단 후이므로 필참
    expect(isMemberRequiredForSchedule(newMember, '2026-10-20')).toBe(true);

    // 출석 로그: 10-20 연습에만 출석
    const logs: RawAttendanceLog[] = [
      {
        id: 'log_1',
        scheduleId: 's_oct_20',
        memberId: 'm_new',
        memberName: '신입단원',
        part: '소프라노',
        timestamp: '2026-10-20T19:30:00Z',
        authMethod: 'QR_WEB_CAM',
        isVerifiedLocation: true,
      },
    ];

    // 11월 15일 기준(모든 일정 종료)
    const stats = calculateCumulativeAttendanceWithLifecycle(
      [newMember],
      sampleSchedules,
      logs,
      '2026-11-15'
    );

    // 신입단원은 10-10은 모수에서 빠지고, 10-20(출석), 11-10(미출석) 총 2회만 모수가 됨
    expect(stats[0].totalSessions).toBe(2);
    expect(stats[0].attended).toBe(1);
    expect(stats[0].absent).toBe(1);
    expect(stats[0].attendanceRate).toBe(50);
  });

  it('미래 일정(오늘 이후)은 모수 및 결석에서 완전 제외되어야 한다 (출석률 왜곡 방지)', () => {
    const regularMember: Member = {
      id: 'm_reg',
      name: '기존단원',
      part: '테너',
      phoneLast4: '1111',
      role: 'MEMBER',
      createdAt: '2026-01-01T00:00:00Z',
      status: 'ACTIVE',
      joinedAt: '2026-01-01',
      memberStatus: '정단원',
    };

    // 10-10 출석 완료
    const logs: RawAttendanceLog[] = [
      {
        id: 'l_oct_10',
        scheduleId: 's_oct_10',
        memberId: 'm_reg',
        memberName: '기존단원',
        part: '테너',
        timestamp: '2026-10-10T19:30:00Z',
        authMethod: 'QR_WEB_CAM',
        isVerifiedLocation: true,
      },
    ];

    // 기준일: 2026-10-15 (10-20과 11-10은 미래 일정)
    const stats = calculateCumulativeAttendanceWithLifecycle(
      [regularMember],
      sampleSchedules,
      logs,
      '2026-10-15'
    );

    // 아직 도래하지 않은 미래 2개 일정은 결석으로 잡히지 않고, 오직 10-10 1회만 모수 및 출석으로 계산 (출석률 100%)
    expect(stats[0].totalSessions).toBe(1);
    expect(stats[0].attended).toBe(1);
    expect(stats[0].absent).toBe(0);
    expect(stats[0].attendanceRate).toBe(100);
  });

  it('휴단원은 휴단일 이후 연습에 결석으로 처리되지 않아야 한다', () => {
    const onLeaveMember: Member = {
      id: 'm_leave',
      name: '휴단원A',
      part: '알토',
      phoneLast4: '5678',
      role: 'MEMBER',
      createdAt: '2026-09-01T00:00:00Z',
      status: 'ACTIVE',
      joinedAt: '2026-09-01',
      memberStatus: '휴단원',
      statusHistory: [
        {
          id: 'h1',
          memberId: 'm_leave',
          status: '정단원',
          part: '알토',
          startDate: '2026-09-01',
          endDate: '2026-10-31',
          createdAt: '2026-09-01T00:00:00Z',
        },
        {
          id: 'h2',
          memberId: 'm_leave',
          status: '휴단원',
          part: '알토',
          startDate: '2026-11-01',
          endDate: '2999-12-31',
          reason: '취업 준비',
          createdAt: '2026-10-30T00:00:00Z',
        },
      ],
    };

    // 10월 연습은 필참, 11월 연습은 의무 제외
    expect(isMemberRequiredForSchedule(onLeaveMember, '2026-10-10')).toBe(true);
    expect(isMemberRequiredForSchedule(onLeaveMember, '2026-10-20')).toBe(true);
    expect(isMemberRequiredForSchedule(onLeaveMember, '2026-11-10')).toBe(false);

    // 10-10, 10-20만 출석하고 11-10은 안 옴
    const logs: RawAttendanceLog[] = [
      {
        id: 'l1',
        scheduleId: 's_oct_10',
        memberId: 'm_leave',
        memberName: '휴단원A',
        part: '알토',
        timestamp: '2026-10-10T19:30:00Z',
        authMethod: 'QR_WEB_CAM',
        isVerifiedLocation: true,
      },
      {
        id: 'l2',
        scheduleId: 's_oct_20',
        memberId: 'm_leave',
        memberName: '휴단원A',
        part: '알토',
        timestamp: '2026-10-20T19:30:00Z',
        authMethod: 'QR_WEB_CAM',
        isVerifiedLocation: true,
      },
    ];

    // 11월 15일 기준
    const stats = calculateCumulativeAttendanceWithLifecycle(
      [onLeaveMember],
      sampleSchedules,
      logs,
      '2026-11-15'
    );

    // 11-10은 휴단 상태라 결석으로 잡히지 않고, 총 2회 중 2회 출석(100%)
    expect(stats[0].totalSessions).toBe(2);
    expect(stats[0].attended).toBe(2);
    expect(stats[0].absent).toBe(0);
    expect(stats[0].attendanceRate).toBe(100);
  });

  it('휴단원이 자발적으로 연습에 와서 출석한 경우, 출석한 날만 모수+1, 출석+1 인정되고 게스트 뱃지가 부여되어야 한다', () => {
    const guestMember: Member = {
      id: 'm_guest',
      name: '휴단원B',
      part: '베이스',
      phoneLast4: '9999',
      role: 'MEMBER',
      createdAt: '2026-09-01T00:00:00Z',
      status: 'ACTIVE',
      joinedAt: '2026-09-01',
      memberStatus: '휴단원',
      statusHistory: [
        {
          id: 'h_all',
          memberId: 'm_guest',
          status: '휴단원',
          part: '베이스',
          startDate: '2026-09-01',
          endDate: '2999-12-31',
          reason: '학업 휴단',
          createdAt: '2026-09-01T00:00:00Z',
        },
      ],
    };

    // 11-10에 깜짝 방문하여 출석함!
    const logs: RawAttendanceLog[] = [
      {
        id: 'l_opt_in',
        scheduleId: 's_nov_10',
        memberId: 'm_guest',
        memberName: '휴단원B',
        part: '베이스',
        timestamp: '2026-11-10T19:30:00Z',
        authMethod: 'QR_WEB_CAM',
        isVerifiedLocation: true,
      },
    ];

    const stats = calculateCumulativeAttendanceWithLifecycle(
      [guestMember],
      sampleSchedules,
      logs,
      '2026-11-15'
    );

    // 오직 출석한 1회만 모수에 포함되어 출석률 100% 유지 & 게스트 1회 뱃지 부여
    expect(stats[0].totalSessions).toBe(1);
    expect(stats[0].attended).toBe(1);
    expect(stats[0].guestAttended).toBe(1);
    expect(stats[0].attendanceRate).toBe(100);
    expect(stats[0].badges).toContain('게스트 1회');
  });

  it('getGamifiedAttendanceLevel는 출석 횟수에 따라 정확한 레벨 뱃지와 진척도를 반환해야 한다', () => {
    // 0회: 새싹 소프라노 (0/4, 0%)
    const lv0 = getGamifiedAttendanceLevel(0, '소프라노');
    expect(lv0.currentLevelName).toBe('새싹 소프라노');
    expect(lv0.nextLevelName).toBe('성실한 소프라노');
    expect(lv0.progressPercent).toBe(0);
    expect(lv0.badgeEmoji).toBe('🌱');

    // 2회: 새싹 (2/4, 50%)
    const lv2 = getGamifiedAttendanceLevel(2, '소프라노');
    expect(lv2.progressPercent).toBe(50);

    // 5회: 성실한 (5-4 / 4 = 25%)
    const lv5 = getGamifiedAttendanceLevel(5, '알토');
    expect(lv5.currentLevelName).toBe('성실한 알토');
    expect(lv5.badgeEmoji).toBe('🥉');
    expect(lv5.progressPercent).toBe(25);

    // 10회: 빛나는 (10-8 / 4 = 50%)
    const lv10 = getGamifiedAttendanceLevel(10, '테너');
    expect(lv10.currentLevelName).toBe('빛나는 테너');
    expect(lv10.badgeEmoji).toBe('🥈');
    expect(lv10.progressPercent).toBe(50);

    // 15회: 개근 마스터 (100%)
    const lv15 = getGamifiedAttendanceLevel(15, '베이스');
    expect(lv15.currentLevelName).toBe('개근 마스터');
    expect(lv15.nextLevelName).toBeNull();
    expect(lv15.progressPercent).toBe(100);
    expect(lv15.badgeEmoji).toBe('🌟');
  });
});

