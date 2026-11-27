import React, { useEffect, useMemo, useState } from 'react';
import { seenStateStore, useSeenState } from '../services/seenStateStore';
import { useBlockingOverlay } from '../hooks/useBlockingOverlay';
import { pickUnseenStickers } from '../utils/seenState';
import type { BoundDeviceProfile, Schedule } from '../types/rollbook';
import type { DisplayMode, ThemeMode } from '../services/displayMode';
import { getKSTDateString, parseKSTDate } from '../utils/date';
import { DEFAULT_PERFORMANCE_CATEGORIES } from '../utils/performanceCategories';
import {
  computeAttendance90Days, computeDaysTogether, computeMemberLevel,
  computePerformanceCount, computePracticeHours, formatStaffTenure,
} from '../utils/memberProgress';
import { computePassionTemperature } from '../utils/passionTemperature';
import { useMemberActivityModel, type MemberActivityModel } from './profile/useMemberActivityModel';
import { ProfileSettingsSection } from './profile/ProfileSettingsSection';
import { ProfileHeroCards } from './profile/ProfileHeroCards';
import { ProfileNumbersRow } from './profile/ProfileNumbersRow';
import { ProfilePassionTempCard } from './profile/ProfilePassionTempCard';
import { ProfileStickersPreviewCard } from './profile/ProfileStickersPreviewCard';
import { LevelLineageSheet } from './profile/LevelLineageSheet';
import { AttendanceRecordSheet, type SelectedScheduleFilter } from './profile/AttendanceRecordSheet';
import { PassionTemperatureSheet } from './profile/PassionTemperatureSheet';
import { StickerBoardSheet } from './profile/StickerBoardSheet';
import '../styles/v3/profile.css';

export interface ProfileTabProps {
  profile: BoundDeviceProfile;
  displayMode: DisplayMode;
  themeMode: ThemeMode;
  onChangeDisplayMode: (mode: DisplayMode) => void;
  onChangeThemeMode: (mode: ThemeMode) => void;
  onChangeBinding: () => void;
  onLogout?: () => Promise<void>;
  onOpenRSVP?: (schedule: Schedule) => void;
  onOpenQRScanner?: (schedule: Schedule) => void;
  refreshTrigger?: number;
  model?: MemberActivityModel;
  openStickerBoardSignal?: number;
  onStickerBoardOpened?: () => void;
}

export const ProfileTab: React.FC<ProfileTabProps> = ({
  profile,
  displayMode,
  themeMode,
  onChangeDisplayMode,
  onChangeThemeMode,
  onChangeBinding,
  onLogout,
  refreshTrigger,
  model: modelProp,
  openStickerBoardSignal = 0,
  onStickerBoardOpened,
}) => {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [activeSheet, setActiveSheet] = useState<'NONE' | 'LEVEL' | 'ATTENDANCE' | 'TEMP' | 'STICKERS'>('NONE');
  useBlockingOverlay(activeSheet !== 'NONE');
  const [selectedScheduleFilter, setSelectedScheduleFilter] = useState<SelectedScheduleFilter | null>(null);

  const [prevBoardSignal, setPrevBoardSignal] = useState(0);
  if (openStickerBoardSignal > 0 && openStickerBoardSignal !== prevBoardSignal) {
    setPrevBoardSignal(openStickerBoardSignal);
    setActiveSheet('STICKERS');
  }
  useEffect(() => {
    if (openStickerBoardSignal > 0) {
      onStickerBoardOpened?.();
    }
  }, [openStickerBoardSignal, onStickerBoardOpened]);

  const fallbackModel = useMemberActivityModel(modelProp ? null : profile, refreshTrigger);
  const {
    currentMember,
    members,
    config,
    currentNow,
    schedules,
    logs: allLogs,
    rsvpVotes: allRsvpVotes,
    isStaff,
    scheduleRecords,
    activity,
    evaluatedStickers,
    isDataReady,
  } = modelProp ?? fallbackModel;

  const todayStr = useMemo(() => getKSTDateString(currentNow), [currentNow]);
  const memberPart = currentMember.part || profile.part;
  const memberName = currentMember.name || profile.name;
  const lateGraceMinutes = config.lateGraceMinutes ?? 10;

  // Cumulative numbers (§5-2)
  const daysTogether = useMemo(() => {
    return computeDaysTogether(currentMember, allLogs, todayStr, members);
  }, [currentMember, allLogs, todayStr, members]);

  const practiceHours = useMemo(() => {
    return computePracticeHours(scheduleRecords);
  }, [scheduleRecords]);

  const performanceCount = useMemo(() => {
    const categories = config.performanceCategories || DEFAULT_PERFORMANCE_CATEGORIES;
    return computePerformanceCount(scheduleRecords, categories);
  }, [scheduleRecords, config.performanceCategories]);

  // 90-day attendance rate for donut ring (Staff excludes this)
  const attendance90Days = useMemo(() => {
    if (isStaff) return { attendanceRate: null, totalSessions: 0 };
    return computeAttendance90Days({
      member: currentMember,
      schedules,
      logs: allLogs,
      rsvpVotes: allRsvpVotes,
      lateGraceMinutes,
      allMembers: members,
      todayStr,
      now: currentNow,
    });
  }, [
    isStaff,
    currentMember,
    schedules,
    allLogs,
    allRsvpVotes,
    lateGraceMinutes,
    members,
    todayStr,
    currentNow,
  ]);

  // Cumulative attendance for Level (Staff excludes this)
  const cumulativeAttendance = useMemo(() => {
    if (isStaff) return 0;
    let count = 0;
    for (const r of scheduleRecords) {
      if (r.finalStatus === '출석' || r.finalStatus === '수동인정' || r.finalStatus === '지각') {
        count += 1;
      }
    }
    return count;
  }, [isStaff, scheduleRecords]);

  const levelInfo = useMemo(() => {
    return computeMemberLevel(cumulativeAttendance, memberPart);
  }, [cumulativeAttendance, memberPart]);

  // Passion Temperature (§5-5, Staff excludes this)
  const passionResult = useMemo(() => {
    if (isStaff) return null;
    return computePassionTemperature(
      currentMember,
      members,
      schedules,
      allLogs,
      activity?.rsvpEvents || [],
      config,
      todayStr ? parseKSTDate(todayStr) : undefined,
      { scheduleRecords, includeWeeklyDelta: true }
    );
  }, [isStaff, currentMember, members, schedules, allLogs, activity, config, todayStr, scheduleRecords]);

  const earnedStickerIds = useMemo(
    () => evaluatedStickers.filter((s) => s.earned).map((s) => s.id),
    [evaluatedStickers]
  );

  const seenState = useSeenState();
  const unseenIds = useMemo(
    () =>
      isDataReady
        ? new Set(pickUnseenStickers(evaluatedStickers, seenState.seen).map((s) => s.id))
        : new Set<string>(),
    [evaluatedStickers, seenState.seen, isDataReady]
  );
  const unseenCount = unseenIds.size;
  const markAllSeen = () => {
    const missing = earnedStickerIds.filter((id) => !seenState.seen?.stickers.has(id));
    if (missing.length === 0) return;
    void seenStateStore.markSeen(
      currentMember.id,
      missing.map((id) => ({ kind: 'sticker' as const, scope: id }))
    );
  };

  const handleLogoutAction = async () => {
    if (!onLogout || isLoggingOut) return;
    if (!window.confirm('정말 이 브라우저에서 로그아웃하시겠습니까?')) return;
    setIsLoggingOut(true);
    try {
      await onLogout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="profile-tab">
      {/* 1. Profile Top Line */}
      <section className="profile-header">
        <div className="profile-avatar">
          {memberName.trim().slice(0, 1) || '문'}
        </div>
        <div className="profile-info">
          <div className="profile-name">{memberName}</div>
          <div className="profile-sub">
            {memberPart || '단원'}
            {daysTogether > 0 ? ` · ${daysTogether}일째` : ''}
          </div>
        </div>
      </section>

      {/* 2. Staff View vs Member View */}
      {isStaff ? (
        <>
          <section className="profile-staff-card">
            <div className="profile-staff-title">{`${memberName} 선생님`}</div>
            <div className="profile-staff-tenure">{formatStaffTenure(daysTogether)}</div>
          </section>

          <button
            type="button"
            className="profile-staff-records-btn"
            onClick={() => {
              setSelectedScheduleFilter(null);
              setActiveSheet('ATTENDANCE');
            }}
          >
            <span>출석 기록</span>
            <span style={{ fontSize: '18px', color: 'var(--text-sub)' }}>›</span>
          </button>
        </>
      ) : (
        <ProfileHeroCards
          levelInfo={levelInfo}
          attendanceRate={attendance90Days.attendanceRate}
          onOpenLevel={() => setActiveSheet('LEVEL')}
          onOpenAttendance={() => {
            setSelectedScheduleFilter(null);
            setActiveSheet('ATTENDANCE');
          }}
        />
      )}

      {/* 3. Three White Number Cards */}
      <ProfileNumbersRow
        daysTogether={daysTogether}
        practiceHours={practiceHours}
        performanceCount={performanceCount}
      />

      {/* 4. Passion Temperature Card (Staff Excludes This) */}
      {!isStaff && passionResult && (
        <ProfilePassionTempCard
          result={passionResult}
          onOpen={() => setActiveSheet('TEMP')}
        />
      )}

      {/* 5. Praise Stickers Preview Card */}
      <ProfileStickersPreviewCard
        stickers={evaluatedStickers}
        isStaff={isStaff}
        unseenCount={unseenCount}
        onOpen={(trigger) => {
          trigger.focus();
          setActiveSheet('STICKERS');
        }}
      />

      {/* 6. Settings & Admin Section */}
      <ProfileSettingsSection
        displayMode={displayMode}
        onChangeDisplayMode={onChangeDisplayMode}
        themeMode={themeMode}
        onChangeThemeMode={onChangeThemeMode}
        onChangeBinding={onChangeBinding}
        onLogout={onLogout ? handleLogoutAction : undefined}
        isLoggingOut={isLoggingOut}
      />

      {/* Sheets / Modals */}
      {activeSheet === 'LEVEL' && (
        <LevelLineageSheet
          levelInfo={levelInfo}
          part={memberPart}
          onClose={() => setActiveSheet('NONE')}
        />
      )}

      {activeSheet === 'ATTENDANCE' && (
        <AttendanceRecordSheet
          records={scheduleRecords}
          selectedScheduleFilter={selectedScheduleFilter}
          onClose={() => {
            setSelectedScheduleFilter(null);
            setActiveSheet('NONE');
          }}
        />
      )}

      {activeSheet === 'TEMP' && passionResult && (
        <PassionTemperatureSheet
          result={passionResult}
          onClose={() => setActiveSheet('NONE')}
          onSelectScheduleFilter={(itemLabel, scheduleIds) => {
            setSelectedScheduleFilter({ itemLabel, scheduleIds });
            setActiveSheet('ATTENDANCE');
          }}
        />
      )}

      {activeSheet === 'STICKERS' && (
        <StickerBoardSheet
          stickers={evaluatedStickers}
          isStaff={isStaff}
          unseenStickerIds={unseenIds}
          onClose={() => {
            markAllSeen();
            setActiveSheet('NONE');
          }}
        />
      )}
    </div>
  );
};
