import type { Schedule } from '../types/rollbook';
import { getKSTDateString } from './date';

export type WindowStatus = 'UPCOMING_DATE' | 'TODAY_BEFORE_WINDOW' | 'WINDOW_OPEN' | 'WINDOW_CLOSED';

export interface CheckInWindowState {
  isOpen: boolean;
  status: WindowStatus;
  message: string;
  badgeLabel: string;
  windowStartTimeStr: string;
}

export interface CheckInWindowOptions {
  openBeforeMinutes?: number; // default: 60 (1 hour)
  forceBypassForTesting?: boolean; // default: false
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
      ? { forceBypassForTesting: optionsOrBypass, openBeforeMinutes: 60 }
      : { openBeforeMinutes: 60, ...optionsOrBypass };

  const { openBeforeMinutes = 60, forceBypassForTesting = false } = options;

  if (forceBypassForTesting) {
    return {
      isOpen: true,
      status: 'WINDOW_OPEN',
      message: '체크인 오픈 중 (테스트 모드)',
      badgeLabel: 'QR 출석 가능',
      windowStartTimeStr: '상시 오픈',
    };
  }

  try {
    const [startH, startM] = schedule.startTime.split(':').map(Number);
    const [endH, endM] = schedule.endTime.split(':').map(Number);

    // Rehearsal start date-time
    const scheduleStart = new Date(`${schedule.date}T${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}:00`);
    
    // Window opens N minutes (default 60m = 1 hour) before rehearsal start
    const windowStart = new Date(scheduleStart.getTime() - openBeforeMinutes * 60 * 1000);
    const windowEnd = new Date(`${schedule.date}T${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`);

    // Handle cross-midnight rehearsals if endTime <= startTime
    if (windowEnd.getTime() <= scheduleStart.getTime()) {
      windowEnd.setDate(windowEnd.getDate() + 1);
    }

    const openTimeHour = String(windowStart.getHours()).padStart(2, '0');
    const openTimeMin = String(windowStart.getMinutes()).padStart(2, '0');
    const windowStartTimeStr = `${openTimeHour}:${openTimeMin}`;

    const nowTime = currentDate.getTime();
    const hoursLabel = openBeforeMinutes === 60 ? '1시간' : `${Math.round(openBeforeMinutes / 60)}시간`;

    if (nowTime < windowStart.getTime()) {
      const todayYMD = getKSTDateString(currentDate);
      if (todayYMD < schedule.date) {
        return {
          isOpen: false,
          status: 'UPCOMING_DATE',
          message: `${schedule.date} 연습 시작 ${hoursLabel} 전(${windowStartTimeStr})에 오픈됩니다.`,
          badgeLabel: `연습 당일 ${windowStartTimeStr} 오픈`,
          windowStartTimeStr,
        };
      }
      return {
        isOpen: false,
        status: 'TODAY_BEFORE_WINDOW',
        message: `오늘 ${windowStartTimeStr} (연습 시작 ${hoursLabel} 전)부터 QR 출석이 가능합니다.`,
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
  } catch (err) {
    console.error('[TimeWindow] Date parsing error, defaulting to open:', err);
    return {
      isOpen: true,
      status: 'WINDOW_OPEN',
      message: 'QR 출석 체크 가능',
      badgeLabel: 'QR 출석 가능',
      windowStartTimeStr: schedule.startTime,
    };
  }
}

/**
 * 단원 사전 참석/불참 투표(RSVP) 변경 가능 여부를 판별합니다.
 * 규칙: 연습 시작 시각의 1시간(60분) 전까지만 변경/취소 가능하며,
 * 마감 시각과 같거나 그 이후(now >= scheduleStart - 60m)에는 단원 변경이 차단됩니다.
 */
export function isRsvpOpenForSchedule(
  schedule: Schedule,
  currentDate: Date = new Date(),
  closeBeforeMinutes: number = 60
): boolean {
  if (schedule.isCancelled || schedule.isArchived) return false;
  try {
    const [startH, startM] = schedule.startTime.split(':').map(Number);
    const scheduleStart = new Date(
      `${schedule.date}T${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}:00`
    );
    const cutoffTime = scheduleStart.getTime() - closeBeforeMinutes * 60 * 1000;
    return currentDate.getTime() < cutoffTime;
  } catch {
    return true;
  }
}

