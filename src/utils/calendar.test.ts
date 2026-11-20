import { describe, expect, it } from 'vitest';
import {
  createSchedulesMultiMode,
  duplicateScheduleSeries,
  expandRecurringSchedules,
  formatYearMonth,
  getCalendarGrid,
  getCategoryDotKind,
  groupSchedulesByDate,
} from './calendar';
import type { Schedule } from '../types/rollbook';

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

  it('자정 직후 새벽(UTC 기준 전날)이어도 KST 기준 18일이 isToday로 올바르게 표시된다', () => {
    // 2026-10-17T15:59:00.000Z -> KST 2026-10-18 00:59:00
    const kstMidnightDate = new Date('2026-10-17T15:59:00.000Z');
    const grid = getCalendarGrid(2026, 9, kstMidnightDate);

    const oct17 = grid.find((d) => d.dateStr === '2026-10-17');
    const oct18 = grid.find((d) => d.dateStr === '2026-10-18');

    expect(oct17?.isToday).toBe(false);
    expect(oct18?.isToday).toBe(true);
  });

  it('expands recurring schedules weekly on Thursdays', () => {
    const base = {
      title: '정기연습',
      date: '2026-10-15',
      startTime: '19:30',
      endTime: '21:30',
      locationName: '제1연습실',
      category: '정기연습' as const,
      checkInPin: '8899',
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

    // Verify series metadata
    expect(expanded[0].seriesId).toBeDefined();
    expect(expanded[0].seriesId).toBe(expanded[1].seriesId);
    expect(expanded[0].seriesIndex).toBe(1);
    expect(expanded[0].seriesTotal).toBe(4);
    expect(expanded[3].seriesIndex).toBe(4);
    expect(expanded.every((schedule) => schedule.checkInPin === undefined)).toBe(true);
  });

  it('duplicates an existing schedule series with new start date and unique IDs', () => {
    const base = {
      title: '정기연습',
      date: '2026-10-15',
      startTime: '19:30',
      endTime: '21:30',
      locationName: '제1연습실',
      category: '정기연습' as const,
    };

    const originalSeries = expandRecurringSchedules(base, {
      frequency: 'WEEKLY',
      byDays: ['THU'],
      count: 3,
    }).map((schedule) => ({ ...schedule, checkInPin: '8899' }));

    const targetSeriesId = originalSeries[0].seriesId!;
    const duplicated = duplicateScheduleSeries(originalSeries, targetSeriesId, '2027-03-04');

    expect(duplicated.length).toBe(3);
    expect(duplicated[0].date).toBe('2027-03-04');
    expect(duplicated[1].date).toBe('2027-03-11');
    expect(duplicated[2].date).toBe('2027-03-18');

    // New seriesId should be generated and differ from original
    expect(duplicated[0].seriesId).toBeDefined();
    expect(duplicated[0].seriesId).not.toBe(targetSeriesId);
    expect(duplicated[0].seriesId).toBe(duplicated[1].seriesId);
    expect(duplicated.every((schedule) => schedule.checkInPin === undefined)).toBe(true);

    // Each duplicated item has a unique scheduleId
    expect(duplicated[0].id).not.toBe(originalSeries[0].id);
    expect(duplicated[0].seriesIndex).toBe(1);
    expect(duplicated[2].seriesIndex).toBe(3);
  });

  describe('createSchedulesMultiMode 4-mode schedule creation engine', () => {
    const base = {
      title: '프로젝트 일정',
      date: '2026-10-20',
      startTime: '19:30',
      endTime: '21:30',
      locationName: '서초 리허설룸',
      category: '추가연습' as const,
      targetAudienceType: 'PARTS' as const,
      targetParts: ['소프라노' as const, '알토' as const],
    };

    it('creates single schedule for SINGLE mode', () => {
      const res = createSchedulesMultiMode({
        mode: 'SINGLE',
        baseSchedule: base,
      });
      expect(res.length).toBe(1);
      expect(res[0].date).toBe('2026-10-20');
      expect(res[0].seriesId).toBeUndefined();
      expect(res[0].targetParts).toEqual(['소프라노', '알토']);
    });

    it('creates recurring dates for INTERVAL mode (every 2 weeks, 3 times)', () => {
      const res = createSchedulesMultiMode({
        mode: 'INTERVAL',
        baseSchedule: base,
        intervalUnit: 'WEEKS',
        intervalStep: 2,
        intervalCount: 3,
      });
      expect(res.length).toBe(3);
      expect(res[0].date).toBe('2026-10-20');
      expect(res[1].date).toBe('2026-11-03');
      expect(res[2].date).toBe('2026-11-17');
      expect(res[0].seriesId).toBeDefined();
      expect(res[0].seriesTotal).toBe(3);
    });

    it('creates schedules on selected days of week for DAYS_OF_WEEK mode', () => {
      // 2026-10-20 is Tuesday. Pick TUE and THU for 2 weeks.
      const res = createSchedulesMultiMode({
        mode: 'DAYS_OF_WEEK',
        baseSchedule: base,
        byDays: ['TUE', 'THU'],
        weeksCount: 2,
      });
      expect(res.length).toBe(4);
      expect(res[0].date).toBe('2026-10-20'); // Tue
      expect(res[1].date).toBe('2026-10-22'); // Thu
      expect(res[2].date).toBe('2026-10-27'); // Tue
      expect(res[3].date).toBe('2026-10-29'); // Thu
    });

    it('creates schedules from picked dates array in CALENDAR_PICK mode', () => {
      const picked = ['2026-10-22', '2026-11-05', '2026-11-12'];
      const res = createSchedulesMultiMode({
        mode: 'CALENDAR_PICK',
        baseSchedule: base,
        pickedDates: picked,
      });
      expect(res.length).toBe(3);
      expect(res[0].date).toBe('2026-10-22');
      expect(res[1].date).toBe('2026-11-05');
      expect(res[2].date).toBe('2026-11-12');
      expect(res[0].seriesTotal).toBe(3);
    });

    it('creates multi-day weekly schedules in INTERVAL mode with byDays', () => {
      // 2026-10-20 is Tuesday. Every 1 week on TUE and THU for 2 weeks.
      const res = createSchedulesMultiMode({
        mode: 'INTERVAL',
        baseSchedule: base,
        intervalUnit: 'WEEKS',
        intervalStep: 1,
        intervalCount: 2,
        byDays: ['TUE', 'THU'],
      });
      expect(res.length).toBe(4);
      expect(res.map((s) => s.date)).toEqual([
        '2026-10-20',
        '2026-10-22',
        '2026-10-27',
        '2026-10-29',
      ]);
    });

    it('creates multi-day monthly schedules in INTERVAL mode with byMonthDays', () => {
      // Starts 2026-10-20. Every 1 month on the 10th and 25th for 2 months.
      // In Oct 2026: only 25th is >= 20th. In Nov 2026: 10th and 25th.
      const res = createSchedulesMultiMode({
        mode: 'INTERVAL',
        baseSchedule: base,
        intervalUnit: 'MONTHS',
        intervalStep: 1,
        intervalCount: 2,
        byMonthDays: [10, 25],
      });
      expect(res.map((s) => s.date)).toEqual([
        '2026-10-25',
        '2026-11-10',
        '2026-11-25',
      ]);
    });

    it('creates multi-date yearly schedules in INTERVAL mode with byYearDates', () => {
      // Starts 2026-10-20. Every 1 year on 10/18 and 12/25 for 2 years.
      // In 2026: only 12/25 is >= 10/20. In 2027: 10/18 and 12/25.
      const res = createSchedulesMultiMode({
        mode: 'INTERVAL',
        baseSchedule: base,
        intervalUnit: 'YEARS',
        intervalStep: 1,
        intervalCount: 2,
        byYearDates: [
          { month: 10, day: 18 },
          { month: 12, day: 25 },
        ],
      });
      expect(res.map((s) => s.date)).toEqual([
        '2026-12-25',
        '2027-10-18',
        '2027-12-25',
      ]);
    });
  });

  describe('getCategoryDotKind Pure Function', () => {
    it('연습 계열 카테고리는 practice를 반환한다', () => {
      expect(getCategoryDotKind('정기연습')).toBe('practice');
      expect(getCategoryDotKind('추가연습')).toBe('practice');
      expect(getCategoryDotKind('파트연습')).toBe('practice');
    });

    it('연주/공연/콘서트 계열 카테고리는 concert를 반환한다', () => {
      expect(getCategoryDotKind('정기연주회')).toBe('concert');
      expect(getCategoryDotKind('초청공연')).toBe('concert');
      expect(getCategoryDotKind('가을 콘서트')).toBe('concert');
    });

    it('행사/합숙/이벤트/MT/기타 계열 카테고리는 event를 반환한다', () => {
      expect(getCategoryDotKind('여름 MT')).toBe('event');
      expect(getCategoryDotKind('겨울합숙')).toBe('event');
      expect(getCategoryDotKind('송년행사')).toBe('event');
      expect(getCategoryDotKind('기타모임')).toBe('event');
      expect(getCategoryDotKind('신입생 이벤트')).toBe('event');
    });

    it('모르는 카테고리나 빈 문자열은 default를 반환한다', () => {
      expect(getCategoryDotKind('특별 강습')).toBe('default');
      expect(getCategoryDotKind('스튜디오 녹음')).toBe('default');
      expect(getCategoryDotKind('')).toBe('default');
      expect(getCategoryDotKind('   ')).toBe('default');
    });
  });

  describe('groupSchedulesByDate Pure Function', () => {
    const makeSch = (id: string, date: string, startTime: string): Schedule => ({
      id,
      title: id,
      date,
      startTime,
      endTime: '21:30',
      locationName: '연습실',
      category: '정기연습',
    });

    it('일정을 날짜별로 그룹화하고 시작 시각 순으로 오름차순 정렬한다', () => {
      const sch1 = makeSch('s1', '2026-10-15', '19:30');
      const sch2 = makeSch('s2', '2026-10-15', '17:00');
      const sch3 = makeSch('s3', '2026-10-18', '14:00');

      const map = groupSchedulesByDate([sch1, sch2, sch3]);

      expect(map.size).toBe(2);
      expect(map.get('2026-10-15')?.map((s) => s.id)).toEqual(['s2', 's1']); // 17:00 before 19:30
      expect(map.get('2026-10-18')?.map((s) => s.id)).toEqual(['s3']);
    });

    it('빈 목록인 경우 빈 Map을 반환한다', () => {
      const map = groupSchedulesByDate([]);
      expect(map.size).toBe(0);
    });
  });
});

