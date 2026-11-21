import React, { useMemo, useState } from 'react';
import { sheetsService } from '../services/sheets';
import type { BoundDeviceProfile, Member, Schedule } from '../types/rollbook';
import type { DisplayMode } from '../services/displayMode';
import { calculateCumulativeAttendanceWithLifecycle } from '../utils/attendanceStats';
import { formatShortDate, getKSTDateString } from '../utils/date';
import { buildMemberScheduleRecords } from '../utils/memberRecords';
import { isStaffMember } from '../utils/staff';
import { InstallAppCard } from './InstallAppCard';

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
  onOpenRSVP,
  onOpenQRScanner,
  onOpenAdmin,
  refreshTrigger,
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const todayStr = useMemo(() => getKSTDateString(), []);

  // Reactive data sources
  const members = useMemo(() => {
    void refreshTrigger;
    return sheetsService.getMembers(true, true);
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

  const lateGraceMinutes = sheetsService.getConfig().lateGraceMinutes ?? 10;

  // Cumulative attendance summary
  const memberSummary = useMemo(() => {
    const summaries = calculateCumulativeAttendanceWithLifecycle(
      [currentMember],
      schedules,
      allLogs,
      todayStr,
      allRsvpVotes,
      lateGraceMinutes,
      members
    );
    return (
      summaries[0] || {
        attendanceRate: 100,
        totalSessions: 0,
        attended: 0,
        late: 0,
        excused: 0,
        absent: 0,
        badges: [],
        guestAttended: 0,
      }
    );
  }, [currentMember, schedules, allLogs, todayStr, allRsvpVotes, lateGraceMinutes, members]);

  // Per-session records assembly (include archived schedules so past semesters remain visible in records)
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

  // Staff check (pure function, zero hardcoding)
  const isStaff = useMemo(() => {
    return isStaffMember(currentMember, members);
  }, [currentMember, members]);

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
    setIsLoggingOut(true);
    setSyncFeedback(null);
    try {
      await onLogout();
    } catch (err: unknown) {
      setSyncFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : '이 브라우저에서 로그아웃하지 못했습니다.',
      });
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div
      className="profile-tab"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        padding: '16px',
        maxWidth: '720px',
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box',
        paddingBottom: 'calc(var(--bottom-nav-h, 60px) + 24px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      {/* 1. Member Profile & Status Header */}
      <section
        style={{
          border: '1px solid var(--border-subtle)',
          borderRadius: '12px',
          padding: '16px',
          backgroundColor: 'var(--bg-card)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--text-main)' }}>
              {memberName}
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px' }}>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '4px',
                  backgroundColor: 'var(--brand-primary-light)',
                  color: 'var(--brand-primary)',
                }}
              >
                {memberPart}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {currentMember.memberStatus || '정단원'}
              </span>
            </div>
            {profile.phoneLast4 && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                전화번호 뒷자리: {profile.phoneLast4}
                <span style={{ marginLeft: '6px', fontSize: '11px', color: 'var(--text-muted, #94a3b8)' }}>
                  (연락처 수정은 운영진에게 요청해 주세요)
                </span>
              </div>
            )}
          </div>

          {/* Staff Mode Access Button (Visible only to staff) */}
          {isStaff && onOpenAdmin && (
            <button
              type="button"
              onClick={onOpenAdmin}
              title="운영진 관리자 모드 진입"
              style={{
                minHeight: '44px',
                minWidth: '44px',
                padding: '8px 16px',
                backgroundColor: 'var(--brand-primary)',
                color: 'var(--text-white, #ffffff)',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              운영진 모드
            </button>
          )}
        </div>

        {/* 2. Cumulative Attendance Summary */}
        <div
          style={{
            borderTop: '1px solid var(--border-subtle)',
            paddingTop: '12px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '8px',
          }}
        >
          <div style={{ padding: '8px', background: 'var(--bg-subtle)', borderRadius: '6px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>이번 시즌 출석</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--text-main)' }}>
              {memberSummary.attended}회
            </div>
          </div>
          <div style={{ padding: '8px', background: 'var(--bg-subtle)', borderRadius: '6px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>누적 출석률</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--brand-primary)' }}>
              {memberSummary.attendanceRate}%
            </div>
          </div>
          <div style={{ padding: '8px', background: 'var(--bg-subtle)', borderRadius: '6px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>진행 회차</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)' }}>
              총 {memberSummary.totalSessions}회
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)' }}>
              지각 {memberSummary.late} / 사유 {memberSummary.excused} / 결석 {memberSummary.absent}
            </div>
          </div>
        </div>
      </section>

      {/* Sync Feedback Message */}
      {syncFeedback && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            backgroundColor: syncFeedback.type === 'success' ? 'var(--status-success-light, #ecfdf5)' : 'var(--status-danger-light, #fff1f2)',
            color: syncFeedback.type === 'success' ? 'var(--status-success, #065f46)' : 'var(--status-danger, #9f1239)',
            border: `1px solid ${syncFeedback.type === 'success' ? 'var(--status-success, #a7f3d0)' : 'var(--status-danger, #fecdd3)'}`,
          }}
        >
          {syncFeedback.text}
        </div>
      )}

      {/* 3. Section: 회차별 출결 기록 */}
      <section
        style={{
          border: '1px solid var(--border-subtle)',
          borderRadius: '12px',
          overflow: 'hidden',
          backgroundColor: 'var(--bg-card)',
        }}
      >
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-main)' }}>
            회차별 출결 기록
          </h3>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            총 {scheduleRecords.length}개 일정
          </span>
        </div>

        {/* Column Headers */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(120px, 1.8fr) 70px 85px 85px',
            background: 'var(--bg-subtle)',
            padding: '10px 12px',
            fontSize: '12px',
            fontWeight: 700,
            color: 'var(--text-muted)',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <span>연습명칭</span>
          <span>연습일</span>
          <span style={{ textAlign: 'center' }}>투표 상태</span>
          <span style={{ textAlign: 'right' }}>출결 시간</span>
        </div>

        {/* Rows */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {scheduleRecords.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted, #94a3b8)', fontSize: '13px' }}>
              등록된 연습 일정이 없습니다.
            </div>
          ) : (
            scheduleRecords.map((r) => (
              <div
                key={r.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(120px, 1.8fr) 70px 85px 85px',
                  alignItems: 'center',
                  padding: '10px 12px',
                  borderBottom: '1px solid var(--border-subtle)',
                  fontSize: '13px',
                }}
              >
                {/* 1. 연습명칭 */}
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{r.title}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {r.category}
                  </div>
                </div>

                {/* 2. 연습일 */}
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {formatShortDate(r.date)}
                </div>

                {/* 3. 투표 상태 */}
                <div style={{ textAlign: 'center' }}>
                  <button
                    type="button"
                    disabled={r.isPast || !onOpenRSVP}
                    onClick={() => onOpenRSVP && onOpenRSVP(r.schedule)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      padding: '4px',
                      cursor: !r.isPast && onOpenRSVP ? 'pointer' : 'default',
                      display: 'inline-block',
                      minHeight: '44px',
                      minWidth: '44px',
                    }}
                    title={!r.isPast && onOpenRSVP ? '클릭하여 참석/불참 투표 변경' : undefined}
                  >
                    {r.voteStatus === 'ATTEND' ? (
                      <span
                        style={{
                          background: 'var(--status-success-light, #dcfce7)',
                          color: 'var(--status-success, #15803d)',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontWeight: 700,
                          fontSize: '11.5px',
                        }}
                      >
                        참석
                      </span>
                    ) : r.voteStatus === 'ABSENT' ? (
                      <span
                        style={{
                          background: 'var(--status-warning-light, #ffedd5)',
                          color: 'var(--status-warning, #c2410c)',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontWeight: 700,
                          fontSize: '11.5px',
                        }}
                        title={r.voteReason ? `사유: ${r.voteReason}` : undefined}
                      >
                        불참
                      </span>
                    ) : r.voteStatus === 'LATE' ? (
                      <span
                        style={{
                          background: 'var(--status-warning-light, #fef3c7)',
                          color: 'var(--status-warning, #b45309)',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontWeight: 700,
                          fontSize: '11.5px',
                        }}
                      >
                        지각
                      </span>
                    ) : (
                      <span
                        style={{
                          background: !r.isPast ? 'var(--status-info-light, #e0e7ff)' : 'var(--bg-subtle, #f1f5f9)',
                          color: !r.isPast ? 'var(--status-info, #4338ca)' : 'var(--text-muted, #94a3b8)',
                          padding: '3px 7px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: !r.isPast ? 700 : 400,
                        }}
                      >
                        {!r.isPast ? '투표하기' : '미투표'}
                      </span>
                    )}
                  </button>
                  {r.voteTimestamp && (
                    <span
                      style={{
                        fontSize: '10px',
                        color: 'var(--text-muted, #64748b)',
                        marginTop: '2px',
                        display: 'block',
                        whiteSpace: 'nowrap',
                      }}
                      title={`투표 일시: ${r.voteTimestamp}`}
                    >
                      {r.voteTimestamp.slice(5, 16)}
                    </span>
                  )}
                </div>

                {/* 4. 출결 시간 */}
                <div style={{ textAlign: 'right' }}>
                  {r.isAttended ? (
                    <span
                      style={{
                        color: 'var(--status-success, #16a34a)',
                        fontWeight: 700,
                        fontSize: '12px',
                        fontFamily: 'monospace',
                      }}
                    >
                      {r.checkInTime}
                    </span>
                  ) : r.isToday && onOpenQRScanner ? (
                    <button
                      type="button"
                      onClick={() => onOpenQRScanner(r.schedule)}
                      style={{
                        background: 'var(--brand-primary)',
                        color: 'var(--text-white, #ffffff)',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '6px 10px',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        minHeight: '44px',
                        minWidth: '44px',
                      }}
                    >
                      QR 출석
                    </button>
                  ) : r.isExempt ? (
                    <span style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '11px' }}>미참</span>
                  ) : r.isPast ? (
                    <span style={{ color: 'var(--status-danger, #dc2626)', fontWeight: 600, fontSize: '11.5px' }}>결석 (-)</span>
                  ) : (
                    <span style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '11.5px' }}>대기</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* 4. Section: 환경 설정 및 계정 관리 */}
      <section
        style={{
          border: '1px solid var(--border-subtle)',
          borderRadius: '12px',
          padding: '16px',
          backgroundColor: 'var(--bg-card)',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-main)' }}>
          화면 설정 및 데이터 관리
        </h3>

        {/* Display Mode Selection */}
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
            화면 표시 모드
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['AUTO', 'DESKTOP', 'MOBILE'] as DisplayMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onChangeDisplayMode(mode)}
                style={{
                  flex: 1,
                  minHeight: '44px',
                  minWidth: '44px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${displayMode === mode ? 'var(--brand-primary)' : 'var(--border-subtle)'}`,
                  backgroundColor: displayMode === mode ? 'var(--brand-primary-light, #e0e7ff)' : 'var(--bg-card, #ffffff)',
                  color: displayMode === mode ? 'var(--brand-primary, #0047ff)' : 'var(--text-sub, #334155)',
                  fontWeight: displayMode === mode ? 700 : 500,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                {mode === 'AUTO' ? '자동' : mode === 'DESKTOP' ? '데스크톱' : '모바일'}
              </button>
            ))}
          </div>
        </div>

        {/* Dark Mode Toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '13px', fontWeight: 600 }}>다크 모드</span>
          <button
            type="button"
            onClick={() => onChangeDarkMode(!isDarkMode)}
            style={{
              minHeight: '44px',
              minWidth: '44px',
              padding: '8px 16px',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle)',
              backgroundColor: isDarkMode ? 'var(--bg-subtle, #1e293b)' : 'var(--bg-card, #f8fafc)',
              color: isDarkMode ? 'var(--text-white, #ffffff)' : 'var(--text-main, #1e293b)',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            {isDarkMode ? '켜짐' : '꺼짐'}
          </button>
        </div>

        {/* Google Sheets Sync Button */}
        <div style={{ paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
          <button
            type="button"
            onClick={() => void handleSyncRemote()}
            disabled={isSyncing}
            style={{
              width: '100%',
              minHeight: '44px',
              padding: '10px 16px',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--bg-card, #f8fafc)',
              color: 'var(--text-main)',
              fontWeight: 600,
              fontSize: '13px',
              cursor: isSyncing ? 'not-allowed' : 'pointer',
            }}
          >
            {isSyncing ? '구글 시트 동기화 중...' : '구글 시트 최신 데이터와 동기화'}
          </button>
        </div>

        {/* Install PWA App Card */}
        <div style={{ paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
          <InstallAppCard />
        </div>

        {/* Switch Bound Member & Logout */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            paddingTop: '8px',
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          <button
            type="button"
            onClick={onChangeBinding}
            style={{
              width: '100%',
              minHeight: '44px',
              padding: '10px 16px',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--bg-card, #ffffff)',
              color: 'var(--text-main, #334155)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            이 브라우저에 저장된 단원 바꾸기
          </button>

          {onLogout && (
            <button
              type="button"
              onClick={() => void handleLogoutAction()}
              disabled={isLoggingOut}
              style={{
                width: '100%',
                minHeight: '44px',
                padding: '10px 16px',
                borderRadius: '6px',
                border: '1px solid var(--status-danger-light, #fecdd3)',
                backgroundColor: 'var(--status-danger-light, #fff1f2)',
                color: 'var(--status-danger, #b91c1c)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: isLoggingOut ? 'not-allowed' : 'pointer',
              }}
            >
              {isLoggingOut ? '로그아웃 처리 중...' : '이 브라우저에서 로그아웃'}
            </button>
          )}
        </div>
      </section>
    </div>
  );
};
