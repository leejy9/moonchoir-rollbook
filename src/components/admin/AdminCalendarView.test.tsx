import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { AdminCalendarView } from './AdminCalendarView';
import type { Schedule } from '../../types/rollbook';
import type { CalendarDay } from '../../utils/calendar';

const mockSchedules: Schedule[] = [
  {
    id: 'sch-1',
    title: '정기연습 1회차',
    date: '2026-10-18',
    startTime: '19:00',
    endTime: '21:00',
    locationName: '언더스탠드에비뉴',
    category: '정기연습',
    checkInPin: '1234',
  },
  {
    id: 'sch-2',
    title: '취소된 연습',
    date: '2026-10-18',
    startTime: '14:00',
    endTime: '16:00',
    locationName: '연습실 B',
    category: '추가연습',
    isCancelled: true,
  },
];

const mockCalendarGrid: CalendarDay[] = [
  {
    date: new Date(2026, 9, 18),
    dateStr: '2026-10-18',
    dayNumber: 18,
    isCurrentMonth: true,
    isToday: true,
  },
  {
    date: new Date(2026, 9, 19),
    dateStr: '2026-10-19',
    dayNumber: 19,
    isCurrentMonth: true,
    isToday: false,
  },
];

describe('AdminCalendarView Component', () => {
  it('월 네비게이션 헤더 및 연도/월 정보를 정상 렌더링한다', () => {
    const html = renderToString(
      <AdminCalendarView
        adminCalYear={2026}
        adminCalMonth={9}
        onPrevMonth={vi.fn()}
        onNextMonth={vi.fn()}
        calendarGrid={mockCalendarGrid}
        schedulesByDate={new Map([['2026-10-18', mockSchedules]])}
        activeSchedulesByDate={new Map([['2026-10-18', [mockSchedules[0]]]])}
        selectedDate="2026-10-18"
        onSelectDate={vi.fn()}
        showCancelledSchedules={false}
        onToggleShowCancelled={vi.fn()}
        schedulesOnSelectedDate={[mockSchedules[0]]}
        onSelectScheduleForEdit={vi.fn()}
        onQuickNewSchedule={vi.fn()}
      />
    );

    expect(html).toContain('2026');
    expect(html).toContain('10');
    expect(html).toContain('월');
    expect(html).toContain('연습 일정 캘린더');
    expect(html).toContain('등록된 일정을 월별로 확인하고 관리합니다.');
    expect(html).toContain('이전 달');
    expect(html).toContain('다음 달');
  });

  it('캘린더 그리드 셀 및 날짜 번호, 스케줄 닷을 정상 렌더링한다', () => {
    const html = renderToString(
      <AdminCalendarView
        adminCalYear={2026}
        adminCalMonth={9}
        onPrevMonth={vi.fn()}
        onNextMonth={vi.fn()}
        calendarGrid={mockCalendarGrid}
        schedulesByDate={new Map([['2026-10-18', mockSchedules]])}
        activeSchedulesByDate={new Map([['2026-10-18', [mockSchedules[0]]]])}
        selectedDate="2026-10-18"
        onSelectDate={vi.fn()}
        showCancelledSchedules={false}
        onToggleShowCancelled={vi.fn()}
        schedulesOnSelectedDate={[mockSchedules[0]]}
        onSelectScheduleForEdit={vi.fn()}
        onQuickNewSchedule={vi.fn()}
      />
    );

    expect(html).toContain('calendar-cell');
    expect(html).toContain('selected'); // 2026-10-18 should be selected
    expect(html).toContain('schedule-dot cat-정기연습');
    expect(html).toContain('cell-day-num');
    expect(html).toContain('18');
    expect(html).toContain('19');
  });

  it('선택된 날짜의 일정 목록과 상세 정보(시간, 장소, PIN, 버튼)를 올바르게 렌더링한다', () => {
    const html = renderToString(
      <AdminCalendarView
        adminCalYear={2026}
        adminCalMonth={9}
        onPrevMonth={vi.fn()}
        onNextMonth={vi.fn()}
        calendarGrid={mockCalendarGrid}
        schedulesByDate={new Map([['2026-10-18', mockSchedules]])}
        activeSchedulesByDate={new Map([['2026-10-18', [mockSchedules[0]]]])}
        selectedDate="2026-10-18"
        onSelectDate={vi.fn()}
        showCancelledSchedules={false}
        onToggleShowCancelled={vi.fn()}
        schedulesOnSelectedDate={[mockSchedules[0]]}
        onSelectScheduleForEdit={vi.fn()}
        onQuickNewSchedule={vi.fn()}
        onCloneSchedule={vi.fn()}
        onDeleteSchedule={vi.fn()}
      />
    );

    expect(html).toContain('정기연습 1회차');
    expect(html).toContain('언더스탠드에비뉴');
    expect(html).toContain('19:00');
    expect(html).toContain('21:00');
    expect(html).toContain('PIN:');
    expect(html).toContain('1234');
    expect(html).toContain('+ 이 날짜로 새 일정 등록');
    expect(html).toContain('복제');
    expect(html).toContain('삭제');
  });
});
