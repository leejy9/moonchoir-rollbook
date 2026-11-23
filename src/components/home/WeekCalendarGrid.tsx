import React from 'react';
import type { Schedule } from '../../types/rollbook';
import { addDaysKST, getWeekdayOfDate } from '../../utils/date';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export interface WeekCalendarGridProps {
  weekAnchorDate: string; // YYYY-MM-DD
  todayStr: string;
  selectedDateStr?: string;
  schedulesByDate: Map<string, Schedule[]>;
  myLogsByScheduleId: Map<string, boolean>;
  onSelectDate: (dateStr: string) => void;
}

export const WeekCalendarGrid: React.FC<WeekCalendarGridProps> = ({
  weekAnchorDate,
  todayStr,
  selectedDateStr,
  schedulesByDate,
  myLogsByScheduleId,
  onSelectDate,
}) => {
  const weekday = getWeekdayOfDate(weekAnchorDate);
  const sundayStr = addDaysKST(weekAnchorDate, -weekday);
  const weekDays = [0, 1, 2, 3, 4, 5, 6].map((i) => addDaysKST(sundayStr, i));

  return (
    <div className="week-calendar-grid" role="grid" aria-label="주간 달력">
      {weekDays.map((dayStr, idx) => {
        const dayNum = parseInt(dayStr.slice(8, 10), 10);
        const isToday = dayStr === todayStr;
        const isSelected = dayStr === selectedDateStr;
        const daySchedules = schedulesByDate.get(dayStr) || [];
        const activeSchedules = daySchedules.filter((s) => !s.isCancelled && !s.isArchived);
        const hasSchedule = activeSchedules.length > 0;
        const hasAttended = activeSchedules.some((s) => myLogsByScheduleId.get(s.id));

        const classes = [
          'week-day-col',
          isToday ? 'today' : '',
          isSelected ? 'selected' : '',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <button
            key={dayStr}
            type="button"
            className={classes}
            onClick={() => onSelectDate(dayStr)}
            aria-label={`${dayStr} ${WEEKDAYS[idx]}요일`}
            aria-selected={isSelected ? 'true' : undefined}
          >
            <span
              className="week-day-label"
              style={{
                color: idx === 0 ? 'var(--status-danger)' : idx === 6 ? 'var(--brand-lavender-text)' : undefined,
              }}
            >
              {WEEKDAYS[idx]}
            </span>
            <span className="week-day-num">{dayNum}</span>
            {hasSchedule && (
              <span className={`week-day-dot ${hasAttended ? 'attended' : ''}`} />
            )}
          </button>
        );
      })}
    </div>
  );
};
