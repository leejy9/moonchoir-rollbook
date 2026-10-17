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
 */
export function isMemberRequiredForSchedule(
  member: Member,
  scheduleDate: string
): boolean {
  // 1. 입단일 이전의 일정은 출결 의무 없음 (모수 제외)
  if (member.joinedAt && scheduleDate < member.joinedAt) {
    return false;
  }

  // 2. 해당 일자 시점의 유효 회원 상태 판정
  const effective = getEffectiveMemberStatus(member, scheduleDate);

  // 정단원, 준단원은 기본 필참 대상
  if (effective.status === '정단원' || effective.status === '준단원') {
    return true;
  }

  // 휴단원, 퇴단원, 객원 등은 의무 제외
  return false;
}

/**
 * 단원 생애주기 이력과 입단일을 반영하여 단원별 누적 출결 통계를 산출합니다.
 */
export function calculateCumulativeAttendanceWithLifecycle(
  members: Member[],
  schedules: Schedule[],
  rawLogs: RawAttendanceLog[]
): CumulativeMemberAttendance[] {
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
      const isRequired = isMemberRequiredForSchedule(member, schedule.date);

      // 해당 일정에 단원의 출석 원천로그가 존재하는지 조회
      const memberLogs = rawLogs.filter(
        (log) => log.scheduleId === schedule.id && log.memberId === member.id
      );
      const hasCheckedIn = memberLogs.length > 0;

      if (isRequired) {
        // 정규 필참 일정인 경우
        totalSessions++;
        if (hasCheckedIn) {
          attended++;
          recentStatusList.push('출석');
        } else {
          absent++;
          recentStatusList.push('결석');
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
