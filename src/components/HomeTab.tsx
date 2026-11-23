import React, { useEffect, useMemo, useState } from 'react';
import { sheetsService } from '../services/sheets';
import { PREFERENCE_KEYS, readPreference, writePreference } from '../services/sheetsStorage';
import type { BoundDeviceProfile, Member, Schedule } from '../types/rollbook';
import { isMemberRequiredForSchedule } from '../utils/attendanceStats';
import { resolveMemberIdentity } from '../utils/memberIdentity';
import { getCalendarGrid, groupSchedulesByDate } from '../utils/calendar';
import {
  addDaysKST,
  getKSTClock,
  getKSTDateString,
  getKSTTimestampString,
} from '../utils/date';
import type { NavAction } from '../utils/route';
import { countCheckedIn } from '../utils/rsvpTally';
import { getCheckInWindowState } from '../utils/timeWindow';
import { deriveTodayCta } from '../utils/todayCta';
import { selectTodayFocus } from '../utils/todayFocus';
import { HomeActiveScheduleCard } from './home/HomeActiveScheduleCard';
import { HomeUpcomingSection } from './home/HomeUpcomingSection';
import { MonthCalendarGrid } from './MonthCalendarGrid';
import { WeekCalendarGrid } from './home/WeekCalendarGrid';
import '../styles/v3/home.css';

export interface HomeTabProps {
  profile: BoundDeviceProfile;
  month?: string; // YYYY-MM
  selectedDate?: string; // YYYY-MM-DD
  onNavigate: (action: NavAction) => void;
  onOpenQRScanner: (scheduleId: string) => void;
  onOpenRSVP: (schedule: Schedule) => void;
  onOpenDetail?: (schedule: Schedule) => void;
  refreshTrigger?: number;
}

export const HomeTab: React.FC<HomeTabProps> = ({
  profile,
  month: routeMonth,
  selectedDate: routeSelectedDate,
  onNavigate,
  onOpenQRScanner,
  onOpenRSVP,
  onOpenDetail,
  refreshTrigger,
}) => {
  const [currentNow, setCurrentNow] = useState(() => new Date());
  const [todayStr, setTodayStr] = useState(() => getKSTDateString());
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);

  // Preference for Week vs Month view
  const [calendarView, setCalendarView] = useState<'week' | 'month'>(() => {
    return readPreference<'week' | 'month'>(
      PREFERENCE_KEYS.HOME_CALENDAR_VIEW,
      (v): v is 'week' | 'month' => v === 'week' || v === 'month',
      'week'
    );
  });

  // Week view anchor date
  const [weekAnchorDate, setWeekAnchorDate] = useState(() => getKSTDateString());

  // Month view year/month state
  const [internalYear, setInternalYear] = useState(() => parseInt(todayStr.slice(0, 4), 10));
  const [internalMonthIndex, setInternalMonthIndex] = useState(
    () => parseInt(todayStr.slice(5, 7), 10) - 1
  );

  const isValidRouteMonth = Boolean(routeMonth && /^\d{4}-\d{2}$/.test(routeMonth));
  const currentYear = isValidRouteMonth
    ? parseInt(routeMonth!.slice(0, 4), 10)
    : internalYear;
  const currentMonthIndex = isValidRouteMonth
    ? parseInt(routeMonth!.slice(5, 7), 10) - 1
    : internalMonthIndex;

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentNow(now);
      const newTodayStr = getKSTDateString(now);
      setTodayStr((prev) => (prev !== newTodayStr ? newTodayStr : prev));
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const schedules = useMemo(() => {
    void refreshTrigger;
    return sheetsService.getSchedulesForMember(profile.memberId);
  }, [refreshTrigger, profile.memberId]);

  const allMembers = useMemo(() => {
    void refreshTrigger;
    return sheetsService.getMembers(true);
  }, [refreshTrigger]);

  const currentMember = useMemo<Member>(() => {
    const canonicalId = resolveMemberIdentity(profile.memberId, allMembers).canonicalId;
    const canonicalMember = allMembers.find((m) => m.id === canonicalId);
    return canonicalMember || {
      id: profile.memberId,
      name: profile.name,
      part: profile.part as Member['part'],
      phoneLast4: profile.phoneLast4 || '',
      role: 'MEMBER',
      status: 'ACTIVE',
      joinedAt: '',
      createdAt: profile.boundAt || '',
    };
  }, [allMembers, profile.memberId, profile.name, profile.part, profile.phoneLast4, profile.boundAt]);

  const schedulesByDate = useMemo(() => {
    return groupSchedulesByDate(schedules);
  }, [schedules]);

  const calendarDays = useMemo(() => {
    return getCalendarGrid(currentYear, currentMonthIndex);
  }, [currentYear, currentMonthIndex]);

  const myLogsByScheduleId = useMemo(() => {
    void refreshTrigger;
    const map = new Map<string, boolean>();
    for (const sch of schedules) {
      const rec = sheetsService.reconcileMemberAttendance(
        profile.memberId,
        sch.id,
        profile.name
      );
      if (rec?.finalStatus === 'ATTENDED') {
        map.set(sch.id, true);
      }
    }
    return map;
  }, [schedules, profile.memberId, profile.name, refreshTrigger]);

  // Top focus schedule
  const focusResult = useMemo(() => {
    return selectTodayFocus({
      schedules,
      member: currentMember,
      now: currentNow,
      todayStr,
      selectedId: selectedScheduleId,
    });
  }, [schedules, currentMember, currentNow, todayStr, selectedScheduleId]);

  const handleToggleCalendarView = (view: 'week' | 'month') => {
    setCalendarView(view);
    writePreference(PREFERENCE_KEYS.HOME_CALENDAR_VIEW, view);
  };

  const handlePrevWeek = () => {
    setWeekAnchorDate((prev) => addDaysKST(prev, -7));
  };

  const handleNextWeek = () => {
    setWeekAnchorDate((prev) => addDaysKST(prev, 7));
  };

  const handlePrevMonth = () => {
    let nextY = currentYear;
    let nextM = currentMonthIndex - 1;
    if (nextM < 0) {
      nextM = 11;
      nextY -= 1;
    }
    setInternalYear(nextY);
    setInternalMonthIndex(nextM);
    const monthStr = `${nextY}-${String(nextM + 1).padStart(2, '0')}`;
    onNavigate({ type: 'TAB', tab: 'home', month: monthStr });
  };

  const handleNextMonth = () => {
    let nextY = currentYear;
    let nextM = currentMonthIndex + 1;
    if (nextM > 11) {
      nextM = 0;
      nextY += 1;
    }
    setInternalYear(nextY);
    setInternalMonthIndex(nextM);
    const monthStr = `${nextY}-${String(nextM + 1).padStart(2, '0')}`;
    onNavigate({ type: 'TAB', tab: 'home', month: monthStr });
  };

  const handleSelectDate = (dateStr: string) => {
    const list = schedulesByDate.get(dateStr) || [];
    if (list.length === 1) {
      onNavigate({
        type: 'OPEN',
        overlay: { kind: 'scheduleSheet', date: dateStr, scheduleId: list[0].id },
      });
    } else {
      onNavigate({
        type: 'OPEN',
        overlay: { kind: 'scheduleSheet', date: dateStr },
      });
    }
  };

  const handleJumpToToday = () => {
    const y = parseInt(todayStr.slice(0, 4), 10);
    const m = parseInt(todayStr.slice(5, 7), 10) - 1;
    setInternalYear(y);
    setInternalMonthIndex(m);
    setWeekAnchorDate(todayStr);
    const monthStr = `${y}-${String(m + 1).padStart(2, '0')}`;
    onNavigate({ type: 'TAB', tab: 'home', month: monthStr });
  };

  // Upcoming 5 schedules
  const upcoming5 = useMemo(() => {
    return schedules
      .filter((s) => !s.isCancelled && !s.isArchived && s.date >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || '').localeCompare(b.startTime || ''))
      .slice(0, 5);
  }, [schedules, todayStr]);

  const viewToggleButtons = (
    <div className="home-calendar-toggle" role="group" aria-label="달력 보기 선택">
      <button
        type="button"
        className={`home-calendar-toggle-btn ${calendarView === 'week' ? 'active' : ''}`}
        onClick={() => handleToggleCalendarView('week')}
        aria-pressed={calendarView === 'week'}
      >
        주간
      </button>
      <button
        type="button"
        className={`home-calendar-toggle-btn ${calendarView === 'month' ? 'active' : ''}`}
        onClick={() => handleToggleCalendarView('month')}
        aria-pressed={calendarView === 'month'}
      >
        월간
      </button>
    </div>
  );

  return (
    <div className="home-tab-container">
      {/* 1. Top Card (Today Schedule or Next Schedule) */}
      {focusResult.mode !== 'NONE' && focusResult.focus && (
        <HomeActiveScheduleCard
          schedule={focusResult.focus}
          schedulesCount={focusResult.schedules.length}
          scheduleIndex={Math.max(
            0,
            focusResult.schedules.findIndex((s) => s.id === focusResult.focus?.id)
          )}
          todayStr={todayStr}
          isToday={focusResult.focus.date === todayStr}
          dDay={focusResult.dDay}
          isRequired={isMemberRequiredForSchedule(
            currentMember,
            focusResult.focus.date,
            focusResult.focus
          )}
          cta={deriveTodayCta({
            schedule: focusResult.focus,
            now: currentNow,
            isRequired: isMemberRequiredForSchedule(
              currentMember,
              focusResult.focus.date,
              focusResult.focus
            ),
            myVote: sheetsService
              .getRSVPVotes(focusResult.focus.id)
              .find((v) => v.memberId === profile.memberId || v.memberName === profile.name),
            myReconciled:
              sheetsService.reconcileMemberAttendance(
                profile.memberId,
                focusResult.focus.id,
                profile.name
              ) || undefined,
            isOnline:
              typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
                ? navigator.onLine
                : true,
          })}
          checkedInCount={
            focusResult.focus.date === todayStr &&
            (getCheckInWindowState(focusResult.focus, currentNow).isOpen ||
              getCheckInWindowState(focusResult.focus, currentNow).status === 'WINDOW_CLOSED')
              ? countCheckedIn(sheetsService.reconcileAttendance(focusResult.focus.id), allMembers)
              : undefined
          }
          checkedInTimeStr={
            focusResult.focus.date === todayStr
              ? getKSTClock(getKSTTimestampString(currentNow))
              : undefined
          }
          onPrevSchedule={() => {
            if (focusResult.schedules.length <= 1) return;
            const idx = focusResult.schedules.findIndex((s) => s.id === focusResult.focus?.id);
            const prev = (idx - 1 + focusResult.schedules.length) % focusResult.schedules.length;
            setSelectedScheduleId(focusResult.schedules[prev].id);
          }}
          onNextSchedule={() => {
            if (focusResult.schedules.length <= 1) return;
            const idx = focusResult.schedules.findIndex((s) => s.id === focusResult.focus?.id);
            const next = (idx + 1) % focusResult.schedules.length;
            setSelectedScheduleId(focusResult.schedules[next].id);
          }}
          onOpenQRScanner={onOpenQRScanner}
          onOpenRSVP={onOpenRSVP}
          onOpenDetail={onOpenDetail}
        />
      )}

      {/* 2. Calendar Section (Week or Month) */}
      {calendarView === 'week' ? (
        <section className="home-calendar-card" aria-label="주간 달력">
          <div className="home-calendar-header">
            <div className="home-calendar-title-wrap">
              <h2 className="home-calendar-title">
                {weekAnchorDate.slice(0, 4)}년 {parseInt(weekAnchorDate.slice(5, 7), 10)}월
              </h2>
              {weekAnchorDate !== todayStr && (
                <button
                  type="button"
                  className="home-calendar-today-btn"
                  onClick={handleJumpToToday}
                >
                  오늘
                </button>
              )}
            </div>

            <div className="home-calendar-controls">
              {viewToggleButtons}
              <button
                type="button"
                className="home-calendar-nav-btn"
                onClick={handlePrevWeek}
                aria-label="이전 주"
              >
                ‹
              </button>
              <button
                type="button"
                className="home-calendar-nav-btn"
                onClick={handleNextWeek}
                aria-label="다음 주"
              >
                ›
              </button>
            </div>
          </div>

          <WeekCalendarGrid
            weekAnchorDate={weekAnchorDate}
            todayStr={todayStr}
            selectedDateStr={routeSelectedDate}
            schedulesByDate={schedulesByDate}
            myLogsByScheduleId={myLogsByScheduleId}
            onSelectDate={handleSelectDate}
          />
        </section>
      ) : (
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
          headerExtra={viewToggleButtons}
        />
      )}

      {/* 3. Upcoming Schedules (Max 5) */}
      <HomeUpcomingSection
        schedules={upcoming5}
        currentNow={currentNow}
        onNavigate={onNavigate}
        onOpenRSVP={onOpenRSVP}
      />
    </div>
  );
};
