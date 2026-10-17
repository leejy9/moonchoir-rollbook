import type {
  Member,
  Schedule,
  RawAttendanceLog,
  CumulativeMemberAttendance,
  AttendanceStatus,
  MemberStatus,
  PartType,
} from '../types/rollbook';

/**
 * 특정 일자(date) 시점에 단원의 유효한 상태(Status)와 파트(Part)를 판정합니다.
 */
export function getEffectiveMemberStatus(
  member: Member,
  date: string
): { status: MemberStatus; part: PartType } {
  if (member.statusHistory && member.statusHistory.length > 0) {
    // 날짜 범위가 일치하는 이력 탐색 (최신 생성순 또는 특정 구간 매칭)
    const matched = member.statusHistory.find(
      (h) => h.startDate <= date && date <= h.endDate
    );
    if (matched) {
      return { status: matched.status, part: matched.part };
    }
  }

  // Fallback: 기본 프로필 상태 사용
  return {
    status: member.memberStatus || '정단원',
    part: member.part || '소프라노',
  };
}

/**
 * 특정 일정 일자에 해당 단원이 '정규 출결 의무 대상(필참)'인지 판정합니다.
 * 대상자 지정(targetAudienceType: 'ALL' | 'PARTS' | 'CUSTOM_MEMBERS')을 완벽히 지원합니다.
 */
export function isMemberRequiredForSchedule(
  member: Member,
  scheduleDate: string,
  schedule?: Pick<Schedule, 'targetAudienceType' | 'targetParts' | 'targetMemberIds'>
): boolean {
  // 1. 입단일 이전의 일정은 출결 의무 없음 (모수 제외)
  if (member.joinedAt && scheduleDate < member.joinedAt) {
    return false;
  }

  // 2. 해당 일자 시점의 유효 회원 상태 판정
  const effective = getEffectiveMemberStatus(member, scheduleDate);

  // 3. 일정 대상자 지정 필터 검사 (Audience Selector)
  if (schedule?.targetAudienceType === 'PARTS') {
    if (!schedule.targetParts || !schedule.targetParts.includes(effective.part)) {
      return false; // 해당 파트가 아니면 의무 제외 (모수 제외)
    }
  } else if (schedule?.targetAudienceType === 'CUSTOM_MEMBERS') {
    if (!schedule.targetMemberIds || !schedule.targetMemberIds.includes(member.id)) {
      return false; // 지정된 단원이 아니면 의무 제외 (모수 제외)
    }
  }

  // 4. 정단원, 준단원은 기본 필참 대상
  if (effective.status === '정단원' || effective.status === '준단원') {
    return true;
  }

  // 휴단원, 퇴단원, 객원 등은 의무 제외
  return false;
}

/**
 * 단원의 누적 출석 횟수에 따른 게이미피케이션 레벨 및 뱃지 상태를 계산합니다.
 */
export interface GamifiedLevel {
  currentLevelName: string;
  nextLevelName: string | null;
  currentCount: number;
  targetCount: number;
  progressPercent: number;
  badgeEmoji: string;
}

export function getGamifiedAttendanceLevel(attendedCount: number, part: string = '단원'): GamifiedLevel {
  const safeCount = Math.max(0, attendedCount);
  if (safeCount < 4) {
    return {
      currentLevelName: `새싹 ${part}`,
      nextLevelName: `성실한 ${part}`,
      currentCount: safeCount,
      targetCount: 4,
      progressPercent: Math.min(100, Math.round((safeCount / 4) * 100)),
      badgeEmoji: '🌱',
    };
  }
  if (safeCount < 8) {
    return {
      currentLevelName: `성실한 ${part}`,
      nextLevelName: `빛나는 ${part}`,
      currentCount: safeCount,
      targetCount: 8,
      progressPercent: Math.min(100, Math.round(((safeCount - 4) / 4) * 100)),
      badgeEmoji: '🥉',
    };
  }
  if (safeCount < 12) {
    return {
      currentLevelName: `빛나는 ${part}`,
      nextLevelName: `개근 마스터`,
      currentCount: safeCount,
      targetCount: 12,
      progressPercent: Math.min(100, Math.round(((safeCount - 8) / 4) * 100)),
      badgeEmoji: '🥈',
    };
  }
  return {
    currentLevelName: `개근 마스터`,
    nextLevelName: null,
    currentCount: safeCount,
    targetCount: safeCount,
    progressPercent: 100,
    badgeEmoji: '🌟',
  };
}

/**
 * 단원 생애주기 이력과 입단일을 반영하여 단원별 누적 출결 통계를 산출합니다.
 * 도메인 불변식: 미래 일정(schedule.date > referenceDate)은 결석 및 모수에서 완전 제외합니다.
 */
export function calculateCumulativeAttendanceWithLifecycle(
  members: Member[],
  schedules: Schedule[],
  rawLogs: RawAttendanceLog[],
  referenceDate?: string
): CumulativeMemberAttendance[] {
  // 기준 날짜 (기본: 오늘 YYYY-MM-DD)
  const todayStr = referenceDate || new Date().toLocaleDateString('sv-SE');

  // 숨김 처리되지 않은 활성 일정만 필터
  const activeSchedules = schedules.filter((s) => !s.isArchived);

  return members.map((member) => {
    let totalSessions = 0;
    let attended = 0;
    let late = 0;
    let excused = 0;
    let absent = 0;
    let guestAttended = 0;
    const recentStatusList: AttendanceStatus[] = [];

    // 날짜 오름차순으로 일정 정렬
    const sortedSchedules = [...activeSchedules].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    for (const schedule of sortedSchedules) {
      const isPastOrToday = schedule.date <= todayStr;
      const isRequired = isMemberRequiredForSchedule(member, schedule.date, schedule);

      // 해당 일정에 단원의 출석 원천로그가 존재하는지 조회 (날짜 일치 Fallback 구출)
      const memberLogs = rawLogs.filter((log) => {
        if (log.memberId !== member.id) return false;
        if (log.scheduleId === schedule.id) return true;
        if (log.timestamp && log.timestamp.slice(0, 10) === schedule.date) return true;
        return false;
      });

      const hasCheckedIn = memberLogs.length > 0;
      const lastLog = memberLogs[memberLogs.length - 1]; // 최신 액션 우선 채택

      if (isRequired) {
        // 정규 필참 일정인 경우: 오직 과거 또는 오늘 일정만 모수 및 결석에 반영!
        if (isPastOrToday) {
          totalSessions++;
          if (hasCheckedIn) {
            attended++;
            if (lastLog?.authMethod === 'MANUAL_BY_ADMIN') {
              recentStatusList.push('수동인정');
            } else {
              recentStatusList.push('출석');
            }
          } else {
            absent++;
            recentStatusList.push('결석');
          }
        }
      } else {
        // 필참 일정이 아닌 경우 (입단 전, 휴단/퇴단/객원 기간)
        if (hasCheckedIn) {
          // 자발적 옵트인(게스트/임시) 출석: 출석한 날만 모수+1, 출석+1 가산
          totalSessions++;
          attended++;
          guestAttended++;
          recentStatusList.push('출석');
        }
        // 출석하지 않았으면 아무 것도 카운트하지 않음 (결석 처리 절대 안 함)
      }
    }

    // 출석률(%) 계산 (모수가 0이면 100% 또는 N/A 방어)
    const attendanceRate =
      totalSessions === 0 ? 100 : Math.round((attended / totalSessions) * 100);

    // 뱃지 부여
    const badges: string[] = [];
    if (totalSessions >= 3 && attendanceRate === 100) {
      badges.push('개근');
    } else if (attendanceRate >= 80) {
      badges.push('우수');
    } else if (attendanceRate < 60 && totalSessions > 0) {
      badges.push('주의');
    }

    if (guestAttended > 0) {
      badges.push(`게스트 ${guestAttended}회`);
    }

    return {
      memberId: member.id,
      memberName: member.name,
      part: member.part,
      memberStatus: member.memberStatus || '정단원',
      joinedAt: member.joinedAt,
      note: member.note,
      totalSessions,
      attended,
      late,
      excused,
      absent,
      attendanceRate,
      recentStatusList,
      badges,
      guestAttended,
      isSpecialGuest: guestAttended > 0,
    };
  });
}

