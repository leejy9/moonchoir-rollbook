import type { Schedule } from '../types/rollbook';

export type WindowStatus = 'UPCOMING_DATE' | 'TODAY_BEFORE_WINDOW' | 'WINDOW_OPEN' | 'WINDOW_CLOSED';

export interface CheckInWindowState {
  isOpen: boolean;
  status: WindowStatus;
  message: string;
  badgeLabel: string;
  windowStartTimeStr: string;
}

/**
 * Calculates whether the QR check-in window is open for a schedule.
 * Rule: Opens exactly 2 hours before rehearsal startTime and closes at endTime on rehearsal day.
 */
export function getCheckInWindowState(
  schedule: Schedule,
  currentDate: Date = new Date(),
  forceBypassForTesting: boolean = false
): CheckInWindowState {
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
    
    // Window opens 2 hours before rehearsal start
    const windowStart = new Date(scheduleStart.getTime() - 2 * 60 * 60 * 1000);
    const windowEnd = new Date(`${schedule.date}T${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`);

    const openTimeHour = String(windowStart.getHours()).padStart(2, '0');
    const openTimeMin = String(windowStart.getMinutes()).padStart(2, '0');
    const windowStartTimeStr = `${openTimeHour}:${openTimeMin}`;

    const nowTime = currentDate.getTime();

    if (nowTime < windowStart.getTime()) {
      const todayYMD = currentDate.toISOString().slice(0, 10);
      if (todayYMD < schedule.date) {
        return {
          isOpen: false,
          status: 'UPCOMING_DATE',
          message: `${schedule.date} 연습 시작 2시간 전(${windowStartTimeStr})에 오픈됩니다.`,
          badgeLabel: `연습 당일 ${windowStartTimeStr} 오픈`,
          windowStartTimeStr,
        };
      }
      return {
        isOpen: false,
        status: 'TODAY_BEFORE_WINDOW',
        message: `오늘 ${windowStartTimeStr} (연습 시작 2시간 전)부터 QR 출석이 가능합니다.`,
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
