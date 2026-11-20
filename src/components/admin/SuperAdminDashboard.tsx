import React, { useEffect, useMemo, useState } from 'react';
import { setSuperAdminLoggedIn } from '../../services/auth';
import { sheetsService } from '../../services/sheets';
import type {
  Member,
  RSVPVote,
  RawAttendanceLog,
  Schedule,
  ScheduleCommentEvent,
} from '../../types/rollbook';
import { getActiveSupabaseRealtime } from '../../services/realtime/supabaseRealtime';

interface SuperAdminDashboardProps {
  onBackToHome: () => void;
  onDataChanged: () => void;
  refreshTrigger?: number;
}

type SuperAdminTab = 'AUDIT_LOGS' | 'CLOUD_INTEGRATION' | 'SECURITY';
type AuditSubTab = 'ATTENDANCE' | 'COMMENTS' | 'RSVP' | 'DEVICES';

export const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({
  onBackToHome,
  onDataChanged,
  refreshTrigger,
}) => {
  const [activeTab, setActiveTab] = useState<SuperAdminTab>('AUDIT_LOGS');
  const [auditSubTab, setAuditSubTab] = useState<AuditSubTab>('ATTENDANCE');

  // Status banners
  const [actionSuccessMsg, setActionSuccessMsg] = useState('');
  const [actionErrorMsg, setActionErrorMsg] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Security Credentials State
  const [adminPinInput, setAdminPinInput] = useState('');
  const [activeOnSitePinInput, setActiveOnSitePinInput] = useState('');
  const [superAdminPinInput, setSuperAdminPinInput] = useState('');
  const [currentSecrets, setCurrentSecrets] = useState<{
    adminPin: string;
    activeOnSitePin: string;
    superAdminPin?: string;
  }>({ adminPin: '1004', activeOnSitePin: '5027', superAdminPin: '2315' });

  // Cloud Integration State
  const [sheetsUrlInput, setSheetsUrlInput] = useState(() => sheetsService.getConfig().sheetsWebAppUrl || '');
  const [realtimeConnected, setRealtimeConnected] = useState<boolean>(false);

  // Load audit data & secrets
  const logs: RawAttendanceLog[] = useMemo(() => {
    void refreshTrigger;
    return sheetsService.getRawLogs();
  }, [refreshTrigger]);

  const comments: ScheduleCommentEvent[] = useMemo(() => {
    void refreshTrigger;
    return sheetsService.getCommentEvents();
  }, [refreshTrigger]);

  const rsvpVotes: RSVPVote[] = useMemo(() => {
    void refreshTrigger;
    return sheetsService.getAllRSVPVotes();
  }, [refreshTrigger]);

  const members: Member[] = useMemo(() => {
    void refreshTrigger;
    return sheetsService.getMembers(true, true);
  }, [refreshTrigger]);

  const schedules: Schedule[] = useMemo(() => {
    void refreshTrigger;
    return sheetsService.getSchedules();
  }, [refreshTrigger]);

  // Schedule title map for readable logs
  const scheduleMap = useMemo(() => {
    const map = new Map<string, Schedule>();
    schedules.forEach((s) => map.set(s.id, s));
    return map;
  }, [schedules]);

  // Load fresh server secrets upon mounting
  useEffect(() => {
    let mounted = true;
    sheetsService.getAdminSecrets().then((secrets) => {
      if (mounted) {
        setCurrentSecrets(secrets);
        setAdminPinInput(secrets.adminPin);
        setActiveOnSitePinInput(secrets.activeOnSitePin);
        setSuperAdminPinInput(secrets.superAdminPin || '2315');
      }
    });
    return () => {
      mounted = false;
    };
  }, [refreshTrigger]);

  // Check Realtime Health
  useEffect(() => {
    const checkRealtime = () => {
      const rt = getActiveSupabaseRealtime();
      setRealtimeConnected(rt ? rt.getIsConnected() : false);
    };
    checkRealtime();
    const interval = setInterval(checkRealtime, 3000);
    return () => clearInterval(interval);
  }, []);

  const showSuccess = (msg: string) => {
    setActionSuccessMsg(msg);
    setActionErrorMsg('');
    setTimeout(() => setActionSuccessMsg(''), 4000);
  };

  const showError = (msg: string) => {
    setActionErrorMsg(msg);
    setActionSuccessMsg('');
    setTimeout(() => setActionErrorMsg(''), 5000);
  };

  // --- Handlers ---
  const handleLogout = () => {
    setSuperAdminLoggedIn(false);
    onBackToHome();
  };

  const handleSaveSheetsUrl = async () => {
    setIsProcessing(true);
    try {
      await sheetsService.saveConfigConfirmed({
        sheetsWebAppUrl: sheetsUrlInput.trim(),
      });
      onDataChanged();
      showSuccess('Google Sheets Web App URL이 안전하게 저장되었습니다.');
    } catch (err) {
      showError(err instanceof Error ? err.message : '시트 URL 저장에 실패했습니다.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleForceCloudSync = async () => {
    setIsProcessing(true);
    try {
      const res = await sheetsService.fetchRemoteData(sheetsUrlInput.trim() || undefined);
      onDataChanged();
      showSuccess(`원격 데이터 동기화 완료! 단원 ${res.count?.members ?? 0}명, 일정 ${res.count?.schedules ?? 0}건`);
    } catch (err) {
      showError(err instanceof Error ? err.message : '동기화 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReconnectRealtime = () => {
    const rt = getActiveSupabaseRealtime();
    if (rt) {
      rt.checkAndReconnect();
      showSuccess('Supabase 실시간 WebSocket 재연결 요청을 전송했습니다.');
    } else {
      showError('현재 활성화된 Supabase Realtime 세션이 없습니다.');
    }
  };

  const handleEmergencyCacheReset = () => {
    if (!window.confirm('로컬 캐시를 비우고 원격 서버에서 최신 상태를 강제로 다시 로드하시겠습니까?')) {
      return;
    }
    try {
      const keys = ['moonchoir_schedules', 'moonchoir_members_v1', 'moonchoir_logs_v1', 'moonchoir_rsvp_votes_v1'];
      keys.forEach((k) => localStorage.removeItem(k));
      window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  const handleUpdateAdminPin = async () => {
    const val = adminPinInput.trim();
    if (!val || val.length < 4) {
      showError('운영진 PIN은 최소 4자리 이상이어야 합니다.');
      return;
    }
    setIsProcessing(true);
    try {
      await sheetsService.saveConfigConfirmed({ adminPin: val });
      setCurrentSecrets((prev) => ({ ...prev, adminPin: val }));
      onDataChanged();
      showSuccess(`운영진 PIN이 [${val}]으로 성공적으로 변경되었습니다.`);
    } catch (err) {
      showError(err instanceof Error ? err.message : '운영진 PIN 변경 실패');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRegenerateOnSitePin = async () => {
    setIsProcessing(true);
    try {
      const newPin = await sheetsService.refreshActiveOnSitePin();
      setCurrentSecrets((prev) => ({ ...prev, activeOnSitePin: newPin }));
      setActiveOnSitePinInput(newPin);
      onDataChanged();
      showSuccess(`당일 현장 PIN이 [${newPin}]으로 신규 발급되었습니다.`);
    } catch (err) {
      showError(err instanceof Error ? err.message : '현장 PIN 발급 실패');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateSuperAdminPin = async () => {
    const val = superAdminPinInput.trim();
    if (!val || val.length < 4) {
      showError('최고 관리자 PIN은 최소 4자리 이상이어야 합니다.');
      return;
    }
    setIsProcessing(true);
    try {
      await sheetsService.saveConfigConfirmed({ superAdminPin: val });
      setCurrentSecrets((prev) => ({ ...prev, superAdminPin: val }));
      onDataChanged();
      showSuccess(`최고 관리자 PIN이 [${val}]으로 성공적으로 변경되었습니다.`);
    } catch (err) {
      showError(err instanceof Error ? err.message : '최고 관리자 PIN 변경 실패');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#090D16',
        color: '#E2E8F0',
        fontFamily: 'Pretendard, -apple-system, BlinkMacSystemFont, sans-serif',
        padding: '24px 16px 80px',
      }}
    >
      {/* 50~60% Width Centered Supabase/GitHub Settings Layout (Max 860px) */}
      <div style={{ maxWidth: '860px', margin: '0 auto', width: '100%' }}>
        {/* Top Header Card */}
        <div
          style={{
            background: '#1e293b',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            marginBottom: '16px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#94a3b8',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  padding: '2px 7px',
                  borderRadius: '4px',
                  letterSpacing: '0.3px',
                }}
              >
                Master Console
              </span>
              <h1 style={{ margin: 0, fontSize: '17px', fontWeight: 600, color: '#FFFFFF' }}>
                시스템 마스터 콘솔
              </h1>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#94A3B8' }}>
              원천 감사 로그 열람, 백엔드 클라우드 연동 및 시스템 자격 증명 관리
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={onBackToHome}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#E2E8F0',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                minHeight: '36px',
              }}
            >
              홈으로 복귀
            </button>
            <button
              type="button"
              onClick={handleLogout}
              style={{
                background: '#dc2626',
                border: 'none',
                color: '#FFFFFF',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                minHeight: '36px',
              }}
            >
              로그아웃
            </button>
          </div>
        </div>

        {/* Global Notifications */}
        {actionSuccessMsg && (
          <div
            style={{
              background: 'rgba(5, 150, 105, 0.15)',
              border: '1px solid rgba(5, 150, 105, 0.4)',
              color: '#34D399',
              padding: '10px 14px',
              borderRadius: '8px',
              marginBottom: '16px',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            {actionSuccessMsg}
          </div>
        )}
        {actionErrorMsg && (
          <div
            style={{
              background: 'rgba(220, 38, 38, 0.15)',
              border: '1px solid rgba(220, 38, 38, 0.4)',
              color: '#F87171',
              padding: '10px 14px',
              borderRadius: '8px',
              marginBottom: '16px',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            {actionErrorMsg}
          </div>
        )}

        {/* Top 3-Tab Bar (Quiet Segmented Style) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '4px',
            background: 'rgba(15, 23, 42, 0.6)',
            padding: '4px',
            borderRadius: '10px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            marginBottom: '16px',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('AUDIT_LOGS')}
            style={{
              background: activeTab === 'AUDIT_LOGS' ? '#334155' : 'transparent',
              color: activeTab === 'AUDIT_LOGS' ? '#FFFFFF' : '#94A3B8',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 12px',
              fontSize: '13px',
              fontWeight: activeTab === 'AUDIT_LOGS' ? 600 : 400,
              cursor: 'pointer',
              minHeight: '38px',
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
          >
            원천 감사 로그
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('CLOUD_INTEGRATION')}
            style={{
              background: activeTab === 'CLOUD_INTEGRATION' ? '#334155' : 'transparent',
              color: activeTab === 'CLOUD_INTEGRATION' ? '#FFFFFF' : '#94A3B8',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 12px',
              fontSize: '13px',
              fontWeight: activeTab === 'CLOUD_INTEGRATION' ? 600 : 400,
              cursor: 'pointer',
              minHeight: '38px',
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
          >
            클라우드 연동
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('SECURITY')}
            style={{
              background: activeTab === 'SECURITY' ? '#334155' : 'transparent',
              color: activeTab === 'SECURITY' ? '#FFFFFF' : '#94A3B8',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 12px',
              fontSize: '13px',
              fontWeight: activeTab === 'SECURITY' ? 600 : 400,
              cursor: 'pointer',
              minHeight: '38px',
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
          >
            보안 설정
          </button>
        </div>

        {/* ================================================================ */}
        {/* TAB 1: AUDIT LOGS (Append-Only Event Sourcing Inspection)        */}
        {/* ================================================================ */}
        {activeTab === 'AUDIT_LOGS' && (
          <div>
            {/* Audit Sub-tabs */}
            <div
              style={{
                display: 'flex',
                gap: '8px',
                flexWrap: 'wrap',
                marginBottom: '14px',
              }}
            >
              {[
                { id: 'ATTENDANCE', label: `출결 로그 (${logs.length})` },
                { id: 'COMMENTS', label: `댓글 수정/삭제 이력 (${comments.length})` },
                { id: 'RSVP', label: `사전투표 로그 (${rsvpVotes.length})` },
                { id: 'DEVICES', label: `단원 기기 바인딩 (${members.filter((m) => m.boundDeviceId).length})` },
              ].map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setAuditSubTab(sub.id as AuditSubTab)}
                  style={{
                    background: auditSubTab === sub.id ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                    border: `1px solid ${auditSubTab === sub.id ? '#6366F1' : 'rgba(255, 255, 255, 0.1)'}`,
                    color: auditSubTab === sub.id ? '#A5B4FC' : '#94A3B8',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    minHeight: '38px',
                  }}
                >
                  {sub.label}
                </button>
              ))}
            </div>

            <div
              style={{
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '14px',
                padding: '16px',
                overflowX: 'auto',
              }}
            >
              {auditSubTab === 'ATTENDANCE' && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: '#94A3B8' }}>
                      <th style={{ padding: '8px' }}>일시 (KST)</th>
                      <th style={{ padding: '8px' }}>회차명</th>
                      <th style={{ padding: '8px' }}>단원명</th>
                      <th style={{ padding: '8px' }}>파트</th>
                      <th style={{ padding: '8px' }}>인증 수단</th>
                      <th style={{ padding: '8px' }}>GPS 위치</th>
                      <th style={{ padding: '8px' }}>관리자 노트</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: '#64748B' }}>
                          기록된 원천 출결 로그가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      logs.slice(0, 100).map((l) => (
                        <tr key={l.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                          <td style={{ padding: '8px', color: '#CBD5E1', whiteSpace: 'nowrap' }}>{l.timestamp}</td>
                          <td style={{ padding: '8px', color: '#E2E8F0' }}>{scheduleMap.get(l.scheduleId)?.title || l.scheduleId}</td>
                          <td style={{ padding: '8px', fontWeight: 700, color: '#FFFFFF' }}>{l.memberName}</td>
                          <td style={{ padding: '8px' }}>{l.part}</td>
                          <td style={{ padding: '8px', color: '#818CF8' }}>{l.authMethod}</td>
                          <td style={{ padding: '8px', color: l.isVerifiedLocation ? '#34D399' : '#F87171' }}>
                            {l.isVerifiedLocation ? '검증 완료' : '반경 외/미검증'}
                          </td>
                          <td style={{ padding: '8px', color: '#94A3B8' }}>{l.adminNote || '-'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {auditSubTab === 'COMMENTS' && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: '#94A3B8' }}>
                      <th style={{ padding: '8px' }}>일시</th>
                      <th style={{ padding: '8px' }}>액션</th>
                      <th style={{ padding: '8px' }}>작성자</th>
                      <th style={{ padding: '8px' }}>파트</th>
                      <th style={{ padding: '8px' }}>댓글 내용</th>
                      <th style={{ padding: '8px' }}>기기 ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comments.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#64748B' }}>
                          기록된 원천 댓글 이벤트가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      comments.slice(0, 100).map((c) => (
                        <tr key={c.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                          <td style={{ padding: '8px', color: '#CBD5E1', whiteSpace: 'nowrap' }}>{c.timestamp}</td>
                          <td style={{ padding: '8px' }}>
                            <span
                              style={{
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 700,
                                background: c.action === 'CREATE' ? '#065F46' : c.action === 'EDIT' ? '#92400E' : '#991B1B',
                                color: '#FFFFFF',
                              }}
                            >
                              {c.action}
                            </span>
                          </td>
                          <td style={{ padding: '8px', fontWeight: 700, color: '#FFFFFF' }}>{c.memberName}</td>
                          <td style={{ padding: '8px' }}>{c.part}</td>
                          <td style={{ padding: '8px', color: '#E2E8F0', maxWidth: '240px', wordBreak: 'break-all' }}>
                            {c.text || '(내용 없음)'}
                          </td>
                          <td style={{ padding: '8px', color: '#64748B', fontSize: '11px' }}>{c.deviceId || '-'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {auditSubTab === 'RSVP' && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: '#94A3B8' }}>
                      <th style={{ padding: '8px' }}>제출 일시</th>
                      <th style={{ padding: '8px' }}>회차</th>
                      <th style={{ padding: '8px' }}>단원명</th>
                      <th style={{ padding: '8px' }}>파트</th>
                      <th style={{ padding: '8px' }}>투표 상태</th>
                      <th style={{ padding: '8px' }}>불참 사유</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rsvpVotes.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#64748B' }}>
                          기록된 사전투표 로그가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      rsvpVotes.slice(0, 100).map((v) => (
                        <tr key={v.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                          <td style={{ padding: '8px', color: '#CBD5E1', whiteSpace: 'nowrap' }}>{v.timestamp}</td>
                          <td style={{ padding: '8px', color: '#E2E8F0' }}>{scheduleMap.get(v.scheduleId)?.title || v.scheduleId}</td>
                          <td style={{ padding: '8px', fontWeight: 700, color: '#FFFFFF' }}>{v.memberName}</td>
                          <td style={{ padding: '8px' }}>{v.part}</td>
                          <td style={{ padding: '8px', color: v.status === 'ATTEND' ? '#34D399' : '#F87171', fontWeight: 700 }}>
                            {v.status === 'ATTEND' ? '참석' : '결석'}
                          </td>
                          <td style={{ padding: '8px', color: '#94A3B8' }}>{v.reason || '-'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {auditSubTab === 'DEVICES' && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: '#94A3B8' }}>
                      <th style={{ padding: '8px' }}>단원명</th>
                      <th style={{ padding: '8px' }}>파트</th>
                      <th style={{ padding: '8px' }}>구분</th>
                      <th style={{ padding: '8px' }}>연락처(뒤4자리)</th>
                      <th style={{ padding: '8px' }}>바인딩된 기기 ID</th>
                      <th style={{ padding: '8px' }}>최초 등록일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.filter((m) => m.boundDeviceId).length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#64748B' }}>
                          기기 바인딩 이력이 있는 단원이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      members
                        .filter((m) => m.boundDeviceId)
                        .map((m) => (
                          <tr key={m.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                            <td style={{ padding: '8px', fontWeight: 700, color: '#FFFFFF' }}>{m.name}</td>
                            <td style={{ padding: '8px' }}>{m.part}</td>
                            <td style={{ padding: '8px' }}>{m.memberStatus || '정단원'}</td>
                            <td style={{ padding: '8px', color: '#94A3B8' }}>{m.phoneLast4 || '-'}</td>
                            <td style={{ padding: '8px', color: '#818CF8', fontFamily: 'monospace' }}>{m.boundDeviceId}</td>
                            <td style={{ padding: '8px', color: '#CBD5E1', fontSize: '11.5px' }}>{m.createdAt?.slice(0, 10)}</td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* TAB 2: CLOUD & SHEETS INTEGRATION (Supabase & Google Sheets Webhook)*/}
        {/* ================================================================ */}
        {activeTab === 'CLOUD_INTEGRATION' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Card 1: Google Sheets Webhook URL */}
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '14px',
                padding: '20px',
              }}
            >
              <h3 style={{ margin: '0 0 8px', fontSize: '15px', fontWeight: 700, color: '#FFFFFF' }}>
                구글 시트 Web App Webhook 연동
              </h3>
              <p style={{ margin: '0 0 14px', fontSize: '12.5px', color: '#94A3B8' }}>
                운영진이 잘못 건드리지 않도록 마스터 콘솔에서만 제어됩니다. GAS Web App의 최신 exec URL을 지정하세요.
              </p>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  className="input-text"
                  placeholder="https://script.google.com/macros/s/.../exec"
                  value={sheetsUrlInput}
                  onChange={(e) => setSheetsUrlInput(e.target.value)}
                  style={{
                    flex: '1 1 300px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    color: '#FFFFFF',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    fontSize: '13px',
                  }}
                />
                <button
                  type="button"
                  onClick={handleSaveSheetsUrl}
                  disabled={isProcessing}
                  style={{
                    background: '#282C48',
                    color: '#FFFFFF',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    padding: '8px 16px',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    minHeight: '40px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isProcessing ? '저장 중...' : 'URL 저장'}
                </button>
              </div>
            </div>

            {/* Card 2: Supabase Realtime WebSocket Status */}
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '16px 20px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#FFFFFF' }}>
                  Supabase 실시간 WebSocket 헬스체크
                </h3>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: realtimeConnected ? '#34D399' : '#F87171',
                    background: realtimeConnected ? 'rgba(5, 150, 105, 0.2)' : 'rgba(220, 38, 38, 0.2)',
                    padding: '3px 8px',
                    borderRadius: '6px',
                  }}
                >
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: realtimeConnected ? '#10B981' : '#EF4444',
                    }}
                  />
                  {realtimeConnected ? '실시간 동기화 정상 (LIVE)' : '연결 확인 중'}
                </span>
              </div>
              <p style={{ margin: '0 0 14px', fontSize: '12.5px', color: '#94A3B8' }}>
                7개 테이블(출결, 댓글, RSVP, 단원, 일정, 카드, 장소)의 변경분을 모바일 기기로 0.05초 내 전파합니다.
              </p>

              <button
                type="button"
                onClick={handleReconnectRealtime}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#E2E8F0',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  minHeight: '40px',
                }}
              >
                🔄 실시간 소켓 강제 재연결 트리거
              </button>
            </div>

            {/* Card 3: 2-Column Button Actions (Compact 50% Layout) */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '12px',
              }}
            >
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '14px',
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <div>
                  <h4 style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 700, color: '#FFFFFF' }}>
                    전체 원격 데이터 수동 동기화
                  </h4>
                  <p style={{ margin: 0, fontSize: '12px', color: '#94A3B8' }}>
                    백엔드 스냅샷을 즉시 수신하여 모든 로컬 캐시를 최신 상태로 갱신합니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleForceCloudSync}
                  disabled={isProcessing}
                  style={{
                    background: '#2563EB',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '10px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    minHeight: '42px',
                  }}
                >
                  {isProcessing ? '동기화 진행 중...' : '원클릭 전체 동기화'}
                </button>
              </div>

              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '14px',
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <div>
                  <h4 style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 700, color: '#F87171' }}>
                    비상 로컬 캐시 초기화
                  </h4>
                  <p style={{ margin: 0, fontSize: '12px', color: '#94A3B8' }}>
                    기기 데이터 불일치 발생 시 로컬 스토리지를 안전하게 비우고 새로고침합니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleEmergencyCacheReset}
                  style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    color: '#F87171',
                    borderRadius: '8px',
                    padding: '10px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    minHeight: '42px',
                  }}
                >
                  비상 캐시 초기화 & 재로드
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* TAB 3: SECURITY CREDENTIALS (Two-Tier RBAC Secret Management)     */}
        {/* ================================================================ */}
        {activeTab === 'SECURITY' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* PIN 1: 일반 운영진 PIN (1004) */}
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '14px',
                padding: '20px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#FFFFFF' }}>
                  1. 일반 운영진 관리자 PIN (현재: {currentSecrets.adminPin})
                </h3>
                <span style={{ fontSize: '11px', color: '#A5B4FC', background: 'rgba(99, 102, 241, 0.2)', padding: '2px 8px', borderRadius: '4px' }}>
                  일반 어드민 전용
                </span>
              </div>
              <p style={{ margin: '0 0 14px', fontSize: '12.5px', color: '#94A3B8' }}>
                총무단, 파트장이 명부 관리, 연습 일정 등록, 출결 통계 대시보드 진입 시 사용하는 PIN입니다.
              </p>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="새 운영진 PIN 입력"
                  value={adminPinInput}
                  onChange={(e) => setAdminPinInput(e.target.value)}
                  style={{
                    flex: '1 1 200px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    color: '#FFFFFF',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    fontSize: '13px',
                  }}
                />
                <button
                  type="button"
                  onClick={handleUpdateAdminPin}
                  disabled={isProcessing}
                  style={{
                    background: '#282C48',
                    color: '#FFFFFF',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    padding: '8px 16px',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    minHeight: '40px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  운영진 PIN 저장
                </button>
              </div>
            </div>

            {/* PIN 2: 당일 현장 출석 PIN */}
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '14px',
                padding: '20px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#FFFFFF' }}>
                  2. 당일 현장 출석 PIN (서버 실시간: {currentSecrets.activeOnSitePin})
                </h3>
                <span style={{ fontSize: '11px', color: '#34D399', background: 'rgba(5, 150, 105, 0.2)', padding: '2px 8px', borderRadius: '4px' }}>
                  Supabase app_secrets 연동
                </span>
              </div>
              <p style={{ margin: '0 0 14px', fontSize: '12.5px', color: '#94A3B8' }}>
                카메라 고장 등으로 QR 스캔이 어려운 단원이 현장에서 직접 입력하는 4자리 출석 PIN 번호입니다.
              </p>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  readOnly
                  value={activeOnSitePinInput || currentSecrets.activeOnSitePin}
                  style={{
                    flex: '1 1 200px',
                    background: 'rgba(0, 0, 0, 0.4)',
                    color: '#34D399',
                    fontFamily: 'monospace',
                    fontWeight: 800,
                    letterSpacing: '3px',
                    textAlign: 'center',
                    border: '1px solid rgba(52, 211, 153, 0.3)',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    fontSize: '16px',
                  }}
                />
                <button
                  type="button"
                  onClick={handleRegenerateOnSitePin}
                  disabled={isProcessing}
                  style={{
                    background: '#059669',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 16px',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    minHeight: '40px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  현장 PIN 재발급
                </button>
              </div>
            </div>

            {/* PIN 3: 최고 시스템 관리자 PIN (2315) */}
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '16px 20px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#f8fafc' }}>
                  3. 최고 관리자 전용 마스터 PIN (현재: {currentSecrets.superAdminPin || '2315'})
                </h3>
                <span style={{ fontSize: '11px', color: '#94a3b8', background: 'rgba(255, 255, 255, 0.06)', padding: '2px 7px', borderRadius: '4px' }}>
                  Master Only
                </span>
              </div>
              <p style={{ margin: '0 0 14px', fontSize: '12.5px', color: '#94A3B8' }}>
                로고 제스처(우클릭/3연타)를 통해 마스터 콘솔에 진입할 때 사용하는 유일한 인증 키입니다.
              </p>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="새 최고 관리자 PIN 입력"
                  value={superAdminPinInput}
                  onChange={(e) => setSuperAdminPinInput(e.target.value)}
                  style={{
                    flex: '1 1 200px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    color: '#FFFFFF',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '13px',
                  }}
                />
                <button
                  type="button"
                  onClick={handleUpdateSuperAdminPin}
                  disabled={isProcessing}
                  style={{
                    background: '#282C48',
                    color: '#FFFFFF',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    padding: '8px 16px',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    minHeight: '40px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  마스터 PIN 저장
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SuperAdminDashboard;
