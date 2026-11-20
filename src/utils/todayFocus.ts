import type { Member, Schedule } from '../types/rollbook';
import { isMemberRequiredForSchedule } from './attendanceStats';
import { getCheckInWindowState } from './timeWindow';

export interface TodayFocusResult {
  mode: 'TODAY' | 'NEXT' | 'NONE';
  schedules: Schedule[];
  focus?: Schedule;
  dDay?: number;
}

export interface TodayFocusInput {
  /**
   * IMPORTANT: 입력 schedules는 숨김(TARGETS_ONLY) 일정 보호를 위해
   * 반드시 `sheetsService.getSchedulesForMember(memberId)`의 결과여야 합니다.
   */
  schedules: Schedule[];
  member: Member | undefined;
  now: Date;
  todayStr: string;
  selectedId?: string | null;
}

/**
 * 일정 우선순위 점수 계산:
 * 1. Time state urgency: OPEN (300) > UPCOMING (200) > CLOSED (100)
 * 2. Member target relevance: Mandatory for me (+50) > Voluntary/Guest (+0)
 */
export function getSchedulePriorityScore(
  sch: Schedule,
  member: Member | undefined,
  now: Date
): number {
  const win = getCheckInWindowState(sch, now);
  let timeScore = 100;
  if (win.isOpen) {
    timeScore = 300;
  } else if (win.status !== 'WINDOW_CLOSED') {
    timeScore = 200;
  }

  const isTarget = member ? isMemberRequiredForSchedule(member, sch.date, sch) : false;
  const targetScore = isTarget ? 50 : 0;

  return timeScore + targetScore;
}

/**
 * KST 기준 날짜 간의 일수(D-Day)를 계산합니다.
 * targetDate > todayStr 이면 양수 (예: 3일 후면 3).
 */
export function computeDDayDifference(targetDate: string, todayStr: string): number {
  const [ty, tm, td] = targetDate.split('-').map(Number);
  const [by, bm, bd] = todayStr.split('-').map(Number);
  const tUtc = Date.UTC(ty, tm - 1, td);
  const bUtc = Date.UTC(by, bm - 1, bd);
  return Math.round((tUtc - bUtc) / (24 * 60 * 60 * 1000));
}

/**
 * 오늘 집중 일정 또는 다음 일정을 결정론적으로 선택하는 순수 함수.
 *
 * - 입력 schedules는 반드시 sheetsService.getSchedulesForMember(memberId)의 결과여야 합니다.
 * - 반환값: { mode: 'TODAY' | 'NEXT' | 'NONE', schedules: Schedule[], focus?: Schedule, dDay?: number }
 */
export function selectTodayFocus(input: TodayFocusInput): TodayFocusResult {
  const { schedules, member, now, todayStr, selectedId } = input;

  // 1. 유효 일정 필터링 (취소 및 보관 제외)
  const validSchedules = schedules.filter((s) => !s.isCancelled && !s.isArchived);

  // 2. 오늘 날짜의 일정 탐색
  const todaySchedules = validSchedules.filter((s) => s.date === todayStr);

  // 오늘 날짜 일정 중 아직 종료되지 않은(진행 중 또는 예정) 일정
  const activeToday = todaySchedules.filter(
    (s) => getCheckInWindowState(s, now).status !== 'WINDOW_CLOSED'
  );

  const sortByPriority = (list: Schedule[]) => {
    return [...list].sort((a, b) => {
      const scoreA = getSchedulePriorityScore(a, member, now);
      const scoreB = getSchedulePriorityScore(b, member, now);
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }
      return a.startTime.localeCompare(b.startTime);
    });
  };

  // 오늘 아직 진행 중이거나 예정된 일정이 있는 경우
  if (activeToday.length > 0) {
    const sorted = sortByPriority(activeToday);
    const focus = selectedId ? sorted.find((s) => s.id === selectedId) || sorted[0] : sorted[0];
    return {
      mode: 'TODAY',
      schedules: sorted,
      focus,
      dDay: 0,
    };
  }

  // 오늘 일정이 없거나 오늘의 모든 일정이 종료(WINDOW_CLOSED)된 경우 -> 다음 가장 가까운 미래 일정 탐색
  const futureSchedules = validSchedules
    .filter((s) => s.date > todayStr)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

  if (futureSchedules.length > 0) {
    const nextDate = futureSchedules[0].date;
    const nextDateSchedules = validSchedules.filter((s) => s.date === nextDate);
    const sorted = sortByPriority(nextDateSchedules);
    const focus = selectedId ? sorted.find((s) => s.id === selectedId) || sorted[0] : sorted[0];
    const dDay = computeDDayDifference(nextDate, todayStr);
    return {
      mode: 'NEXT',
      schedules: sorted,
      focus,
      dDay,
    };
  }

  // 예정된 미래 일정도 없는 경우
  return {
    mode: 'NONE',
    schedules: [],
    focus: undefined,
    dDay: undefined,
  };
}
