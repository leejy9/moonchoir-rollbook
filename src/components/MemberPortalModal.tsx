import React, { useMemo, useState } from 'react';
import { sheetsService } from '../services/sheets';
import type { BoundDeviceProfile, Member, RawAttendanceLog, RSVPVote, Schedule } from '../types/rollbook';
import { calculateCumulativeAttendanceWithLifecycle } from '../utils/attendanceStats';
import { LiquidGauge } from './LiquidGauge';

interface MemberPortalModalProps {
  profile: BoundDeviceProfile;
  onClose: () => void;
  onChangeBinding: () => void;
  onLogout?: () => void;
  onRefreshData?: () => void;
}

const getTodayDateString = () => new Date().toISOString().slice(0, 10);

export const MemberPortalModal: React.FC<MemberPortalModalProps> = ({
  profile,
  onClose,
  onChangeBinding,
  onLogout,
  onRefreshData,
}) => {
  const [activeTab, setActiveTab] = useState<'LOGS' | 'VOTES' | 'TIMELINE'>('LOGS');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [todayStr] = useState(getTodayDateString);

  // 1. 단원 프로필 조회
  const members = sheetsService.getMembers();
  const currentMember: Member = useMemo(() => {
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

  const schedules = sheetsService.getSchedules();
  const allLogs = sheetsService.getLogs();
  const allVotes = sheetsService.getRSVPVotes();

  // 2. 단원 생애주기 & 입단일 반영 누적 통계 산출
  const memberSummary = useMemo(() => {
    const summaries = calculateCumulativeAttendanceWithLifecycle([currentMember], schedules, allLogs);
    return summaries[0] || {
      attendanceRate: 100,
      totalSessions: 0,
      attended: 0,
      late: 0,
      excused: 0,
      absent: 0,
      badges: [],
      guestAttended: 0,
    };
  }, [currentMember, schedules, allLogs]);

  // 3. 내 원천 출석 로그 (최신순)
  const myLogs: (RawAttendanceLog & { scheduleTitle?: string; scheduleDate?: string })[] = useMemo(() => {
    const scheduleMap = new Map<string, Schedule>();
    schedules.forEach((s) => scheduleMap.set(s.id, s));

    return allLogs
      .filter((l) => l.memberId === profile.memberId)
      .map((l) => {
        const sch = scheduleMap.get(l.scheduleId);
        return {
          ...l,
          scheduleTitle: sch?.title || '연습 일정',
          scheduleDate: sch?.date || l.timestamp.slice(0, 10),
        };
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [allLogs, profile.memberId, schedules]);

  // 4. 내 사전 투표 내역 (날짜순 정렬)
  const myVotes: (RSVPVote & { scheduleTitle?: string; scheduleDate?: string; isUpcoming?: boolean })[] = useMemo(() => {
    const scheduleMap = new Map<string, Schedule>();
    schedules.forEach((s) => scheduleMap.set(s.id, s));

    return allVotes
      .filter((v) => v.memberId === profile.memberId)
      .map((v) => {
        const sch = scheduleMap.get(v.scheduleId);
        const date = sch?.date || '';
        return {
          ...v,
          scheduleTitle: sch?.title || '연습 일정',
          scheduleDate: date,
          isUpcoming: Boolean(date && date >= todayStr),
        };
      })
      .sort((a, b) => (b.scheduleDate || '').localeCompare(a.scheduleDate || ''));
  }, [allVotes, profile.memberId, schedules, todayStr]);

  // 5. 시트 동기화 핸들러
  const handleSyncRemote = async () => {
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      await sheetsService.fetchRemoteData();
      if (onRefreshData) onRefreshData();
      setSyncFeedback('✅ 구글 시트 최신 데이터와 동기화되었습니다.');
      setTimeout(() => setSyncFeedback(null), 3000);
    } catch (err: unknown) {
      setSyncFeedback(err instanceof Error ? `⚠️ ${err.message}` : '⚠️ 동기화 중 오류가 발생했습니다.');
    } finally {
      setIsSyncing(false);
    }
  };

  // 포맷 헬퍼: KST 타임스탬프
  const formatTimestamp = (ts: string) => {
    if (!ts) return '-';
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return ts;
      return d.toLocaleString('ko-KR', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    } catch {
      return ts;
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-container member-portal-container"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '520px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: '#ffffff',
          borderRadius: '20px',
          overflow: 'hidden',
          boxShadow: '0 20px 40px rgba(0,0,0,0.18)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px 16px',
            background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
            color: '#ffffff',
            position: 'relative',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              color: '#ffffff',
              fontSize: '18px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="닫기"
          >
            ✕
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: '999px',
                background: '#4f46e5',
                color: '#ffffff',
              }}
            >
              {currentMember.part || profile.part}
            </span>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                padding: '3px 10px',
                borderRadius: '999px',
                background: 'rgba(255,255,255,0.2)',
                color: '#e0e7ff',
              }}
            >
              {currentMember.memberStatus || '정단원'}
            </span>
          </div>

          <h2 style={{ margin: '0 0 4px', fontSize: '1.45rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
            {profile.name} <span style={{ fontSize: '0.95rem', fontWeight: 400, opacity: 0.85 }}>단원님</span>
          </h2>
          <div style={{ fontSize: '0.8rem', color: '#c7d2fe', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {currentMember.joinedAt && <span>입단일: {currentMember.joinedAt}</span>}
            <span>인증번호: 뒷자리 {profile.phoneLast4}</span>
          </div>
        </div>

        {/* Scrollable Body */}
        <div style={{ padding: '20px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {syncFeedback && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '10px',
                fontSize: '0.85rem',
                background: syncFeedback.startsWith('✅') ? '#ecfdf5' : '#fef2f2',
                color: syncFeedback.startsWith('✅') ? '#065f46' : '#991b1b',
                border: syncFeedback.startsWith('✅') ? '1px solid #a7f3d0' : '1px solid #fecaca',
              }}
            >
              {syncFeedback}
            </div>
          )}

          {/* Quick Scorecard Card (Toss Minimalist) */}
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '16px',
              padding: '16px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, marginBottom: '2px' }}>
                누적 출석률 (실시간 투영)
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#1e293b' }}>
                  {memberSummary.attendanceRate}%
                </span>
                <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                  ({memberSummary.attended}회 출석 / {memberSummary.totalSessions}회 의무)
                </span>
              </div>

              {/* Badges row */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                {memberSummary.badges.map((b) => (
                  <span
                    key={b}
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '6px',
                      background: b.includes('개근')
                        ? '#fef3c7'
                        : b.includes('우수')
                        ? '#dcfce7'
                        : b.includes('게스트')
                        ? '#ede9fe'
                        : '#fee2e2',
                      color: b.includes('개근')
                        ? '#92400e'
                        : b.includes('우수')
                        ? '#166534'
                        : b.includes('게스트')
                        ? '#5b21b6'
                        : '#991b1b',
                    }}
                  >
                    {b}
                  </span>
                ))}
              </div>
            </div>

            <div style={{ width: 56, height: 56 }}>
              <LiquidGauge percentage={memberSummary.attendanceRate} size={56} subText="출석" />
            </div>
          </div>

          {/* Tab Selector */}
          <div
            style={{
              display: 'flex',
              background: '#f1f5f9',
              padding: '4px',
              borderRadius: '12px',
              gap: '4px',
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab('LOGS')}
              style={{
                flex: 1,
                minHeight: '40px',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                background: activeTab === 'LOGS' ? '#ffffff' : 'transparent',
                color: activeTab === 'LOGS' ? '#1e293b' : '#64748b',
                boxShadow: activeTab === 'LOGS' ? '0 2px 4px rgba(0,0,0,0.06)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              🕒 출석 원천 로그 ({myLogs.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('VOTES')}
              style={{
                flex: 1,
                minHeight: '40px',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                background: activeTab === 'VOTES' ? '#ffffff' : 'transparent',
                color: activeTab === 'VOTES' ? '#1e293b' : '#64748b',
                boxShadow: activeTab === 'VOTES' ? '0 2px 4px rgba(0,0,0,0.06)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              📝 사전 투표 ({myVotes.length})
            </button>
            {currentMember.statusHistory && currentMember.statusHistory.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('TIMELINE')}
                style={{
                  flex: 1,
                  minHeight: '40px',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: activeTab === 'TIMELINE' ? '#ffffff' : 'transparent',
                  color: activeTab === 'TIMELINE' ? '#1e293b' : '#64748b',
                  boxShadow: activeTab === 'TIMELINE' ? '0 2px 4px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                📜 신분 이력 ({currentMember.statusHistory.length})
              </button>
            )}
          </div>

          {/* Tab 1: Raw Attendance Logs */}
          {activeTab === 'LOGS' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>
                💡 구글 시트 <code>출석원천로그</code>에 불변으로 영구 기록된 출석 타임스탬프입니다.
              </div>

              {myLogs.length === 0 ? (
                <div
                  style={{
                    padding: '32px 16px',
                    textAlign: 'center',
                    background: '#f8fafc',
                    borderRadius: '12px',
                    color: '#94a3b8',
                    fontSize: '0.9rem',
                  }}
                >
                  아직 출석 체크 기록이 없습니다.
                </div>
              ) : (
                myLogs.map((log) => (
                  <div
                    key={log.id}
                    style={{
                      padding: '12px 14px',
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '0.92rem', color: '#1e293b' }}>
                        {log.scheduleTitle}
                      </strong>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: log.isVerifiedLocation ? '#ecfdf5' : '#fffbeb',
                          color: log.isVerifiedLocation ? '#059669' : '#d97706',
                        }}
                      >
                        {log.isVerifiedLocation ? '📍 위치 인증' : '⚠️ GPS 미검증'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#64748b' }}>
                      <span>체크인: {formatTimestamp(log.timestamp)}</span>
                      <span>인증: {log.authMethod === 'QR_WEB_CAM' ? '📷 QR스캔' : log.authMethod === 'MANUAL_PIN' ? '🔢 PIN입력' : '👑 수동인정'}</span>
                    </div>

                    {log.distanceMeters !== undefined && (
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        연습실과의 실측 오차: {Math.round(log.distanceMeters)}m
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Tab 2: RSVP Votes */}
          {activeTab === 'VOTES' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>
                💡 구글 시트 <code>사전투표_RSVP</code>에 등록된 내 투표 내역입니다.
              </div>

              {myVotes.length === 0 ? (
                <div
                  style={{
                    padding: '32px 16px',
                    textAlign: 'center',
                    background: '#f8fafc',
                    borderRadius: '12px',
                    color: '#94a3b8',
                    fontSize: '0.9rem',
                  }}
                >
                  아직 등록된 사전 투표 내역이 없습니다.
                </div>
              ) : (
                myVotes.map((vote) => (
                  <div
                    key={vote.id}
                    style={{
                      padding: '12px 14px',
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '0.92rem', color: '#1e293b' }}>
                        {vote.scheduleTitle}
                      </strong>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: vote.status === 'ATTEND' ? '#dcfce7' : '#fee2e2',
                          color: vote.status === 'ATTEND' ? '#15803d' : '#b91c1c',
                        }}
                      >
                        {vote.status === 'ATTEND' ? '🟢 참석' : '🔴 불참'}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      연습 일자: {vote.scheduleDate}
                    </div>

                    {vote.reason && (
                      <div
                        style={{
                          marginTop: '4px',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          background: '#f8fafc',
                          fontSize: '0.8rem',
                          color: '#475569',
                        }}
                      >
                        💬 "{vote.reason}"
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Tab 3: Member Status History */}
          {activeTab === 'TIMELINE' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>
                💡 구글 시트 <code>단원변경로그</code>에 기록된 내 상태 및 파트 변경 이력입니다.
              </div>

              {(currentMember.statusHistory || []).map((h) => (
                <div
                  key={h.id}
                  style={{
                    padding: '12px 14px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color: '#334155', fontSize: '0.88rem' }}>
                      {h.status} ({h.part})
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      {h.startDate} ~ {h.endDate === '2999-12-31' ? '영구' : h.endDate}
                    </span>
                  </div>
                  {h.reason && (
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      사유: {h.reason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '14px 20px',
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '10px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={handleSyncRemote}
              disabled={isSyncing}
              style={{
                height: '42px',
                padding: '0 12px',
                borderRadius: '8px',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                fontSize: '0.82rem',
                fontWeight: 600,
                color: '#334155',
                cursor: 'pointer',
              }}
            >
              {isSyncing ? '동기화 중...' : '🔄 시트 동기화'}
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onChangeBinding();
              }}
              style={{
                height: '42px',
                padding: '0 12px',
                borderRadius: '8px',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                fontSize: '0.82rem',
                fontWeight: 600,
                color: '#64748b',
                cursor: 'pointer',
              }}
            >
              ⚙️ 기기 재바인딩
            </button>
            {onLogout && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('이 기기에서 로그아웃(연동 해제)하시겠습니까?\n출석 체크를 하려면 다시 본인 인증(이름+전화번호)을 해야 합니다.')) {
                    onClose();
                    onLogout();
                  }
                }}
                style={{
                  height: '42px',
                  padding: '0 12px',
                  borderRadius: '8px',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: '#dc2626',
                  cursor: 'pointer',
                }}
              >
                🚪 연동 해제
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              height: '42px',
              padding: '0 20px',
              borderRadius: '8px',
              background: '#1e293b',
              border: 'none',
              fontSize: '0.9rem',
              fontWeight: 600,
              color: '#ffffff',
              cursor: 'pointer',
              minWidth: '80px',
            }}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
export default MemberPortalModal;
