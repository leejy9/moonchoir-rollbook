import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { CalendarTab } from './CalendarTab';
import { MonthCalendarGrid } from './MonthCalendarGrid';
import { sheetsService } from '../services/sheets';
import type { BoundDeviceProfile, Schedule } from '../types/rollbook';
import { getCategoryDotKind } from '../utils/calendar';
import { navReducer, type Route } from '../utils/route';

describe('CalendarTab and MonthCalendarGrid Component', () => {
  const mockProfile: BoundDeviceProfile = {
    memberId: 'mem_cal_1',
    name: '최민수',
    part: '테너',
    phoneLast4: '4321',
    boundAt: '2026-01-01T00:00:00Z',
  };

  const mockSchedules: Schedule[] = [
    {
      id: 'sch_future_1',
      title: '정기 연습 1',
      category: '정기연습',
      date: '2099-12-01',
      startTime: '19:30',
      endTime: '21:30',
      locationName: '문콰이어 제1연습실',
    },
    {
      id: 'sch_closed_vote',
      title: '특별 공연',
      category: '연주/행사',
      date: '2026-11-01',
      startTime: '14:00',
      endTime: '17:00',
      locationName: '국립극장',
    },
    {
      id: 'sch_unknown_cat',
      title: '신규 특별 워크숍',
      category: '알수없는카테고리',
      date: '2099-12-20',
      startTime: '10:00',
      endTime: '12:00',
      locationName: '외부 세미나실',
    },
  ];

  beforeEach(() => {
    vi.spyOn(sheetsService, 'getSchedulesForMember').mockReturnValue(mockSchedules);
    vi.spyOn(sheetsService, 'reconcileMemberAttendance').mockReturnValue(null);
  });

  it('renders MonthCalendarGrid with month header and weekday headers', () => {
    const html = renderToString(
      <CalendarTab
        profile={mockProfile}
        month="2026-12"
        onNavigate={() => {}}
      />
    ).replace(/<!-- -->/g, '');

    expect(html).toContain('2026년 12월');
    expect(html).toContain('일');
    expect(html).toContain('월');
    expect(html).toContain('토');
    expect(html).toContain('다가오는 연습');
  });

  it('maps unknown categories to default dot kind', () => {
    expect(getCategoryDotKind('알수없는카테고리')).toBe('default');
    expect(getCategoryDotKind('정기연습')).toBe('practice');
    expect(getCategoryDotKind('연주')).toBe('concert');
    expect(getCategoryDotKind('행사')).toBe('event');
  });

  it('renders upcoming schedules and shows "투표 마감" when RSVP deadline has passed', () => {
    const html = renderToString(
      <CalendarTab
        profile={mockProfile}
        month="2026-12"
        onNavigate={() => {}}
      />
    ).replace(/<!-- -->/g, '');

    expect(html).toContain('정기 연습 1');
    expect(html).toContain('신규 특별 워크숍');
    // Future schedule has open RSVP button
    expect(html).toContain('투표');
  });

  it('preserves month when navigating between tabs and back via navReducer', () => {
    // 1) Start at home with month 2026-12
    const startRoute: Route = { area: 'member', tab: 'home', month: '2026-12' };
    // 2) User switches to studio tab
    const toStudio = navReducer(startRoute, { type: 'TAB', tab: 'studio' });
    expect(toStudio.route).toEqual({ area: 'member', tab: 'studio', month: '2026-12' });
    // 3) User switches back to home tab without specifying month
    const backToHome = navReducer(toStudio.route, { type: 'TAB', tab: 'home' });
    expect(backToHome.route).toEqual({ area: 'member', tab: 'home', month: '2026-12' });
  });

  it('opens scheduleSheet overlay when a day is selected via navReducer', () => {
    const homeRoute: Route = { area: 'member', tab: 'home', month: '2026-12' };
    const res = navReducer(homeRoute, {
      type: 'OPEN',
      overlay: { kind: 'scheduleSheet', date: '2026-12-01' },
    });
    expect(res.history).toBe('push');
    expect(res.route).toEqual({
      area: 'member',
      tab: 'home',
      month: '2026-12',
      overlay: { kind: 'scheduleSheet', date: '2026-12-01' },
    });
  });

  it('contains NO emoji characters across the rendered calendar and upcoming section (Anti-slop constraint)', () => {
    const html = renderToString(
      <CalendarTab
        profile={mockProfile}
        month="2026-12"
        onNavigate={() => {}}
      />
    );
    const emojiRegex = /\p{Extended_Pictographic}/u;
    expect(emojiRegex.test(html)).toBe(false);
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
        schedulesByDate={new Map([['2026-12-01', [mockSchedules[0]]]])}
        myLogsByScheduleId={new Map()}
        onSelectDate={() => {}}
        onPrevMonth={() => {}}
        onNextMonth={() => {}}
      />
    );

    expect(html).toContain('aria-label="이전 달"');
    expect(html).toContain('aria-label="다음 달"');
    expect(html).toMatch(/min-width:\s*44px/);
    expect(html).toMatch(/min-height:\s*44px/);
  });
});
