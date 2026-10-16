import { describe, expect, it } from 'vitest';
import { expandRecurringSchedules, formatYearMonth, getCalendarGrid } from './calendar';

describe('Calendar Utility', () => {
  it('formats year and month as YYYY-MM', () => {
    expect(formatYearMonth(2026, 9)).toBe('2026-10'); // monthIndex 9 is October
    expect(formatYearMonth(2026, 0)).toBe('2026-01');
  });

  it('generates correct 7-column calendar grid for October 2026', () => {
    // Oct 2026: Oct 1 is Thursday (index 4)
    const grid = getCalendarGrid(2026, 9, new Date('2026-10-15'));

    // Grid length should be multiple of 7
    expect(grid.length % 7).toBe(0);

    // Current month days count should be 31
    const currentMonthDays = grid.filter((d) => d.isCurrentMonth);
    expect(currentMonthDays.length).toBe(31);

    // Oct 15 should be marked as isToday
    const oct15 = grid.find((d) => d.dateStr === '2026-10-15');
    expect(oct15?.isToday).toBe(true);
    expect(oct15?.dayNumber).toBe(15);
  });

  it('expands recurring schedules weekly on Thursdays', () => {
    const base = {
      title: '정기연습',
      date: '2026-10-15',
      startTime: '19:30',
      endTime: '21:30',
      locationName: '제1연습실',
      category: '정기연습' as const,
    };

    const expanded = expandRecurringSchedules(base, {
      frequency: 'WEEKLY',
      byDays: ['THU'],
      count: 4,
    });

    expect(expanded.length).toBe(4);
    expect(expanded[0].date).toBe('2026-10-15');
    expect(expanded[1].date).toBe('2026-10-22');
    expect(expanded[2].date).toBe('2026-10-29');
    expect(expanded[3].date).toBe('2026-11-05');
  });
});
