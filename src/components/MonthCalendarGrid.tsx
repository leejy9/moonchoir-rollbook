import React from 'react';
import type { Schedule } from '../types/rollbook';
import { getCategoryDotKind, type CalendarDay } from '../utils/calendar';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function getCategoryDotClass(category: string): string {
  const kind = getCategoryDotKind(category);
  return `dot-${kind}`;
}

export interface MonthCalendarGridProps {
  currentYear: number;
  currentMonthIndex: number;
  selectedDateStr?: string;
  /** 카드를 넘길 때 따라가는 강조 날짜. `selectedDateStr`가 있으면 표시하지 않는다. */
  highlightDateStr?: string;
  todayStr: string;
  calendarDays: CalendarDay[];
  schedulesByDate: Map<string, Schedule[]>;
  myLogsByScheduleId: Map<string, boolean>;
  onSelectDate: (dateStr: string) => void;
  onJumpToToday?: () => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

export const MonthCalendarGrid: React.FC<MonthCalendarGridProps> = ({
  currentYear,
  currentMonthIndex,
  selectedDateStr,
  highlightDateStr,
  todayStr,
  calendarDays,
  schedulesByDate,
  myLogsByScheduleId,
  onSelectDate,
  onJumpToToday,
  onPrevMonth,
  onNextMonth,
}) => {
  return (
    <section className="home-cal" aria-label="월간 달력">
      <div className="home-cal-header">
        <button type="button" className="home-cal-nav" onClick={onPrevMonth} aria-label="이전 달">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <div className="home-cal-title-wrap">
          <h2 className="home-cal-title">
            {currentYear}년 {currentMonthIndex + 1}월
          </h2>
          {selectedDateStr && selectedDateStr !== todayStr && onJumpToToday && (
            <button type="button" className="home-cal-today" onClick={onJumpToToday}>
              오늘
            </button>
          )}
        </div>
        <button type="button" className="home-cal-nav" onClick={onNextMonth} aria-label="다음 달">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>

      <div className="calendar-grid-weekdays">
        {WEEKDAYS.map((wd, idx) => (
          <span
            key={wd}
            className={`weekday-header ${idx === 0 ? 'sun' : idx === 6 ? 'sat' : ''}`}
          >
            {wd}
          </span>
        ))}
      </div>

      <div className="calendar-grid-cells">
        {calendarDays.map((day) => {
          const daySchedules = schedulesByDate.get(day.dateStr) || [];
          const isSelected = day.dateStr === selectedDateStr;
          const isHighlighted = !selectedDateStr && day.dateStr === highlightDateStr;
          const isToday = day.dateStr === todayStr;
          const hasCheckIn = daySchedules.some((s) => myLogsByScheduleId.has(s.id));

          return (
            <div
              key={day.dateStr}
              className={`calendar-cell ${day.isCurrentMonth ? '' : 'dimmed'} ${
                isToday ? 'today' : ''
              } ${isSelected ? 'selected' : ''} ${isHighlighted ? 'highlight' : ''}`}
              onClick={() => onSelectDate(day.dateStr)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectDate(day.dateStr);
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={`${day.dateStr} 일정 선택`}
            >
              <span className="cell-day-num">{day.dayNumber}</span>

              <div className="cell-dots-row">
                {daySchedules.length > 0 &&
                  (hasCheckIn ? (
                    <span className="cell-check" title="출석 완료">
                      ✓
                    </span>
                  ) : (
                    daySchedules.slice(0, 3).map((sch) => (
                      <span
                        key={sch.id}
                        className={`schedule-dot ${getCategoryDotClass(sch.category)}`}
                      />
                    ))
                  ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export { MonthCalendarGrid as HomeCalendarSection };
