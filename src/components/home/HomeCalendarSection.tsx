import React from 'react';
import type { Schedule } from '../../types/rollbook';
import type { CalendarDay } from '../../utils/calendar';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function getCategoryDotClass(category: string): string {
  if (category.includes('연주') || category.includes('공연') || category.includes('콘서트')) {
    return 'dot-concert';
  }
  if (
    category.includes('행사') ||
    category.includes('합숙') ||
    category.includes('이벤트') ||
    category.includes('MT') ||
    category.includes('기타')
  ) {
    return 'dot-event';
  }
  return 'dot-practice';
}

interface HomeCalendarSectionProps {
  currentYear: number;
  currentMonthIndex: number;
  selectedDateStr: string;
  todayStr: string;
  calendarDays: CalendarDay[];
  schedulesByDate: Map<string, Schedule[]>;
  myLogsByScheduleId: Map<string, boolean>;
  onSelectDate: (dateStr: string) => void;
  onJumpToToday: () => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

export const HomeCalendarSection: React.FC<HomeCalendarSectionProps> = ({
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
        background: '#ffffff',
        borderRadius: '16px',
        padding: '16px',
        border: '1px solid #e2e8f0',
        marginBottom: '16px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
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
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>
            {currentYear}년 {currentMonthIndex + 1}월
          </h2>
          {selectedDateStr !== todayStr && (
            <button
              type="button"
              onClick={onJumpToToday}
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '999px',
                background: '#e0e7ff',
                color: '#4338ca',
                border: 'none',
                cursor: 'pointer',
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
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
            }}
          >
            ◀
          </button>
          <button
            type="button"
            onClick={onNextMonth}
            aria-label="다음 달"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
            }}
          >
            ▶
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
                        color: isSelected ? '#ffffff' : '#10b981',
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
          color: '#64748b',
          marginTop: '12px',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1' }} /> 정기연습
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} /> 연주/행사
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <strong style={{ color: '#10b981' }}>✓</strong> 내 출석 완료
        </span>
      </div>
    </section>
  );
};
