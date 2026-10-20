import type {
  Member,
  Schedule,
  RawAttendanceLog,
  RSVPVote,
  AttendanceReconciliation,
  CumulativeMemberAttendance,
  AttendanceStatus,
  MemberStatus,
  PartType,
} from '../types/rollbook';
import { getKSTDateString, parseKSTDate } from './date';

/**
 * 특정 일자(date) 시점에 단원의 유효한 상태(Status)와 파트(Part)를 판정합니다.
 */
export function getEffectiveMemberStatus(
  member: Member,
  date: string
): { status: MemberStatus; part: PartType } {
  if (member.statusHistory && member.statusHistory.length > 0) {
    // 1. 최신 생성순(createdAt 내림차순) 및 최신 시작일순으로 정렬하여 탐색
    const sorted = [...member.statusHistory].sort((a, b) => {
      const timeA = a.createdAt || a.startDate || '';
      const timeB = b.createdAt || b.startDate || '';
      return timeB.localeCompare(timeA);
    });

    const matched = sorted.find(
      (h) => h.startDate <= date && date <= h.endDate
    );
    if (matched) {
      return { status: matched.status, part: matched.part };
    }
  }

  // 2. Fallback: 기본 프로필 상태 사용
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

  // 2-1. 퇴단원은 관리자가 직접 지정에 실수로 넣었더라도 절대 의무 대상이 아님 (데이터 오염 및 탈퇴자 결석 방지)
  if (effective.status === '퇴단원') {
    return false;
  }

  // 3. 일정 대상자 지정 필터 검사 (Audience Selector)
  if (schedule?.targetAudienceType === 'PARTS') {
    if (!schedule.targetParts || !schedule.targetParts.includes(effective.part)) {
      return false; // 해당 파트가 아니면 의무 제외 (모수 제외)
    }
  } else if (schedule?.targetAudienceType === 'CUSTOM_MEMBERS') {
    if (!schedule.targetMemberIds || !schedule.targetMemberIds.includes(member.id)) {
      return false; // 지정된 단원이 아니면 의무 제외 (모수 제외)
    }
    // 관리자가 명시적으로 직접 지정한 단원(CUSTOM_MEMBERS)인 경우:
    // 휴단원이더라도 관리자의 명시적 차출 의도를 최상위로 인정하여 필참 대상자로 승격
    return true;
  }

  // 4. 전체 + 객원(ALL_WITH_GUESTS): 정단원, 준단원, 선생님, 객원 모두 필참 (연주회/녹음)
  if (schedule?.targetAudienceType === 'ALL_WITH_GUESTS') {
    return (
      effective.status === '정단원' ||
      effective.status === '준단원' ||
      effective.status === '선생님' ||
      effective.status === '객원'
    );
  }

  // 5. 전체(ALL) 또는 파트(PARTS) 일정의 경우: 정단원, 준단원, 선생님이 기본 필참 대상
  if (
    effective.status === '정단원' ||
    effective.status === '준단원' ||
    effective.status === '선생님'
  ) {
    return true;
  }

  // 휴단원, 객원 등은 기본 전체/파트 일정에서 의무 제외 (자율 대상자 / 모수 제외)
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
  const partName = part && part !== '기타' ? part : '단원';

  // 1단계: 0~7회 (입단 ~ 2개월 미만, 뉴비)
  if (safeCount < 8) {
    return {
      currentLevelName: `새싹 ${partName}`,
      nextLevelName: `성실한 ${partName}`,
      currentCount: safeCount,
      targetCount: 8,
      progressPercent: Math.min(100, Math.round((safeCount / 8) * 100)),
      badgeEmoji: '🌱',
    };
  }

  // 2단계: 8~23회 (2개월 ~ 6개월, 뉴비 탈출 및 1차 승급)
  if (safeCount < 24) {
    return {
      currentLevelName: `성실한 ${partName}`,
      nextLevelName: `${partName}의 기둥`,
      currentCount: safeCount,
      targetCount: 24,
      progressPercent: Math.min(100, Math.round(((safeCount - 8) / 16) * 100)),
      badgeEmoji: '🎵',
    };
  }

  // 3단계: 24~49회 (6개월 ~ 1년 이상, 대리/중견)
  if (safeCount < 50) {
    return {
      currentLevelName: `${partName}의 기둥`,
      nextLevelName: `문콰이어 ${partName} 레전드`,
      currentCount: safeCount,
      targetCount: 50,
      progressPercent: Math.min(100, Math.round(((safeCount - 24) / 26) * 100)),
      badgeEmoji: '🏛️',
    };
  }

  // 4단계: 50회 이상 (짬 찬 베테랑, 레전드)
  return {
    currentLevelName: `문콰이어 ${partName} 레전드`,
    nextLevelName: null,
    currentCount: safeCount,
    targetCount: safeCount,
    progressPercent: 100,
    badgeEmoji: '👑',
  };
}

/**
 * 명시적 병합 관계(mergedIntoId)를 따라 대표 단원(canonicalMemberId)에 연결된
 * 모든 단원 ID 집합(본인 ID + 병합된 과거 ID들)을 반환합니다.
 * 이름이나 전화번호 뒷자리 추측에 의존하지 않습니다.
 */
export function resolveMergedMemberIds(
  canonicalMemberId: string,
  allMembers: Member[]
): Set<string> {
  const result = new Set<string>([canonicalMemberId]);
  let added = true;
  while (added) {
    added = false;
    for (const m of allMembers) {
      if (m.mergedIntoId && result.has(m.mergedIntoId) && !result.has(m.id)) {
        result.add(m.id);
        added = true;
      }
    }
  }
  return result;
}

/**
 * 단일 단원 + 단일 일정에 대한 출결 상태를 결정론적으로 계산하는 순수 투영 함수(SSOT).
 * - 취소된 연습(isCancelled) -> '미참'
 * - 최신 원천 로그(Recency Resolution) 우선 반영 (관리자 출결 취소 포함)
 * - 로그가 없으면: 비필참 대상자는 '미참', 사전 불참(사유 작성)은 '사유결석', 그 외 필참 대상자는 '결석'
 */
export function reconcileSingleMemberAttendance(
  member: Member,
  schedule: Schedule,
  memberLogs: RawAttendanceLog[],
  memberRsvp?: RSVPVote,
  lateGraceMinutes: number = 10
): AttendanceReconciliation {
  if (schedule.isCancelled) {
    return {
      memberId: member.id,
      memberName: member.name,
      part: member.part,
      rsvpStatus: 'UNVOTED',
      finalStatus: '미참',
      isManualOverride: false,
      adminNote: '취소된 연습',
    };
  }

  const [startHour, startMin] = schedule.startTime.split(':').map(Number);
  const startMinutes = (startHour || 0) * 60 + (startMin || 0);
  const lateThresholdMinutes = startMinutes + lateGraceMinutes;

  // 동일 단원의 다중 로그 중 가장 최신 액션 우선 채택
  const sortedLogs = [...memberLogs].sort((a, b) => {
    const timeA = parseKSTDate(a.timestamp || '').getTime();
    const timeB = parseKSTDate(b.timestamp || '').getTime();
    return timeA - timeB;
  });
  const log = sortedLogs.length > 0 ? sortedLogs[sortedLogs.length - 1] : undefined;

  let finalStatus: AttendanceStatus = '결석';
  let checkInTime: string | undefined;

  const isRequired = isMemberRequiredForSchedule(member, schedule.date, schedule);
  const isExempt = !isRequired;

  // 1) 출결 취소(초기화) 로그인지 판별
  const isCancelledLog = Boolean(
    log &&
      (log.adminNote?.includes('취소') || log.adminNote === '관리자 출결 취소 (초기화)')
  );

  // 2) 관리자가 명시적으로 수동 결석 오버라이드한 경우 (취소 로그 제외)
  const isManualAbsentOverride = Boolean(
    log &&
      !isCancelledLog &&
      log.authMethod === 'MANUAL_BY_ADMIN' &&
      (log.adminNote?.includes('결석') ||
        log.adminNote?.includes('노쇼') ||
        (log as unknown as { status?: string }).status === '결석')
  );

  let isManualOverride = false;
  let effectiveAdminNote: string | undefined;

  if (log && !isCancelledLog) {
    checkInTime = log.timestamp;
    isManualOverride = log.authMethod === 'MANUAL_BY_ADMIN';
    effectiveAdminNote = log.adminNote;

    if (isManualAbsentOverride) {
      finalStatus = '결석';
    } else {
      let logMinutes = 0;
      if (log.timestamp.includes('T')) {
        const timePart = log.timestamp.split('T')[1].slice(0, 5);
        const [h, m] = timePart.split(':').map(Number);
        logMinutes = (h || 0) * 60 + (m || 0);
      } else {
        const logDate = parseKSTDate(log.timestamp);
        if (!isNaN(logDate.getTime()) && log.timestamp.includes(':')) {
          logMinutes = logDate.getHours() * 60 + logDate.getMinutes();
        }
      }

      if (log.adminNote?.includes('지각') || logMinutes > lateThresholdMinutes) {
        finalStatus = '지각';
      } else {
        finalStatus = '출석';
      }
    }
  } else {
    if (isExempt) {
      finalStatus = '미참';
    } else if (memberRsvp && memberRsvp.status === 'ABSENT' && memberRsvp.reason) {
      finalStatus = '사유결석';
    } else {
      finalStatus = '결석';
    }
    isManualOverride = false;
    effectiveAdminNote = undefined;
  }

  return {
    memberId: member.id,
    memberName: member.name,
    part: member.part,
    rsvpStatus: memberRsvp ? memberRsvp.status : 'UNVOTED',
    rsvpReason: memberRsvp?.reason,
    checkInTime,
    authMethod: isCancelledLog ? undefined : log?.authMethod,
    distanceMeters: log?.distanceMeters,
    isVerifiedLocation: log?.isVerifiedLocation,
    finalStatus,
    isManualOverride,
    adminNote: effectiveAdminNote,
  };
}

/**
 * 단원 생애주기 이력, 입단일, 대상자 분류, 사전투표(사유결석), 출석원천로그를 모두 반영하여
 * 단원별 누적 출결 통계를 산출하는 단일 통합 엔진(SSOT).
 * - 미래 일정(schedule.date > referenceDate) 및 취소/보관 일정은 결석 및 모수에서 제외합니다.
 * - 사유결석은 모수(분모)에 포함하되 사유결석 횟수(excused)로 집계합니다.
 * - 지각은 출석률 계산 시 100% 출석으로 인정하되 지각 횟수(late)로 분리 기록합니다.
 */
export function calculateCumulativeAttendanceWithLifecycle(
  members: Member[],
  schedules: Schedule[],
  rawLogs: RawAttendanceLog[],
  referenceDate?: string,
  rsvpVotes: RSVPVote[] = [],
  lateGraceMinutes: number = 10,
  allMembersForMergeResolution?: Member[]
): CumulativeMemberAttendance[] {
  const todayStr = referenceDate || getKSTDateString();
  const rosterForMerge = allMembersForMergeResolution || members;

  // 숨김(아카이브) 또는 취소되지 않은 일정만 모수 후보로 정렬
  const activeSchedules = schedules
    .filter((s) => !s.isArchived && !s.isCancelled)
    .sort((a, b) => a.date.localeCompare(b.date));

  return members.map((member) => {
    let totalSessions = 0;
    let attended = 0;
    let late = 0;
    let excused = 0;
    let absent = 0;
    let guestAttended = 0;
    const recentStatusList: AttendanceStatus[] = [];

    const aliasIds = resolveMergedMemberIds(member.id, rosterForMerge);

    for (const schedule of activeSchedules) {
      const isPastOrToday = schedule.date <= todayStr;
      const isRequired = isMemberRequiredForSchedule(member, schedule.date, schedule);

      const memberLogs = rawLogs.filter(
        (log) => aliasIds.has(log.memberId) && log.scheduleId === schedule.id
      );
      const memberRsvp = rsvpVotes.find(
        (v) => aliasIds.has(v.memberId) && v.scheduleId === schedule.id
      );

      const rec = reconcileSingleMemberAttendance(
        member,
        schedule,
        memberLogs,
        memberRsvp,
        lateGraceMinutes
      );

      const hasCheckedIn =
        rec.finalStatus === '출석' ||
        rec.finalStatus === '수동인정' ||
        rec.finalStatus === '지각';

      if (isRequired) {
        if (isPastOrToday || hasCheckedIn) {
          totalSessions += 1;
          recentStatusList.push(rec.finalStatus);

          if (rec.finalStatus === '출석' || rec.finalStatus === '수동인정') {
            attended += 1;
          } else if (rec.finalStatus === '지각') {
            late += 1;
          } else if (rec.finalStatus === '사유결석') {
            excused += 1;
          } else {
            absent += 1;
          }
        }
      } else {
        // 비필참 일정(입단 전, 휴단/객원, 타 파트/미지정 소그룹): 자발적 출석 시에만 모수+1 및 출석 인정
        if (hasCheckedIn) {
          totalSessions += 1;
          if (rec.finalStatus === '지각') {
            late += 1;
          } else {
            attended += 1;
          }
          guestAttended += 1;
          recentStatusList.push(rec.finalStatus);
        }
      }
    }

    const effectiveAttended = attended + late;
    const attendanceRate =
      totalSessions === 0
        ? 100
        : Math.min(100, Math.round((effectiveAttended / totalSessions) * 100));

    const badges: string[] = [];
    if (totalSessions >= 3 && attendanceRate === 100) {
      badges.push('개근');
    } else if (attendanceRate >= 80 && totalSessions > 0) {
      badges.push('우수');
    }
    if (absent >= 3 || (totalSessions > 0 && attendanceRate < 60)) {
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
      recentStatusList: recentStatusList.slice(-5),
      badges,
      guestAttended,
      isSpecialGuest: guestAttended > 0,
    };
  });
}

