import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { sheetsService } from '../services/sheets';
import type { BoundDeviceProfile, Member, RSVPVote, Schedule } from '../types/rollbook';
import { isMemberRequiredForSchedule, resolveMergedMemberIds } from '../utils/attendanceStats';
import { resolveMemberIdentity } from '../utils/memberIdentity';
import { getCalendarGrid, groupSchedulesByDate } from '../utils/calendar';
import { getKSTClock, getKSTDateString, getKSTTimestampString } from '../utils/date';
import type { NavAction } from '../utils/route';
import { countCheckedIn } from '../utils/rsvpTally';
import { getCheckInWindowState } from '../utils/timeWindow';
import { isCheckedInFinalStatus } from '../utils/homeCardText';
import { buildHomeCards } from '../utils/homeCards';
import { calendarHighlightDate } from '../utils/homeCarousel';
import { findMyVote } from '../utils/myVote';
import { deriveTodayCta } from '../utils/todayCta';
import { computeDDayDifference, selectTodayFocus } from '../utils/todayFocus';
import { HomeCardCarousel, type HomeCardModel } from './home/HomeCardCarousel';
import { HomeUpcomingSection } from './home/HomeUpcomingSection';
import { useSeenComments } from './home/useSeenComments';
import { MonthCalendarGrid } from './MonthCalendarGrid';
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
  const currentMemberAliasIds = useMemo(
    () => resolveMergedMemberIds(currentMember.id, allMembers),
    [currentMember.id, allMembers]
  );

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
        profile.name,
        currentNow
      );
      if (isCheckedInFinalStatus(rec?.finalStatus)) {
        map.set(sch.id, true);
      }
    }
    return map;
  }, [schedules, profile.memberId, profile.name, refreshTrigger, currentNow]);

  const focusResult = useMemo(() => {
    return selectTodayFocus({
      schedules,
      member: currentMember,
      memberAliasIds: currentMemberAliasIds,
      identityMembers: allMembers,
      now: currentNow,
      todayStr,
    });
  }, [schedules, currentMember, currentMemberAliasIds, allMembers, currentNow, todayStr]);

  const { cards, upcoming } = useMemo(
    () => buildHomeCards({ focusResult, schedules, now: currentNow, todayStr }),
    [focusResult, schedules, currentNow, todayStr]
  );

  const syncState = useSyncExternalStore(
    (listener) => sheetsService.subscribeSync(listener),
    () => sheetsService.getSyncState(),
    () => sheetsService.getSyncState()
  );
  const dataKey = (refreshTrigger ?? 0) + syncState.lastSyncedAt;
  const seenComments = useSeenComments(
    profile.memberId,
    schedules,
    syncState.lastSyncedAt > 0,
    dataKey
  );

  const cardModels = useMemo<HomeCardModel[]>(() => {
    void dataKey;
    return cards.map((sch) => {
      const isToday = sch.date === todayStr;
      const isRequired = isMemberRequiredForSchedule(
        currentMember,
        sch.date,
        sch,
        currentMemberAliasIds,
        allMembers
      );
      const windowState = getCheckInWindowState(sch, currentNow);
      const comments = sheetsService.getComments(sch.id);
      const last = comments[comments.length - 1];
      return {
        schedule: sch,
        isToday,
        dDay: computeDDayDifference(sch.date, todayStr),
        isRequired,
        cta: deriveTodayCta({
          schedule: sch,
          now: currentNow,
          isRequired,
          myVote: findMyVote(sheetsService.getRSVPVotes(sch.id), currentMemberAliasIds),
          myReconciled:
            sheetsService.reconcileMemberAttendance(
              profile.memberId,
              sch.id,
              profile.name,
              currentNow
            ) || undefined,
          isOnline:
            typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
              ? navigator.onLine
              : true,
        }),
        checkedInCount:
          isToday && (windowState.isOpen || windowState.status === 'WINDOW_CLOSED')
            ? countCheckedIn(sheetsService.reconcileAttendance(sch.id, currentNow), allMembers)
            : undefined,
        checkedInTimeStr: isToday ? getKSTClock(getKSTTimestampString(currentNow)) : undefined,
        comments: {
          count: comments.length,
          last: last
            ? { part: last.part, memberName: last.memberName, text: last.text }
            : undefined,
          hasNew: seenComments.hasNewComment(sch.id),
        },
      };
    });
  }, [
    cards,
    todayStr,
    currentMember,
    currentMemberAliasIds,
    allMembers,
    currentNow,
    profile.memberId,
    profile.name,
    dataKey,
    seenComments,
  ]);

  const myVoteBySchedule = useMemo(() => {
    void dataKey;
    const map = new Map<string, RSVPVote>();
    for (const sch of upcoming) {
      const vote = findMyVote(sheetsService.getRSVPVotes(sch.id), currentMemberAliasIds);
      if (vote) map.set(sch.id, vote);
    }
    return map;
  }, [upcoming, currentMemberAliasIds, dataKey]);

  const commentCounts = useMemo(() => {
    void dataKey;
    return sheetsService.getCommentCounts();
  }, [dataKey]);

  const [activeCardDate, setActiveCardDate] = useState<string | undefined>(undefined);
  const handleActiveDateChange = useCallback((date: string | undefined) => setActiveCardDate(date), []);
  const highlightDateStr = calendarHighlightDate(activeCardDate, currentYear, currentMonthIndex);

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
    const monthStr = `${y}-${String(m + 1).padStart(2, '0')}`;
    onNavigate({ type: 'TAB', tab: 'home', month: monthStr });
  };

  return (
    <div className="home-tab-container">
      <MonthCalendarGrid
        currentYear={currentYear}
        currentMonthIndex={currentMonthIndex}
        selectedDateStr={routeSelectedDate}
        highlightDateStr={highlightDateStr}
        todayStr={todayStr}
        calendarDays={calendarDays}
        schedulesByDate={schedulesByDate}
        myLogsByScheduleId={myLogsByScheduleId}
        onSelectDate={handleSelectDate}
        onJumpToToday={handleJumpToToday}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
      />

      <HomeCardCarousel
        cards={cardModels}
        onActiveDateChange={handleActiveDateChange}
        onOpenQRScanner={onOpenQRScanner}
        onOpenRSVP={onOpenRSVP}
        onOpenDetail={onOpenDetail}
      />

      <HomeUpcomingSection
        schedules={upcoming}
        currentNow={currentNow}
        todayStr={todayStr}
        myVoteBySchedule={myVoteBySchedule}
        commentCounts={commentCounts}
        onNavigate={onNavigate}
      />
    </div>
  );
};
