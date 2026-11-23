import type {
  BoundDeviceProfile,
  Member,
  RawAttendanceLog,
  RSVPVote,
  Schedule,
} from '../types/rollbook';
import { calculateCumulativeAttendanceWithLifecycle, resolveMergedMemberIds } from './attendanceStats';
import { addDaysKST, getKSTDateString } from './date';
import { DEFAULT_PERFORMANCE_CATEGORIES } from './performanceCategories';
import type { MemberScheduleRecord } from './memberRecords';

export interface MemberLevelInfo {
  level: number;
  name: string;
  minAttendance: number;
  nextMin: number | null;
  remainingForNext: number;
  progressPercent: number;
  summaryText: string;
}

export const LEVEL_TIERS = [
  { level: 1, min: 0, nextMin: 10, titleTemplate: '새내기 {파트}' },
  { level: 2, min: 10, nextMin: 20, titleTemplate: '첫걸음 {파트}' },
  { level: 3, min: 20, nextMin: 30, titleTemplate: '꾸준한 {파트}' },
  { level: 4, min: 30, nextMin: 60, titleTemplate: '든든한 {파트}' },
  { level: 5, min: 60, nextMin: 100, titleTemplate: '기둥 {파트}' },
  { level: 6, min: 100, nextMin: null, titleTemplate: '문콰이어의 목소리' },
] as const;

/**
 * 누적 출석 수와 파트명으로 레벨 정보 계산 (Spec §5-3)
 */
export function computeMemberLevel(
  cumulativeAttendance: number,
  part?: string
): MemberLevelInfo {
  const safeAttendance = Math.max(0, Math.floor(cumulativeAttendance));
  const partText = (part || '').trim() || '단원';

  let currentTier: (typeof LEVEL_TIERS)[number] = LEVEL_TIERS[0];
  for (const tier of LEVEL_TIERS) {
    if (safeAttendance >= tier.min) {
      currentTier = tier;
    }
  }

  const name = currentTier.titleTemplate.replace('{파트}', partText);

  if (currentTier.nextMin === null) {
    return {
      level: currentTier.level,
      name,
      minAttendance: currentTier.min,
      nextMin: null,
      remainingForNext: 0,
      progressPercent: 100,
      summaryText: '',
    };
  }

  const range = currentTier.nextMin - currentTier.min;
  const currentInRange = safeAttendance - currentTier.min;
  const remainingForNext = Math.max(0, currentTier.nextMin - safeAttendance);
  const progressPercent = Math.max(0, Math.min(100, Math.round((currentInRange / range) * 100)));

  return {
    level: currentTier.level,
    name,
    minAttendance: currentTier.min,
    nextMin: currentTier.nextMin,
    remainingForNext,
    progressPercent,
    summaryText: `Lv.${currentTier.level + 1}까지 ${remainingForNext}회`,
  };
}

/**
 * 입단일 또는 첫 출석 로그를 기준으로 함께한 날수 계산 (Spec §5-2)
 */
export function computeDaysTogether(
  member: Member | BoundDeviceProfile,
  logs: RawAttendanceLog[] = [],
  todayStr: string = getKSTDateString(),
  allMembers: Member[] = []
): number {
  let baseDate = '';
  const joinedAt = 'joinedAt' in member ? member.joinedAt : undefined;

  if (joinedAt && /^\d{4}-\d{2}-\d{2}$/.test(joinedAt) && joinedAt <= todayStr) {
    baseDate = joinedAt;
  } else {
    const memberId = 'memberId' in member ? member.memberId : member.id;
    const validIds = resolveMergedMemberIds(memberId, allMembers);

    const validLogDates = logs
      .filter((l) => validIds.has(l.memberId))
      .map((l) => (l.timestamp ? l.timestamp.slice(0, 10) : ''))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= todayStr)
      .sort();

    if (validLogDates.length > 0) {
      baseDate = validLogDates[0];
    }
  }

  if (!baseDate || baseDate > todayStr) return 0;

  const [ty, tm, td] = todayStr.split('-').map(Number);
  const [by, bm, bd] = baseDate.split('-').map(Number);
  const diffDays = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(by, bm - 1, bd)) / (24 * 60 * 60 * 1000));
  return Math.max(0, diffDays + 1);
}

/**
 * 출석·수동인정·지각 일정의 총 연습 시간(시간 단위 내림) 계산 (Spec §5-2)
 */
export function computePracticeHours(records: MemberScheduleRecord[]): number {
  let totalMinutes = 0;
  for (const r of records) {
    const s = r.finalStatus;
    if (s === '출석' || s === '수동인정' || s === '지각') {
      const start = r.schedule.startTime;
      const end = r.schedule.endTime;
      if (start && end && /^\d{2}:\d{2}/.test(start) && /^\d{2}:\d{2}/.test(end)) {
        const [sh, sm] = start.split(':').map(Number);
        const [eh, em] = end.split(':').map(Number);
        const startMin = sh * 60 + sm;
        const endMin = eh * 60 + em;
        if (endMin > startMin) {
          totalMinutes += endMin - startMin;
        }
      }
    }
  }
  return Math.floor(totalMinutes / 60);
}

/**
 * performanceCategories에 포함되고 출석·수동인정·지각한 일정 수 계산 (Spec §5-2)
 */
export function computePerformanceCount(
  records: MemberScheduleRecord[],
  performanceCategories: string[] = DEFAULT_PERFORMANCE_CATEGORIES
): number {
  let count = 0;
  for (const r of records) {
    const s = r.finalStatus;
    if (s === '출석' || s === '수동인정' || s === '지각') {
      const cat = r.category || r.schedule.category;
      if (performanceCategories.includes(cat)) {
        count += 1;
      }
    }
  }
  return count;
}

/**
 * 최근 90일 기준 출석률 계산 (모수 0이면 attendanceRate null 반환, Spec §5-2)
 */
export function computeAttendance90Days({
  member,
  schedules,
  logs,
  rsvpVotes,
  lateGraceMinutes = 10,
  allMembers,
  todayStr = getKSTDateString(),
  now,
}: {
  member: Member;
  schedules: Schedule[];
  logs: RawAttendanceLog[];
  rsvpVotes: RSVPVote[];
  lateGraceMinutes?: number;
  allMembers: Member[];
  todayStr?: string;
  now?: Date;
}): {
  attendanceRate: number | null;
  totalSessions: number;
  attended: number;
  late: number;
  excused: number;
  absent: number;
} {
  const ninetyDaysAgo = addDaysKST(todayStr, -90);
  const targetSchedules = schedules.filter(
    (s) => !s.isArchived && s.date >= ninetyDaysAgo && s.date <= todayStr
  );

  const summaries = calculateCumulativeAttendanceWithLifecycle(
    [member],
    targetSchedules,
    logs,
    todayStr,
    rsvpVotes,
    lateGraceMinutes,
    allMembers,
    now
  );

  const summary = summaries[0];
  if (!summary || summary.totalSessions === 0) {
    return {
      attendanceRate: null,
      totalSessions: 0,
      attended: 0,
      late: 0,
      excused: 0,
      absent: 0,
    };
  }

  return {
    attendanceRate: summary.attendanceRate,
    totalSessions: summary.totalSessions,
    attended: summary.attended,
    late: summary.late,
    excused: summary.excused,
    absent: summary.absent,
  };
}

/**
 * 스태프 칭호 카드 '함께한 지 n년 m개월' (1년 미만: n개월, 1개월 미만: n일) 포맷터 (Spec §5-7)
 */
export function formatStaffTenure(
  daysOrJoinedAt: number | string,
  todayStr: string = getKSTDateString()
): string {
  let days: number;

  if (typeof daysOrJoinedAt === 'string') {
    if (!daysOrJoinedAt || !/^\d{4}-\d{2}-\d{2}$/.test(daysOrJoinedAt) || daysOrJoinedAt > todayStr) {
      return '함께한 지 0일';
    }
    const [ty, tm, td] = todayStr.split('-').map(Number);
    const [by, bm, bd] = daysOrJoinedAt.split('-').map(Number);
    let months = (ty - by) * 12 + (tm - bm);
    if (td < bd) {
      months -= 1;
    }
    const diffDays = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(by, bm - 1, bd)) / (24 * 60 * 60 * 1000));
    days = Math.max(0, diffDays + 1);

    if (months < 1) {
      return `함께한 지 ${days}일`;
    }
    if (months < 12) {
      return `함께한 지 ${months}개월`;
    }
    const years = Math.floor(months / 12);
    const remMonths = months % 12;
    return remMonths === 0
      ? `함께한 지 ${years}년`
      : `함께한 지 ${years}년 ${remMonths}개월`;
  }

  days = Math.max(0, Math.floor(daysOrJoinedAt));
  if (days < 30) {
    return `함께한 지 ${days}일`;
  }
  const totalMonths = Math.floor(days / 30);
  if (totalMonths < 12) {
    return `함께한 지 ${totalMonths}개월`;
  }
  const years = Math.floor(totalMonths / 12);
  const remMonths = totalMonths % 12;
  return remMonths === 0
    ? `함께한 지 ${years}년`
    : `함께한 지 ${years}년 ${remMonths}개월`;
}

export type AttendanceFilterCategory = 'ALL' | 'ATTENDED' | 'LATE' | 'EXCUSED' | 'ABSENT';

export type AttendancePeriod = '3M' | 'YEAR' | 'ALL';

/**
 * 출석 기록 시트의 finalStatus 분류 (Spec §5-4)
 */
export function classifyAttendanceStatus(
  status: string
): 'ATTENDED' | 'LATE' | 'EXCUSED' | 'ABSENT' | 'OTHER' {
  if (status === '출석' || status === '수동인정') return 'ATTENDED';
  if (status === '지각') return 'LATE';
  if (status === '사유결석') return 'EXCUSED';
  if (status === '결석') return 'ABSENT';
  return 'OTHER';
}

/**
 * 출석 기록 시트의 기간 필터링 (Spec §5-4)
 */
export function filterRecordsByPeriod(
  records: MemberScheduleRecord[],
  period: AttendancePeriod,
  todayStr: string = getKSTDateString()
): MemberScheduleRecord[] {
  if (period === 'ALL') return records;

  if (period === '3M') {
    const ninetyDaysAgo = addDaysKST(todayStr, -90);
    return records.filter((r) => r.date >= ninetyDaysAgo && r.date <= todayStr);
  }

  if (period === 'YEAR') {
    const yearStart = `${todayStr.slice(0, 4)}-01-01`;
    return records.filter((r) => r.date >= yearStart && r.date <= todayStr);
  }

  return records;
}
