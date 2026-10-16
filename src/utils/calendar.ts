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

  const results: import('../types/rollbook').Schedule[] = [];
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
      if (options.untilDate && dateStr > options.untilDate) return results;

      results.push({
        ...baseSchedule,
        id: `sch_${dateStr.replace(/-/g, '')}_${Math.random().toString(36).slice(2, 6)}`,
        date: dateStr,
      });

      generatedCount++;
      if (generatedCount >= maxOccurrences) break;
    }

    // Step by intervalWeeks
    currentWeekStart.setDate(currentWeekStart.getDate() + intervalWeeks * 7);
  }

  return results;
}

