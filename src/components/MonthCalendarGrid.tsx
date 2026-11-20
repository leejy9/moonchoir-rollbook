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
    <section
      className="integrated-calendar-card"
      style={{
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius-xl)',
        padding: '16px',
        border: '1px solid var(--border-subtle)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      {/* Calendar Header Month Switcher */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
            {currentYear}년 {currentMonthIndex + 1}월
          </h2>
          {selectedDateStr && selectedDateStr !== todayStr && onJumpToToday && (
            <button
              type="button"
              onClick={onJumpToToday}
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                padding: '4px 10px',
                minHeight: '44px',
                minWidth: '44px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--brand-primary-light)',
                color: 'var(--brand-primary)',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              오늘
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            type="button"
            onClick={onPrevMonth}
            aria-label="이전 달"
            style={{
              minWidth: '44px',
              minHeight: '44px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-card)',
              color: 'var(--text-sub)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onNextMonth}
            aria-label="다음 달"
            style={{
              minWidth: '44px',
              minHeight: '44px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-card)',
              color: 'var(--text-sub)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>

      {/* Weekday Row */}
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

      {/* Calendar Grid Cells */}
      <div className="calendar-grid-cells">
        {calendarDays.map((day) => {
          const daySchedules = schedulesByDate.get(day.dateStr) || [];
          const isSelected = day.dateStr === selectedDateStr;
          const isToday = day.dateStr === todayStr;
          const hasCheckIn = daySchedules.some((s) => myLogsByScheduleId.has(s.id));

          return (
            <div
              key={day.dateStr}
              className={`calendar-cell ${day.isCurrentMonth ? '' : 'dimmed'} ${
                isToday ? 'today' : ''
              } ${isSelected ? 'selected' : ''}`}
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

              {/* Attendance check or rehearsal dots */}
              {daySchedules.length > 0 && (
                <div className="cell-dots-row">
                  {hasCheckIn ? (
                    <span
                      style={{
                        fontSize: '9px',
                        fontWeight: 800,
                        color: isSelected ? 'var(--text-white)' : 'var(--status-success)',
                        lineHeight: 1,
                      }}
                      title="출석 완료"
                    >
                      ✓
                    </span>
                  ) : (
                    daySchedules.slice(0, 3).map((sch) => (
                      <span
                        key={sch.id}
                        className={`schedule-dot ${getCategoryDotClass(sch.category)}`}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
          marginTop: '12px',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--brand-primary)' }} /> 정기연습
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--status-danger)' }} /> 연주/행사
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <strong style={{ color: 'var(--status-success)' }}>✓</strong> 내 출석 완료
        </span>
      </div>
    </section>
  );
};

export { MonthCalendarGrid as HomeCalendarSection };
