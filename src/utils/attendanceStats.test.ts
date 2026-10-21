import { describe, it, expect } from 'vitest';
import {
  isMemberRequiredForSchedule,
  reconcileSingleMemberAttendance,
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
        timestamp: '2026-10-20 19:30:00',
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

  it('입단 전 일정에 수동 결석 로그가 있어도 미참으로 처리한다', () => {
    const member: Member = {
      id: 'm_joined_later',
      name: '신입단원',
      part: '소프라노',
      phoneLast4: '1234',
      role: 'MEMBER',
      createdAt: '2026-10-16T00:00:00Z',
      status: 'ACTIVE',
      joinedAt: '2026-10-16',
      memberStatus: '정단원',
    };
    const schedule = sampleSchedules[0];
    const manualAbsentLog: RawAttendanceLog = {
      id: 'manual-absent-before-joining',
      scheduleId: schedule.id,
      memberId: member.id,
      memberName: member.name,
      part: member.part,
      timestamp: '2026-10-10T19:30:00Z',
      authMethod: 'MANUAL_BY_ADMIN',
      isVerifiedLocation: false,
      adminNote: '관리자 결석 처리 (노쇼)',
    };

    const result = reconcileSingleMemberAttendance(member, schedule, [manualAbsentLog]);

    expect(result.finalStatus).toBe('미참');
  });

  it('미래 일정의 출석 로그보다 나중에 추가된 초기화 로그를 우선한다', () => {
    const member: Member = {
      id: 'm_regular',
      name: '정단원',
      part: '테너',
      phoneLast4: '1234',
      role: 'MEMBER',
      createdAt: '2026-01-01T00:00:00Z',
      status: 'ACTIVE',
      joinedAt: '2026-01-01',
      memberStatus: '정단원',
    };
    const schedule: Schedule = {
      id: 's_oct_22',
      title: '정기 연습',
      date: '2026-10-22',
      startTime: '19:30',
      endTime: '22:00',
      locationName: '제1연습실',
      category: '정기연습',
    };
    const attendanceLog: RawAttendanceLog = {
      id: 'log_manual_future_attendance',
      scheduleId: schedule.id,
      memberId: member.id,
      memberName: member.name,
      part: member.part,
      timestamp: '2026-10-22T19:30:00',
      authMethod: 'MANUAL_BY_ADMIN',
      isVerifiedLocation: true,
      adminNote: '관리자 수동 출석 인정',
    };
    const resetLog: RawAttendanceLog = {
      id: 'log_cancel_later_action',
      scheduleId: schedule.id,
      memberId: member.id,
      memberName: member.name,
      part: member.part,
      timestamp: '2026-10-21T11:09:38',
      authMethod: 'MANUAL_BY_ADMIN',
      isVerifiedLocation: false,
      adminNote: '관리자 출결 취소 (초기화)',
    };

    const resetResult = reconcileSingleMemberAttendance(member, schedule, [attendanceLog, resetLog]);
    expect(resetResult.finalStatus).toBe('결석');
    expect(resetResult.isAttendanceCleared).toBe(true);

    const laterAttendanceLog = { ...attendanceLog, id: 'log_manual_reapplied' };
    const reappliedResult = reconcileSingleMemberAttendance(member, schedule, [
      attendanceLog,
      resetLog,
      laterAttendanceLog,
    ]);
    expect(reappliedResult.finalStatus).toBe('출석');
    expect(reappliedResult.isAttendanceCleared).toBe(false);
  });

  it('ADMIN의 제공된 10/22 단원·일정 데이터는 필참 대상으로 판정한다', () => {
    const member: Member = {
      id: 'mem_new_1792508291001',
      name: 'ADMIN',
      part: '베이스',
      phoneLast4: '0000',
      role: 'MEMBER',
      createdAt: '2026-10-21T00:00:00Z',
      status: 'ACTIVE',
      joinedAt: '2026-10-21',
      memberStatus: '준단원',
      statusHistory: [
        {
          id: 'hist_temporary_base_member',
          memberId: 'mem_new_1792508291001',
          status: '준단원',
          part: '베이스',
          startDate: '2026-10-21',
          endDate: '2026-11-21',
          createdAt: '2026-10-21 11:49:16',
        },
      ],
    };
    const schedule: Schedule = {
      id: 'sch_20261022_prm7',
      title: '문콰이어 정기연습',
      date: '2026-10-22',
      startTime: '19:30',
      endTime: '22:00',
      locationName: '문콰이어 정기연습실 (예든)',
      category: '정기연습',
      targetAudienceType: 'PARTS',
      targetParts: ['소프라노', '알토', '테너', '베이스'],
    };

    expect(isMemberRequiredForSchedule(member, schedule.date, schedule)).toBe(true);
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
        timestamp: '2026-10-10 19:30:00',
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
        timestamp: '2026-10-10 19:30:00',
        authMethod: 'QR_WEB_CAM',
        isVerifiedLocation: true,
      },
      {
        id: 'l2',
        scheduleId: 's_oct_20',
        memberId: 'm_leave',
        memberName: '휴단원A',
        part: '알토',
        timestamp: '2026-10-20 19:30:00',
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
        timestamp: '2026-11-10 19:30:00',
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

  it('getGamifiedAttendanceLevel는 4단계 구간(8, 24, 50회)과 파트명에 따라 정확한 레벨 칭호와 진척도를 반환해야 한다', () => {
    // 1단계: 0~7회 (새싹 소프라노, 목표 8회)
    const lv0 = getGamifiedAttendanceLevel(0, '소프라노');
    expect(lv0.currentLevelName).toBe('새싹 소프라노');
    expect(lv0.nextLevelName).toBe('성실한 소프라노');
    expect(lv0.progressPercent).toBe(0);
    expect(lv0.badgeEmoji).toBe('🌱');

    const lv4 = getGamifiedAttendanceLevel(4, '소프라노');
    expect(lv4.progressPercent).toBe(50); // 4 / 8 = 50%

    // 2단계: 8~23회 (성실한 알토, 목표 24회)
    const lv8 = getGamifiedAttendanceLevel(8, '알토');
    expect(lv8.currentLevelName).toBe('성실한 알토');
    expect(lv8.nextLevelName).toBe('알토의 기둥');
    expect(lv8.badgeEmoji).toBe('🎵');
    expect(lv8.progressPercent).toBe(0); // (8 - 8) / 16 = 0%

    const lv16 = getGamifiedAttendanceLevel(16, '알토');
    expect(lv16.progressPercent).toBe(50); // (16 - 8) / 16 = 50%

    // 3단계: 24~49회 (테너의 기둥, 목표 50회)
    const lv24 = getGamifiedAttendanceLevel(24, '테너');
    expect(lv24.currentLevelName).toBe('테너의 기둥');
    expect(lv24.nextLevelName).toBe('문콰이어 테너 레전드');
    expect(lv24.badgeEmoji).toBe('🏛️');
    expect(lv24.progressPercent).toBe(0); // (24 - 24) / 26 = 0%

    const lv37 = getGamifiedAttendanceLevel(37, '테너');
    expect(lv37.progressPercent).toBe(50); // (37 - 24) / 26 = 50%

    // 4단계: 50회 이상 (문콰이어 베이스 레전드, 100%)
    const lv50 = getGamifiedAttendanceLevel(50, '베이스');
    expect(lv50.currentLevelName).toBe('문콰이어 베이스 레전드');
    expect(lv50.nextLevelName).toBeNull();
    expect(lv50.progressPercent).toBe(100);
    expect(lv50.badgeEmoji).toBe('👑');

    // 파트명이 기타이거나 없을 경우 기본값 '단원' 적용
    const lvDefault = getGamifiedAttendanceLevel(10, '기타');
    expect(lvDefault.currentLevelName).toBe('성실한 단원');
    expect(lvDefault.nextLevelName).toBe('단원의 기둥');
  });

  it('지각생은 통계 산출 시 1.0회 출석으로 인정(감점 없음)되고, 원천 로그에는 지각으로 보존되어야 한다', () => {
    const member: Member = {
      id: 'm_late_test',
      name: '지각단원',
      part: '알토',
      phoneLast4: '9999',
      role: 'MEMBER',
      createdAt: '2026-01-01T00:00:00Z',
      status: 'ACTIVE',
      joinedAt: '2026-01-01',
      memberStatus: '정단원',
    };

    // 2개 일정: 1회 정상출석, 1회 지각
    const schedules: Schedule[] = [
      {
        id: 'sch_1',
        title: '연습 1',
        date: '2026-10-01',
        startTime: '19:30',
        endTime: '21:30',
        locationName: '연습실',
        category: '정기연습',
      },
      {
        id: 'sch_2',
        title: '연습 2',
        date: '2026-10-08',
        startTime: '19:30',
        endTime: '21:30',
        locationName: '연습실',
        category: '정기연습',
      },
    ];

    const logs: RawAttendanceLog[] = [
      {
        id: 'log_normal',
        scheduleId: 'sch_1',
        memberId: 'm_late_test',
        memberName: '지각단원',
        part: '알토',
        timestamp: '2026-10-01 19:25:00', // 제시간 출석
        authMethod: 'QR_WEB_CAM',
        isVerifiedLocation: true,
      },
      {
        id: 'log_late',
        scheduleId: 'sch_2',
        memberId: 'm_late_test',
        memberName: '지각단원',
        part: '알토',
        timestamp: '2026-10-08 19:45:00', // 지각 출석
        authMethod: 'QR_WEB_CAM',
        isVerifiedLocation: true,
      },
    ];

    const stats = calculateCumulativeAttendanceWithLifecycle(
      [member],
      schedules,
      logs,
      '2026-10-15'
    );

    expect(stats[0].totalSessions).toBe(2);
    expect(stats[0].attended).toBe(1); // 순수 제시간 출석
    expect(stats[0].late).toBe(1);     // 지각 1회 보존
    expect(stats[0].absent).toBe(0);
    // 지각도 1.0 인정: (1 + 1) / 2 * 100 = 100%
    expect(stats[0].attendanceRate).toBe(100);
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

    it('ALL 일정은 선생님도 기본 필참 대상에 포함하고, 객원은 제외해야 한다', () => {
      const teacherMember: Member = {
        id: 'mem_teacher',
        name: '박선생',
        part: '선생님',
        memberStatus: '선생님',
        role: 'ADMIN',
        status: 'ACTIVE',
        phoneLast4: '9999',
        joinedAt: '2026-01-01',
        createdAt: '2026-01-01 00:00:00',
      };

      const guestMember: Member = {
        id: 'mem_guest',
        name: '최객원',
        part: '객원',
        memberStatus: '객원',
        role: 'GUEST',
        status: 'ACTIVE',
        phoneLast4: '8888',
        joinedAt: '2026-01-01',
        createdAt: '2026-01-01 00:00:00',
      };

      const regularSch: Schedule = {
        id: 'sch_all_test',
        title: '정기연습',
        date: '2026-10-22',
        startTime: '19:30',
        endTime: '21:30',
        locationName: '제1연습실',
        category: '정기연습',
        targetAudienceType: 'ALL',
      };

      expect(isMemberRequiredForSchedule(teacherMember, regularSch.date, regularSch)).toBe(true);
      expect(isMemberRequiredForSchedule(guestMember, regularSch.date, regularSch)).toBe(false);
    });

    it('ALL_WITH_GUESTS 일정은 정단원, 선생님, 객원 모두 필참 대상이어야 한다', () => {
      const teacherMember: Member = {
        id: 'mem_teacher_2',
        name: '박선생',
        part: '선생님',
        memberStatus: '선생님',
        role: 'ADMIN',
        status: 'ACTIVE',
        phoneLast4: '9999',
        joinedAt: '2026-01-01',
        createdAt: '2026-01-01 00:00:00',
      };

      const guestMember: Member = {
        id: 'mem_guest_2',
        name: '최객원',
        part: '객원',
        memberStatus: '객원',
        role: 'GUEST',
        status: 'ACTIVE',
        phoneLast4: '8888',
        joinedAt: '2026-01-01',
        createdAt: '2026-01-01 00:00:00',
      };

      const concertSch: Schedule = {
        id: 'sch_concert_test',
        title: '정기연주회',
        date: '2026-10-25',
        startTime: '17:00',
        endTime: '20:00',
        locationName: '예술의전당',
        category: '연주',
        targetAudienceType: 'ALL_WITH_GUESTS',
      };

      expect(isMemberRequiredForSchedule(teacherMember, concertSch.date, concertSch)).toBe(true);
      expect(isMemberRequiredForSchedule(guestMember, concertSch.date, concertSch)).toBe(true);
    });
  });
});

describe('과거 UTC(Z) 체크인 기록의 지각 판정은 한국 시각 기준', () => {
  const member = {
    id: 'mem_utc',
    name: '시각단원',
    part: '알토',
    phoneLast4: '0000',
    role: 'MEMBER',
    createdAt: '2026-01-01 00:00:00',
    status: 'ACTIVE',
    joinedAt: '2026-01-01',
    memberStatus: '정단원',
  } as Member;
  const schedule = {
    id: 's_utc',
    title: '정기 연습',
    date: '2026-10-08',
    startTime: '19:30',
    endTime: '22:00',
    locationName: '제1연습실',
    category: '정기연습',
  } as Schedule;
  const logAt = (timestamp: string): RawAttendanceLog => ({
    id: `log_${timestamp}`,
    scheduleId: schedule.id,
    memberId: member.id,
    memberName: member.name,
    part: member.part,
    timestamp,
    authMethod: 'QR_WEB_CAM',
    isVerifiedLocation: true,
  });

  it('UTC 10:25Z(= KST 19:25)는 출석, UTC 10:45Z(= KST 19:45)는 지각', () => {
    expect(reconcileSingleMemberAttendance(member, schedule, [logAt('2026-10-08T10:25:00Z')]).finalStatus).toBe('출석');
    expect(reconcileSingleMemberAttendance(member, schedule, [logAt('2026-10-08T10:45:00Z')]).finalStatus).toBe('지각');
  });

  it('같은 시각을 KST 표준 문자열로 적어도 같은 판정', () => {
    expect(reconcileSingleMemberAttendance(member, schedule, [logAt('2026-10-08 19:25:00')]).finalStatus).toBe('출석');
    expect(reconcileSingleMemberAttendance(member, schedule, [logAt('2026-10-08 19:45:00')]).finalStatus).toBe('지각');
  });
});

