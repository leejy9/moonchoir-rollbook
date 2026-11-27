import type { Schedule } from '../types/rollbook';
import { getKSTDateString, getKSTTimestampString } from './date';

export const CHECKIN_OPEN_BEFORE_MIN = 60;
export const RSVP_CUTOFF_BEFORE_MIN = CHECKIN_OPEN_BEFORE_MIN;

export type WindowStatus = 'UPCOMING_DATE' | 'TODAY_BEFORE_WINDOW' | 'WINDOW_OPEN' | 'WINDOW_CLOSED';

export interface CheckInWindowState {
  isOpen: boolean;
  status: WindowStatus;
  message: string;
  badgeLabel: string;
  windowStartTimeStr: string;
}

export interface CheckInWindowOptions {
  openBeforeMinutes?: number; // default: 60 (CHECKIN_OPEN_BEFORE_MIN)
  forceBypassForTesting?: boolean; // default: false
}

/**
 * 일정 날짜(YYYY-MM-DD)와 시각(HH:mm)을 한국 표준시(KST, UTC+09:00) 기준 Date로 파싱합니다.
 * 형식이 올바르지 않거나 유효하지 않은 숫자면 null을 반환합니다.
 */
export function parseScheduleKST(dateStr: string, timeStr: string): Date | null {
  if (!dateStr || !timeStr) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;

  const isoStr = `${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+09:00`;
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return null;
  return d;
}

/**
 * Calculates whether the QR check-in window is open for a schedule.
 * Rule: Opens 1 hour (60 minutes) before rehearsal startTime and closes at endTime on rehearsal day.
 */
export function getCheckInWindowState(
  schedule: Schedule,
  currentDate: Date = new Date(),
  optionsOrBypass: CheckInWindowOptions | boolean = false
): CheckInWindowState {
  const options: CheckInWindowOptions =
    typeof optionsOrBypass === 'boolean'
      ? { forceBypassForTesting: optionsOrBypass, openBeforeMinutes: CHECKIN_OPEN_BEFORE_MIN }
      : { openBeforeMinutes: CHECKIN_OPEN_BEFORE_MIN, ...optionsOrBypass };

  const { openBeforeMinutes = CHECKIN_OPEN_BEFORE_MIN, forceBypassForTesting = false } = options;

  if (forceBypassForTesting) {
    return {
      isOpen: true,
      status: 'WINDOW_OPEN',
      message: '체크인 오픈 중 (테스트 모드)',
      badgeLabel: 'QR 출석 가능',
      windowStartTimeStr: '상시 오픈',
    };
  }

  const scheduleStart = parseScheduleKST(schedule.date, schedule.startTime);
  const scheduleEnd = parseScheduleKST(schedule.date, schedule.endTime);

  if (!scheduleStart || !scheduleEnd) {
    return {
      isOpen: false,
      status: 'WINDOW_CLOSED',
      message: '일정 시간 오류, 운영진에게 문의해 주세요.',
      badgeLabel: '시간 오류',
      windowStartTimeStr: schedule.startTime || '',
    };
  }

  // Window opens N minutes (default 60m = 1 hour) before rehearsal start
  const windowStart = new Date(scheduleStart.getTime() - openBeforeMinutes * 60 * 1000);
  const windowEnd = new Date(scheduleEnd.getTime());

  // Handle cross-midnight rehearsals if endTime <= startTime
  if (windowEnd.getTime() <= scheduleStart.getTime()) {
    windowEnd.setTime(windowEnd.getTime() + 24 * 60 * 60 * 1000);
  }

  const windowStartTimeStr = getKSTTimestampString(windowStart).slice(11, 16);

  const nowTime = currentDate.getTime();
  if (nowTime < windowStart.getTime()) {
    const todayYMD = getKSTDateString(currentDate);
    if (todayYMD < schedule.date) {
      return {
        isOpen: false,
        status: 'UPCOMING_DATE',
        message: `${windowStartTimeStr}부터`,
        badgeLabel: `연습 당일 ${windowStartTimeStr} 오픈`,
        windowStartTimeStr,
      };
    }
    return {
      isOpen: false,
      status: 'TODAY_BEFORE_WINDOW',
      message: `${windowStartTimeStr}부터`,
      badgeLabel: `오늘 ${windowStartTimeStr} 오픈 예정`,
      windowStartTimeStr,
    };
  }

  if (nowTime > windowEnd.getTime()) {
    return {
      isOpen: false,
      status: 'WINDOW_CLOSED',
      message: '금일 연습 출석 체크가 마감되었습니다.',
      badgeLabel: '출석 마감',
      windowStartTimeStr,
    };
  }

  return {
    isOpen: true,
    status: 'WINDOW_OPEN',
    message: '현재 연습실 QR 출석 체크가 진행 중입니다.',
    badgeLabel: 'QR 출석 진행 중',
    windowStartTimeStr,
  };
}

/**
 * 단원 사전 참석/불참 투표(RSVP) 변경 가능 여부를 판별합니다.
 * 규칙: 연습 시작 시각의 1시간(60분) 전까지만 변경/취소 가능하며,
 * 마감 시각과 같거나 그 이후(now >= scheduleStart - 60m)에는 단원 변경이 차단됩니다.
 */
export function isRsvpOpenForSchedule(
  schedule: Schedule,
  currentDate: Date = new Date(),
  closeBeforeMinutes: number = RSVP_CUTOFF_BEFORE_MIN
): boolean {
  if (schedule.isCancelled || schedule.isArchived) return false;
  const scheduleStart = parseScheduleKST(schedule.date, schedule.startTime);
  if (!scheduleStart) return false;
  const cutoffTime = scheduleStart.getTime() - closeBeforeMinutes * 60 * 1000;
  return currentDate.getTime() < cutoffTime;
}
