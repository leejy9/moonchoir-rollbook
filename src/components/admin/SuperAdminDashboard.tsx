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
import { getKSTDateString, parseKSTDate, getKSTTimestampString } from '../../utils/date';

interface SuperAdminDashboardProps {
  onBackToHome: () => void;
  onDataChanged: () => void;
  refreshTrigger?: number;
}

type SuperAdminTab = 'AUDIT_LOGS' | 'DIAGNOSTICS' | 'CLOUD_INTEGRATION' | 'SECURITY';
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
  }>({ adminPin: '', activeOnSitePin: '', superAdminPin: '' });

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

  // Field Diagnostics & Member Doctor State
  const [diagMemberSearch, setDiagMemberSearch] = useState('');
  const [selectedMemberIdForDiag, setSelectedMemberIdForDiag] = useState<string>('');

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
        setSuperAdminPinInput(secrets.superAdminPin);
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

  // Emergency GPS Bypass handler
  const isEmergencyGpsBypassed = sheetsService.isEmergencyGpsBypassed();
  const emergencyGpsBypassUntil = sheetsService.getConfig().emergencyGpsBypassUntil;

  const handleToggleEmergencyGpsBypass = async (durationMinutes: number) => {
    setIsProcessing(true);
    try {
      const until = await sheetsService.setEmergencyGpsBypass(durationMinutes);
      onDataChanged();
      if (durationMinutes > 0 && until) {
        showSuccess(`한시적 GPS 위치 인증 면제가 ${durationMinutes}분간 활성화되었습니다.`);
      } else {
        showSuccess('한시적 GPS 위치 인증 면제가 정상 해제되었습니다.');
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'GPS 면제 설정 실패');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualApproveAttendance = async (targetMember: Member, targetSchedule: Schedule) => {
    if (!window.confirm(`'${targetMember.name}' 단원을 '${targetSchedule.title}' 세션에 수동 출석 인정 처리하시겠습니까?`)) {
      return;
    }
    setIsProcessing(true);
    try {
      const log: RawAttendanceLog = {
        id: `log_manual_${Date.now()}`,
        timestamp: getKSTTimestampString(),
        scheduleId: targetSchedule.id,
        memberId: targetMember.id,
        memberName: targetMember.name,
        part: targetMember.part,
        authMethod: 'MANUAL_BY_ADMIN',
        isVerifiedLocation: true,
        adminNote: '마스터 콘솔 긴급 진단 직권 인정',
      };
      await sheetsService.addCheckInLog(log);
      onDataChanged();
      showSuccess(`'${targetMember.name}' 단원의 출석이 수동 인정 처리되었습니다.`);
    } catch (err) {
      showError(err instanceof Error ? err.message : '수동 출석 인정 실패');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateAdminPin = async () => {
    const val = adminPinInput.trim();
    if (!val || val.length < 6 || val.length > 8) {
      showError('운영진 PIN은 6~8자리 숫자여야 합니다.');
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
    if (!val || val.length < 6 || val.length > 8) {
      showError('최고 관리자 PIN은 6~8자리 숫자여야 합니다.');
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
      const dateOnly = (l.timestamp || '').slice(0, 10);
      if (rangeBounds.start && dateOnly < rangeBounds.start) return false;
      if (rangeBounds.end && dateOnly > rangeBounds.end) return false;

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

  // Member Doctor: Active Schedule & Target Member Evaluation
  const activeTodaySchedule = useMemo(() => {
    return (
      schedules.find((s) => !s.isCancelled && !s.isArchived && s.date === todayStr) ||
      schedules.find((s) => !s.isCancelled && !s.isArchived && s.date >= todayStr)
    );
  }, [schedules, todayStr]);

  const searchedDiagMembers = useMemo(() => {
    if (!diagMemberSearch.trim()) return members.slice(0, 8);
    const q = diagMemberSearch.toLowerCase();
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.part.toLowerCase().includes(q) ||
        (m.phoneLast4 && m.phoneLast4.includes(q))
    ).slice(0, 10);
  }, [members, diagMemberSearch]);

  const diagTargetMember = useMemo(() => {
    return members.find((m) => m.id === selectedMemberIdForDiag);
  }, [members, selectedMemberIdForDiag]);

  // Diagnosis Results for diagTargetMember
  const memberDiagnosis = useMemo(() => {
    if (!diagTargetMember) return null;

    const issues: { type: 'ERROR' | 'WARNING' | 'SUCCESS'; title: string; desc: string }[] = [];

    // 1. Roster Status
    if (diagTargetMember.status === 'MERGED') {
      issues.push({
        type: 'ERROR',
        title: '중복 명부 통합 상태',
        desc: `다른 단원 ID(${diagTargetMember.mergedIntoId || '기존'})로 병합된 이전 계정입니다. 새 프로필로 접속해야 합니다.`,
      });
    } else if (diagTargetMember.status === 'DELETED') {
      issues.push({
        type: 'ERROR',
        title: '삭제된 단원',
        desc: '명부에서 삭제 처리된 단원입니다.',
      });
    } else {
      issues.push({
        type: 'SUCCESS',
        title: '단원 명부 상태 정상',
        desc: `${diagTargetMember.part} 파트 · ${diagTargetMember.memberStatus || '정단원'} (ACTIVE)`,
      });
    }

    // 2. Device Lock
    if (diagTargetMember.boundDeviceId) {
      issues.push({
        type: 'WARNING',
        title: '스마트폰 기기 1대 연동 중',
        desc: `단원이 폰을 바꿨거나 사파리 시크릿 모드를 켠 경우 '다른 기기에 연동됨' 오류로 진입이 차단됩니다. (기기 ID: ${diagTargetMember.boundDeviceId})`,
      });
    } else {
      issues.push({
        type: 'SUCCESS',
        title: '기기 연동 자유 상태',
        desc: '바인딩된 기기가 없어 새 폰이나 브라우저에서 즉시 연동 가능합니다.',
      });
    }

    // 3. Schedule Target
    if (activeTodaySchedule) {
      let isEligible = true;
      if (activeTodaySchedule.targetAudienceType === 'PARTS') {
        isEligible = Boolean(activeTodaySchedule.targetParts?.includes(diagTargetMember.part));
      } else if (activeTodaySchedule.targetAudienceType === 'CUSTOM_MEMBERS') {
        isEligible = Boolean(activeTodaySchedule.targetMemberIds?.includes(diagTargetMember.id));
      }

      if (!isEligible) {
        issues.push({
          type: 'ERROR',
          title: '오늘 일정 대상자 아님',
          desc: `'${activeTodaySchedule.title}' 세션은 ${diagTargetMember.part} 파트가 대상에 포함되지 않아 단원 화면에 일정이 뜨지 않습니다.`,
        });
      } else {
        issues.push({
          type: 'SUCCESS',
          title: '오늘 일정 대상자 부합',
          desc: `'${activeTodaySchedule.title}' 연습의 정상 참여 대상입니다.`,
        });
      }
    }

    // 4. GPS Bypass Status
    if (isEmergencyGpsBypassed) {
      issues.push({
        type: 'SUCCESS',
        title: '비상 GPS 면제 모드 적용 중',
        desc: '위치 오차나 권한 문제와 관계없이 QR/PIN 출석이 즉시 승인됩니다.',
      });
    } else {
      issues.push({
        type: 'WARNING',
        title: 'GPS 100m 엄격 검증 모드',
        desc: '단원 폰의 위치 권한이 꺼져 있거나 지하/건물 밖이면 위치 오류가 발생할 수 있습니다.',
      });
    }

    // 5. Today's Attendance Record
    const todayLogs = logs.filter(
      (l) => l.memberId === diagTargetMember.id && (l.timestamp || '').slice(0, 10) === todayStr
    );
    if (todayLogs.length > 0) {
      const latest = todayLogs[todayLogs.length - 1];
      issues.push({
        type: 'SUCCESS',
        title: '오늘 출결 로그 기록 완료',
        desc: `${latest.timestamp}에 ${latest.authMethod} 방식으로 정상 출석 기록되었습니다.`,
      });
    } else {
      issues.push({
        type: 'WARNING',
        title: '오늘 출결 원천 로그 없음',
        desc: '아직 오늘 세션에 대한 출석 기록이 서버에 접수되지 않았습니다.',
      });
    }

    return issues;
  }, [diagTargetMember, activeTodaySchedule, isEmergencyGpsBypassed, logs, todayStr]);

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
              원천 데이터베이스 조회, 현장 장애 진단 및 시스템 자격 증명 관리
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

        {/* 4-Tab Bar */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
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
              padding: '8px 6px',
              fontSize: '12.5px',
              fontWeight: activeTab === 'AUDIT_LOGS' ? 600 : 400,
              cursor: 'pointer',
              minHeight: '38px',
              textAlign: 'center',
            }}
          >
            원천 로그
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('DIAGNOSTICS')}
            style={{
              background: activeTab === 'DIAGNOSTICS' ? '#334155' : 'transparent',
              color: activeTab === 'DIAGNOSTICS' ? '#FFFFFF' : '#94A3B8',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 6px',
              fontSize: '12.5px',
              fontWeight: activeTab === 'DIAGNOSTICS' ? 600 : 400,
              cursor: 'pointer',
              minHeight: '38px',
              textAlign: 'center',
            }}
          >
            현장 진단
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('CLOUD_INTEGRATION')}
            style={{
              background: activeTab === 'CLOUD_INTEGRATION' ? '#334155' : 'transparent',
              color: activeTab === 'CLOUD_INTEGRATION' ? '#FFFFFF' : '#94A3B8',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 6px',
              fontSize: '12.5px',
              fontWeight: activeTab === 'CLOUD_INTEGRATION' ? 600 : 400,
              cursor: 'pointer',
              minHeight: '38px',
              textAlign: 'center',
            }}
          >
            클라우드
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('SECURITY')}
            style={{
              background: activeTab === 'SECURITY' ? '#334155' : 'transparent',
              color: activeTab === 'SECURITY' ? '#FFFFFF' : '#94A3B8',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 6px',
              fontSize: '12.5px',
              fontWeight: activeTab === 'SECURITY' ? 600 : 400,
              cursor: 'pointer',
              minHeight: '38px',
              textAlign: 'center',
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
            {/* Sub-tab Selector */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
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

            {/* Grid Control Toolbar (Search & Time Series Range) */}
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

            {/* Table View */}
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
        {/* TAB 2: FIELD DIAGNOSTICS & HOTFIX OVERRIDES (Doctor)             */}
        {/* ================================================================ */}
        {activeTab === 'DIAGNOSTICS' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Card 1: Emergency GPS Bypass Switchboard */}
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.85)',
                border: isEmergencyGpsBypassed
                  ? '1px solid rgba(245, 158, 11, 0.5)'
                  : '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '16px 20px',
                boxShadow: isEmergencyGpsBypassed ? '0 0 16px rgba(245, 158, 11, 0.15)' : 'none',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>
                    한시적 GPS 위치 인증 면제 (Emergency GPS Bypass)
                  </h3>
                  <span
                    style={{
                      fontSize: '11.5px',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: isEmergencyGpsBypassed ? '#f59e0b' : '#334155',
                      color: isEmergencyGpsBypassed ? '#0f172a' : '#94a3b8',
                    }}
                  >
                    {isEmergencyGpsBypassed ? '비상 모드 가동 중' : '정상 운영 (100m 검증)'}
                  </span>
                </div>
              </div>

              <p style={{ margin: '0 0 12px', fontSize: '12.5px', color: '#94A3B8', lineHeight: 1.5 }}>
                지하 연습실, 우천 시 GPS 위치 인식이 튀거나 단원들의 브라우저 권한 문제로 출석 실패가 속출할 때 켜두세요.
                활성화 시 <strong>위치 오차나 반경 밖 여부와 관계없이 모든 단원의 QR/PIN 출석이 즉시 승인</strong>됩니다.
                {isEmergencyGpsBypassed && emergencyGpsBypassUntil && (
                  <span style={{ display: 'block', marginTop: '4px', color: '#fbbf24', fontWeight: 500 }}>
                    면제 만료 예정: {emergencyGpsBypassUntil.replace('T', ' ').slice(0, 19)} (KST)
                  </span>
                )}
              </p>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => handleToggleEmergencyGpsBypass(60)}
                  disabled={isProcessing}
                  style={{
                    background: '#d97706',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 14px',
                    fontSize: '12.5px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    minHeight: '36px',
                  }}
                >
                  1시간 동안 GPS 면제 켜기
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleEmergencyGpsBypass(120)}
                  disabled={isProcessing}
                  style={{
                    background: '#b45309',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 14px',
                    fontSize: '12.5px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    minHeight: '36px',
                  }}
                >
                  2시간 동안 GPS 면제 켜기
                </button>
                {isEmergencyGpsBypassed && (
                  <button
                    type="button"
                    onClick={() => handleToggleEmergencyGpsBypass(0)}
                    disabled={isProcessing}
                    style={{
                      background: 'rgba(239, 68, 68, 0.2)',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      color: '#F87171',
                      borderRadius: '6px',
                      padding: '8px 14px',
                      fontSize: '12.5px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      minHeight: '36px',
                    }}
                  >
                    즉시 정상 복원 (면제 끄기)
                  </button>
                )}
              </div>
            </div>

            {/* Card 2: Member Trouble Doctor (단원별 출결/접속 불량 종합 진단기) */}
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.85)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '16px 20px',
              }}
            >
              <h3 style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>
                단원 출결 및 접속 불량 진단기 (Member Trouble Doctor)
              </h3>
              <p style={{ margin: '0 0 14px', fontSize: '12.5px', color: '#94A3B8' }}>
                현장에서 "출석이 안 돼요", "화면이 안 떠요"라고 호소하는 단원의 이름을 검색해 <strong>정확한 원인과 처방</strong>을 즉시 확인합니다.
              </p>

              {/* Member Search & Selector */}
              <div style={{ marginBottom: '14px' }}>
                <input
                  type="text"
                  placeholder="진단할 단원명 또는 파트 검색 (예: 이재현, 베이스)"
                  value={diagMemberSearch}
                  onChange={(e) => setDiagMemberSearch(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(0, 0, 0, 0.3)',
                    color: '#FFFFFF',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    marginBottom: '8px',
                  }}
                />

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {searchedDiagMembers.map((m) => {
                    const isSelected = m.id === selectedMemberIdForDiag;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setSelectedMemberIdForDiag(m.id)}
                        style={{
                          background: isSelected ? '#282C48' : 'rgba(255, 255, 255, 0.05)',
                          color: isSelected ? '#FFFFFF' : '#CBD5E1',
                          border: isSelected ? '1px solid #818CF8' : '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '6px',
                          padding: '5px 10px',
                          fontSize: '12px',
                          fontWeight: isSelected ? 600 : 400,
                          cursor: 'pointer',
                        }}
                      >
                        {m.name} ({m.part})
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Diagnosis Output Card */}
              {diagTargetMember && memberDiagnosis ? (
                <div
                  style={{
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    padding: '14px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>
                        {diagTargetMember.name} 단원 진단 결과
                      </span>
                      <span style={{ fontSize: '12px', color: '#94A3B8' }}>
                        {diagTargetMember.part} · {diagTargetMember.phoneLast4 ? `끝4자리 ${diagTargetMember.phoneLast4}` : '연락처 미등록'}
                      </span>
                    </div>
                  </div>

                  {/* Checklist */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                    {memberDiagnosis.map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '10px',
                          background:
                            item.type === 'ERROR'
                              ? 'rgba(239, 68, 68, 0.1)'
                              : item.type === 'WARNING'
                              ? 'rgba(245, 158, 11, 0.08)'
                              : 'rgba(16, 185, 129, 0.08)',
                          border:
                            item.type === 'ERROR'
                              ? '1px solid rgba(239, 68, 68, 0.25)'
                              : item.type === 'WARNING'
                              ? '1px solid rgba(245, 158, 11, 0.2)'
                              : '1px solid rgba(16, 185, 129, 0.2)',
                          padding: '8px 12px',
                          borderRadius: '6px',
                        }}
                      >
                        <span style={{ fontSize: '13px', marginTop: '1px' }}>
                          {item.type === 'ERROR' ? '🔴' : item.type === 'WARNING' ? '🟡' : '🟢'}
                        </span>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#F8FAFC' }}>
                            {item.title}
                          </div>
                          <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px', lineHeight: 1.4 }}>
                            {item.desc}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Action Prescriptions */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '12px' }}>
                    {diagTargetMember.boundDeviceId && (
                      <button
                        type="button"
                        onClick={() => handleEmergencyUnbindDevice(diagTargetMember.id, diagTargetMember.name)}
                        disabled={isProcessing}
                        style={{
                          background: 'rgba(239, 68, 68, 0.15)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          color: '#F87171',
                          borderRadius: '6px',
                          padding: '6px 12px',
                          fontSize: '12px',
                          fontWeight: 500,
                          cursor: 'pointer',
                        }}
                      >
                        기기 바인딩 즉시 해제 (기기 교체 허용)
                      </button>
                    )}

                    {activeTodaySchedule && (
                      <button
                        type="button"
                        onClick={() => handleManualApproveAttendance(diagTargetMember, activeTodaySchedule)}
                        disabled={isProcessing}
                        style={{
                          background: '#282C48',
                          color: '#FFFFFF',
                          border: '1px solid rgba(255, 255, 255, 0.15)',
                          borderRadius: '6px',
                          padding: '6px 12px',
                          fontSize: '12px',
                          fontWeight: 500,
                          cursor: 'pointer',
                        }}
                      >
                        오늘 세션 수동 출석 인정
                      </button>
                    )}

                    {!isEmergencyGpsBypassed && (
                      <button
                        type="button"
                        onClick={() => handleToggleEmergencyGpsBypass(60)}
                        disabled={isProcessing}
                        style={{
                          background: '#d97706',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '6px 12px',
                          fontSize: '12px',
                          fontWeight: 500,
                          cursor: 'pointer',
                        }}
                      >
                        GPS 면제 모드 1시간 켜기
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '24px', color: '#64748B', fontSize: '13px' }}>
                  위 목록에서 진단할 단원을 클릭하거나 검색하세요.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* TAB 3: CLOUD & SHEETS INTEGRATION (Supabase & GAS Webhook)        */}
        {/* ================================================================ */}
        {activeTab === 'CLOUD_INTEGRATION' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* System Status Overview */}
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '16px 20px',
              }}
            >
              <h3 style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>
                클라우드 파이프라인 상태
              </h3>
              <p style={{ margin: '0 0 14px', fontSize: '12.5px', color: '#94A3B8' }}>
                Supabase 실시간 WebSocket 및 원격 스토리지 동기화 상태를 확인합니다.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <div style={{ fontSize: '11.5px', color: '#94A3B8', marginBottom: '4px' }}>Supabase Realtime</div>
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
                  <div style={{ fontSize: '11.5px', color: '#94A3B8', marginBottom: '4px' }}>원천 로그 건수</div>
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

            {/* Google Sheets Webhook URL */}
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
        {/* TAB 4: SECURITY CREDENTIALS (Compact Width & Eye Toggle)          */}
        {/* ================================================================ */}
        {activeTab === 'SECURITY' && (
          <div style={{ maxWidth: '520px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* PIN 1: 일반 운영진 PIN */}
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
                  6~8자리 숫자
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

            {/* PIN 2: 최고 시스템 관리자 PIN */}
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
                  마스터 전용 (6~8자리)
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
