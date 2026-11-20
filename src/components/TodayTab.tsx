import React, { useEffect, useMemo, useState } from 'react';
import { sheetsService } from '../services/sheets';
import type { BoundDeviceProfile, Member, Schedule } from '../types/rollbook';
import { isMemberRequiredForSchedule } from '../utils/attendanceStats';
import { getKSTClock, getKSTDateString, getKSTTimestampString } from '../utils/date';
import { getCheckInWindowState } from '../utils/timeWindow';
import { selectTodayFocus } from '../utils/todayFocus';
import { deriveTodayCta } from '../utils/todayCta';
import { countCheckedIn } from '../utils/rsvpTally';
import { HomeActiveScheduleCard } from './home/HomeActiveScheduleCard';

export interface TodayTabProps {
  profile: BoundDeviceProfile;
  onOpenQRScanner: (scheduleId: string) => void;
  onOpenRSVP: (schedule: Schedule) => void;
  onOpenDetail?: (schedule: Schedule) => void;
  onNavigateToCalendar?: () => void;
  refreshTrigger?: number;
  // Backward compatibility passthrough props
  onOpenAdmin?: () => void;
  onOpenSuperAdmin?: () => void;
  onChangeProfile?: () => void;
  onOpenProfilePortal?: () => void;
  onViewCalendar?: () => void;
}

export const TodayTab: React.FC<TodayTabProps> = ({
  profile,
  onOpenQRScanner,
  onOpenRSVP,
  onOpenDetail,
  onNavigateToCalendar,
  onViewCalendar,
  refreshTrigger,
}) => {
  const [currentNow, setCurrentNow] = useState(() => new Date());
  const [todayStr, setTodayStr] = useState(() => getKSTDateString());
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentNow(now);
      const newTodayStr = getKSTDateString(now);
      setTodayStr((prev) => (prev !== newTodayStr ? newTodayStr : prev));
    }, 10000); // 10s tick
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

  const activeMembers = useMemo(() => {
    return allMembers.filter((m) => m.status === 'ACTIVE');
  }, [allMembers]);

  const currentMember = useMemo<Member>(() => {
    const direct = allMembers.find((m) => m.id === profile.memberId);
    if (direct?.status === 'MERGED' && direct.mergedIntoId) {
      const canonical = activeMembers.find((m) => m.id === direct.mergedIntoId);
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
  }, [allMembers, activeMembers, profile]);

  const focusResult = useMemo(() => {
    return selectTodayFocus({
      schedules,
      member: currentMember,
      now: currentNow,
      todayStr,
      selectedId: selectedScheduleId,
    });
  }, [schedules, currentMember, currentNow, todayStr, selectedScheduleId]);

  const handleNavigateCalendar = onNavigateToCalendar || onViewCalendar || (() => {});

  // Past attended schedule on todayStr (if mode === 'NEXT', show today attended result)
  let todayAttendedSummary: {
    scheduleTitle: string;
    status: string;
    time: string;
  } | null = null;
  if (focusResult.mode === 'NEXT') {
    const todaySchedules = schedules.filter(
      (s) => s.date === todayStr && !s.isCancelled && !s.isArchived
    );
    for (const sch of todaySchedules) {
      const rec = sheetsService.reconcileMemberAttendance(profile.memberId, sch.id, profile.name);
      if (
        rec &&
        (rec.finalStatus === '출석' ||
          rec.finalStatus === '지각' ||
          rec.finalStatus === '수동인정')
      ) {
        const timeStr = rec.checkInTime ? getKSTClock(rec.checkInTime) : '';
        todayAttendedSummary = {
          scheduleTitle: sch.title,
          status: rec.finalStatus,
          time: timeStr,
        };
        break;
      }
    }
  }

  if (focusResult.mode === 'NONE' || !focusResult.focus) {
    return (
      <div
        className="today-tab-empty"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 20px',
          textAlign: 'center',
          gap: '16px',
        }}
      >
        <p style={{ fontSize: '16px', color: 'var(--text-sub)', margin: 0, fontWeight: 600 }}>
          예정된 일정이 없습니다.
        </p>
        <button
          type="button"
          onClick={handleNavigateCalendar}
          style={{
            minHeight: '44px',
            padding: '10px 20px',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--brand-primary)',
            color: 'var(--text-white)',
            fontSize: '14px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          일정 탭에서 전체 일정 확인하기
        </button>
      </div>
    );
  }

  const activeSchedule = focusResult.focus;
  const focusSchedules = focusResult.schedules;
  const activeIndex = Math.max(0, focusSchedules.findIndex((s) => s.id === activeSchedule.id));

  const isRequired = isMemberRequiredForSchedule(currentMember, activeSchedule.date, activeSchedule);
  const myVote = sheetsService
    .getRSVPVotes(activeSchedule.id)
    .find((v) => v.memberId === profile.memberId || v.memberName === profile.name);
  const myReconciled =
    sheetsService.reconcileMemberAttendance(profile.memberId, activeSchedule.id, profile.name) ||
    undefined;
  const isOnline =
    typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
      ? navigator.onLine
      : true;

  const cta = deriveTodayCta({
    schedule: activeSchedule,
    now: currentNow,
    isRequired,
    myVote,
    myReconciled,
    isOnline,
  });

  // Calculate checked-in count if on today and check-in window is open or past
  let checkedInCount: number | undefined;
  let checkedInTimeStr: string | undefined;
  if (activeSchedule.date === todayStr) {
    const windowState = getCheckInWindowState(activeSchedule, currentNow);
    if (windowState.isOpen || windowState.status === 'WINDOW_CLOSED') {
      const reconciledList = sheetsService.reconcileAttendance(activeSchedule.id);
      checkedInCount = countCheckedIn(reconciledList, allMembers);
      checkedInTimeStr = getKSTClock(getKSTTimestampString(currentNow));
    }
  }

  const handlePrevSchedule = () => {
    if (focusSchedules.length <= 1) return;
    const prevIndex = (activeIndex - 1 + focusSchedules.length) % focusSchedules.length;
    setSelectedScheduleId(focusSchedules[prevIndex].id);
  };

  const handleNextSchedule = () => {
    if (focusSchedules.length <= 1) return;
    const nextIndex = (activeIndex + 1) % focusSchedules.length;
    setSelectedScheduleId(focusSchedules[nextIndex].id);
  };

  return (
    <div className="today-tab-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Today Finished Attendance Result (when viewing NEXT schedule) */}
      {todayAttendedSummary && (
        <div
          className="today-completed-banner"
          style={{
            background: 'var(--status-success-light)',
            border: '1px solid rgba(5, 150, 105, 0.2)',
            borderRadius: 'var(--radius-lg)',
            padding: '12px 16px',
            fontSize: '13px',
            color: 'var(--status-success)',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span className="status-indicator-dot checked" />
          <span>
            오늘 출석 완료 {todayAttendedSummary.time ? `${todayAttendedSummary.time}` : ''}
            <span style={{ opacity: 0.85, marginLeft: '6px' }}>({todayAttendedSummary.scheduleTitle})</span>
          </span>
        </div>
      )}

      <HomeActiveScheduleCard
        schedule={activeSchedule}
        schedulesCount={focusSchedules.length}
        scheduleIndex={activeIndex}
        todayStr={todayStr}
        isToday={activeSchedule.date === todayStr}
        dDay={focusResult.dDay}
        isRequired={isRequired}
        cta={cta}
        checkedInCount={checkedInCount}
        checkedInTimeStr={checkedInTimeStr}
        onPrevSchedule={handlePrevSchedule}
        onNextSchedule={handleNextSchedule}
        onOpenQRScanner={onOpenQRScanner}
        onOpenRSVP={onOpenRSVP}
        onOpenDetail={onOpenDetail}
      />
    </div>
  );
};
