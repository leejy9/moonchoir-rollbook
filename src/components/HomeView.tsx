import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { sheetsService } from '../services/sheets';
import type { BoundDeviceProfile, Member, RSVPVote, Schedule } from '../types/rollbook';
import { isMemberRequiredForSchedule } from '../utils/attendanceStats';
import { getCalendarGrid } from '../utils/calendar';
import { getCheckInWindowState } from '../utils/timeWindow';
import { getKSTDateString } from '../utils/date';
import {
  IconCalendar,
  IconClock,
  IconLocation,
  IconQrScan,
  IconSettings,
  IconVote,
} from './Icons';
import { LiquidGauge } from './LiquidGauge';
import moonchoirLogo from '../assets/moonchoir-logo.png';

interface HomeViewProps {
  profile: BoundDeviceProfile;
  onOpenQRScanner: (schedule?: Schedule) => void;
  onOpenRSVP: (schedule: Schedule) => void;
  onOpenAdmin: () => void;
  onChangeProfile?: () => void;
  onOpenProfilePortal?: () => void;
  onViewCalendar?: () => void;
  refreshTrigger: number;
}

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

const getTodayDateString = () => getKSTDateString();

export const HomeView: React.FC<HomeViewProps> = ({
  profile,
  onOpenQRScanner,
  onOpenRSVP,
  onOpenAdmin,
  onChangeProfile,
  onOpenProfilePortal,
  onViewCalendar,
  refreshTrigger: _refreshTrigger,
}) => {
  const [homeViewTab, setHomeViewTab] = useState<'CALENDAR' | 'LIST'>('CALENDAR');
  const [isRosterOpen, setIsRosterOpen] = useState(false);

  const [todayStr, setTodayStr] = useState(getTodayDateString);
  const [currentNow, setCurrentNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentNow(now);
      const newTodayStr = getKSTDateString(now);
      setTodayStr((prev) => {
        if (prev !== newTodayStr) {
          // 자정이 넘어가면 기본 선택 날짜도 새 오늘 날짜로 자동 갱신
          setSelectedDateStr((sel) => (sel === prev ? newTodayStr : sel));
          return newTodayStr;
        }
        return prev;
      });
    }, 10000); // 10s tick for smooth, real-time window transition
    return () => clearInterval(timer);
  }, []);

  // Month navigation state (default to current year/month)
  const [currentYear, setCurrentYear] = useState(() => parseInt(todayStr.slice(0, 4), 10));
  const [currentMonthIndex, setCurrentMonthIndex] = useState(() => parseInt(todayStr.slice(5, 7), 10) - 1);
  const [selectedDateStr, setSelectedDateStr] = useState<string>(todayStr);
  const [userSelectedScheduleId, setUserSelectedScheduleId] = useState<string | null>(null);

  const schedules = useMemo(() => {
    void _refreshTrigger;
    return sheetsService.getSchedules();
  }, [_refreshTrigger]);
  const members = useMemo(() => {
    void _refreshTrigger;
    return sheetsService.getMembers().filter((m) => m.status === 'ACTIVE');
  }, [_refreshTrigger]);

  const currentMember = useMemo(() => {
    void _refreshTrigger;
    return (
      members.find((m) => m.id === profile.memberId) ||
      (profile.name ? members.find((m) => m.name.trim() === profile.name.trim()) : undefined) ||
      ({
        id: profile.memberId,
        name: profile.name,
        part: profile.part,
        phoneLast4: profile.phoneLast4,
        role: 'MEMBER',
        status: 'ACTIVE',
        joinedAt: '2020-01-01',
      } as Member)
    );
  }, [members, profile, _refreshTrigger]);

  // Map user's attended schedules (reconciled projection view: only actual attendances get checkmark)
  const myLogsByScheduleId = useMemo(() => {
    void _refreshTrigger;
    const map = new Map<string, boolean>();
    schedules.forEach((sch) => {
      const rec = sheetsService.reconcileMemberAttendance(profile.memberId, sch.id, profile.name);
      if (rec && (rec.finalStatus === '출석' || rec.finalStatus === '지각' || rec.finalStatus === '수동인정')) {
        map.set(sch.id, true);
      }
    });
    return map;
  }, [schedules, profile.memberId, profile.name, _refreshTrigger]);

  // Map schedules by date string
  const schedulesByDate = useMemo(() => {
    const map = new Map<string, Schedule[]>();
    schedules.forEach((s) => {
      const list = map.get(s.date) || [];
      list.push(s);
      map.set(s.date, list);
    });
    return map;
  }, [schedules]);

  // Calendar grid calculation
  const calendarDays = useMemo(() => {
    return getCalendarGrid(currentYear, currentMonthIndex);
  }, [currentYear, currentMonthIndex]);

  const handlePrevMonth = () => {
    if (currentMonthIndex === 0) {
      setCurrentMonthIndex(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonthIndex((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonthIndex === 11) {
      setCurrentMonthIndex(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonthIndex((m) => m + 1);
    }
  };

  // Priority score for smart auto-ranking:
  // 1. Time state urgency: OPEN (300) > UPCOMING (200) > CLOSED (100)
  // 2. Member target relevance: Mandatory for me (+50) > Voluntary/Guest (+0)
  const getSchedulePriorityScore = useCallback(
    (sch: Schedule): number => {
      const win = getCheckInWindowState(sch, currentNow);
      let timeScore = 100;
      if (win.isOpen) {
        timeScore = 300;
      } else if (win.status !== 'WINDOW_CLOSED') {
        timeScore = 200;
      }

      const isTarget = isMemberRequiredForSchedule(currentMember, sch.date, sch);
      const targetScore = isTarget ? 50 : 0;

      return timeScore + targetScore;
    },
    [currentNow, currentMember]
  );

  // Candidate schedules for currently focused day, sorted by priority descending
  const activeDateSchedules = useMemo(() => {
    let list = schedulesByDate.get(selectedDateStr) || [];
    if (list.length === 0) {
      const todayList = schedulesByDate.get(todayStr) || [];
      if (todayList.length > 0) {
        list = todayList;
      } else {
        const nextSch = schedules.find((s) => s.date >= todayStr);
        list = nextSch ? schedulesByDate.get(nextSch.date) || [nextSch] : schedules.slice(0, 1);
      }
    }

    return [...list].sort((a, b) => {
      const scoreA = getSchedulePriorityScore(a);
      const scoreB = getSchedulePriorityScore(b);
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }
      return a.startTime.localeCompare(b.startTime);
    });
  }, [schedulesByDate, selectedDateStr, todayStr, schedules, getSchedulePriorityScore]);

  // Safe active schedule resolution (Clamping & Fallback Guard)
  const activeSchedule: Schedule | undefined = useMemo(() => {
    if (activeDateSchedules.length === 0) return undefined;
    if (userSelectedScheduleId) {
      const found = activeDateSchedules.find((s) => s.id === userSelectedScheduleId);
      if (found) return found;
    }
    // Default to the top-priority schedule
    return activeDateSchedules[0];
  }, [activeDateSchedules, userSelectedScheduleId]);

  const activeScheduleIndex = useMemo(() => {
    if (!activeSchedule) return 0;
    const idx = activeDateSchedules.findIndex((s) => s.id === activeSchedule.id);
    return idx >= 0 ? idx : 0;
  }, [activeDateSchedules, activeSchedule]);

  const handlePrevSchedule = () => {
    if (activeDateSchedules.length <= 1) return;
    const prevIdx = activeScheduleIndex > 0 ? activeScheduleIndex - 1 : activeDateSchedules.length - 1;
    setUserSelectedScheduleId(activeDateSchedules[prevIdx].id);
  };

  const handleNextSchedule = () => {
    if (activeDateSchedules.length <= 1) return;
    const nextIdx = activeScheduleIndex < activeDateSchedules.length - 1 ? activeScheduleIndex + 1 : 0;
    setUserSelectedScheduleId(activeDateSchedules[nextIdx].id);
  };

  // Touch Swipe Gesture Handling with vertical scroll guard (threshold 45px)
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
    setTouchStartY(e.touches[0].clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null || touchStartY === null) return;
    const diffX = e.changedTouches[0].clientX - touchStartX;
    const diffY = e.changedTouches[0].clientY - touchStartY;
    setTouchStartX(null);
    setTouchStartY(null);

    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 45) {
      if (diffX < 0) {
        handleNextSchedule();
      } else {
        handlePrevSchedule();
      }
    }
  };

  const windowState = activeSchedule
    ? getCheckInWindowState(activeSchedule, currentNow)
    : null;

  const rsvpVotes = useMemo(() => {
    void _refreshTrigger;
    return activeSchedule ? sheetsService.getRSVPVotes(activeSchedule.id) : [];
  }, [activeSchedule, _refreshTrigger]);

  const logs = useMemo(() => {
    void _refreshTrigger;
    return activeSchedule ? sheetsService.getLogs(activeSchedule.id) : [];
  }, [activeSchedule, _refreshTrigger]);

  // Current user's status for this active schedule (matching by memberId or name)
  const myVote = rsvpVotes.find(
    (v) => v.memberId === profile.memberId || (profile.name && v.memberName === profile.name)
  );
  const myLog = logs.find(
    (l) => l.memberId === profile.memberId || (profile.name && l.memberName === profile.name)
  );

  const myReconciliation = useMemo(() => {
    void _refreshTrigger;
    if (!activeSchedule) return null;
    return sheetsService.reconcileMemberAttendance(profile.memberId, activeSchedule.id, profile.name);
  }, [activeSchedule, profile.memberId, profile.name, _refreshTrigger]);

  const isActuallyAttended = Boolean(
    myReconciliation &&
    (myReconciliation.finalStatus === '출석' ||
     myReconciliation.finalStatus === '지각' ||
     myReconciliation.finalStatus === '수동인정')
  );
  const isManuallyAbsent = Boolean(
    myReconciliation?.finalStatus === '결석' && myReconciliation.isManualOverride
  );

  // Grouped RSVP lists with deduplication by name/ID so a single person cannot appear twice
  const uniqueVotes = useMemo(() => {
    const map = new Map<string, RSVPVote>();
    for (const v of rsvpVotes) {
      const key = v.memberName ? v.memberName.trim() : v.memberId;
      map.set(key, v);
    }
    return Array.from(map.values());
  }, [rsvpVotes]);

  // Target active members required for this schedule (accounting for audience selector & member status)
  const targetMembers = useMemo(() => {
    void _refreshTrigger;
    if (!activeSchedule) return [];

    // Filter active members who are required for this schedule
    const required = members.filter((m) => {
      if (m.status === 'MERGED') return false;
      return isMemberRequiredForSchedule(m, activeSchedule.date, activeSchedule);
    });

    // Deduplicate by name so duplicate unmerged IDs for the same person don't inflate the denominator
    const uniqueMap = new Map<string, Member>();
    for (const m of required) {
      const key = m.name.trim();
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, m);
      }
    }
    return Array.from(uniqueMap.values());
  }, [members, activeSchedule, _refreshTrigger]);

  const targetMemberIds = useMemo(() => new Set(targetMembers.map((m) => m.id)), [targetMembers]);
  const targetMemberNames = useMemo(() => new Set(targetMembers.map((m) => m.name.trim())), [targetMembers]);

  // Split attendees into mandatory target attendees vs voluntary/guest attendees
  const mandatoryAttendees = useMemo(
    () =>
      uniqueVotes.filter(
        (v) =>
          v.status === 'ATTEND' &&
          (targetMemberIds.has(v.memberId) || (v.memberName && targetMemberNames.has(v.memberName.trim())))
      ),
    [uniqueVotes, targetMemberIds, targetMemberNames]
  );

  const mandatoryAbsentees = useMemo(
    () =>
      uniqueVotes.filter(
        (v) =>
          v.status === 'ABSENT' &&
          (targetMemberIds.has(v.memberId) || (v.memberName && targetMemberNames.has(v.memberName.trim())))
      ),
    [uniqueVotes, targetMemberIds, targetMemberNames]
  );

  const voluntaryAttendees = useMemo(
    () =>
      uniqueVotes.filter(
        (v) =>
          v.status === 'ATTEND' &&
          !targetMemberIds.has(v.memberId) &&
          (!v.memberName || !targetMemberNames.has(v.memberName.trim()))
      ),
    [uniqueVotes, targetMemberIds, targetMemberNames]
  );

  // Voted names and IDs
  const votedNames = useMemo(
    () => new Set(uniqueVotes.map((v) => v.memberName.trim())),
    [uniqueVotes]
  );
  const votedIds = useMemo(
    () => new Set(uniqueVotes.map((v) => v.memberId)),
    [uniqueVotes]
  );

  // Unvoted members: Target members who haven't voted yet (neither by ID nor by name)
  const unvotedMembers = useMemo(() => {
    return targetMembers.filter((m) => {
      const nameKey = m.name.trim();
      if (votedNames.has(nameKey)) return false;
      if (votedIds.has(m.id)) return false;
      if (m.mergedIntoId && votedIds.has(m.mergedIntoId)) return false;
      return true;
    });
  }, [targetMembers, votedNames, votedIds]);


  const isTargetMember = useMemo(() => {
    void _refreshTrigger;
    if (!activeSchedule) return true;
    return isMemberRequiredForSchedule(currentMember, activeSchedule.date, activeSchedule);
  }, [currentMember, activeSchedule, _refreshTrigger]);

  // Denominator is strictly targetMembers.length (no artificial Math.max inflating)
  const totalTargetCount = targetMembers.length;
  const attendRate =
    totalTargetCount > 0
      ? Math.round((mandatoryAttendees.length / totalTargetCount) * 100)
      : voluntaryAttendees.length > 0
      ? 100
      : 0;

  // Upcoming future schedules (from today onwards)
  const upcomingSchedules = useMemo(() => {
    return schedules
      .filter((s) => s.date >= todayStr && !s.isArchived)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [schedules, todayStr]);

  const handleProfileClick = () => {
    if (onOpenProfilePortal) {
      onOpenProfilePortal();
    } else if (onChangeProfile) {
      onChangeProfile();
    }
  };

  return (
    <div className="home-container">
      {/* Top Header */}
      <header className="home-header">
        <div className="header-brand">
          <img
            src={moonchoirLogo}
            alt="Moonchoir"
            className="brand-logo-img"
            style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover' }}
          />
          <div>
            <h1 className="brand-title">문콰이어 출석부</h1>
            <p className="brand-subtitle">MOONCHOIR ATTENDANCE</p>
          </div>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="profile-pill-btn"
            onClick={handleProfileClick}
            title="프로필 및 출결 현황"
          >
            <span className={`part-badge part-${currentMember.part || profile.part}`}>{currentMember.part || profile.part}</span>
            <span className="profile-name">{currentMember.name || profile.name}</span>
          </button>

          <button
            type="button"
            className="admin-icon-btn"
            onClick={onOpenAdmin}
            title="관리자 모드"
            aria-label="관리자 모드"
          >
            <IconSettings size={18} />
          </button>
        </div>
      </header>

      {/* View Switcher Tabs: 캘린더 일체형 뷰 vs 리스트 뷰 */}
      <div
        style={{
          display: 'flex',
          background: '#f1f5f9',
          padding: '4px',
          borderRadius: '12px',
          margin: '0 0 16px',
          gap: '4px',
        }}
      >
        <button
          type="button"
          onClick={() => setHomeViewTab('CALENDAR')}
          style={{
            flex: 1,
            minHeight: '44px',
            border: 'none',
            borderRadius: '8px',
            fontSize: '0.9rem',
            fontWeight: 700,
            cursor: 'pointer',
            background: homeViewTab === 'CALENDAR' ? '#ffffff' : 'transparent',
            color: homeViewTab === 'CALENDAR' ? '#1e293b' : '#64748b',
            boxShadow: homeViewTab === 'CALENDAR' ? '0 2px 4px rgba(0,0,0,0.06)' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            transition: 'all 0.15s ease',
          }}
        >
          <IconCalendar size={16} />
          <span>월간 캘린더</span>
        </button>

        <button
          type="button"
          onClick={() => setHomeViewTab('LIST')}
          style={{
            flex: 1,
            minHeight: '44px',
            border: 'none',
            borderRadius: '8px',
            fontSize: '0.9rem',
            fontWeight: 700,
            cursor: 'pointer',
            background: homeViewTab === 'LIST' ? '#ffffff' : 'transparent',
            color: homeViewTab === 'LIST' ? '#1e293b' : '#64748b',
            boxShadow: homeViewTab === 'LIST' ? '0 2px 4px rgba(0,0,0,0.06)' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            transition: 'all 0.15s ease',
          }}
        >
          <span>📋 오늘 & 다가오는 연습</span>
        </button>
      </div>

      {/* Embedded Monthly Interactive Calendar (When in CALENDAR tab) */}
      {homeViewTab === 'CALENDAR' && (
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
                  onClick={() => {
                    const todayYear = parseInt(todayStr.slice(0, 4), 10);
                    const todayMonth = parseInt(todayStr.slice(5, 7), 10) - 1;
                    setCurrentYear(todayYear);
                    setCurrentMonthIndex(todayMonth);
                    setSelectedDateStr(todayStr);
                    setUserSelectedScheduleId(null);
                  }}
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
                onClick={handlePrevMonth}
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
                onClick={handleNextMonth}
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
                  onClick={() => {
                    setSelectedDateStr(day.dateStr);
                    setUserSelectedScheduleId(null);
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
      )}

      {/* Main Active / Selected Rehearsal Card */}
      {activeSchedule ? (
        <section
          className="active-schedule-card"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Multi-Schedule Carousel Switcher (Rendered only when 2+ schedules exist) */}
          {activeDateSchedules.length > 1 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
                padding: '6px 12px',
                marginBottom: '14px',
              }}
            >
              <button
                type="button"
                onClick={handlePrevSchedule}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 800,
                  color: '#475569',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                }}
                title="이전 일정 보기"
                aria-label="이전 일정 보기"
              >
                ◀
              </button>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#1E293B' }}>
                  {activeSchedule.date === todayStr ? '오늘' : activeSchedule.date} 일정 {activeScheduleIndex + 1}/{activeDateSchedules.length}
                  <span style={{ color: '#4F46E5', marginLeft: '6px' }}>({activeSchedule.startTime})</span>
                </span>
                {/* Dot Indicators */}
                <div style={{ display: 'flex', gap: '5px' }}>
                  {activeDateSchedules.map((sch, i) => (
                    <span
                      key={sch.id}
                      onClick={() => setUserSelectedScheduleId(sch.id)}
                      style={{
                        width: i === activeScheduleIndex ? '16px' : '6px',
                        height: '6px',
                        borderRadius: '3px',
                        background: i === activeScheduleIndex ? '#4F46E5' : '#CBD5E1',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                      title={`${sch.title} (${sch.startTime})`}
                    />
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleNextSchedule}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 800,
                  color: '#475569',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                }}
                title="다음 일정 보기"
                aria-label="다음 일정 보기"
              >
                ▶
              </button>
            </div>
          )}

          <div className="schedule-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="schedule-category-badge">{activeSchedule.category}</span>
              {!isTargetMember && (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#047857',
                    background: '#ECFDF5',
                    border: '1px solid #A7F3D0',
                    padding: '2px 8px',
                    borderRadius: '999px',
                  }}
                >
                  🌿 자율 참여 연습
                </span>
              )}
              <span className={`schedule-date-badge ${activeSchedule.date === todayStr ? 'is-today' : ''}`}>
                {activeSchedule.date === todayStr ? '오늘 연습' : activeSchedule.date}
              </span>
              {homeViewTab === 'CALENDAR' && activeSchedule.date === selectedDateStr && (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#4f46e5',
                    background: '#e0e7ff',
                    padding: '2px 8px',
                    borderRadius: '999px',
                  }}
                >
                  선택한 날짜
                </span>
              )}
            </div>
            {/* Cute Liquid Wave Gauge (MYTURN Style) */}
            <LiquidGauge percentage={attendRate} size={44} subText="투표율" />
          </div>

          <h2 className="schedule-card-title">{activeSchedule.title}</h2>

          <div className="schedule-info-grid">
            <div className="info-item">
              <span className="info-icon" aria-hidden="true">
                <IconClock size={16} />
              </span>
              <span className="info-text">{activeSchedule.startTime} ~ {activeSchedule.endTime}</span>
            </div>
            <div className="info-item">
              <span className="info-icon" aria-hidden="true">
                <IconLocation size={16} />
              </span>
              <span className="info-text">{activeSchedule.locationName}</span>
            </div>
          </div>

          {activeSchedule.description && (
            <p className="schedule-desc-box">{activeSchedule.description}</p>
          )}

          {/* Non-target member gentle notice banner */}
          {!isTargetMember && (
            <div
              style={{
                background: '#F0FDF4',
                border: '1px solid #BBF7D0',
                borderRadius: '8px',
                padding: '10px 14px',
                margin: '12px 0 4px',
                fontSize: '12.5px',
                color: '#166534',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span style={{ fontSize: '16px' }}>🌿</span>
              <div>
                <strong>공식 필참 일정이 아닙니다.</strong>
                <p style={{ margin: '2px 0 0', fontSize: '11.5px', color: '#15803D' }}>
                  참관이나 개인 연습으로 자유롭게 참여하실 수 있습니다.
                </p>
              </div>
            </div>
          )}

          {/* User's Check-in & RSVP Status Banner */}
          {isActuallyAttended ? (
            <div className={`my-status-banner checked-in ${myReconciliation?.finalStatus === '지각' ? 'late' : ''}`}>
              <span className={`status-indicator-dot ${myReconciliation?.finalStatus === '지각' ? 'late' : 'checked'}`} />
              <div>
                <strong>{myReconciliation?.finalStatus === '지각' ? '오늘 출석 (지각)' : '오늘 출석 체크 완료'}</strong>
                <p className="banner-subtext">
                  인증 시각:{' '}
                  {myReconciliation?.checkInTime
                    ? (myReconciliation.checkInTime.includes('T')
                        ? myReconciliation.checkInTime.slice(11, 16)
                        : myReconciliation.checkInTime.slice(0, 5))
                    : (myLog ? (myLog.timestamp.includes('T') ? myLog.timestamp.slice(11, 16) : myLog.timestamp.slice(0, 5)) : '')}{' '}
                  ·{' '}
                  {myReconciliation?.authMethod === 'MANUAL_BY_ADMIN'
                    ? (myReconciliation.adminNote || '관리자 수동 인정')
                    : myReconciliation?.isVerifiedLocation
                    ? '연습실 위치 확인됨'
                    : 'GPS 오차 범위'}
                </p>
              </div>
            </div>
          ) : isManuallyAbsent ? (
            <div className="my-status-banner absent" style={{ background: '#fef2f2', borderColor: '#fca5a5' }}>
              <span className="status-indicator-dot absent" />
              <div>
                <strong style={{ color: '#b91c1c' }}>관리자 확인: 결석 처리</strong>
                <p className="banner-subtext" style={{ color: '#ef4444' }}>
                  {myReconciliation?.adminNote || '관리자에 의해 결석으로 처리되었습니다.'}
                </p>
              </div>
            </div>
          ) : myVote ? (
            <div className={`my-status-banner voted ${myVote.status.toLowerCase()}`}>
              <span className={`status-indicator-dot ${myVote.status === 'ATTEND' ? 'attend' : 'absent'}`} />
              <div>
                <strong>사전 투표: {myVote.status === 'ATTEND' ? '참석 예정' : '불참'}</strong>
                {myVote.reason && <p className="banner-subtext">사유: {myVote.reason}</p>}
              </div>
            </div>
          ) : null}

          {/* Action Buttons: Time Window Driven */}
          <div className="action-buttons-stack">
            {windowState?.isOpen ? (
              <>
                <button
                  type="button"
                  className="btn-qr-scan-primary"
                  onClick={() => onOpenQRScanner(activeSchedule)}
                >
                  <IconQrScan size={22} className="btn-icon" />
                  <div className="btn-text-block">
                    <span className="btn-main-label">
                      {isActuallyAttended ? '다시 출석 체크하기' : (!isTargetMember ? '개인 연습으로 출석 체크' : 'QR 출석 체크')}
                    </span>
                    <span className="btn-sub-label">
                      {!isTargetMember ? '자유 연습/참관으로 출석 기록을 남깁니다' : '연습실 종이 QR 코드를 스캔하세요'}
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  className="btn-rsvp-secondary"
                  onClick={() => onOpenRSVP(activeSchedule)}
                >
                  <IconVote size={18} className="btn-icon" />
                  <span>
                    {!isTargetMember
                      ? (myVote ? '개인 연습 참여 여부 수정' : '개인 연습으로 참여 투표')
                      : (myVote ? '사전 참석/불참 투표 수정' : '사전 참석/불참 투표하기')}
                  </span>
                </button>
              </>
            ) : windowState?.status === 'WINDOW_CLOSED' ? (
              /* Concluded Schedule: Closed State */
              <div className="qr-locked-card window-closed" style={{ borderLeft: '4px solid #94A3B8' }}>
                <div className="qr-locked-info">
                  <span className="qr-lock-icon">🏁</span>
                  <div>
                    <div className="qr-locked-title">출석 마감 ({activeSchedule.date} 일정 종료)</div>
                    <div className="qr-locked-desc">
                      {isActuallyAttended && myReconciliation?.checkInTime
                        ? `출석 완료 (${myReconciliation.checkInTime.includes('T') ? myReconciliation.checkInTime.slice(11, 16) : myReconciliation.checkInTime.slice(0, 5)}) · 정상 반영되었습니다.`
                        : isManuallyAbsent
                        ? `관리자에 의해 결석 처리되었습니다 (${myReconciliation?.adminNote || '관리자 결석'}).`
                        : '금일 연습의 공식 출석 체크가 마감되었습니다.'}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Default Primary Action: RSVP Pre-voting */}
                <button
                  type="button"
                  className="btn-rsvp-primary"
                  onClick={() => onOpenRSVP(activeSchedule)}
                >
                  <IconVote size={22} className="btn-icon" />
                  <div className="btn-text-block">
                    <span className="btn-main-label">
                      {!isTargetMember
                        ? (myVote ? '개인 연습 참여 여부 수정' : '개인 연습으로 참여 투표')
                        : (myVote ? '사전 참석/불참 투표 수정' : '사전 참석/불참 투표하기')}
                    </span>
                    <span className="btn-sub-label">
                      {myVote
                        ? `현재 선택: ${myVote.status === 'ATTEND' ? '참석 예정' : '불참'}`
                        : (!isTargetMember ? '자유 연습/참관 참여 여부를 알려주세요' : '연습 참석 여부를 미리 알려주세요')}
                    </span>
                  </div>
                </button>

                {/* Subordinate Locked QR Check-in Notice */}
                <div className="qr-locked-card">
                  <div className="qr-locked-info">
                    <span className="qr-lock-icon">🔒</span>
                    <div>
                      <div className="qr-locked-title">현장 QR 출석 ({windowState?.badgeLabel})</div>
                      <div className="qr-locked-desc">{windowState?.message}</div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Realtime Attendance / RSVP Tally Bar */}
          <div className="tally-section">
            <div className="tally-header">
              <h3 className="tally-title">사전 참석 투표 현황</h3>
              <span className="tally-total">
                {mandatoryAttendees.length + mandatoryAbsentees.length}명 응답 / 총 {totalTargetCount}명
                {voluntaryAttendees.length > 0 && ` (🌿 자율 ${voluntaryAttendees.length}명)`}
              </span>
            </div>

            <div className="tally-bar">
              <div
                className="tally-bar-segment attend"
                style={{ width: `${(mandatoryAttendees.length / Math.max(totalTargetCount, 1)) * 100}%` }}
                title={`필수 참석 ${mandatoryAttendees.length}명`}
              />
              <div
                className="tally-bar-segment absent"
                style={{ width: `${(mandatoryAbsentees.length / Math.max(totalTargetCount, 1)) * 100}%` }}
                title={`불참 ${mandatoryAbsentees.length}명`}
              />
            </div>

            <div className="tally-stat-chips">
              <span className="stat-chip attend">
                <span className="chip-dot attend" /> 참석 {mandatoryAttendees.length}
              </span>
              <span className="stat-chip absent">
                <span className="chip-dot absent" /> 불참 {mandatoryAbsentees.length}
              </span>
              <span className="stat-chip unvoted">
                <span className="chip-dot unvoted" /> 미응답 {unvotedMembers.length}
              </span>
              {voluntaryAttendees.length > 0 && (
                <span className="stat-chip" style={{ background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0' }}>
                  <span className="chip-dot" style={{ background: '#10B981' }} /> 🌿 자율참관 {voluntaryAttendees.length}
                </span>
              )}
            </div>

            {/* Clean, Subtle Roster Disclosure Toggle */}
            <div style={{ marginTop: '14px' }}>
              <button
                type="button"
                onClick={() => setIsRosterOpen((prev) => !prev)}
                style={{
                  width: '100%',
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: isRosterOpen ? '8px 8px 0 0' : '8px',
                  padding: '9px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#475569',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
              >
                <span>
                  👥 단원 투표 명단 (참석 {mandatoryAttendees.length} · 불참 {mandatoryAbsentees.length} · 미응답 {unvotedMembers.length}
                  {voluntaryAttendees.length > 0 ? ` · 🌿 자율 ${voluntaryAttendees.length}` : ''})
                </span>
                <span style={{ fontSize: '11px', color: '#94A3B8' }}>
                  {isRosterOpen ? '▲ 명단 접기' : '▼ 명단 펼치기'}
                </span>
              </button>

              {isRosterOpen && (
                <div
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderTop: 'none',
                    borderRadius: '0 0 8px 8px',
                    padding: '12px 14px',
                    fontSize: '12px',
                    color: '#334155',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  {/* Mandatory Attendees */}
                  <div>
                    <span style={{ fontWeight: 700, color: '#059669', display: 'block', marginBottom: '4px' }}>
                      ✓ 참석 ({mandatoryAttendees.length}명)
                    </span>
                    {mandatoryAttendees.length > 0 ? (
                      <span style={{ color: '#475569', lineHeight: 1.6 }}>
                        {mandatoryAttendees.map((a) => a.memberName).join(', ')}
                      </span>
                    ) : (
                      <span style={{ color: '#94A3B8' }}>아직 참석 투표한 필수 대상 단원이 없습니다.</span>
                    )}
                  </div>

                  {/* Voluntary / Guest Attendees */}
                  {voluntaryAttendees.length > 0 && (
                    <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '6px', padding: '8px 10px' }}>
                      <span style={{ fontWeight: 700, color: '#047857', display: 'block', marginBottom: '4px' }}>
                        🌿 자율 참여 / 참관 ({voluntaryAttendees.length}명)
                      </span>
                      <span style={{ color: '#166534', lineHeight: 1.6 }}>
                        {voluntaryAttendees.map((a) => a.memberName).join(', ')}
                      </span>
                    </div>
                  )}

                  {/* Absentees */}
                  {mandatoryAbsentees.length > 0 && (
                    <div>
                      <span style={{ fontWeight: 700, color: '#DC2626', display: 'block', marginBottom: '4px' }}>
                        ✕ 불참 ({mandatoryAbsentees.length}명)
                      </span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {mandatoryAbsentees.map((ab) => (
                          <span key={ab.id} style={{ color: '#475569', lineHeight: 1.5 }}>
                            <strong>{ab.memberName}</strong>
                            {ab.reason ? ` (${ab.reason})` : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Unvoted */}
                  <div>
                    <span style={{ fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '4px' }}>
                      ⏳ 미응답 ({unvotedMembers.length}명)
                    </span>
                    {unvotedMembers.length > 0 ? (
                      <span style={{ color: '#64748B', lineHeight: 1.6 }}>
                        {unvotedMembers.map((m) => m.name).join(', ')}
                      </span>
                    ) : (
                      <span style={{ color: '#059669' }}>모든 필수 대상 단원이 응답을 완료했습니다! 🎉</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      ) : (
        <div className="no-schedule-box" style={{ background: '#ffffff', padding: '30px 20px', borderRadius: '16px', textAlign: 'center', border: '1px solid #e2e8f0', margin: '0 0 16px' }}>
          <p style={{ margin: '0 0 10px', color: '#64748b', fontSize: '0.95rem' }}>
            선택한 날짜({selectedDateStr})에는 연습 일정이 없습니다.
          </p>
          <button
            type="button"
            onClick={() => {
              setSelectedDateStr(todayStr);
              setUserSelectedScheduleId(null);
            }}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              background: '#4f46e5',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem',
            }}
          >
            오늘 일정으로 이동
          </button>
        </div>
      )}

      {/* Upcoming Schedules List */}
      <section className="month-overview-card" style={{ marginTop: '16px' }}>
        <div className="section-title-row">
          <div>
            <h3 className="section-title">다가오는 연습 일정</h3>
            <p className="section-subtitle">오늘 이후 예정된 연습 모음</p>
          </div>
          {onViewCalendar && (
            <button type="button" className="btn-calendar-link" onClick={onViewCalendar}>
              <IconCalendar size={15} />
              <span>전체 캘린더</span>
            </button>
          )}
        </div>

        <div className="schedules-preview-list compact">
          {upcomingSchedules.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
              예정된 다음 연습 일정이 없습니다.
            </div>
          ) : (
            upcomingSchedules.slice(0, 5).map((s) => {
              const targetForSch = members.filter((m) => isMemberRequiredForSchedule(m, s.date, s));
              const votes = sheetsService.getRSVPVotes(s.id);
              const count = votes.filter(
                (v) =>
                  v.status === 'ATTEND' &&
                  targetForSch.some((tm) => tm.id === v.memberId || tm.name.trim() === v.memberName.trim())
              ).length;
              const totalCount = targetForSch.length;
              const rate = totalCount > 0 ? Math.round((count / totalCount) * 100) : (votes.some((v) => v.status === 'ATTEND') ? 100 : 0);
              const isSelected = s.date === selectedDateStr;

              return (
                <div
                  key={s.id}
                  className="schedule-preview-item compact"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    borderRadius: '10px',
                    border: isSelected ? '1.5px solid #4f46e5' : '1px solid #f1f5f9',
                    background: isSelected ? '#f5f3ff' : '#ffffff',
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => {
                    setSelectedDateStr(s.date);
                    setUserSelectedScheduleId(s.id);
                    setHomeViewTab('CALENDAR');
                  }}
                >
                  <div className="preview-date-box" style={{ width: '38px', minWidth: '38px', height: '38px' }}>
                    <span className="preview-month" style={{ fontSize: '9px' }}>{s.date.slice(5, 7)}월</span>
                    <span className="preview-day" style={{ fontSize: '14px' }}>{s.date.slice(8, 10)}</span>
                  </div>
                  <div className="preview-content" style={{ flex: 1, minWidth: 0 }}>
                    <div className="preview-title-row" style={{ gap: '6px' }}>
                      <span className="preview-title" style={{ fontSize: '13px', fontWeight: 600 }}>{s.title}</span>
                      <span className="schedule-category-badge" style={{ fontSize: '10px', padding: '1px 6px' }}>{s.category}</span>
                    </div>
                    <div className="preview-meta" style={{ fontSize: '11px', color: '#8b95a1', marginTop: '2px' }}>
                      <span>{s.startTime}~{s.endTime}</span>
                      <span className="meta-divider">·</span>
                      <span>{s.locationName}</span>
                    </div>
                  </div>
                  <LiquidGauge percentage={rate} size={32} />
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
};
export default HomeView;
