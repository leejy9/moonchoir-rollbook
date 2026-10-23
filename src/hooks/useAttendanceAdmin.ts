import { useMemo, useState } from 'react';
import { sheetsService } from '../services/sheets';
import type {
  Member,
  MemberStatusHistory,
  RawAttendanceLog,
  Schedule,
} from '../types/rollbook';
import { getKSTDateString, getKSTTimestampString } from '../utils/date';
import { resolveManualAttendanceTimestamp } from '../utils/manualAttendance';

export type PeriodOption = '1M' | '3M' | '6M' | 'YEAR' | 'ALL';
export type SessionFilterType = '전체' | '출석' | '지각' | '사유결석' | '결석';

export interface UseAttendanceAdminProps {
  schedules: Schedule[];
  members: Member[];
  onDataChanged: () => void;
  setMemberRefreshKey?: React.Dispatch<React.SetStateAction<number>>;
}

export function getPeriodRange(periodOption: PeriodOption) {
  if (periodOption === 'ALL') {
    return { startStr: undefined, endStr: undefined };
  }
  const today = new Date();
  const endStr = getKSTDateString(today);
  const start = new Date(today);

  if (periodOption === '1M') {
    start.setMonth(start.getMonth() - 1);
  } else if (periodOption === '3M') {
    start.setMonth(start.getMonth() - 3);
  } else if (periodOption === '6M') {
    start.setMonth(start.getMonth() - 6);
  } else if (periodOption === 'YEAR') {
    start.setMonth(0);
    start.setDate(1);
  }
  return { startStr: getKSTDateString(start), endStr };
}

export function createManualLogMeta(): { id: string; timestamp: string } {
  return {
    id: `log_manual_${Date.now()}`,
    timestamp: getKSTTimestampString(),
  };
}

export function useAttendanceAdmin({
  schedules,
  members,
  onDataChanged,
  setMemberRefreshKey,
}: UseAttendanceAdminProps) {
  // --- 1. Member Modal Handlers & State ---
  const [selectedMemberForModal, setSelectedMemberForModal] = useState<Member | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [memberActionMsg, setMemberActionMsg] = useState('');

  const handleOpenAddMemberModal = () => {
    const todayStr = getKSTDateString(new Date());
    const newMember: Member = {
      id: `mem_${Date.now().toString().slice(-6)}`,
      name: '',
      part: '소프라노',
      phoneLast4: '',
      role: 'MEMBER',
      status: 'ACTIVE',
      joinedAt: todayStr,
      memberStatus: '정단원',
      note: '',
      createdAt: getKSTTimestampString(),
    };
    setSelectedMemberForModal(newMember);
    setIsProfileModalOpen(true);
  };

  const handleOpenEditMemberModal = (member: Member) => {
    setSelectedMemberForModal(member);
    setIsProfileModalOpen(true);
  };

  const handleSaveMemberProfile = async (
    memberData: Member,
    historyItem?: MemberStatusHistory
  ) => {
    const exists = members.some((m) => m.id === memberData.id);
    if (exists) {
      await sheetsService.updateMember(memberData.id, memberData, historyItem);
      setMemberActionMsg(
        `단원 [${memberData.name}] 정보가 수정되었습니다.${historyItem ? ' (변경 이력 시트 기록 완료)' : ''}`
      );
    } else {
      await sheetsService.addMember(memberData);
      setMemberActionMsg(`신규 단원 [${memberData.name}]이(가) 등록되었습니다.`);
    }
    if (setMemberRefreshKey) setMemberRefreshKey((k) => k + 1);
    onDataChanged();
    setTimeout(() => setMemberActionMsg(''), 3500);
  };

  const handleDeleteMemberProfile = async (memberId: string) => {
    const target = members.find((m) => m.id === memberId);
    await sheetsService.deleteMember(memberId);
    setMemberActionMsg(`단원 [${target?.name || memberId}]이(가) 삭제되었습니다.`);
    if (setMemberRefreshKey) setMemberRefreshKey((k) => k + 1);
    onDataChanged();
    setTimeout(() => setMemberActionMsg(''), 3500);
  };

  // --- 2. Session Detail State & Reconciled List ---
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>(
    schedules[0]?.id || ''
  );
  const currentSchedule =
    schedules.find((s) => s.id === selectedScheduleId) || schedules[0];
  const reconciledList = currentSchedule
    ? sheetsService.reconcileAttendance(currentSchedule.id)
    : [];

  const [sessionFilter, setSessionFilter] = useState<SessionFilterType>('전체');

  const filteredSessionList = reconciledList.filter((r) => {
    if (sessionFilter === '전체') return true;
    if (sessionFilter === '출석') return r.finalStatus === '출석' || r.finalStatus === '수동인정';
    return r.finalStatus === sessionFilter;
  });

  // Manual Override State & Submit
  const [overrideTarget, setOverrideTargetState] = useState<{
    id: string;
    name: string;
    part: string;
  } | null>(null);
  const [overrideReason, setOverrideReason] = useState('현장 확인 완료 (배터리 방전)');
  const [overrideTime, setOverrideTime] = useState('');
  const [overrideTimeError, setOverrideTimeError] = useState('');

  // 다른 단원을 열거나 창을 닫으면 이전 입력과 오류를 비운다
  const setOverrideTarget: typeof setOverrideTargetState = (target) => {
    setOverrideTargetState(target);
    setOverrideTime('');
    setOverrideTimeError('');
  };

  const handleManualOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideTarget || !currentSchedule) return;

    const { id, timestamp: enteredAt } = createManualLogMeta();
    const resolved = resolveManualAttendanceTimestamp({
      status: '출석',
      schedule: currentSchedule,
      inputTime: overrideTime,
      lateGraceMinutes: sheetsService.getConfig().lateGraceMinutes ?? 10,
      defaultTimestamp: enteredAt,
    });
    if (resolved.error !== undefined) {
      setOverrideTimeError(resolved.error);
      return;
    }
    setOverrideTimeError('');
    const log: RawAttendanceLog = {
      id,
      timestamp: resolved.timestamp,
      scheduleId: currentSchedule.id,
      memberId: overrideTarget.id,
      memberName: overrideTarget.name,
      part: overrideTarget.part as any,
      authMethod: 'MANUAL_BY_ADMIN',
      isVerifiedLocation: true,
      adminNote: overrideReason.trim(),
    };

    await sheetsService.addCheckInLog(log);
    setOverrideTarget(null);
    setOverrideReason('현장 확인 완료 (배터리 방전)');
    setOverrideTime('');
    onDataChanged();
  };

  // --- 3. Cumulative Attendance State ---
  const [periodOption, setPeriodOption] = useState<PeriodOption>('3M');
  const [partFilter, setPartFilter] = useState<string>('전체');
  const [memberStatusFilter, setMemberStatusFilter] = useState<string>('전체');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());

  const { startStr, endStr } = getPeriodRange(periodOption);
  const { sessions: cumulativeSessions, memberSummaries } =
    sheetsService.calculateCumulativeAttendance(startStr, endStr);

  const filteredSummaries = useMemo(() => {
    return memberSummaries.filter((m) => {
      if (partFilter !== '전체' && m.part !== partFilter) return false;
      if (memberStatusFilter !== '전체' && m.memberStatus !== memberStatusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = m.memberName.toLowerCase().includes(q);
        const matchPart = m.part.toLowerCase().includes(q);
        const matchNote = m.note?.toLowerCase().includes(q);
        if (!matchName && !matchPart && !matchNote) return false;
      }
      return true;
    });
  }, [memberSummaries, partFilter, memberStatusFilter, searchQuery]);

  const selectedSummaries = useMemo(() => {
    return memberSummaries.filter((m) => selectedMemberIds.has(m.memberId));
  }, [memberSummaries, selectedMemberIds]);

  const selectedAvgRate =
    selectedSummaries.length > 0
      ? Math.round(
          selectedSummaries.reduce((sum, item) => sum + item.attendanceRate, 0) /
            selectedSummaries.length
        )
      : 0;

  const toggleSelectMember = (id: string) => {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedMemberIds(new Set(filteredSummaries.map((m) => m.memberId)));
  };

  const clearSelection = () => {
    setSelectedMemberIds(new Set());
  };

  return {
    // Member Modal State & Handlers
    selectedMemberForModal,
    setSelectedMemberForModal,
    isProfileModalOpen,
    setIsProfileModalOpen,
    memberActionMsg,
    setMemberActionMsg,
    handleOpenAddMemberModal,
    handleOpenEditMemberModal,
    handleSaveMemberProfile,
    handleDeleteMemberProfile,

    // Session Attendance & Manual Override
    selectedScheduleId,
    setSelectedScheduleId,
    currentSchedule,
    reconciledList,
    sessionFilter,
    setSessionFilter,
    filteredSessionList,
    overrideTarget,
    setOverrideTarget,
    overrideReason,
    setOverrideReason,
    overrideTime,
    setOverrideTime,
    overrideTimeError,
    currentScheduleStartTime: currentSchedule?.startTime,
    handleManualOverrideSubmit,

    // Cumulative Stats & Filters
    periodOption,
    setPeriodOption,
    partFilter,
    setPartFilter,
    memberStatusFilter,
    setMemberStatusFilter,
    searchQuery,
    setSearchQuery,
    selectedMemberIds,
    setSelectedMemberIds,
    cumulativeSessions,
    memberSummaries,
    filteredSummaries,
    selectedSummaries,
    selectedAvgRate,
    toggleSelectMember,
    selectAllFiltered,
    clearSelection,
  };
}
