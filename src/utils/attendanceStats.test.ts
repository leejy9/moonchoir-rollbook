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

  describe('Audience Selector (대상자 지정 필터)', () => {
    const sopranoMember: Member = {
      id: 'm_sop',
      name: '소프단원',
      part: '소프라노',
      phoneLast4: '1111',
      role: 'MEMBER',
      createdAt: '2026-01-01T00:00:00Z',
      status: 'ACTIVE',
      joinedAt: '2026-01-01',
      memberStatus: '정단원',
    };

    const tenorMember: Member = {
      id: 'm_ten',
      name: '테너단원',
      part: '테너',
      phoneLast4: '2222',
      role: 'MEMBER',
      createdAt: '2026-01-01T00:00:00Z',
      status: 'ACTIVE',
      joinedAt: '2026-01-01',
      memberStatus: '정단원',
    };

    it('특정 파트(소프라노/알토) 한정 일정은 테너 단원의 모수에서 완전 제외되어야 한다', () => {
      const partSchedule: Schedule = {
        id: 'sch_sop_part',
        title: '여성파트 추가연습',
        date: '2026-10-12',
        startTime: '19:30',
        endTime: '21:30',
        locationName: '제1연습실',
        category: '추가연습',
        targetAudienceType: 'PARTS',
        targetParts: ['소프라노', '알토'],
      };

      expect(isMemberRequiredForSchedule(sopranoMember, partSchedule.date, partSchedule)).toBe(true);
      expect(isMemberRequiredForSchedule(tenorMember, partSchedule.date, partSchedule)).toBe(false);

      // 테너 단원은 불참했어도 결석으로 카운트되지 않음
      const stats = calculateCumulativeAttendanceWithLifecycle(
        [tenorMember],
        [partSchedule],
        [],
        '2026-10-15'
      );
      expect(stats[0].totalSessions).toBe(0);
      expect(stats[0].absent).toBe(0);
    });

    it('선발 단원(CUSTOM_MEMBERS) 한정 일정은 미선발 단원의 모수에서 완전 제외되어야 한다', () => {
      const customSchedule: Schedule = {
        id: 'sch_solo_rehearsal',
        title: '솔리스트 특별 연습',
        date: '2026-10-14',
        startTime: '19:30',
        endTime: '21:30',
        locationName: '제1연습실',
        category: '추가연습',
        targetAudienceType: 'CUSTOM_MEMBERS',
        targetMemberIds: ['m_sop'], // 소프단원만 선발
      };

      expect(isMemberRequiredForSchedule(sopranoMember, customSchedule.date, customSchedule)).toBe(true);
      expect(isMemberRequiredForSchedule(tenorMember, customSchedule.date, customSchedule)).toBe(false);

      const stats = calculateCumulativeAttendanceWithLifecycle(
        [sopranoMember, tenorMember],
        [customSchedule],
        [],
        '2026-10-15'
      );

      // 소프단원은 대상자이므로 미출석 시 결석 1회
      expect(stats[0].totalSessions).toBe(1);
      expect(stats[0].absent).toBe(1);

      // 테너단원은 비대상자이므로 모수 0회, 결석 0회
      expect(stats[1].totalSessions).toBe(0);
      expect(stats[1].absent).toBe(0);
    });

    it('관리자가 직접 지정(CUSTOM_MEMBERS)한 경우 휴단원도 필참으로 인정하되, 퇴단원은 실수로 지정해도 제외한다', () => {
      const inactiveMember: Member = {
        id: 'm_inactive',
        name: '휴단원',
        part: '소프라노',
        phoneLast4: '9999',
        role: 'MEMBER',
        status: 'ACTIVE',
        joinedAt: '2025-01-01',
        memberStatus: '휴단원',
        createdAt: '2025-01-01 00:00:00',
      };

      const withdrawnMember: Member = {
        id: 'm_withdrawn',
        name: '퇴단원',
        part: '베이스',
        phoneLast4: '8888',
        role: 'MEMBER',
        status: 'ACTIVE',
        joinedAt: '2025-01-01',
        memberStatus: '퇴단원',
        createdAt: '2025-01-01 00:00:00',
      };

      const customSch: Schedule = {
        id: 'sch_special_callup',
        title: '특별 차출 연습',
        date: '2026-10-18',
        startTime: '19:30',
        endTime: '21:30',
        locationName: '제1연습실',
        category: '추가연습',
        targetAudienceType: 'CUSTOM_MEMBERS',
        targetMemberIds: ['m_inactive', 'm_withdrawn'], // 관리자가 휴단원과 실수로 퇴단원을 지정
      };

      const normalSch: Schedule = {
        id: 'sch_regular_all',
        title: '전체 정기연습',
        date: '2026-10-22',
        startTime: '19:30',
        endTime: '21:30',
        locationName: '제1연습실',
        category: '정기연습',
        targetAudienceType: 'ALL',
      };

      // 1. CUSTOM_MEMBERS 일정: 휴단원은 관리자의 명시적 차출로 필참 인정
      expect(isMemberRequiredForSchedule(inactiveMember, customSch.date, customSch)).toBe(true);

      // 2. CUSTOM_MEMBERS 일정: 퇴단원은 실수로 지정되었어도 안전하게 의무 제외
      expect(isMemberRequiredForSchedule(withdrawnMember, customSch.date, customSch)).toBe(false);

      // 3. ALL 정기 일정: 휴단원은 일반 일정에선 의무 제외(자율 대상자)
      expect(isMemberRequiredForSchedule(inactiveMember, normalSch.date, normalSch)).toBe(false);
    });

    it('과거 휴단원 이력이 있더라도 정단원으로 복귀한 최신 상태가 전체 일정 필참으로 올바르게 판정된다', () => {
      const returnedMember: Member = {
        id: 'mem_returnee',
        name: '이재연',
        part: '테너',
        phoneLast4: '4240',
        role: 'MEMBER',
        status: 'ACTIVE',
        joinedAt: '2023-03-01',
        createdAt: '2023-03-01 00:00:00',
        memberStatus: '정단원',
        statusHistory: [
          {
            id: 'hist_old_leave',
            memberId: 'mem_returnee',
            status: '휴단원',
            part: '테너',
            startDate: '2026-10-18',
            endDate: '2999-12-31',
            createdAt: '2026-10-18 00:00:00',
          },
          {
            id: 'hist_new_active',
            memberId: 'mem_returnee',
            status: '정단원',
            part: '테너',
            startDate: '2026-10-18',
            endDate: '2999-12-31',
            createdAt: '2026-10-18 01:00:00', // 더 나중에 생성된 최신 이력
          },
        ],
      };

      const regularSch: Schedule = {
        id: 'sch_20261022',
        title: '문콰이어 정기연습',
        date: '2026-10-22',
        startTime: '19:30',
        endTime: '22:00',
        locationName: '문콰이어 정기연습실',
        category: '정기연습',
        targetAudienceType: 'ALL',
      };

      // 최신 이력이 '정단원'이므로 정기연습 일정에 필참(true)으로 계산되어야 함
      expect(isMemberRequiredForSchedule(returnedMember, regularSch.date, regularSch)).toBe(true);
    });
  });
});

