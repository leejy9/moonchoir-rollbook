/**
 * Calendar utilities for Moonchoir Rollbook
 */

export interface CalendarDay {
  date: Date;
  dateStr: string; // YYYY-MM-DD
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
}

export function formatYearMonth(year: number, monthIndex: number): string {
  const m = String(monthIndex + 1).padStart(2, '0');
  return `${year}-${m}`;
}

export function getCalendarGrid(year: number, monthIndex: number, referenceToday = new Date()): CalendarDay[] {
  const firstDayOfMonth = new Date(year, monthIndex, 1);
  const lastDayOfMonth = new Date(year, monthIndex + 1, 0);

  const startDayOfWeek = firstDayOfMonth.getDay(); // 0 (Sun) ~ 6 (Sat)
  const totalDays = lastDayOfMonth.getDate();

  const days: CalendarDay[] = [];
  const todayStr = referenceToday.toISOString().slice(0, 10);

  // 1. Previous month trailing padding
  const prevMonthLastDay = new Date(year, monthIndex, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const dayNum = prevMonthLastDay - i;
    const d = new Date(year, monthIndex - 1, dayNum);
    const dateStr = d.toISOString().slice(0, 10);
    days.push({
      date: d,
      dateStr,
      dayNumber: dayNum,
      isCurrentMonth: false,
      isToday: dateStr === todayStr,
    });
  }

  // 2. Current month days
  for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
    const d = new Date(year, monthIndex, dayNum);
    // Format YYYY-MM-DD reliably with local date values
    const monthStr = String(monthIndex + 1).padStart(2, '0');
    const dayStr = String(dayNum).padStart(2, '0');
    const dateStr = `${year}-${monthStr}-${dayStr}`;

    days.push({
      date: d,
      dateStr,
      dayNumber: dayNum,
      isCurrentMonth: true,
      isToday: dateStr === todayStr,
    });
  }

  // 3. Next month leading padding (to complete full 7-day rows)
  const remainingDays = 7 - (days.length % 7);
  if (remainingDays < 7) {
    for (let dayNum = 1; dayNum <= remainingDays; dayNum++) {
      const d = new Date(year, monthIndex + 1, dayNum);
      const nextMonthIndex = (monthIndex + 1) % 12;
      const nextYear = monthIndex === 11 ? year + 1 : year;
      const monthStr = String(nextMonthIndex + 1).padStart(2, '0');
      const dayStr = String(dayNum).padStart(2, '0');
      const dateStr = `${nextYear}-${monthStr}-${dayStr}`;

      days.push({
        date: d,
        dateStr,
        dayNumber: dayNum,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
      });
    }
  }

  return days;
}

const DAY_MAP: Record<string, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
};

export interface RecurrenceOptions {
  frequency: 'NONE' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
  interval?: number; // default 1
  byDays?: ('MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN')[];
  count?: number; // e.g. 12
  untilDate?: string; // YYYY-MM-DD
}

/**
 * Expands a recurring schedule into individual concrete Schedule records.
 * Follows Apple / Naver Calendar recurrence patterns.
 */
export function expandRecurringSchedules(
  baseSchedule: Omit<import('../types/rollbook').Schedule, 'id'>,
  options: RecurrenceOptions
): import('../types/rollbook').Schedule[] {
  if (options.frequency === 'NONE') {
    return [
      {
        ...baseSchedule,
        id: 'sch_' + Math.random().toString(36).slice(2, 9),
      },
    ];
  }

  const rawOccurrences: { date: string }[] = [];
  const maxOccurrences = options.count && options.count > 0 ? options.count : 24; // default max 24
  const targetDays =
    options.byDays && options.byDays.length > 0
      ? options.byDays.map((d) => DAY_MAP[d])
      : [new Date(baseSchedule.date).getDay()];

  const intervalWeeks = options.frequency === 'BIWEEKLY' ? 2 : options.interval || 1;
  const startDate = new Date(baseSchedule.date + 'T00:00:00');
  let currentWeekStart = new Date(startDate);
  // Roll back to Sunday of this week for clean week-based step
  const dayOfWeek = currentWeekStart.getDay();
  currentWeekStart.setDate(currentWeekStart.getDate() - dayOfWeek);

  let generatedCount = 0;
  let safetyLoop = 0;

  while (generatedCount < maxOccurrences && safetyLoop < 100) {
    safetyLoop++;

    for (const targetDayNum of targetDays) {
      const candidateDate = new Date(currentWeekStart);
      candidateDate.setDate(candidateDate.getDate() + targetDayNum);

      const y = candidateDate.getFullYear();
      const m = String(candidateDate.getMonth() + 1).padStart(2, '0');
      const d = String(candidateDate.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;

      // Must be >= baseSchedule.date
      if (dateStr < baseSchedule.date) continue;
      // Must not exceed untilDate if specified
      if (options.untilDate && dateStr > options.untilDate) break;

      rawOccurrences.push({ date: dateStr });

      generatedCount++;
      if (generatedCount >= maxOccurrences) break;
    }

    if (options.untilDate && rawOccurrences.length > 0) {
      const last = rawOccurrences[rawOccurrences.length - 1];
      if (last.date > options.untilDate) break;
    }

    // Step by intervalWeeks
    currentWeekStart.setDate(currentWeekStart.getDate() + intervalWeeks * 7);
  }

  const seriesId = `series_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const totalCount = rawOccurrences.length;

  return rawOccurrences.map((occ, idx) => ({
    ...baseSchedule,
    id: `sch_${occ.date.replace(/-/g, '')}_${Math.random().toString(36).slice(2, 6)}`,
    date: occ.date,
    seriesId,
    seriesIndex: idx + 1,
    seriesTotal: totalCount,
  }));
}

/**
 * Duplicates an existing schedule series to a new semester/period starting on newStartDate.
 * Generates fresh unique schedule IDs, a new seriesId, and random check-in PINs.
 * Ensures complete foreign-key isolation so past attendance and RSVP logs remain untouched.
 */
export function duplicateScheduleSeries(
  allSchedules: import('../types/rollbook').Schedule[],
  targetSeriesId: string,
  newStartDate: string
): import('../types/rollbook').Schedule[] {
  // Find members of the series (or fallback by title if legacy)
  const seriesItems = allSchedules
    .filter((s) => s.seriesId === targetSeriesId)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (seriesItems.length === 0) return [];

  const origFirstDate = new Date(seriesItems[0].date + 'T00:00:00');
  const targetStartDate = new Date(newStartDate + 'T00:00:00');
  const newSeriesId = `series_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const totalCount = seriesItems.length;

  return seriesItems.map((item, idx) => {
    const itemDate = new Date(item.date + 'T00:00:00');
    const dayOffset = Math.round(
      (itemDate.getTime() - origFirstDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    const newDateObj = new Date(targetStartDate);
    newDateObj.setDate(newDateObj.getDate() + dayOffset);

    const y = newDateObj.getFullYear();
    const m = String(newDateObj.getMonth() + 1).padStart(2, '0');
    const d = String(newDateObj.getDate()).padStart(2, '0');
    const newDateStr = `${y}-${m}-${d}`;

    const randomPin = Math.floor(1000 + Math.random() * 9000).toString();

    return {
      ...item,
      id: `sch_${newDateStr.replace(/-/g, '')}_${Math.random().toString(36).slice(2, 6)}`,
      date: newDateStr,
      seriesId: newSeriesId,
      seriesIndex: idx + 1,
      seriesTotal: totalCount,
      checkInPin: randomPin,
      isArchived: false,
    };
  });
}

export type ScheduleAddMode = 'SINGLE' | 'INTERVAL' | 'DAYS_OF_WEEK' | 'CALENDAR_PICK';

export interface MultiModeScheduleOptions {
  mode: ScheduleAddMode;
  baseSchedule: Omit<import('../types/rollbook').Schedule, 'id'> & { date?: string };
  // INTERVAL mode
  intervalUnit?: 'DAYS' | 'WEEKS' | 'MONTHS';
  intervalStep?: number; // e.g. every 2 weeks
  intervalCount?: number; // total count e.g. 8
  // DAYS_OF_WEEK mode
  byDays?: ('MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN')[];
  weeksCount?: number; // repeat for N weeks
  // CALENDAR_PICK mode
  pickedDates?: string[]; // e.g. ['2026-10-22', '2026-10-29', '2026-11-05']
}

/**
 * 4대 다채널 일정 추가 엔진 (단일 일정 / 간격 반복 / 요일 지정 / 캘린더 직접 날짜 복수 픽)
 */
export function createSchedulesMultiMode(
  options: MultiModeScheduleOptions
): import('../types/rollbook').Schedule[] {
  const { mode, baseSchedule } = options;
  const initialDateStr = baseSchedule.date || new Date().toISOString().slice(0, 10);
  let targetDates: string[] = [];

  switch (mode) {
    case 'SINGLE': {
      targetDates = [initialDateStr];
      break;
    }

    case 'CALENDAR_PICK': {
      if (options.pickedDates && options.pickedDates.length > 0) {
        targetDates = Array.from(new Set(options.pickedDates)).sort();
      } else {
        targetDates = [initialDateStr];
      }
      break;
    }

    case 'INTERVAL': {
      const step = Math.max(1, options.intervalStep || 1);
      const count = Math.max(1, options.intervalCount || 4);
      const unit = options.intervalUnit || 'WEEKS';
      const startDate = new Date(initialDateStr + 'T00:00:00');

      targetDates = [];
      for (let i = 0; i < count; i++) {
        const d = new Date(startDate);
        if (unit === 'DAYS') {
          d.setDate(d.getDate() + i * step);
        } else if (unit === 'WEEKS') {
          d.setDate(d.getDate() + i * step * 7);
        } else if (unit === 'MONTHS') {
          d.setMonth(d.getMonth() + i * step);
        }
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        targetDates.push(`${y}-${m}-${day}`);
      }
      break;
    }

    case 'DAYS_OF_WEEK': {
      const selectedDays =
        options.byDays && options.byDays.length > 0
          ? options.byDays.map((k) => DAY_MAP[k])
          : [new Date(initialDateStr + 'T00:00:00').getDay()];
      const weeks = Math.max(1, options.weeksCount || 4);

      const startDate = new Date(initialDateStr + 'T00:00:00');
      let currentWeekStart = new Date(startDate);
      // Roll back to Sunday
      currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay());

      targetDates = [];
      for (let w = 0; w < weeks; w++) {
        for (const dayNum of selectedDays) {
          const d = new Date(currentWeekStart);
          d.setDate(d.getDate() + dayNum);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          const dateStr = `${y}-${m}-${day}`;
          if (dateStr >= initialDateStr) {
            targetDates.push(dateStr);
          }
        }
        currentWeekStart.setDate(currentWeekStart.getDate() + 7);
      }
      targetDates = Array.from(new Set(targetDates)).sort();
      break;
    }
  }

  if (targetDates.length === 0) {
    targetDates = [initialDateStr];
  }

  const seriesId =
    targetDates.length > 1
      ? `series_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      : undefined;
  const seriesTotal = targetDates.length;

  return targetDates.map((dateStr, idx) => {
    const pin =
      baseSchedule.checkInPin ||
      Math.floor(1000 + Math.random() * 9000).toString();

    return {
      ...baseSchedule,
      id: `sch_${dateStr.replace(/-/g, '')}_${Math.random().toString(36).slice(2, 6)}`,
      date: dateStr,
      checkInPin: pin,
      seriesId,
      seriesIndex: seriesId ? idx + 1 : undefined,
      seriesTotal: seriesId ? seriesTotal : undefined,
    };
  });
}


