import React, { useMemo, useState } from 'react';
import { sheetsService } from '../services/sheets';
import type { BoundDeviceProfile, Schedule } from '../types/rollbook';
import { getCalendarGrid, groupSchedulesByDate } from '../utils/calendar';
import { getKSTDateString } from '../utils/date';
import type { NavAction } from '../utils/route';
import { isRsvpOpenForSchedule } from '../utils/timeWindow';
import { MonthCalendarGrid } from './MonthCalendarGrid';

export interface CalendarTabProps {
  profile: BoundDeviceProfile;
  month?: string; // YYYY-MM
  selectedDate?: string; // YYYY-MM-DD
  onNavigate: (action: NavAction) => void;
  onOpenRSVP?: (schedule: Schedule) => void;
  refreshTrigger?: number;
}

export const CalendarTab: React.FC<CalendarTabProps> = ({
  profile,
  month: routeMonth,
  selectedDate: routeSelectedDate,
  onNavigate,
  onOpenRSVP,
  refreshTrigger,
}) => {
  const todayStr = useMemo(() => getKSTDateString(), []);
  const [now] = useState(() => new Date());

  // Determine initial year and monthIndex from routeMonth (YYYY-MM) or today
  const initialYear = useMemo(() => {
    if (routeMonth && /^\d{4}-\d{2}$/.test(routeMonth)) {
      return parseInt(routeMonth.slice(0, 4), 10);
    }
    return parseInt(todayStr.slice(0, 4), 10);
  }, [routeMonth, todayStr]);

  const initialMonthIndex = useMemo(() => {
    if (routeMonth && /^\d{4}-\d{2}$/.test(routeMonth)) {
      return parseInt(routeMonth.slice(5, 7), 10) - 1;
    }
    return parseInt(todayStr.slice(5, 7), 10) - 1;
  }, [routeMonth, todayStr]);

  const [currentYear, setCurrentYear] = useState(initialYear);
  const [currentMonthIndex, setCurrentMonthIndex] = useState(initialMonthIndex);

  // If routeMonth changes externally, synchronize
  React.useEffect(() => {
    if (routeMonth && /^\d{4}-\d{2}$/.test(routeMonth)) {
      const y = parseInt(routeMonth.slice(0, 4), 10);
      const m = parseInt(routeMonth.slice(5, 7), 10) - 1;
      // oxlint-disable-next-line react/set-state-in-effect
      setCurrentYear(y);
      setCurrentMonthIndex(m);
    }
  }, [routeMonth]);

  const schedules = useMemo(() => {
    void refreshTrigger;
    return sheetsService.getSchedulesForMember(profile.memberId);
  }, [refreshTrigger, profile.memberId]);

  const schedulesByDate = useMemo(() => {
    return groupSchedulesByDate(schedules);
  }, [schedules]);

  const myLogsByScheduleId = useMemo(() => {
    const map = new Map<string, boolean>();
    schedules.forEach((sch) => {
      const rec = sheetsService.reconcileMemberAttendance(profile.memberId, sch.id, profile.name);
      if (
        rec &&
        (rec.finalStatus === '출석' ||
          rec.finalStatus === '지각' ||
          rec.finalStatus === '수동인정')
      ) {
        map.set(sch.id, true);
      }
    });
    return map;
  }, [schedules, profile.memberId, profile.name]);

  const calendarDays = useMemo(() => {
    return getCalendarGrid(currentYear, currentMonthIndex);
  }, [currentYear, currentMonthIndex]);

  const handlePrevMonth = () => {
    let nextY = currentYear;
    let nextM = currentMonthIndex - 1;
    if (nextM < 0) {
      nextM = 11;
      nextY -= 1;
    }
    setCurrentYear(nextY);
    setCurrentMonthIndex(nextM);
    const monthStr = `${nextY}-${String(nextM + 1).padStart(2, '0')}`;
    onNavigate({ type: 'TAB', tab: 'calendar', month: monthStr });
  };

  const handleNextMonth = () => {
    let nextY = currentYear;
    let nextM = currentMonthIndex + 1;
    if (nextM > 11) {
      nextM = 0;
      nextY += 1;
    }
    setCurrentYear(nextY);
    setCurrentMonthIndex(nextM);
    const monthStr = `${nextY}-${String(nextM + 1).padStart(2, '0')}`;
    onNavigate({ type: 'TAB', tab: 'calendar', month: monthStr });
  };

  const handleJumpToToday = () => {
    const y = parseInt(todayStr.slice(0, 4), 10);
    const m = parseInt(todayStr.slice(5, 7), 10) - 1;
    setCurrentYear(y);
    setCurrentMonthIndex(m);
    const monthStr = `${y}-${String(m + 1).padStart(2, '0')}`;
    onNavigate({ type: 'TAB', tab: 'calendar', month: monthStr });
  };

  const handleSelectDate = (dateStr: string) => {
    onNavigate({
      type: 'OPEN',
      overlay: {
        kind: 'scheduleSheet',
        date: dateStr,
      },
    });
  };

  // Upcoming 3 schedules
  const upcoming3 = useMemo(() => {
    return schedules
      .filter((s) => !s.isCancelled && !s.isArchived && s.date >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || '').localeCompare(b.startTime || ''))
      .slice(0, 3);
  }, [schedules, todayStr]);

  return (
    <div className="calendar-tab-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Month Calendar Grid */}
      <MonthCalendarGrid
        currentYear={currentYear}
        currentMonthIndex={currentMonthIndex}
        selectedDateStr={routeSelectedDate}
        todayStr={todayStr}
        calendarDays={calendarDays}
        schedulesByDate={schedulesByDate}
        myLogsByScheduleId={myLogsByScheduleId}
        onSelectDate={handleSelectDate}
        onJumpToToday={handleJumpToToday}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
      />

      {/* Upcoming Rehearsals Section (Next 3) */}
      <section
        className="calendar-upcoming-section"
        style={{
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius-xl)',
          padding: '18px 16px',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-card)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
            다가오는 연습
          </h3>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            최대 3개 표시
          </span>
        </div>

        {upcoming3.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0', margin: 0 }}>
            예정된 일정이 없습니다.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {upcoming3.map((sch) => {
              const rsvpOpen = isRsvpOpenForSchedule(sch, now);
              return (
                <div
                  key={sch.id}
                  onClick={() =>
                    onNavigate({
                      type: 'OPEN',
                      overlay: { kind: 'scheduleSheet', date: sch.date, scheduleId: sch.id },
                    })
                  }
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-subtle)',
                    cursor: 'pointer',
                    minHeight: '44px',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="schedule-category-badge" style={{ fontSize: '10px', padding: '1px 6px' }}>
                        {sch.category}
                      </span>
                      <strong style={{ fontSize: '14px', color: 'var(--text-main)' }}>
                        {sch.title}
                      </strong>
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--text-sub)' }}>
                      {sch.date} {sch.startTime} ~ {sch.endTime} · {sch.locationName || '장소 미정'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {rsvpOpen ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenRSVP?.(sch);
                        }}
                        style={{
                          minWidth: '44px',
                          minHeight: '44px',
                          padding: '6px 12px',
                          borderRadius: 'var(--radius-md)',
                          background: 'var(--brand-primary)',
                          color: 'var(--text-white)',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        투표
                      </button>
                    ) : (
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: 'var(--text-muted)',
                          padding: '6px 8px',
                        }}
                      >
                        투표 마감
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
