import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MonthCalendarGrid } from './MonthCalendarGrid';
import { getCategoryDotKind } from '../utils/calendar';
import type { Schedule } from '../types/rollbook';

describe('MonthCalendarGrid Component', () => {
  const mockSchedule: Schedule = {
    id: 'sch_1',
    title: '정기 연습',
    category: '정기연습',
    date: '2026-12-01',
    startTime: '19:30',
    endTime: '21:30',
    locationName: '제1연습실',
  };

  it('maps categories to correct dot kind', () => {
    expect(getCategoryDotKind('알수없는카테고리')).toBe('default');
    expect(getCategoryDotKind('정기연습')).toBe('practice');
    expect(getCategoryDotKind('연주')).toBe('concert');
    expect(getCategoryDotKind('행사')).toBe('event');
  });

  it('renders MonthCalendarGrid with 44px min touch target navigation buttons', () => {
    const html = renderToString(
      <MonthCalendarGrid
        currentYear={2026}
        currentMonthIndex={11}
        todayStr="2026-12-01"
        calendarDays={[
          {
            date: new Date(2026, 11, 1),
            dateStr: '2026-12-01',
            dayNumber: 1,
            isCurrentMonth: true,
            isToday: false,
          },
        ]}
        schedulesByDate={new Map([['2026-12-01', [mockSchedule]]])}
        myLogsByScheduleId={new Map()}
        onSelectDate={() => {}}
        onPrevMonth={() => {}}
        onNextMonth={() => {}}
      />
    ).replace(/<!-- -->/g, '');

    expect(html).toContain('2026년 12월');
    expect(html).toContain('aria-label="이전 달"');
    expect(html).toContain('aria-label="다음 달"');
    expect(html).toMatch(/min-width:\s*44px/);
    expect(html).toMatch(/min-height:\s*44px/);
  });
});
