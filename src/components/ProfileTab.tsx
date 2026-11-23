import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { sheetsService } from '../services/sheets';
import type { BoundDeviceProfile, Member, MemberActivity, Schedule } from '../types/rollbook';
import type { DisplayMode } from '../services/displayMode';
import { getKSTDateString, parseKSTDate } from '../utils/date';
import { buildMemberScheduleRecords } from '../utils/memberRecords';
import { resolveMemberIdentity } from '../utils/memberIdentity';
import { isActivityStaff } from '../utils/staff';
import { DEFAULT_PERFORMANCE_CATEGORIES } from '../utils/performanceCategories';
import {
  computeAttendance90Days, computeDaysTogether, computeMemberLevel,
  computePerformanceCount, computePracticeHours, formatStaffTenure,
} from '../utils/memberProgress';
import { computePassionTemperature } from '../utils/passionTemperature';
import { evaluatePraiseStickers } from '../utils/praiseStickers';
import { isStickerDataReady, useSeenStickers } from './profile/useSeenStickers';
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
  isDarkMode: boolean;
  onChangeDisplayMode: (mode: DisplayMode) => void;
  onChangeDarkMode: (enabled: boolean) => void;
  onChangeBinding: () => void;
  onLogout?: () => Promise<void>;
  onOpenRSVP?: (schedule: Schedule) => void;
  onOpenQRScanner?: (schedule: Schedule) => void;
  refreshTrigger?: number;
}

export const ProfileTab: React.FC<ProfileTabProps> = ({
  profile,
  displayMode,
  isDarkMode,
  onChangeDisplayMode,
  onChangeDarkMode,
  onChangeBinding,
  onLogout,
  refreshTrigger,
}) => {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [activeSheet, setActiveSheet] = useState<'NONE' | 'LEVEL' | 'ATTENDANCE' | 'TEMP' | 'STICKERS'>('NONE');
  const [selectedScheduleFilter, setSelectedScheduleFilter] = useState<SelectedScheduleFilter | null>(null);

  const [activity, setActivity] = useState<MemberActivity | null>(null);

  const todayStr = useMemo(() => getKSTDateString(), []);
  const syncState = useSyncExternalStore(
    (listener) => sheetsService.subscribeSync(listener),
    () => sheetsService.getSyncState(),
    () => sheetsService.getSyncState()
  );

  // Reactive data sources
  const members = useMemo(() => {
    void refreshTrigger;
    return sheetsService.getMembers(true, true);
  }, [refreshTrigger]);

  const config = useMemo(() => {
    void refreshTrigger;
    return sheetsService.getConfig();
  }, [refreshTrigger]);

  const currentMember = useMemo((): Member => {
    const canonicalId = resolveMemberIdentity(profile.memberId, members).canonicalId;
    const found = members.find((m) => m.id === canonicalId);
    if (found) return found;
    return {
      id: profile.memberId,
      name: profile.name,
      part: profile.part,
      phoneLast4: profile.phoneLast4,
      role: 'MEMBER',
      status: 'ACTIVE',
      createdAt: '',
      joinedAt: '',
      memberStatus: '정단원',
    };
  }, [members, profile]);

  const memberPart = currentMember.part || profile.part;
  const memberName = currentMember.name || profile.name;
  const activityAliasIds = useMemo(
    () => resolveMemberIdentity(currentMember.id, members).aliasIds,
    [currentMember.id, members]
  );
  const activityAliasIdsKey = activityAliasIds.join(',');

  // Fetch member activity (listen sessions, rsvp events) on mount & refresh
  useEffect(() => {
    let isMounted = true;
    sheetsService
      .getMemberActivity(activityAliasIds)
      .then((act) => {
        if (isMounted) setActivity(act);
      })
      .catch((err) => {
        console.warn('[ProfileTab] Failed to fetch member activity:', err);
      });
    return () => {
      isMounted = false;
    };
  }, [activityAliasIds, activityAliasIdsKey, refreshTrigger]);

  const schedules = useMemo(() => {
    void refreshTrigger;
    return sheetsService.getSchedulesForMember(profile.memberId);
  }, [profile.memberId, refreshTrigger]);

  const allLogs = useMemo(() => {
    void refreshTrigger;
    return sheetsService.getLogs();
  }, [refreshTrigger]);

  const allRsvpVotes = useMemo(() => {
    void refreshTrigger;
    return sheetsService.getRSVPVotes();
  }, [refreshTrigger]);

  const lateGraceMinutes = config.lateGraceMinutes ?? 10;
  const isStaff = useMemo(
    () => isActivityStaff(currentMember, config, members),
    [currentMember, config, members]
  );
  // Schedule records for practice hours & performance count
  const scheduleRecords = useMemo(() => {
    return buildMemberScheduleRecords({
      member: currentMember,
      members,
      schedules,
      logs: allLogs,
      rsvpVotes: allRsvpVotes,
      lateGraceMinutes,
      includeArchived: true,
    });
  }, [currentMember, members, schedules, allLogs, allRsvpVotes, lateGraceMinutes]);

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
    });
  }, [isStaff, currentMember, schedules, allLogs, allRsvpVotes, lateGraceMinutes, members, todayStr]);

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

  // Praise Stickers (§5-6, §5-7)
  const evaluatedStickers = useMemo(() => {
    return evaluatePraiseStickers({
      member: currentMember,
      schedules,
      logs: allLogs,
      activity,
      performanceCategories: config.performanceCategories,
      allMembers: members,
      isStaff,
      scheduleRecords,
    });
  }, [currentMember, schedules, allLogs, activity, config.performanceCategories, members, isStaff, scheduleRecords]);

  const earnedStickerIds = useMemo(
    () => evaluatedStickers.filter((s) => s.earned).map((s) => s.id),
    [evaluatedStickers]
  );

  const isDataReady = isStickerDataReady(
    Boolean(activity),
    isStaff,
    syncState.lastSyncedAt
  );
  const { unseenIds, unseenCount, markAllSeen } = useSeenStickers(earnedStickerIds, isDataReady);

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
        isDarkMode={isDarkMode}
        onChangeDarkMode={onChangeDarkMode}
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
