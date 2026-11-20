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
import { getKSTDateString, parseKSTDate } from '../../utils/date';

interface SuperAdminDashboardProps {
  onBackToHome: () => void;
  onDataChanged: () => void;
  refreshTrigger?: number;
}

type SuperAdminTab = 'AUDIT_LOGS' | 'CLOUD_INTEGRATION' | 'SECURITY';
type AuditSubTab = 'ATTENDANCE' | 'COMMENTS' | 'RSVP' | 'DEVICES';
type TimeRangePreset = 'ALL' | 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'CUSTOM';
type SortField = 'timestamp' | 'memberName';
type SortOrder = 'asc' | 'desc';

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
  const [superAdminPinInput, setSuperAdminPinInput] = useState('');
  const [showAdminPin, setShowAdminPin] = useState(false);
  const [showSuperAdminPin, setShowSuperAdminPin] = useState(false);
  const [currentSecrets, setCurrentSecrets] = useState<{
    adminPin: string;
    activeOnSitePin: string;
    superAdminPin?: string;
  }>({ adminPin: '1004', activeOnSitePin: '5027', superAdminPin: '2315' });

  // Cloud Integration State
  const [sheetsUrlInput, setSheetsUrlInput] = useState(() => sheetsService.getConfig().sheetsWebAppUrl || '');
  const [realtimeConnected, setRealtimeConnected] = useState<boolean>(false);

  // Audit Log Filters & Sorting (Excel/DB Grid)
  const [searchQuery, setSearchQuery] = useState('');
  const [timeRangePreset, setTimeRangePreset] = useState<TimeRangePreset>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

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

  const handleEmergencyUnbindDevice = async (memberId: string, memberName: string) => {
    if (!window.confirm(`'${memberName}' 단원의 기기 바인딩을 해제하시겠습니까?\n해제 후 해당 단원은 새 기기에서 즉시 다시 연동할 수 있습니다.`)) {
      return;
    }
    setIsProcessing(true);
    try {
      await sheetsService.unbindMemberDevice(memberId);
      onDataChanged();
      showSuccess(`'${memberName}' 단원의 기기 연동이 성공적으로 해제되었습니다.`);
    } catch (err) {
      showError(err instanceof Error ? err.message : '기기 연동 해제 실패');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateAdminPin = async () => {
    const val = adminPinInput.trim();
    if (!val || val.length < 4 || val.length > 8) {
      showError('운영진 PIN은 4~8자리 숫자여야 합니다.');
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

  const handleUpdateSuperAdminPin = async () => {
    const val = superAdminPinInput.trim();
    if (!val || val.length < 4 || val.length > 8) {
      showError('최고 관리자 PIN은 4~8자리 숫자여야 합니다.');
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

  // Preset Date Range Calculator
  const todayStr = useMemo(() => getKSTDateString(), []);
  const rangeBounds = useMemo(() => {
    if (timeRangePreset === 'ALL') return { start: '', end: '' };
    if (timeRangePreset === 'TODAY') return { start: todayStr, end: todayStr };
    if (timeRangePreset === 'THIS_WEEK') {
      const d = parseKSTDate(todayStr);
      const day = d.getDay();
      const diffToMonday = (day + 6) % 7;
      const mon = new Date(d);
      mon.setDate(d.getDate() - diffToMonday);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      return {
        start: mon.toISOString().slice(0, 10),
        end: sun.toISOString().slice(0, 10),
      };
    }
    if (timeRangePreset === 'THIS_MONTH') {
      const yearMonth = todayStr.slice(0, 7);
      return {
        start: `${yearMonth}-01`,
        end: `${yearMonth}-31`,
      };
    }
    return { start: startDate, end: endDate };
  }, [timeRangePreset, todayStr, startDate, endDate]);

  // Filtering & Sorting Audit Logs
  const filteredAttendanceLogs = useMemo(() => {
    return logs.filter((l) => {
      // Date range check
      const dateOnly = (l.timestamp || '').slice(0, 10);
      if (rangeBounds.start && dateOnly < rangeBounds.start) return false;
      if (rangeBounds.end && dateOnly > rangeBounds.end) return false;

      // Query search
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const schTitle = scheduleMap.get(l.scheduleId)?.title || '';
      return (
        l.memberName.toLowerCase().includes(q) ||
        l.part.toLowerCase().includes(q) ||
        schTitle.toLowerCase().includes(q) ||
        (l.adminNote && l.adminNote.toLowerCase().includes(q)) ||
        l.authMethod.toLowerCase().includes(q)
      );
    }).sort((a, b) => {
      if (sortField === 'memberName') {
        const cmp = a.memberName.localeCompare(b.memberName);
        return sortOrder === 'asc' ? cmp : -cmp;
      }
      const cmp = (a.timestamp || '').localeCompare(b.timestamp || '');
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [logs, rangeBounds, searchQuery, scheduleMap, sortField, sortOrder]);

  const filteredComments = useMemo(() => {
    return comments.filter((c) => {
      const dateOnly = (c.timestamp || '').slice(0, 10);
      if (rangeBounds.start && dateOnly < rangeBounds.start) return false;
      if (rangeBounds.end && dateOnly > rangeBounds.end) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        c.memberName.toLowerCase().includes(q) ||
        c.part.toLowerCase().includes(q) ||
        (c.text && c.text.toLowerCase().includes(q)) ||
        (c.deviceId && c.deviceId.toLowerCase().includes(q))
      );
    }).sort((a, b) => {
      if (sortField === 'memberName') {
        const cmp = a.memberName.localeCompare(b.memberName);
        return sortOrder === 'asc' ? cmp : -cmp;
      }
      const cmp = (a.timestamp || '').localeCompare(b.timestamp || '');
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [comments, rangeBounds, searchQuery, sortField, sortOrder]);

  const filteredRsvps = useMemo(() => {
    return rsvpVotes.filter((v) => {
      const dateOnly = (v.timestamp || '').slice(0, 10);
      if (rangeBounds.start && dateOnly < rangeBounds.start) return false;
      if (rangeBounds.end && dateOnly > rangeBounds.end) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const schTitle = scheduleMap.get(v.scheduleId)?.title || '';
      return (
        v.memberName.toLowerCase().includes(q) ||
        v.part.toLowerCase().includes(q) ||
        schTitle.toLowerCase().includes(q) ||
        (v.reason && v.reason.toLowerCase().includes(q))
      );
    }).sort((a, b) => {
      if (sortField === 'memberName') {
        const cmp = a.memberName.localeCompare(b.memberName);
        return sortOrder === 'asc' ? cmp : -cmp;
      }
      const cmp = (a.timestamp || '').localeCompare(b.timestamp || '');
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [rsvpVotes, rangeBounds, searchQuery, scheduleMap, sortField, sortOrder]);

  const filteredDevices = useMemo(() => {
    return members
      .filter((m) => Boolean(m.boundDeviceId))
      .filter((m) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          m.name.toLowerCase().includes(q) ||
          m.part.toLowerCase().includes(q) ||
          (m.phoneLast4 && m.phoneLast4.includes(q)) ||
          (m.boundDeviceId && m.boundDeviceId.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        if (sortField === 'memberName') {
          const cmp = a.name.localeCompare(b.name);
          return sortOrder === 'asc' ? cmp : -cmp;
        }
        const cmp = (a.boundDeviceAt || a.createdAt || '').localeCompare(b.boundDeviceAt || b.createdAt || '');
        return sortOrder === 'asc' ? cmp : -cmp;
      });
  }, [members, searchQuery, sortField, sortOrder]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#090D16',
        color: '#E2E8F0',
        fontFamily: 'Pretendard, -apple-system, BlinkMacSystemFont, sans-serif',
        padding: '20px 16px 80px',
      }}
    >
      <div style={{ maxWidth: '920px', margin: '0 auto', width: '100%' }}>
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
              <span
                style={{
                  fontSize: '11px',
                  color: '#64748b',
                  background: 'rgba(0, 0, 0, 0.25)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                }}
              >
                15분 유휴 시 자동 잠금
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#94A3B8' }}>
              원천 데이터베이스 조회, 백엔드 클라우드 연동 및 시스템 자격 증명 관리
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

        {/* Top 3-Tab Bar */}
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
            클라우드 연동 및 진단
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
        {/* TAB 1: AUDIT LOGS (Database / Excel Grid with Filtering & Sort)    */}
        {/* ================================================================ */}
        {activeTab === 'AUDIT_LOGS' && (
          <div>
            {/* 1. Sub-tab Selector */}
            <div
              style={{
                display: 'flex',
                gap: '8px',
                flexWrap: 'wrap',
                marginBottom: '12px',
              }}
            >
              {[
                { id: 'ATTENDANCE', label: `출결 로그 (${logs.length})` },
                { id: 'COMMENTS', label: `댓글 이력 (${comments.length})` },
                { id: 'RSVP', label: `사전투표 (${rsvpVotes.length})` },
                { id: 'DEVICES', label: `기기 바인딩 현황 (${members.filter((m) => m.boundDeviceId).length})` },
              ].map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setAuditSubTab(sub.id as AuditSubTab)}
                  style={{
                    background: auditSubTab === sub.id ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                    border: `1px solid ${auditSubTab === sub.id ? '#6366F1' : 'rgba(255, 255, 255, 0.08)'}`,
                    color: auditSubTab === sub.id ? '#A5B4FC' : '#94A3B8',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    minHeight: '34px',
                  }}
                >
                  {sub.label}
                </button>
              ))}
            </div>

            {/* 2. Grid Control Toolbar (Search & Time Series Range) */}
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.75)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '10px',
                padding: '12px 14px',
                marginBottom: '12px',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '10px',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              {/* Search Bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 240px' }}>
                <input
                  type="text"
                  placeholder="단원명, 회차, 내용 검색"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(0, 0, 0, 0.3)',
                    color: '#FFFFFF',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '12.5px',
                    outline: 'none',
                  }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#94a3b8',
                      fontSize: '12px',
                      cursor: 'pointer',
                      padding: '4px',
                    }}
                  >
                    초기화
                  </button>
                )}
              </div>

              {/* Time Range Preset Bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                {[
                  { id: 'ALL', label: '전체' },
                  { id: 'TODAY', label: '오늘' },
                  { id: 'THIS_WEEK', label: '이번 주' },
                  { id: 'THIS_MONTH', label: '이번 달' },
                  { id: 'CUSTOM', label: '기간 선택' },
                ].map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setTimeRangePreset(preset.id as TimeRangePreset)}
                    style={{
                      background: timeRangePreset === preset.id ? '#334155' : 'rgba(255, 255, 255, 0.05)',
                      color: timeRangePreset === preset.id ? '#FFFFFF' : '#94A3B8',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '4px',
                      padding: '4px 8px',
                      fontSize: '11.5px',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Custom Date Range Picker */}
              {timeRangePreset === 'CUSTOM' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%', marginTop: '4px' }}>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      color: '#FFFFFF',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                    }}
                  />
                  <span style={{ color: '#94a3b8', fontSize: '12px' }}>~</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      color: '#FFFFFF',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                    }}
                  />
                </div>
              )}
            </div>

            {/* 3. Database / Excel Table View */}
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '10px',
                overflowX: 'auto',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
              }}
            >
              {auditSubTab === 'ATTENDANCE' && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#1e293b', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: '#94A3B8' }}>
                      <th
                        onClick={() => toggleSort('timestamp')}
                        style={{ padding: '10px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                        title="클릭하여 일시 정렬"
                      >
                        일시 (KST) {sortField === 'timestamp' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'}
                      </th>
                      <th style={{ padding: '10px 12px' }}>회차명</th>
                      <th
                        onClick={() => toggleSort('memberName')}
                        style={{ padding: '10px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                        title="클릭하여 단원명 정렬"
                      >
                        단원명 {sortField === 'memberName' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'}
                      </th>
                      <th style={{ padding: '10px 12px' }}>파트</th>
                      <th style={{ padding: '10px 12px' }}>인증 수단</th>
                      <th style={{ padding: '10px 12px' }}>위치 검증</th>
                      <th style={{ padding: '10px 12px' }}>관리자 노트</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAttendanceLogs.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: '#64748B' }}>
                          조건에 일치하는 원천 출결 로그가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      filteredAttendanceLogs.map((l) => (
                        <tr key={l.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                          <td style={{ padding: '8px 12px', color: '#CBD5E1', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                            {l.timestamp}
                          </td>
                          <td style={{ padding: '8px 12px', color: '#E2E8F0' }}>
                            {scheduleMap.get(l.scheduleId)?.title || l.scheduleId}
                          </td>
                          <td style={{ padding: '8px 12px', fontWeight: 600, color: '#FFFFFF' }}>{l.memberName}</td>
                          <td style={{ padding: '8px 12px' }}>{l.part}</td>
                          <td style={{ padding: '8px 12px', color: '#818CF8' }}>{l.authMethod}</td>
                          <td style={{ padding: '8px 12px', color: l.isVerifiedLocation ? '#34D399' : '#F87171' }}>
                            {l.isVerifiedLocation ? '검증 완료' : '반경 외/미검증'}
                          </td>
                          <td style={{ padding: '8px 12px', color: '#94A3B8' }}>{l.adminNote || '-'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {auditSubTab === 'COMMENTS' && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#1e293b', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: '#94A3B8' }}>
                      <th
                        onClick={() => toggleSort('timestamp')}
                        style={{ padding: '10px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        일시 {sortField === 'timestamp' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'}
                      </th>
                      <th style={{ padding: '10px 12px' }}>구분</th>
                      <th
                        onClick={() => toggleSort('memberName')}
                        style={{ padding: '10px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        작성자 {sortField === 'memberName' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'}
                      </th>
                      <th style={{ padding: '10px 12px' }}>파트</th>
                      <th style={{ padding: '10px 12px' }}>댓글 내용</th>
                      <th style={{ padding: '10px 12px' }}>기기 ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredComments.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: '36px', textAlign: 'center', color: '#64748B' }}>
                          조건에 일치하는 댓글 이력이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      filteredComments.map((c) => (
                        <tr key={c.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                          <td style={{ padding: '8px 12px', color: '#CBD5E1', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                            {c.timestamp}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <span
                              style={{
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 600,
                                background: c.action === 'CREATE' ? '#065F46' : c.action === 'EDIT' ? '#92400E' : '#991B1B',
                                color: '#FFFFFF',
                              }}
                            >
                              {c.action}
                            </span>
                          </td>
                          <td style={{ padding: '8px 12px', fontWeight: 600, color: '#FFFFFF' }}>{c.memberName}</td>
                          <td style={{ padding: '8px 12px' }}>{c.part}</td>
                          <td style={{ padding: '8px 12px', color: '#E2E8F0', maxWidth: '300px', wordBreak: 'break-all' }}>
                            {c.text || '(내용 없음)'}
                          </td>
                          <td style={{ padding: '8px 12px', color: '#64748B', fontSize: '11px', fontFamily: 'monospace' }}>
                            {c.deviceId || '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {auditSubTab === 'RSVP' && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#1e293b', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: '#94A3B8' }}>
                      <th
                        onClick={() => toggleSort('timestamp')}
                        style={{ padding: '10px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        제출 일시 {sortField === 'timestamp' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'}
                      </th>
                      <th style={{ padding: '10px 12px' }}>회차</th>
                      <th
                        onClick={() => toggleSort('memberName')}
                        style={{ padding: '10px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        단원명 {sortField === 'memberName' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'}
                      </th>
                      <th style={{ padding: '10px 12px' }}>파트</th>
                      <th style={{ padding: '10px 12px' }}>투표 상태</th>
                      <th style={{ padding: '10px 12px' }}>불참 사유</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRsvps.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: '36px', textAlign: 'center', color: '#64748B' }}>
                          조건에 일치하는 사전투표 로그가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      filteredRsvps.map((v) => (
                        <tr key={v.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                          <td style={{ padding: '8px 12px', color: '#CBD5E1', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                            {v.timestamp}
                          </td>
                          <td style={{ padding: '8px 12px', color: '#E2E8F0' }}>
                            {scheduleMap.get(v.scheduleId)?.title || v.scheduleId}
                          </td>
                          <td style={{ padding: '8px 12px', fontWeight: 600, color: '#FFFFFF' }}>{v.memberName}</td>
                          <td style={{ padding: '8px 12px' }}>{v.part}</td>
                          <td style={{ padding: '8px 12px', color: v.status === 'ATTEND' ? '#34D399' : '#F87171', fontWeight: 600 }}>
                            {v.status === 'ATTEND' ? '참석' : '결석'}
                          </td>
                          <td style={{ padding: '8px 12px', color: '#94A3B8' }}>{v.reason || '-'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {auditSubTab === 'DEVICES' && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#1e293b', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: '#94A3B8' }}>
                      <th
                        onClick={() => toggleSort('memberName')}
                        style={{ padding: '10px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        단원명 {sortField === 'memberName' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'}
                      </th>
                      <th style={{ padding: '10px 12px' }}>파트</th>
                      <th style={{ padding: '10px 12px' }}>연락처</th>
                      <th style={{ padding: '10px 12px' }}>바인딩된 스마트폰 기기 ID</th>
                      <th
                        onClick={() => toggleSort('timestamp')}
                        style={{ padding: '10px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        바인딩 시각 {sortField === 'timestamp' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'}
                      </th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>비상 조치</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDevices.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: '36px', textAlign: 'center', color: '#64748B' }}>
                          바인딩된 기기가 있는 단원이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      filteredDevices.map((m) => (
                        <tr key={m.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 600, color: '#FFFFFF' }}>{m.name}</td>
                          <td style={{ padding: '8px 12px' }}>{m.part}</td>
                          <td style={{ padding: '8px 12px', color: '#94A3B8' }}>{m.phoneLast4 ? `끝 4자리: ${m.phoneLast4}` : '-'}</td>
                          <td style={{ padding: '8px 12px', color: '#818CF8', fontFamily: 'monospace', fontSize: '12px' }}>
                            {m.boundDeviceId}
                          </td>
                          <td style={{ padding: '8px 12px', color: '#CBD5E1', fontSize: '11.5px', fontFamily: 'monospace' }}>
                            {m.boundDeviceAt || m.createdAt || '-'}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleEmergencyUnbindDevice(m.id, m.name)}
                              disabled={isProcessing}
                              style={{
                                background: 'rgba(239, 68, 68, 0.15)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                color: '#F87171',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 500,
                                cursor: 'pointer',
                              }}
                              title="기기 분실 또는 변경 시 바인딩 즉시 해제"
                            >
                              연동 해제
                            </button>
                          </td>
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
        {/* TAB 2: CLOUD INTEGRATION & DIAGNOSTICS (Doctor & Recovery)        */}
        {/* ================================================================ */}
        {activeTab === 'CLOUD_INTEGRATION' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Diagnostic Doctor Overview Card */}
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '16px 20px',
              }}
            >
              <h3 style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>
                시스템 상태 진단 (System Doctor)
              </h3>
              <p style={{ margin: '0 0 14px', fontSize: '12.5px', color: '#94A3B8' }}>
                현장에서 앱 이상 현상이나 출결 동기화 지연 발생 시 실시간 통신 파이프라인과 데이터 정합성을 진단합니다.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <div style={{ fontSize: '11.5px', color: '#94A3B8', marginBottom: '4px' }}>Supabase Realtime 통신</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: realtimeConnected ? '#10B981' : '#EF4444' }} />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: realtimeConnected ? '#34D399' : '#F87171' }}>
                      {realtimeConnected ? 'WebSocket 정상 연결됨' : '연결 끊김 / 재연결 필요'}
                    </span>
                  </div>
                </div>

                <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <div style={{ fontSize: '11.5px', color: '#94A3B8', marginBottom: '4px' }}>바인딩된 스마트폰</div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#FFFFFF' }}>
                    {members.filter((m) => m.boundDeviceId).length}명 / 총 단원 {members.length}명
                  </div>
                </div>

                <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <div style={{ fontSize: '11.5px', color: '#94A3B8', marginBottom: '4px' }}>적재된 원천 로그 건수</div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#FFFFFF' }}>
                    출결 {logs.length}건 · 댓글 {comments.length}건
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' }}>
                <button
                  type="button"
                  onClick={handleReconnectRealtime}
                  style={{
                    background: '#282C48',
                    color: '#FFFFFF',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    padding: '8px 14px',
                    fontSize: '12.5px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    minHeight: '36px',
                  }}
                >
                  실시간 웹소켓 강제 재연결
                </button>
                <button
                  type="button"
                  onClick={handleForceCloudSync}
                  disabled={isProcessing}
                  style={{
                    background: '#334155',
                    color: '#FFFFFF',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    padding: '8px 14px',
                    fontSize: '12.5px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    minHeight: '36px',
                  }}
                >
                  {isProcessing ? '동기화 중...' : '원격 서버 전체 스냅샷 동기화'}
                </button>
                <button
                  type="button"
                  onClick={handleEmergencyCacheReset}
                  style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#F87171',
                    borderRadius: '6px',
                    padding: '8px 14px',
                    fontSize: '12.5px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    minHeight: '36px',
                  }}
                >
                  비상 로컬 캐시 초기화 & 재로드
                </button>
              </div>
            </div>

            {/* Card 2: Google Sheets Webhook URL */}
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '16px 20px',
              }}
            >
              <h3 style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>
                Google Sheets Webhook URL 설정
              </h3>
              <p style={{ margin: '0 0 12px', fontSize: '12.5px', color: '#94A3B8' }}>
                Google Apps Script Web App의 최신 exec URL을 지정합니다. (운영진 화면에서는 실수 방지를 위해 숨김 처리됨)
              </p>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="https://script.google.com/macros/s/.../exec"
                  value={sheetsUrlInput}
                  onChange={(e) => setSheetsUrlInput(e.target.value)}
                  style={{
                    flex: '1 1 280px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    color: '#FFFFFF',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '12.5px',
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
                    fontSize: '12.5px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    minHeight: '36px',
                  }}
                >
                  {isProcessing ? '저장 중...' : 'URL 저장'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* TAB 3: SECURITY CREDENTIALS (Compact Width & Eye Toggle)          */}
        {/* ================================================================ */}
        {activeTab === 'SECURITY' && (
          <div style={{ maxWidth: '520px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* PIN 1: 일반 운영진 PIN (1004) */}
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '16px 18px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <h3 style={{ margin: 0, fontSize: '14.5px', fontWeight: 600, color: '#f8fafc' }}>
                  일반 운영진 관리자 PIN {currentSecrets.adminPin ? `(현재: ${currentSecrets.adminPin})` : ''}
                </h3>
                <span style={{ fontSize: '11px', color: '#94a3b8', background: 'rgba(255, 255, 255, 0.06)', padding: '2px 6px', borderRadius: '4px' }}>
                  4~8자리 숫자
                </span>
              </div>
              <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#94A3B8' }}>
                총무단, 파트장이 일정 등록 및 출결 대시보드 진입 시 사용하는 PIN입니다.
              </p>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <input
                    type={showAdminPin ? 'text' : 'password'}
                    inputMode="numeric"
                    maxLength={8}
                    placeholder="새 운영진 PIN 입력"
                    value={adminPinInput}
                    onChange={(e) => setAdminPinInput(e.target.value.replace(/[^0-9]/g, ''))}
                    style={{
                      width: '100%',
                      background: 'rgba(0, 0, 0, 0.3)',
                      color: '#FFFFFF',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      padding: '8px 38px 8px 12px',
                      borderRadius: '6px',
                      fontSize: '13px',
                      letterSpacing: showAdminPin ? '1px' : '3px',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminPin(!showAdminPin)}
                    title={showAdminPin ? '비밀번호 숨기기' : '비밀번호 보기'}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      fontSize: '14px',
                      padding: '4px',
                    }}
                  >
                    {showAdminPin ? '닫기' : '보기'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleUpdateAdminPin}
                  disabled={isProcessing}
                  style={{
                    background: '#282C48',
                    color: '#FFFFFF',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    padding: '8px 14px',
                    fontSize: '12.5px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    minHeight: '36px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  저장
                </button>
              </div>
            </div>

            {/* PIN 2: 최고 시스템 관리자 PIN (2315) */}
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '16px 18px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <h3 style={{ margin: 0, fontSize: '14.5px', fontWeight: 600, color: '#f8fafc' }}>
                  최고 관리자 마스터 PIN {currentSecrets.superAdminPin ? `(현재: ${currentSecrets.superAdminPin})` : ''}
                </h3>
                <span style={{ fontSize: '11px', color: '#94a3b8', background: 'rgba(255, 255, 255, 0.06)', padding: '2px 6px', borderRadius: '4px' }}>
                  마스터 전용 (4~8자리)
                </span>
              </div>
              <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#94A3B8' }}>
                로고 제스처(우클릭/3연타)를 통해 마스터 콘솔에 진입할 때 사용하는 유일한 인증 키입니다.
              </p>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <input
                    type={showSuperAdminPin ? 'text' : 'password'}
                    inputMode="numeric"
                    maxLength={8}
                    placeholder="새 최고 관리자 PIN 입력"
                    value={superAdminPinInput}
                    onChange={(e) => setSuperAdminPinInput(e.target.value.replace(/[^0-9]/g, ''))}
                    style={{
                      width: '100%',
                      background: 'rgba(0, 0, 0, 0.3)',
                      color: '#FFFFFF',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      padding: '8px 38px 8px 12px',
                      borderRadius: '6px',
                      fontSize: '13px',
                      letterSpacing: showSuperAdminPin ? '1px' : '3px',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSuperAdminPin(!showSuperAdminPin)}
                    title={showSuperAdminPin ? '비밀번호 숨기기' : '비밀번호 보기'}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      fontSize: '14px',
                      padding: '4px',
                    }}
                  >
                    {showSuperAdminPin ? '닫기' : '보기'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleUpdateSuperAdminPin}
                  disabled={isProcessing}
                  style={{
                    background: '#282C48',
                    color: '#FFFFFF',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    padding: '8px 14px',
                    fontSize: '12.5px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    minHeight: '36px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  저장
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
