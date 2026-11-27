import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
    expect(html).toContain('home-cal-nav');
  });

  const baseProps = {
    currentYear: 2026,
    currentMonthIndex: 10,
    todayStr: '2026-11-21',
    calendarDays: [
      { date: new Date(2026, 10, 21), dateStr: '2026-11-21', dayNumber: 21, isCurrentMonth: true, isToday: true },
      { date: new Date(2026, 10, 24), dateStr: '2026-11-24', dayNumber: 24, isCurrentMonth: true, isToday: false },
    ],
    schedulesByDate: new Map<string, Schedule[]>(),
    myLogsByScheduleId: new Map<string, boolean>(),
    onSelectDate: () => {},
    onPrevMonth: () => {},
    onNextMonth: () => {},
  };

  it('highlightDateStr 칸만 highlight 모양이고 "오늘" 버튼은 생기지 않는다', () => {
    const html = renderToString(
      <MonthCalendarGrid {...baseProps} highlightDateStr="2026-11-24" onJumpToToday={() => {}} />
    ).replace(/<!-- -->/g, '');
    expect(html.match(/calendar-cell [^"]*highlight/g)).toHaveLength(1);
    expect(html).toMatch(/calendar-cell[^"]*highlight[^"]*"[^>]*aria-label="2026-11-24/);
    expect(html).not.toContain('home-cal-today');
  });

  it('선택한 날짜(d)가 있으면 강조는 표시하지 않는다', () => {
    const html = renderToString(
      <MonthCalendarGrid {...baseProps} selectedDateStr="2026-11-14" highlightDateStr="2026-11-24" onJumpToToday={() => {}} />
    ).replace(/<!-- -->/g, '');
    expect(html).not.toContain('highlight');
    expect(html).toContain('home-cal-today'); // 선택일이 오늘이 아니면 기존대로 "오늘" 버튼
  });

  it('상자(흰 카드 스타일)를 인라인으로 두르지 않는다', () => {
    const html = renderToString(<MonthCalendarGrid {...baseProps} />);
    expect(html).not.toContain('box-shadow');
    expect(html).not.toContain('border-radius:var(--radius-xl)');
  });

  it('home.css: 이동 버튼·댓글 줄은 44px 이상, 날짜 칸은 48px', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/v3/home.css'), 'utf8');
    const block = (sel: string) => css.slice(css.indexOf(sel), css.indexOf('}', css.indexOf(sel)));
    expect(block('.home-cal-nav {')).toMatch(/width:\s*44px/);
    expect(block('.home-cal-nav {')).toMatch(/height:\s*44px/);
    expect(block('.home-cal .calendar-cell {')).toMatch(/min-height:\s*48px/);
    expect(block('.home-card-comment-row {')).toMatch(/min-height:\s*44px/);
    expect(block('.home-upcoming-row {')).toMatch(/min-height:\s*60px/);
  });
});
