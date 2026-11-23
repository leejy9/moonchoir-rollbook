import React, { useMemo, useState } from 'react';
import { sheetsService } from '../services/sheets';
import type { BoundDeviceProfile, Member, Schedule } from '../types/rollbook';
import type { DisplayMode } from '../services/displayMode';
import { getKSTDateString } from '../utils/date';
import { buildMemberScheduleRecords } from '../utils/memberRecords';
import { isStaffMember, isActivityStaff } from '../utils/staff';
import {
  computeAttendance90Days,
  computeDaysTogether,
  computeMemberLevel,
  computePerformanceCount,
  computePracticeHours,
  formatStaffTenure,
} from '../utils/memberProgress';
import { ProfileSettingsSection } from './profile/ProfileSettingsSection';
import { ProfileHeroCards } from './profile/ProfileHeroCards';
import { LevelLineageSheet } from './profile/LevelLineageSheet';
import { AttendanceRecordSheet } from './profile/AttendanceRecordSheet';
import '../styles/v3/profile.css';

export interface ProfileTabProps {
  profile: BoundDeviceProfile;
  displayMode: DisplayMode;
  isDarkMode: boolean;
  onChangeDisplayMode: (mode: DisplayMode) => void;
  onChangeDarkMode: (enabled: boolean) => void;
  onChangeBinding: () => void;
  onLogout?: () => Promise<void>;
  onRefreshData?: () => void;
  onOpenRSVP?: (schedule: Schedule) => void;
  onOpenQRScanner?: (schedule: Schedule) => void;
  onOpenAdmin?: () => void;
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
  onRefreshData,
  onOpenAdmin,
  refreshTrigger,
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [activeSheet, setActiveSheet] = useState<'NONE' | 'LEVEL' | 'ATTENDANCE' | 'TEMP' | 'STICKERS'>('NONE');

  const todayStr = useMemo(() => getKSTDateString(), []);

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
    const found = members.find((m) => m.id === profile.memberId);
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

  // Staff check (Spec §5-7, V26)
  const isStaff = useMemo(() => {
    return isActivityStaff(currentMember, config, members);
  }, [currentMember, config, members]);

  // Admin menu permission check
  const hasAdminMenuAccess = useMemo(() => {
    return isStaffMember(currentMember, members);
  }, [currentMember, members]);

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
    const categories = config.performanceCategories || ['연주', '녹음'];
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

  const handleSyncRemote = async () => {
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      await sheetsService.fetchRemoteData();
      if (onRefreshData) onRefreshData();
      setSyncFeedback({ type: 'success', text: '구글 시트 최신 데이터와 동기화되었습니다.' });
      setTimeout(() => setSyncFeedback(null), 3000);
    } catch (err: unknown) {
      setSyncFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : '동기화 중 오류가 발생했습니다.',
      });
    } finally {
      setIsSyncing(false);
    }
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
          {/* Staff Title Card */}
          <section className="profile-staff-card">
            <div className="profile-staff-title">{`${memberName} 선생님`}</div>
            <div className="profile-staff-tenure">{formatStaffTenure(daysTogether)}</div>
          </section>

          {/* Staff Attendance Record Action Row */}
          <button
            type="button"
            className="profile-staff-records-btn"
            onClick={() => setActiveSheet('ATTENDANCE')}
          >
            <span>출석 기록</span>
            <span style={{ fontSize: '18px', color: 'var(--text-sub)' }}>›</span>
          </button>
        </>
      ) : (
        /* Member Hero 2-Card Row */
        <ProfileHeroCards
          levelInfo={levelInfo}
          attendanceRate={attendance90Days.attendanceRate}
          onOpenLevel={() => setActiveSheet('LEVEL')}
          onOpenAttendance={() => setActiveSheet('ATTENDANCE')}
        />
      )}

      {/* 3. Three White Number Cards */}
      <section className="profile-numbers-row">
        <div className="profile-number-card">
          <svg className="profile-number-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <div className="profile-number-value">{daysTogether}일</div>
          <div className="profile-number-label">함께한 날</div>
        </div>

        <div className="profile-number-card">
          <svg className="profile-number-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <div className="profile-number-value">{practiceHours}시간</div>
          <div className="profile-number-label">연습</div>
        </div>

        <div className="profile-number-card">
          <svg className="profile-number-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
          <div className="profile-number-value">{performanceCount}번</div>
          <div className="profile-number-label">공연</div>
        </div>
      </section>

      {/* 4. Passion Temperature Card (Staff Excludes This) */}
      {!isStaff && (
        <section className="profile-temp-card" onClick={() => setActiveSheet('TEMP')} role="button" tabIndex={0}>
          <div className="profile-temp-top">
            <div className="profile-temp-left">
              <div className="profile-temp-icon-circle">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2c1.1 0 2 .9 2 2 0 1.5-1 3.5-2 5-1-1.5-2-3.5-2-5 0-1.1.9-2 2-2zm6 9c0 3.3-2.7 6-6 6s-6-2.7-6-6c0-2.4 1.4-4.5 3.5-5.5-.3 1.2 0 2.5 1 3.2 1.2.9 2.8.9 4 0 1-.7 1.3-2 1-3.2 2.1 1 3.5 3.1 3.5 5.5z" />
                </svg>
              </div>
              <div className="profile-temp-info">
                <span className="profile-temp-title">열정 온도</span>
                <span className="profile-temp-value">36.5°C</span>
              </div>
            </div>
          </div>

          <div className="profile-temp-bar-wrap">
            <div className="profile-temp-bar" />
            <div className="profile-temp-tick" style={{ left: '31.25%' }} />
            <div className="profile-temp-indicator" style={{ left: '31.25%' }} />
          </div>
        </section>
      )}

      {/* 5. Praise Stickers Preview Card */}
      <section className="profile-stickers-card">
        <button
          type="button"
          className="profile-stickers-header"
          onClick={() => setActiveSheet('STICKERS')}
        >
          <div className="profile-stickers-title-group">
            <span className="profile-stickers-title">칭찬 스티커</span>
          </div>
          <div className="profile-stickers-count">
            <span>{`0 / ${isStaff ? 8 : 24}`}</span>
            <span style={{ fontSize: '16px' }}>›</span>
          </div>
        </button>

        <div className="profile-stickers-grid">
          <div className="profile-sticker-slot">
            <span className="profile-sticker-empty-text">미획득</span>
          </div>
          <div className="profile-sticker-slot">
            <span className="profile-sticker-empty-text">미획득</span>
          </div>
          <div className="profile-sticker-slot">
            <span className="profile-sticker-empty-text">미획득</span>
          </div>
          <div className="profile-sticker-slot">
            <span className="profile-sticker-empty-text">미획득</span>
          </div>
        </div>
      </section>

      {/* 6. Settings & Admin Section */}
      <ProfileSettingsSection
        hasAdminMenuAccess={hasAdminMenuAccess}
        onOpenAdmin={onOpenAdmin}
        displayMode={displayMode}
        onChangeDisplayMode={onChangeDisplayMode}
        isDarkMode={isDarkMode}
        onChangeDarkMode={onChangeDarkMode}
        isSyncing={isSyncing}
        syncFeedback={syncFeedback}
        onSyncRemote={handleSyncRemote}
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
          onClose={() => setActiveSheet('NONE')}
        />
      )}

      {(activeSheet === 'TEMP' || activeSheet === 'STICKERS') && (
        <div
          className="profile-sheet-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setActiveSheet('NONE')}
        >
          <div className="profile-sheet-content">
            <div className="profile-sheet-header">
              <h2 className="profile-sheet-title">
                {activeSheet === 'TEMP' ? '열정 온도 내역' : '칭찬 스티커 보드'}
              </h2>
              <button
                type="button"
                className="profile-sheet-close-btn"
                onClick={() => setActiveSheet('NONE')}
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-sub)', fontSize: '14px' }}>
              아직 기록이 없어요
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
