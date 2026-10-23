import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { buildRsvpTally } from '../utils/rsvpTally';
import { sheetsService } from '../services/sheets';
import type { BoundDeviceProfile, Member, RSVPVote, Schedule } from '../types/rollbook';
import {
  isMemberRequiredForSchedule,
  resolveMergedMemberIds,
} from '../utils/attendanceStats';
import { getCalendarGrid } from '../utils/calendar';
import { getCheckInWindowState } from '../utils/timeWindow';
import { getKSTDateString } from '../utils/date';
import {
  IconCalendar,
  IconSettings,
} from './Icons';
import { HomeActiveScheduleCard } from './home/HomeActiveScheduleCard';
import { HomeCalendarSection } from './home/HomeCalendarSection';
import { HomeUpcomingListSection } from './home/HomeUpcomingListSection';
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
  const allMembers = useMemo(() => {
    void _refreshTrigger;
    return sheetsService.getMembers(true);
  }, [_refreshTrigger]);

  const members = useMemo(() => {
    return allMembers.filter((m) => m.status === 'ACTIVE');
  }, [allMembers]);

  const currentMember = useMemo(() => {
    void _refreshTrigger;
    const direct = allMembers.find((m) => m.id === profile.memberId);
    if (direct?.status === 'MERGED' && direct.mergedIntoId) {
      const canonical = members.find((m) => m.id === direct.mergedIntoId);
      if (canonical) return canonical;
    }
    if (direct && direct.status === 'ACTIVE') return direct;
    return {
      id: profile.memberId,
      name: profile.name,
      part: profile.part,
      phoneLast4: profile.phoneLast4,
      role: 'MEMBER',
      status: 'ACTIVE',
      joinedAt: '2020-01-01',
    } as Member;
  }, [allMembers, members, profile, _refreshTrigger]);

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
    const directList = schedulesByDate.get(selectedDateStr) || [];
    if (directList.length === 0) {
      // 사용자가 오늘이 아닌 다른 날짜(예: 일정 없는 날)를 직접 클릭한 경우에는 과거 일정을 억지로 끌어오지 않고 빈 상태 표시
      if (selectedDateStr !== todayStr) {
        return [];
      }
      // 오늘 날짜에 일정이 없을 때만 오늘 이후 예정된 가장 가까운 미래 일정을 표시 (이미 지난 과거 연습 제외)
      const nextSch = schedules.find(
        (s) => !s.isCancelled && !s.isArchived && s.date > todayStr
      );
      return nextSch
        ? (schedulesByDate.get(nextSch.date) || [nextSch]).filter(
            (s) => !s.isCancelled && !s.isArchived
          )
        : [];
    }

    // 오늘 날짜인 경우 이미 종료된 연습(WINDOW_CLOSED)이 아닌 진행 중/예정 연습만 남김
    // (단, 사용자가 달력에서 과거 날짜를 직접 클릭한 경우에는 해당 날짜 기록 열람 허용)
    const filteredList =
      selectedDateStr === todayStr
        ? directList.filter((s) => {
            if (s.isCancelled || s.isArchived) return false;
            return getCheckInWindowState(s, currentNow).status !== 'WINDOW_CLOSED';
          })
        : directList.filter((s) => !s.isCancelled && !s.isArchived);

    if (filteredList.length === 0 && selectedDateStr === todayStr) {
      // 오늘 연습이 모두 시간이 지나 종료되었다면 다음 미래 연습으로 자동 전환
      const nextSch = schedules.find(
        (s) => !s.isCancelled && !s.isArchived && s.date > todayStr
      );
      if (nextSch) {
        return (schedulesByDate.get(nextSch.date) || [nextSch]).filter(
          (s) => !s.isCancelled && !s.isArchived
        );
      }
      return [];
    }

    return [...filteredList].sort((a, b) => {
      const scoreA = getSchedulePriorityScore(a);
      const scoreB = getSchedulePriorityScore(b);
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }
      return a.startTime.localeCompare(b.startTime);
    });
  }, [schedulesByDate, selectedDateStr, todayStr, schedules, currentNow, getSchedulePriorityScore]);

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

  const myAliasIds = useMemo(
    () => resolveMergedMemberIds(currentMember.id, allMembers),
    [currentMember.id, allMembers]
  );

  // Current user's status for this active schedule (strictly by memberId + mergedIntoId chain)
  const myVote = rsvpVotes.find((v) => myAliasIds.has(v.memberId));
  const myLog = logs.find((l) => myAliasIds.has(l.memberId));

  const myReconciliation = useMemo(() => {
    void _refreshTrigger;
    if (!activeSchedule) return null;
    return sheetsService.reconcileMemberAttendance(currentMember.id, activeSchedule.id);
  }, [activeSchedule, currentMember.id, _refreshTrigger]);

  const isActuallyAttended = Boolean(
    myReconciliation &&
    (myReconciliation.finalStatus === '출석' ||
     myReconciliation.finalStatus === '지각' ||
     myReconciliation.finalStatus === '수동인정')
  );
  // 관리자가 명시적으로 결석/노쇼로 지정한 경우에만 관리자 결석으로 판정 (출결 취소/초기화 및 일반 미출석 마감과 엄격히 분리)
  const isManuallyAbsent = Boolean(
    myReconciliation?.finalStatus === '결석' &&
    myReconciliation.isManualOverride &&
    !myReconciliation.adminNote?.includes('취소') &&
    (myReconciliation.adminNote?.includes('결석') || myReconciliation.adminNote?.includes('노쇼'))
  );

  const canonicalMemberIdMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of allMembers) {
      let cur = m;
      const visited = new Set<string>([cur.id]);
      while (cur.mergedIntoId) {
        const next = allMembers.find((x) => x.id === cur.mergedIntoId);
        if (!next || visited.has(next.id)) break;
        visited.add(next.id);
        cur = next;
      }
      map.set(m.id, cur.id);
    }
    return map;
  }, [allMembers]);

  // Grouped RSVP lists deduplicated strictly by canonical memberId (preserving same-name members)
  const uniqueVotes = useMemo(() => {
    const map = new Map<string, RSVPVote>();
    for (const v of rsvpVotes) {
      const canonicalId = canonicalMemberIdMap.get(v.memberId) || v.memberId;
      map.set(canonicalId, { ...v, memberId: canonicalId });
    }
    return Array.from(map.values());
  }, [rsvpVotes, canonicalMemberIdMap]);

  // Target active members required for this schedule (accounting for audience selector & member status)
  const targetMembers = useMemo(() => {
    void _refreshTrigger;
    if (!activeSchedule) return [];

    return members.filter((m) =>
      isMemberRequiredForSchedule(m, activeSchedule.date, activeSchedule)
    );
  }, [members, activeSchedule, _refreshTrigger]);

  const targetMemberIds = useMemo(() => new Set(targetMembers.map((m) => m.id)), [targetMembers]);

  // 실제 출석한 단원(출석·지각·수동 인정). 투표보다 출석을 우선해 현황에 반영한다.
  const attendedMemberIds = useMemo(() => {
    void _refreshTrigger;
    if (!activeSchedule) return new Set<string>();
    return new Set(
      sheetsService
        .reconcileAttendance(activeSchedule.id)
        .filter((r) => r.finalStatus === '출석' || r.finalStatus === '지각' || r.finalStatus === '수동인정')
        .map((r) => r.memberId)
    );
  }, [activeSchedule, _refreshTrigger]);

  const tally = useMemo(
    () => buildRsvpTally({ targetMembers, votes: uniqueVotes, attendedMemberIds }),
    [targetMembers, uniqueVotes, attendedMemberIds]
  );
  const mandatoryAttendees = tally.votedAttendees;
  const onSiteAttendees = tally.onSiteAttendees;
  const mandatoryAbsentees = tally.absentees;
  const unvotedMembers = tally.unvotedMembers;

  // 대상이 아닌 단원의 참석 투표는 자율 참여로 따로 센다
  const voluntaryAttendees = useMemo(
    () =>
      uniqueVotes.filter(
        (v) => v.status === 'ATTEND' && !targetMemberIds.has(v.memberId)
      ),
    [uniqueVotes, targetMemberIds]
  );

  const isTargetMember = useMemo(() => {
    void _refreshTrigger;
    if (!activeSchedule) return true;
    return isMemberRequiredForSchedule(currentMember, activeSchedule.date, activeSchedule);
  }, [currentMember, activeSchedule, _refreshTrigger]);

  // Denominator is strictly targetMembers.length (no artificial Math.max inflating)
  const totalTargetCount = targetMembers.length;
  const attendRate =
    totalTargetCount > 0
      ? Math.round((tally.attendTotal / totalTargetCount) * 100)
      : voluntaryAttendees.length > 0
      ? 100
      : 0;

  // Upcoming future schedules (from today onwards, excluding already-concluded today schedules)
  const upcomingSchedules = useMemo(() => {
    return schedules
      .filter((s) => {
        if (s.isArchived || s.isCancelled) return false;
        if (s.date < todayStr) return false;
        if (s.date === todayStr) {
          return getCheckInWindowState(s, currentNow).status !== 'WINDOW_CLOSED';
        }
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [schedules, todayStr, currentNow]);

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
        <HomeCalendarSection
          currentYear={currentYear}
          currentMonthIndex={currentMonthIndex}
          selectedDateStr={selectedDateStr}
          todayStr={todayStr}
          calendarDays={calendarDays}
          schedulesByDate={schedulesByDate}
          myLogsByScheduleId={myLogsByScheduleId}
          onSelectDate={(dateStr) => {
            setSelectedDateStr(dateStr);
            setUserSelectedScheduleId(null);
          }}
          onJumpToToday={() => {
            const todayYear = parseInt(todayStr.slice(0, 4), 10);
            const todayMonth = parseInt(todayStr.slice(5, 7), 10) - 1;
            setCurrentYear(todayYear);
            setCurrentMonthIndex(todayMonth);
            setSelectedDateStr(todayStr);
            setUserSelectedScheduleId(null);
          }}
          onPrevMonth={handlePrevMonth}
          onNextMonth={handleNextMonth}
        />
      )}

      {/* Main Active / Selected Rehearsal Card */}
      {activeSchedule ? (
        <HomeActiveScheduleCard
          activeSchedule={activeSchedule}
          activeDateSchedules={activeDateSchedules}
          activeScheduleIndex={activeScheduleIndex}
          todayStr={todayStr}
          selectedDateStr={selectedDateStr}
          homeViewTab={homeViewTab}
          isTargetMember={isTargetMember}
          attendRate={attendRate}
          isActuallyAttended={isActuallyAttended}
          isManuallyAbsent={isManuallyAbsent}
          myReconciliation={myReconciliation}
          myLog={myLog}
          myVote={myVote}
          windowState={windowState}
          mandatoryAttendees={mandatoryAttendees}
          onSiteAttendees={onSiteAttendees}
          mandatoryAbsentees={mandatoryAbsentees}
          voluntaryAttendees={voluntaryAttendees}
          unvotedMembers={unvotedMembers}
          totalTargetCount={totalTargetCount}
          isRosterOpen={isRosterOpen}
          onToggleRoster={() => setIsRosterOpen((prev) => !prev)}
          onPrevSchedule={handlePrevSchedule}
          onNextSchedule={handleNextSchedule}
          onSelectScheduleId={(scheduleId) => setUserSelectedScheduleId(scheduleId)}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onOpenQRScanner={onOpenQRScanner}
          onOpenRSVP={onOpenRSVP}
        />
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
      <HomeUpcomingListSection
        upcomingSchedules={upcomingSchedules}
        members={members}
        canonicalMemberIdMap={canonicalMemberIdMap}
        selectedDateStr={selectedDateStr}
        onViewCalendar={onViewCalendar}
        onSelectSchedule={(s) => {
          setSelectedDateStr(s.date);
          setUserSelectedScheduleId(s.id);
          setHomeViewTab('CALENDAR');
        }}
      />
    </div>
  );
};
export default HomeView;
