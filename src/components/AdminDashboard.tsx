import { QRCodeSVG } from 'qrcode.react';
import React, { useMemo, useState } from 'react';
import { setAdminLoggedIn } from '../services/auth';
import { sheetsService } from '../services/sheets';
import type {
  AttendanceStatus,
  Member,
  RawAttendanceLog,
  Schedule,
  ScheduleCategory,
} from '../types/rollbook';
import { expandRecurringSchedules, getCalendarGrid } from '../utils/calendar';
import {
  generateMasterWallQRPayload,
  generateRehearsalQRPayload,
} from '../utils/qr';
import {
  IconCalendar,
  IconClose,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconStats,
  IconSync,
  IconTag,
  IconUsers,
} from './Icons';
import { LiquidGauge } from './LiquidGauge';
import { AdminMatrixGrid } from './AdminMatrixGrid';
import { AdminNotionFilterBar, type AdminFilterState } from './AdminNotionFilterBar';
import { MemberProfileModal } from './MemberProfileModal';
import { LocationPickerMap } from './LocationPickerMap';
import moonchoirLogo from '../assets/moonchoir-logo.png';

interface AdminDashboardProps {
  onBackToHome: () => void;
  onDataChanged: () => void;
}

const DAYS_OF_WEEK = [
  { key: 'MON', label: '월' },
  { key: 'TUE', label: '화' },
  { key: 'WED', label: '수' },
  { key: 'THU', label: '목' },
  { key: 'FRI', label: '금' },
  { key: 'SAT', label: '토' },
  { key: 'SUN', label: '일' },
] as const;

type AdminTab = 'ROSTER' | 'SCHEDULES' | 'STATS' | 'SETTINGS';

function getTodayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function generateRandomPin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function createScheduleId(dateStr: string): string {
  return `sch_${dateStr.replace(/-/g, '')}_${Date.now().toString().slice(-4)}`;
}

function createManualLogMeta(): { id: string; timestamp: string } {
  const now = new Date();
  return {
    id: `log_manual_${now.getTime()}`,
    timestamp: now.toISOString(),
  };
}

function getPeriodRange(periodOption: '1M' | '3M' | '6M' | 'YEAR' | 'ALL') {
  if (periodOption === 'ALL') {
    return { startStr: undefined, endStr: undefined };
  }
  const today = new Date();
  const endStr = today.toISOString().slice(0, 10);
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
  return { startStr: start.toISOString().slice(0, 10), endStr };
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  onBackToHome,
  onDataChanged,
}) => {
  const [adminTab, setAdminTab] = useState<AdminTab>('ROSTER');

  // Member Profile Modal State
  const [selectedMemberForModal, setSelectedMemberForModal] = useState<Member | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [, setMemberRefreshKey] = useState<number>(0);

  // Sub-segments for unified major categories
  const [scheduleSubTab, setScheduleSubTab] = useState<'LIST' | 'QR' | 'SESSION'>('LIST');
  const [settingsSubTab, setSettingsSubTab] = useState<'SHEETS' | 'LOCATIONS' | 'TAXONOMY'>('SHEETS');

  // Schedules & Config
  const schedules = sheetsService.getSchedules();
  const config = sheetsService.getConfig();
  const locationPresets = sheetsService.getLocationPresets();
  const members = sheetsService.getMembers();

  // Member Modal Handlers
  const handleOpenAddMemberModal = () => {
    const newMember: Member = {
      id: `mem_${Date.now().toString().slice(-6)}`,
      name: '',
      part: '소프라노',
      phoneLast4: '',
      role: 'MEMBER',
      status: 'ACTIVE',
      joinedAt: getTodayString(),
      memberStatus: '정단원',
      note: '',
      createdAt: new Date().toISOString(),
    };
    setSelectedMemberForModal(newMember);
    setIsProfileModalOpen(true);
  };

  const handleOpenEditMemberModal = (member: Member) => {
    setSelectedMemberForModal(member);
    setIsProfileModalOpen(true);
  };

  const handleSaveMemberProfile = async (memberData: Member) => {
    const exists = members.some((m) => m.id === memberData.id);
    if (exists) {
      await sheetsService.updateMember(memberData.id, memberData);
      setMemberActionMsg(`단원 [${memberData.name}] 인적사항이 수정되었습니다.`);
    } else {
      await sheetsService.addMember(memberData);
      setMemberActionMsg(`신규 단원 [${memberData.name}]이(가) 등록되었습니다.`);
    }
    setMemberRefreshKey((k) => k + 1);
    onDataChanged();
    setTimeout(() => setMemberActionMsg(''), 3500);
  };

  const handleDeleteMemberProfile = async (memberId: string) => {
    const target = members.find((m) => m.id === memberId);
    await sheetsService.deleteMember(memberId);
    setMemberActionMsg(`단원 [${target?.name || memberId}]이(가) 삭제되었습니다.`);
    setMemberRefreshKey((k) => k + 1);
    onDataChanged();
    setTimeout(() => setMemberActionMsg(''), 3500);
  };

  // --- 0. Universal Matrix Grid State (Notion Filter Bar) ---
  const [matrixFilters, setMatrixFilters] = useState<AdminFilterState>({
    dateStart: '2026-10-01',
    dateEnd: '2026-10-31',
    selectedParts: [],
    selectedStatuses: [],
    searchQuery: '',
  });

  const filteredMatrixSchedules = React.useMemo(() => {
    return schedules.filter(
      (s) => s.date >= matrixFilters.dateStart && s.date <= matrixFilters.dateEnd
    );
  }, [schedules, matrixFilters.dateStart, matrixFilters.dateEnd]);

  const filteredMatrixMembers = React.useMemo(() => {
    return members.filter((m) => {
      if (matrixFilters.selectedParts.length > 0 && !matrixFilters.selectedParts.includes(m.part)) {
        return false;
      }
      if (
        matrixFilters.selectedStatuses.length > 0 &&
        !matrixFilters.selectedStatuses.includes(m.memberStatus || '정단원')
      ) {
        return false;
      }
      if (matrixFilters.searchQuery.trim()) {
        const q = matrixFilters.searchQuery.trim().toLowerCase();
        const matchName = m.name.toLowerCase().includes(q);
        const matchPhone = m.phoneLast4.includes(q);
        const matchNote = m.note?.toLowerCase().includes(q);
        if (!matchName && !matchPhone && !matchNote) return false;
      }
      return true;
    });
  }, [members, matrixFilters]);

  // --- 1. Cumulative Attendance State ---
  const [periodOption, setPeriodOption] = useState<'1M' | '3M' | '6M' | 'YEAR' | 'ALL'>('3M');
  const [partFilter, setPartFilter] = useState<string>('전체');
  const [memberStatusFilter, setMemberStatusFilter] = useState<string>('전체');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());

  const { startStr, endStr } = getPeriodRange(periodOption);
  const { sessions: cumulativeSessions, memberSummaries } =
    sheetsService.calculateCumulativeAttendance(startStr, endStr);

  // Filtered members for cumulative tab
  const filteredSummaries = memberSummaries.filter((m) => {
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

  // Selected Members Multi-comparison Metrics
  const selectedSummaries = memberSummaries.filter((m) => selectedMemberIds.has(m.memberId));
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

  // --- 2. Session Detail State ---
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>(
    schedules[0]?.id || ''
  );
  const currentSchedule =
    schedules.find((s) => s.id === selectedScheduleId) || schedules[0];
  const reconciledList = currentSchedule
    ? sheetsService.reconcileAttendance(currentSchedule.id)
    : [];

  const [sessionFilter, setSessionFilter] = useState<
    '전체' | '출석' | '지각' | '사유결석' | '결석'
  >('전체');

  const filteredSessionList = reconciledList.filter((r) => {
    if (sessionFilter === '전체') return true;
    if (sessionFilter === '출석') return r.finalStatus === '출석' || r.finalStatus === '수동인정';
    return r.finalStatus === sessionFilter;
  });

  // Manual Override Modal
  const [overrideTarget, setOverrideTarget] = useState<{
    id: string;
    name: string;
    part: string;
  } | null>(null);
  const [overrideReason, setOverrideReason] = useState('현장 확인 완료 (배터리 방전)');

  const [memberActionMsg, setMemberActionMsg] = useState('');

  // --- 4. QR & PIN Management State ---
  const [printTitle, setPrintTitle] = useState('🎵 문콰이어 정기연습 출석 QR');
  const [printSubtitle, setPrintSubtitle] = useState('명동 제1연습실 상설 출석부');
  const [printNotice, setPrintNotice] = useState(
    '스마트폰 카메라로 비추거나 문콰이어 앱 [출석하기] 버튼을 눌러 스캔하세요.'
  );
  const [qrMode, setQrMode] = useState<'MASTER' | 'SESSION'>('MASTER');
  const [pinRegenMsg, setPinRegenMsg] = useState('');

  // --- 5. Add Schedule State (Recurring Engine) ---
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState(() => getTodayString());
  const [newStartTime, setNewStartTime] = useState('19:30');
  const [newEndTime, setNewEndTime] = useState('21:30');
  const [selectedLocationPresetId, setSelectedLocationPresetId] = useState<string>(
    locationPresets[0]?.id || 'custom'
  );
  const [newLocName, setNewLocName] = useState(
    locationPresets[0]?.name || '문콰이어 제1연습실 (명동)'
  );
  const [newLat, setNewLat] = useState(locationPresets[0]?.latitude || 37.5665);
  const [newLon, setNewLon] = useState(locationPresets[0]?.longitude || 126.9780);
  const [newRadius, setNewRadius] = useState(locationPresets[0]?.radiusMeters || 100);
  const [newCategory, setNewCategory] = useState<ScheduleCategory>('정기연습');
  const [newDesc, setNewDesc] = useState('');
  const [recurrenceFreq, setRecurrenceFreq] = useState<'NONE' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'>('WEEKLY');
  const [selectedDays, setSelectedDays] = useState<('MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN')[]>(['THU']);
  const [repeatCount, setRepeatCount] = useState<number>(12);
  const [scheduleSuccessMsg, setScheduleSuccessMsg] = useState('');

  // --- 5.1 Admin Interactive Calendar State (SCHEDULES > LIST) ---
  const [adminCalYear, setAdminCalYear] = useState(() => new Date().getFullYear());
  const [adminCalMonth, setAdminCalMonth] = useState(() => new Date().getMonth());
  const [adminSelectedDate, setAdminSelectedDate] = useState<string>(() => getTodayString());

  const handleAdminPrevMonth = () => {
    if (adminCalMonth === 0) {
      setAdminCalMonth(11);
      setAdminCalYear((y) => y - 1);
    } else {
      setAdminCalMonth((m) => m - 1);
    }
  };

  const handleAdminNextMonth = () => {
    if (adminCalMonth === 11) {
      setAdminCalMonth(0);
      setAdminCalYear((y) => y + 1);
    } else {
      setAdminCalMonth((m) => m + 1);
    }
  };

  const adminCalendarGrid = useMemo(() => {
    return getCalendarGrid(adminCalYear, adminCalMonth);
  }, [adminCalYear, adminCalMonth]);

  const schedulesByDate = useMemo(() => {
    const map = new Map<string, Schedule[]>();
    schedules.forEach((s) => {
      const list = map.get(s.date) || [];
      list.push(s);
      map.set(s.date, list);
    });
    return map;
  }, [schedules]);

  const schedulesOnSelectedDate = schedulesByDate.get(adminSelectedDate) || [];

  const handleDeleteSchedule = async (scheduleId: string, title: string) => {
    if (!window.confirm(`정말로 '${title}' 일정을 삭제하시겠습니까?\n구글 스프레드시트에서도 해당 행이 삭제됩니다.`)) {
      return;
    }
    try {
      await sheetsService.deleteSchedule(scheduleId);
      setScheduleSuccessMsg(`'${title}' 일정이 정상적으로 삭제되었습니다.`);
      onDataChanged();
      setTimeout(() => setScheduleSuccessMsg(''), 4000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '일정 삭제 중 오류가 발생했습니다.');
    }
  };

  // --- 6. Settings State ---
  const [sheetsUrl, setSheetsUrl] = useState(config.sheetsWebAppUrl || '');
  const [lateGrace, setLateGrace] = useState(config.lateGraceMinutes || 10);
  const [adminPinInput, setAdminPinInput] = useState(config.adminPin || '1234');
  const [syncStatusMsg, setSyncStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [settingsSuccessMsg, setSettingsSuccessMsg] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  // Dynamic Taxonomy Lists
  const dynamicParts = sheetsService.getParts();
  const dynamicMemberStatuses = sheetsService.getMemberStatuses();
  const dynamicCategories = sheetsService.getCategories();

  // --- 7. Location Presets Tab State ---
  const [presetFormName, setPresetFormName] = useState('');
  const [presetFormAddress, setPresetFormAddress] = useState('');
  const [presetFormDetailAddress, setPresetFormDetailAddress] = useState('');
  const [presetFormEntranceNote, setPresetFormEntranceNote] = useState('');
  const [presetFormLat, setPresetFormLat] = useState<number>(37.5665);
  const [presetFormLon, setPresetFormLon] = useState<number>(126.9780);
  const [presetFormRadius, setPresetFormRadius] = useState<number>(100);
  const [presetFormIsDefault, setPresetFormIsDefault] = useState<boolean>(false);
  const [presetSuccessMsg, setPresetSuccessMsg] = useState<string | null>(null);

  // Edit & Delete Modal States for Locations
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [locationToDelete, setLocationToDelete] = useState<import('../types/rollbook').LocationPreset | null>(null);
  const [, setLocationRefreshKey] = useState<number>(0);

  // --- 8. Taxonomy Dynamic Settings State ---
  const [newPartInput, setNewPartInput] = useState('');
  const [newStatusInput, setNewStatusInput] = useState('');
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [taxSuccessMsg, setTaxSuccessMsg] = useState<string | null>(null);

  // ================= HANDLERS =================
  const handleLogout = () => {
    setAdminLoggedIn(false);
    onBackToHome();
  };

  const resetLocationForm = () => {
    setEditingLocationId(null);
    setPresetFormName('');
    setPresetFormAddress('');
    setPresetFormDetailAddress('');
    setPresetFormEntranceNote('');
    setPresetFormLat(37.5665);
    setPresetFormLon(126.9780);
    setPresetFormRadius(100);
    setPresetFormIsDefault(false);
  };

  const handleStartEditLocation = (loc: import('../types/rollbook').LocationPreset) => {
    setEditingLocationId(loc.id);
    setPresetFormName(loc.name);
    setPresetFormAddress(loc.address || '');
    setPresetFormDetailAddress(loc.detailAddress || '');
    setPresetFormEntranceNote(loc.entranceNote || '');
    setPresetFormLat(loc.latitude);
    setPresetFormLon(loc.longitude);
    setPresetFormRadius(loc.radiusMeters || 100);
    setPresetFormIsDefault(loc.isDefault || false);

    const formEl = document.getElementById('location-preset-form-card');
    if (formEl) {
      formEl.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleSaveLocationPreset = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = presetFormName.trim();
    if (!trimmedName) {
      alert('장소 명칭을 입력해주세요.');
      return;
    }

    if (editingLocationId) {
      await sheetsService.updateLocationPreset(editingLocationId, {
        name: trimmedName,
        address: presetFormAddress.trim(),
        detailAddress: presetFormDetailAddress.trim(),
        entranceNote: presetFormEntranceNote.trim(),
        latitude: presetFormLat,
        longitude: presetFormLon,
        radiusMeters: presetFormRadius,
        isDefault: presetFormIsDefault,
      });
      setPresetSuccessMsg(`'${trimmedName}' 장소 정보가 성공적으로 수정되었습니다.`);
    } else {
      const newPreset: import('../types/rollbook').LocationPreset = {
        id: `loc_${Date.now()}`,
        name: trimmedName,
        address: presetFormAddress.trim(),
        detailAddress: presetFormDetailAddress.trim(),
        entranceNote: presetFormEntranceNote.trim(),
        latitude: presetFormLat,
        longitude: presetFormLon,
        radiusMeters: presetFormRadius,
        isDefault: presetFormIsDefault,
      };
      await sheetsService.addLocationPreset(newPreset);
      setPresetSuccessMsg(`'${trimmedName}' 연습실이 새로 등록되었습니다.`);
    }

    resetLocationForm();
    setLocationRefreshKey((k) => k + 1);
    onDataChanged();
    setTimeout(() => setPresetSuccessMsg(null), 3500);
  };

  const handleConfirmDeleteLocation = async () => {
    if (!locationToDelete) return;
    const targetName = locationToDelete.name;
    await sheetsService.deleteLocationPreset(locationToDelete.id);
    if (editingLocationId === locationToDelete.id) {
      resetLocationForm();
    }
    setLocationToDelete(null);
    setPresetSuccessMsg(`'${targetName}' 장소가 삭제되었습니다.`);
    setLocationRefreshKey((k) => k + 1);
    onDataChanged();
    setTimeout(() => setPresetSuccessMsg(null), 3000);
  };

  // Taxonomy Handlers
  const handleAddPart = () => {
    const val = newPartInput.trim();
    if (!val) return;
    sheetsService.addPart(val);
    setTaxSuccessMsg(`파트 '${val}'이(가) 추가되었습니다.`);
    setNewPartInput('');
    onDataChanged();
    setTimeout(() => setTaxSuccessMsg(null), 3000);
  };

  const handleRemovePart = (part: string) => {
    if (sheetsService.getParts().length <= 1) {
      alert('최소 1개 이상의 파트가 유지되어야 합니다.');
      return;
    }
    sheetsService.removePart(part);
    setTaxSuccessMsg(`파트 '${part}'이(가) 삭제되었습니다.`);
    onDataChanged();
    setTimeout(() => setTaxSuccessMsg(null), 3000);
  };

  const handleAddMemberStatus = () => {
    const val = newStatusInput.trim();
    if (!val) return;
    sheetsService.addMemberStatus(val);
    setTaxSuccessMsg(`회원 상태 '${val}'이(가) 추가되었습니다.`);
    setNewStatusInput('');
    onDataChanged();
    setTimeout(() => setTaxSuccessMsg(null), 3000);
  };

  const handleRemoveMemberStatus = (st: string) => {
    if (sheetsService.getMemberStatuses().length <= 1) {
      alert('최소 1개 이상의 회원 구분이 유지되어야 합니다.');
      return;
    }
    sheetsService.removeMemberStatus(st);
    setTaxSuccessMsg(`회원 상태 '${st}'이(가) 삭제되었습니다.`);
    onDataChanged();
    setTimeout(() => setTaxSuccessMsg(null), 3000);
  };

  const handleAddCategory = () => {
    const val = newCategoryInput.trim();
    if (!val) return;
    sheetsService.addCategory(val);
    setTaxSuccessMsg(`일정 카테고리 '${val}'이(가) 추가되었습니다.`);
    setNewCategoryInput('');
    onDataChanged();
    setTimeout(() => setTaxSuccessMsg(null), 3000);
  };

  const handleRemoveCategory = (cat: string) => {
    if (sheetsService.getCategories().length <= 1) {
      alert('최소 1개 이상의 일정이 유지되어야 합니다.');
      return;
    }
    sheetsService.removeCategory(cat);
    setTaxSuccessMsg(`일정 카테고리 '${cat}'이(가) 삭제되었습니다.`);
    onDataChanged();
    setTimeout(() => setTaxSuccessMsg(null), 3000);
  };

  // Location Preset change in Schedule Creation
  const handleLocationPresetChange = (presetId: string) => {
    setSelectedLocationPresetId(presetId);
    const found = locationPresets.find((l) => l.id === presetId);
    if (found) {
      setNewLocName(found.name);
      setNewLat(found.latitude);
      setNewLon(found.longitude);
      setNewRadius(found.radiusMeters);
    }
  };

  const toggleDaySelection = (dayKey: 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN') => {
    setSelectedDays((prev) => {
      if (prev.includes(dayKey)) {
        if (prev.length === 1) return prev; // At least one day
        return prev.filter((d) => d !== dayKey);
      }
      return [...prev, dayKey];
    });
  };

  // Create Schedule (Single or Recurring Batch)
  const handleCreateScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDate.trim()) return;

    const foundLoc = locationPresets.find((l) => l.id === selectedLocationPresetId);
    const baseSchedule = {
      title: newTitle.trim(),
      date: newDate,
      startTime: newStartTime,
      endTime: newEndTime,
      locationName: newLocName.trim(),
      locationId: foundLoc ? foundLoc.id : undefined,
      detailAddress: foundLoc?.detailAddress,
      entranceNote: foundLoc?.entranceNote,
      targetLat: newLat,
      targetLon: newLon,
      radiusMeters: newRadius,
      category: newCategory,
      description: newDesc.trim() || undefined,
      checkInPin: generateRandomPin(),
    };

    if (recurrenceFreq === 'NONE') {
      const newSch: Schedule = {
        ...baseSchedule,
        id: createScheduleId(newDate),
      };
      await sheetsService.addSchedule(newSch);
      setSelectedScheduleId(newSch.id);
      setScheduleSuccessMsg(`새 일정 [${newSch.title}]이 등록되었습니다.`);
    } else {
      const expanded = expandRecurringSchedules(baseSchedule, {
        frequency: recurrenceFreq,
        byDays: selectedDays,
        count: repeatCount,
      });
      await sheetsService.addSchedules(expanded);
      setSelectedScheduleId(expanded[0]?.id || '');
      setScheduleSuccessMsg(
        `반복 엔진을 통해 ${expanded.length}개 회차의 일정이 일괄 전개되어 캘린더에 생성되었습니다!`
      );
    }

    onDataChanged();
    setTimeout(() => setScheduleSuccessMsg(''), 4000);
  };

  // Manual Override Submit
  const handleManualOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideTarget || !currentSchedule) return;

    const { id, timestamp } = createManualLogMeta();
    const log: RawAttendanceLog = {
      id,
      timestamp,
      scheduleId: currentSchedule.id,
      memberId: overrideTarget.id,
      memberName: overrideTarget.name,
      part: overrideTarget.part,
      authMethod: 'MANUAL_BY_ADMIN',
      isVerifiedLocation: true,
      adminNote: overrideReason.trim(),
    };

    await sheetsService.addCheckInLog(log);
    setOverrideTarget(null);
    setOverrideReason('현장 확인 완료 (배터리 방전)');
    onDataChanged();
  };

  // Master QR Refresh
  const handleRefreshMasterQR = () => {
    const newToken = sheetsService.refreshMasterQrToken();
    onDataChanged();
    setPinRegenMsg(`상설 마스터 QR이 새로운 보안 토큰(${newToken.slice(0, 12)}...)으로 갱신되었습니다.`);
    setTimeout(() => setPinRegenMsg(''), 3000);
  };

  // Regenerate Session PIN
  const handleRegenSessionPin = async () => {
    if (!currentSchedule) return;
    const newPin = generateRandomPin();
    await sheetsService.updateSchedule(currentSchedule.id, { checkInPin: newPin });
    onDataChanged();
    setPinRegenMsg(`오늘 회차 현장 PIN이 [${newPin}]으로 재발급되었습니다.`);
    setTimeout(() => setPinRegenMsg(''), 3000);
  };

  // Save Settings
  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    sheetsService.updateConfig({
      sheetsWebAppUrl: sheetsUrl.trim(),
      lateGraceMinutes: Number(lateGrace),
      adminPin: adminPinInput.trim(),
    });
    setSettingsSuccessMsg('어드민 설정이 성공적으로 저장되었습니다!');
    onDataChanged();
    setTimeout(() => setSettingsSuccessMsg(''), 3000);
  };

  const handleSyncRemote = async () => {
    if (!sheetsUrl.trim()) {
      setSyncStatusMsg({ type: 'error', text: 'Google Apps Script Web App URL을 입력해주세요.' });
      return;
    }
    setIsSyncing(true);
    setSyncStatusMsg(null);
    try {
      const res = await sheetsService.fetchRemoteData(sheetsUrl.trim());
      setSyncStatusMsg({
        type: 'success',
        text: `동기화 성공! 대원 ${res.count?.members ?? 0}명, 일정 ${res.count?.schedules ?? 0}건, 원천 로그 ${res.count?.logs ?? 0}건 수신`,
      });
      onDataChanged();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSyncStatusMsg({ type: 'error', text: `구글 시트 동기화 실패: ${msg}` });
    } finally {
      setIsSyncing(false);
    }
  };

  // Active QR payload
  const activeQrPayload =
    qrMode === 'MASTER'
      ? generateMasterWallQRPayload(config.masterQrToken || 'mq_master_default')
      : currentSchedule
      ? generateRehearsalQRPayload(currentSchedule.id)
      : '';

  return (
    <div className="admin-container">
      {/* Top Header */}
      <header className="admin-header">
        <div className="admin-header-left">
          <button type="button" className="btn-nav-back" onClick={onBackToHome}>
            ← 홈으로
          </button>
          <img
            src={moonchoirLogo}
            alt="Moonchoir"
            style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' }}
          />
          <div>
            <h1 className="admin-title">문콰이어 관리자 센터</h1>
            <p className="admin-subtitle">스마트 출결 통계 분석 및 단원 관리 시스템</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <a
            href="https://docs.google.com/spreadsheets/d/1VYT0HgsrR82ORbd4bxq8doVXvyBvwobgIv3kjE3flX8/edit"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-open-sheet-header"
            title="구글 스프레드시트 열기"
          >
            📊 구글 시트 열기 ↗
          </a>
          <button type="button" className="btn-logout" onClick={handleLogout}>
            로그아웃
          </button>
        </div>
      </header>

      {/* Modern Toss 4 Primary Navigation Tabs */}
      <nav className="admin-subtabs admin-primary-tabs" style={{ display: 'flex', gap: '8px', paddingBottom: '8px' }}>
        <button
          type="button"
          className={`subtab-btn ${adminTab === 'ROSTER' ? 'active' : ''}`}
          onClick={() => setAdminTab('ROSTER')}
        >
          <IconUsers size={18} />
          <span>인적사항 & 출결</span>
        </button>
        <button
          type="button"
          className={`subtab-btn ${adminTab === 'SCHEDULES' ? 'active' : ''}`}
          onClick={() => setAdminTab('SCHEDULES')}
        >
          <IconCalendar size={18} />
          <span>연습관리 (일정·QR)</span>
        </button>
        <button
          type="button"
          className={`subtab-btn ${adminTab === 'STATS' ? 'active' : ''}`}
          onClick={() => setAdminTab('STATS')}
        >
          <IconStats size={18} />
          <span>통계 & 대시보드</span>
        </button>
        <button
          type="button"
          className={`subtab-btn ${adminTab === 'SETTINGS' ? 'active' : ''}`}
          onClick={() => setAdminTab('SETTINGS')}
        >
          <IconSettings size={18} />
          <span>환경설정</span>
        </button>
      </nav>

      {/* Global Feedback Banner */}
      {memberActionMsg && <div className="success-banner">{memberActionMsg}</div>}
      {presetSuccessMsg && <div className="success-banner">{presetSuccessMsg}</div>}
      {taxSuccessMsg && <div className="success-banner">{taxSuccessMsg}</div>}
      {pinRegenMsg && <div className="success-banner">{pinRegenMsg}</div>}

      {/* ============================================================== */}
      {/* TAB 1: [인적사항 & 출결] MATRIX GRID & MEMBER PROFILE MODAL     */}
      {/* ============================================================== */}
      {adminTab === 'ROSTER' && (
        <div className="admin-tab-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <AdminNotionFilterBar
            filters={matrixFilters}
            onChangeFilters={setMatrixFilters}
            availableParts={dynamicParts}
            availableStatuses={dynamicMemberStatuses}
            totalMembersCount={members.length}
            filteredMembersCount={filteredMatrixMembers.length}
            totalSchedulesCount={filteredMatrixSchedules.length}
          />

          <AdminMatrixGrid
            members={filteredMatrixMembers}
            schedules={filteredMatrixSchedules}
            onDataChanged={onDataChanged}
            onSelectMember={handleOpenEditMemberModal}
            onAddNewMember={handleOpenAddMemberModal}
          />

          <MemberProfileModal
            member={selectedMemberForModal}
            isOpen={isProfileModalOpen}
            onClose={() => setIsProfileModalOpen(false)}
            onSave={handleSaveMemberProfile}
            onDelete={handleDeleteMemberProfile}
            schedules={schedules}
            logs={sheetsService.getLogs()}
          />
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 3: [통계 & 대시보드] CUMULATIVE STATS & MULTI-COMPARE     */}
      {/* ============================================================== */}
      {adminTab === 'STATS' && (
        <div className="admin-tab-body">
          {/* 1. Period Selector Chips */}
          <div className="toss-section-card">
            <div className="section-title-row">
              <div>
                <h3 className="section-title">조회 기간 설정</h3>
                <p className="section-subtitle">
                  선택 기간 내 총 {cumulativeSessions.length}회차 연습 기준 누적 통계
                </p>
              </div>
            </div>

            <div className="toss-filter-row" style={{ marginTop: '8px' }}>
              {(
                [
                  { key: '1M', label: '최근 1개월' },
                  { key: '3M', label: '최근 3개월' },
                  { key: '6M', label: '최근 6개월' },
                  { key: 'YEAR', label: '올해 전체' },
                  { key: 'ALL', label: '전체 일정' },
                ] as const
              ).map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={`toss-filter-chip ${periodOption === p.key ? 'active' : ''}`}
                  onClick={() => setPeriodOption(p.key)}
                >
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 2. Multi-Select Target Comparison Card (Appears when >= 1 checked) */}
          {selectedSummaries.length > 0 && (
            <div
              className="toss-section-card"
              style={{
                backgroundColor: 'var(--brand-purple-soft)',
                borderColor: 'var(--brand-accent)',
                borderWidth: '1.5px',
              }}
            >
              <div className="section-title-row" style={{ flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                <div style={{ flex: '1 1 auto', minWidth: '180px' }}>
                  <span
                    className="part-badge"
                    style={{ backgroundColor: 'var(--brand-accent)', color: '#fff', marginBottom: '4px' }}
                  >
                    선택 대원 {selectedSummaries.length}명 비교 분석
                  </span>
                  <h3 className="section-title" style={{ color: '#191f28', marginTop: '4px' }}>
                    선택 그룹 평균 출석률: {selectedAvgRate}%
                  </h3>
                </div>
                <button
                  type="button"
                  className="btn-sync"
                  onClick={clearSelection}
                  style={{ padding: '6px 14px', fontSize: '13px', whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  선택 해제
                </button>
              </div>

              {/* Selected Members Mini Comparison Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                  gap: '8px',
                  marginTop: '12px',
                }}
              >
                {selectedSummaries.map((sm) => (
                  <div
                    key={sm.memberId}
                    style={{
                      background: '#fff',
                      padding: '10px',
                      borderRadius: '12px',
                      border: '1px solid #ECEBFC',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: '6px' }}>
                      <span style={{ fontWeight: 600, fontSize: '13px', color: '#191f28' }}>{sm.memberName}</span>
                      <span className={`part-badge part-${sm.part}`} style={{ fontSize: '10px', padding: '1px 5px' }}>
                        {sm.part}
                      </span>
                    </div>
                    <LiquidGauge percentage={sm.attendanceRate} size={44} />
                    <div style={{ fontSize: '11px', color: '#8b95a1', marginTop: '6px' }}>
                      출석 {sm.attended} · 지각 {sm.late} · 결석 {sm.absent}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. Filter & Search Controls */}
          <div className="toss-section-card">
            <div className="section-title-row">
              <div>
                <h3 className="section-title">대원별 성적표 & 태그 필터</h3>
                <p className="section-subtitle">
                  체크박스로 특정 단원들을 다중 선택하여 비교할 수 있습니다.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  className="btn-sync"
                  style={{ padding: '6px 10px', fontSize: '12px' }}
                  onClick={selectAllFiltered}
                >
                  전체 선택
                </button>
                {selectedMemberIds.size > 0 && (
                  <button
                    type="button"
                    className="btn-sync"
                    style={{ padding: '6px 10px', fontSize: '12px' }}
                    onClick={clearSelection}
                  >
                    초기화
                  </button>
                )}
              </div>
            </div>

            {/* Part Chips (User Voice: 동적 파트 태그 분류 버튼) */}
            <div className="toss-filter-row" style={{ marginBottom: '8px' }}>
              {['전체', ...dynamicParts].map((part) => (
                <button
                  key={part}
                  type="button"
                  className={`toss-filter-chip ${partFilter === part ? 'active' : ''}`}
                  onClick={() => setPartFilter(part)}
                >
                  <span>{part}</span>
                </button>
              ))}
            </div>

            {/* Member Status Chips (User Voice: 동적 단원 구분 분류 버튼) */}
            <div className="toss-filter-row" style={{ marginBottom: '12px' }}>
              {['전체', ...dynamicMemberStatuses].map((status) => (
                <button
                  key={status}
                  type="button"
                  className={`toss-filter-chip ${memberStatusFilter === status ? 'active' : ''}`}
                  onClick={() => setMemberStatusFilter(status)}
                >
                  <span>{status}</span>
                </button>
              ))}
            </div>

            {/* Search Input Box */}
            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                marginBottom: '14px',
              }}
            >
              <span style={{ position: 'absolute', left: '12px', color: '#8b95a1' }}>
                <IconSearch size={18} />
              </span>
              <input
                type="text"
                className="input-text"
                placeholder="대원 이름, 파트, 특이사항 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: '38px', height: '46px' }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: '#8b95a1',
                  }}
                >
                  <IconClose size={16} />
                </button>
              )}
            </div>

            {/* Cumulative Member List Cells */}
            <div className="toss-member-list">
              {filteredSummaries.length > 0 ? (
                filteredSummaries.map((row) => {
                  const isChecked = selectedMemberIds.has(row.memberId);
                  return (
                    <div
                      key={row.memberId}
                      className={`toss-member-item ${isChecked ? 'selected-item' : ''}`}
                      style={{
                        backgroundColor: isChecked ? 'rgba(49, 130, 246, 0.04)' : undefined,
                        cursor: 'pointer',
                      }}
                      onClick={() => toggleSelectMember(row.memberId)}
                    >
                      {/* Checkbox Touch Target */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          paddingRight: '10px',
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelectMember(row.memberId);
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          style={{
                            width: '20px',
                            height: '20px',
                            cursor: 'pointer',
                            accentColor: 'var(--brand-accent)',
                          }}
                        />
                      </div>

                      {/* Member Info */}
                      <div className="toss-member-left">
                        <div className="toss-member-name-row">
                          <span className={`part-badge part-${row.part}`}>{row.part}</span>
                          <span className="toss-member-name">{row.memberName}</span>
                          <span
                            className="status-pill"
                            style={{
                              fontSize: '11px',
                              padding: '2px 6px',
                              backgroundColor:
                                row.memberStatus === '정단원'
                                  ? 'var(--brand-purple-soft)'
                                  : row.memberStatus === '휴단원'
                                  ? '#fff0eb'
                                  : '#f2f4f6',
                              color:
                                row.memberStatus === '정단원'
                                  ? 'var(--brand-accent)'
                                  : row.memberStatus === '휴단원'
                                  ? '#f04452'
                                  : '#4e5968',
                            }}
                          >
                            {row.memberStatus}
                          </span>

                          {row.badges.map((b) => (
                            <span
                              key={b}
                              style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                padding: '2px 6px',
                                borderRadius: '6px',
                                backgroundColor: b === '개근' ? '#10b981' : b === '우수' ? 'var(--brand-accent)' : '#f04452',
                                color: '#fff',
                              }}
                            >
                              {b}
                            </span>
                          ))}
                        </div>

                        <div className="toss-member-meta">
                          <span className="meta-text">
                            출석 <strong>{row.attended}</strong> · 지각 {row.late} · 공결 {row.excused} · 결석{' '}
                            <span style={{ color: row.absent > 0 ? '#f04452' : undefined }}>{row.absent}</span>
                            {row.joinedAt && (
                              <span className="meta-sub"> · {row.joinedAt.slice(0, 7)} 입단</span>
                            )}
                          </span>

                          {row.note && (
                            <div style={{ fontSize: '12px', color: '#6b7684', marginTop: '2px' }}>
                              📝 {row.note}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right: Rate Gauge & Recent Dots */}
                      <div className="toss-member-right" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <LiquidGauge percentage={row.attendanceRate} size={38} />
                        <div style={{ minWidth: '40px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '3px', justifyContent: 'flex-end' }}>
                            {row.recentStatusList.map((st, i) => (
                              <span
                                key={i}
                                title={st}
                                style={{
                                  width: '7px',
                                  height: '7px',
                                  borderRadius: '50%',
                                  backgroundColor:
                                    st === '출석' || st === '수동인정'
                                      ? '#10b981'
                                      : st === '지각'
                                      ? '#f59e0b'
                                      : st === '사유결석'
                                      ? 'var(--brand-accent)'
                                      : '#f04452',
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="toss-empty-list">
                  <p>선택한 조건에 일치하는 대원이 없습니다.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: [연습관리] SCHEDULES, QR & SESSIONS (User Voice Consolidated) */}
      {/* ============================================================== */}
      {adminTab === 'SCHEDULES' && (
        <div className="admin-tab-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Sub-segment Pill Bar */}
          <div className="subsegment-pill-bar">
            <button
              type="button"
              className={`subsegment-pill ${scheduleSubTab === 'LIST' ? 'active' : ''}`}
              onClick={() => setScheduleSubTab('LIST')}
            >
              📅 연습 일정 등록 & 캘린더
            </button>
            <button
              type="button"
              className={`subsegment-pill ${scheduleSubTab === 'QR' ? 'active' : ''}`}
              onClick={() => setScheduleSubTab('QR')}
            >
              🖨️ 상설 QR & 출석 PIN 발급
            </button>
            <button
              type="button"
              className={`subsegment-pill ${scheduleSubTab === 'SESSION' ? 'active' : ''}`}
              onClick={() => setScheduleSubTab('SESSION')}
            >
              🗳️ 회차별 출결 & 사전투표(RSVP)
            </button>
          </div>

          {/* Sub-tab 1: SESSION ATTENDANCE DETAIL & MANUAL OVERRIDE */}
          {scheduleSubTab === 'SESSION' && currentSchedule && (
            <div>
              {/* Rehearsal Selector */}
              <div className="schedule-selector-row">
                <label className="selector-label" htmlFor="schedule-select">
                  관리할 일정 선택:
                </label>
                <select
                  id="schedule-select"
                  className="select-input"
                  value={currentSchedule.id}
                  onChange={(e) => setSelectedScheduleId(e.target.value)}
                >
                  {schedules.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.date} | {s.title} ({s.category})
                    </option>
                  ))}
                </select>
              </div>

              {/* Session Overview Card */}
              <div className="toss-section-card">
                <div className="section-title-row">
                  <div>
                    <h3 className="section-title">{currentSchedule.title}</h3>
                    <p className="section-subtitle">
                      📍 {currentSchedule.locationName} · {currentSchedule.date} ({currentSchedule.startTime}~{currentSchedule.endTime})
                    </p>
                  </div>
                  {currentSchedule.checkInPin && (
                    <div
                      style={{
                        backgroundColor: '#f2f4f6',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        textAlign: 'center',
                      }}
                    >
                      <span style={{ fontSize: '11px', color: '#8b95a1', display: 'block' }}>현장 PIN</span>
                      <span style={{ fontSize: '16px', fontWeight: 700, color: '#191f28', letterSpacing: '2px' }}>
                        {currentSchedule.checkInPin}
                      </span>
                    </div>
                  )}
                </div>

                {/* Part Rate Bars */}
                <div className="toss-part-grid" style={{ marginTop: '12px' }}>
                  {['소프라노', '알토', '테너', '베이스'].map((p) => {
                    const partMembers = reconciledList.filter((r) => r.part === p);
                    const present = partMembers.filter(
                      (r) => r.finalStatus === '출석' || r.finalStatus === '수동인정' || r.finalStatus === '지각'
                    ).length;
                    const rate = partMembers.length > 0 ? Math.round((present / partMembers.length) * 100) : 0;
                    return (
                      <div key={p} className="toss-part-card">
                        <div className="toss-part-header">
                          <span className={`part-badge part-${p}`}>{p}</span>
                          <span className="toss-part-rate">{rate}%</span>
                        </div>
                        <div className="toss-progress-bar">
                          <div className={`toss-progress-fill part-${p}`} style={{ width: `${rate}%` }} />
                        </div>
                        <span className="toss-part-detail">
                          {present}명 / 총 {partMembers.length}명
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Members List */}
              <div className="toss-section-card">
                <div className="toss-filter-row">
                  {(['전체', '출석', '지각', '사유결석', '결석'] as const).map((tabName) => (
                    <button
                      key={tabName}
                      type="button"
                      className={`toss-filter-chip ${sessionFilter === tabName ? 'active' : ''}`}
                      onClick={() => setSessionFilter(tabName)}
                    >
                      <span>{tabName}</span>
                    </button>
                  ))}
                </div>

                <div className="toss-member-list">
                  {filteredSessionList.map((row) => (
                    <div key={row.memberId} className="toss-member-item">
                      <div className="toss-member-left">
                        <div className="toss-member-name-row">
                          <span className={`part-badge part-${row.part}`}>{row.part}</span>
                          <span className="toss-member-name">{row.memberName}</span>
                          {row.isManualOverride && (
                            <span className="toss-manual-tag" title={row.adminNote}>
                              수동인정
                            </span>
                          )}
                        </div>

                        <div className="toss-member-meta">
                          {row.checkInTime ? (
                            <span className="meta-text text-checked">
                              {row.checkInTime.slice(11, 16)} 체크인
                              {row.distanceMeters !== undefined && (
                                <span className="meta-sub">
                                  {' '}· {row.distanceMeters}m ({row.isVerifiedLocation ? '현장인증' : '위치초과'})
                                </span>
                              )}
                            </span>
                          ) : row.rsvpStatus === 'ABSENT' ? (
                            <span className="meta-text text-absent">
                              사전 불참: "{row.rsvpReason || '사유 미작성'}"
                            </span>
                          ) : row.rsvpStatus === 'ATTEND' ? (
                            <span className="meta-text text-attend">사전 참석 투표 완료 (체크인 전)</span>
                          ) : (
                            <span className="meta-text text-unvoted">체크인 기록 없음 · 사전 미투표</span>
                          )}
                        </div>
                      </div>

                      <div className="toss-member-right">
                        <span className={`status-pill status-${getStatusPillClass(row.finalStatus)}`}>
                          {row.finalStatus}
                        </span>

                        {row.finalStatus !== '출석' && row.finalStatus !== '수동인정' && (
                          <button
                            type="button"
                            className="toss-btn-override"
                            onClick={() =>
                              setOverrideTarget({
                                id: row.memberId,
                                name: row.memberName,
                                part: row.part,
                              })
                            }
                          >
                            출석 인정
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Sub-tab 2: PERMANENT MASTER QR & CUSTOM PRINT & ON-SITE PIN */}
          {scheduleSubTab === 'QR' && (
        <div className="qr-print-card">
          {/* Mode Selector */}
          <div className="toss-filter-row" style={{ marginBottom: '14px' }}>
            <button
              type="button"
              className={`toss-filter-chip ${qrMode === 'MASTER' ? 'active' : ''}`}
              onClick={() => setQrMode('MASTER')}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              🏢 벽면 상설 마스터 QR (영구 부착용)
            </button>
            <button
              type="button"
              className={`toss-filter-chip ${qrMode === 'SESSION' ? 'active' : ''}`}
              onClick={() => setQrMode('SESSION')}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              📅 당일 특정 회차 QR
            </button>
          </div>

          {/* On-Site Temporary PIN Banner */}
          {currentSchedule && (
            <div
              className="toss-section-card"
              style={{
                backgroundColor: '#f8f9fa',
                marginBottom: '16px',
                textAlign: 'center',
                padding: '16px',
              }}
            >
              <span style={{ fontSize: '13px', color: '#6b7684' }}>
                외부 연습실 / 임시 출결용 <strong>당일 현장 4자리 PIN</strong>
              </span>
              <div
                style={{
                  fontSize: '32px',
                  fontWeight: 800,
                  color: 'var(--brand-accent)',
                  letterSpacing: '8px',
                  margin: '8px 0',
                }}
              >
                {currentSchedule.checkInPin || '1234'}
              </div>
              <p style={{ fontSize: '12px', color: '#8b95a1', margin: 0 }}>
                * 단원들이 앱의 [현장 PIN 입력] 탭에서 입력하면 GPS 반경 100m 검증 후 정상 출석 처리됩니다.
              </p>
              <button
                type="button"
                className="btn-sync"
                style={{ marginTop: '10px', fontSize: '12px', padding: '6px 12px' }}
                onClick={handleRegenSessionPin}
              >
                PIN 번호 재발급
              </button>
            </div>
          )}

          {/* Printable Frame */}
          <div className="printable-qr-container">
            <h2 className="print-choir-title">{printTitle}</h2>
            <h3 className="print-schedule-title">{printSubtitle}</h3>
            <p className="print-schedule-meta">
              {qrMode === 'MASTER'
                ? '문콰이어 연습실 상설 배치 QR (스캔 시 당일 진행 일정 자동 매칭)'
                : `${currentSchedule?.date} | ${currentSchedule?.title}`}
            </p>

            <div className="printable-qr-frame">
              <QRCodeSVG value={activeQrPayload} size={280} level="H" />
            </div>

            <p className="print-instruction">{printNotice}</p>
          </div>

          {/* Customize Text Form (Naver QR Style) */}
          <div className="admin-form-card" style={{ marginTop: '16px' }}>
            <h3 className="section-title">네이버 QR 스타일 인쇄 문구 커스텀</h3>
            <div className="form-stack">
              <div>
                <label className="form-label">인쇄 상단 타이틀</label>
                <input
                  type="text"
                  className="input-text"
                  value={printTitle}
                  onChange={(e) => setPrintTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="form-label">부제목 및 장소</label>
                <input
                  type="text"
                  className="input-text"
                  value={printSubtitle}
                  onChange={(e) => setPrintSubtitle(e.target.value)}
                />
              </div>
              <div>
                <label className="form-label">안내 문구</label>
                <input
                  type="text"
                  className="input-text"
                  value={printNotice}
                  onChange={(e) => setPrintNotice(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="print-action-row" style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
            {qrMode === 'MASTER' && (
              <button
                type="button"
                className="btn-qr-action-secondary"
                onClick={handleRefreshMasterQR}
              >
                <IconRefresh size={18} />
                <span>마스터 QR 보안 갱신</span>
              </button>
            )}
            <button
              type="button"
              className="btn-qr-action-primary"
              onClick={() => window.print()}
            >
              🖨️ A4 종이 QR 인쇄하기
            </button>
          </div>
        </div>
      )}

          {/* Sub-tab 3: ADD RECURRING SCHEDULE & INTEGRATED CALENDAR */}
          {scheduleSubTab === 'LIST' && (
            <div className="admin-schedules-split-grid">
              {/* Left Column: Interactive Month Calendar & Selected Day Schedules */}
              <div className="admin-calendar-col">
                <div className="admin-form-card" style={{ padding: '20px' }}>
                  <div className="admin-cal-header-row">
                    <div>
                      <h2 className="section-title" style={{ margin: 0 }}>
                        📅 연습 일정 캘린더
                      </h2>
                      <p className="section-subtitle" style={{ margin: '4px 0 0' }}>
                        등록된 총 {schedules.length}건의 일정을 월별로 확인하고 관리합니다.
                      </p>
                    </div>
                    <div className="month-switcher-compact">
                      <button
                        type="button"
                        className="month-arrow-btn"
                        onClick={handleAdminPrevMonth}
                        aria-label="이전 달"
                      >
                        ◀
                      </button>
                      <span className="current-month-label">
                        {adminCalYear}년 {adminCalMonth + 1}월
                      </span>
                      <button
                        type="button"
                        className="month-arrow-btn"
                        onClick={handleAdminNextMonth}
                        aria-label="다음 달"
                      >
                        ▶
                      </button>
                    </div>
                  </div>

                  {/* 7-Col Calendar Grid */}
                  <div className="admin-cal-wrap" style={{ marginTop: '14px' }}>
                    <div className="calendar-grid-weekdays">
                      <span className="weekday-header sun">일</span>
                      <span className="weekday-header">월</span>
                      <span className="weekday-header">화</span>
                      <span className="weekday-header">수</span>
                      <span className="weekday-header">목</span>
                      <span className="weekday-header">금</span>
                      <span className="weekday-header sat">토</span>
                    </div>

                    <div className="calendar-grid-cells">
                      {adminCalendarGrid.map((day) => {
                        const daySchedules = schedulesByDate.get(day.dateStr) || [];
                        const isSelected = day.dateStr === adminSelectedDate;

                        return (
                          <div
                            key={day.dateStr}
                            className={`calendar-cell ${!day.isCurrentMonth ? 'dimmed' : ''} ${day.isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
                            onClick={() => {
                              setAdminSelectedDate(day.dateStr);
                              setNewDate(day.dateStr);
                            }}
                            title={daySchedules.length > 0 ? `${day.dateStr} (${daySchedules.length}건)` : day.dateStr}
                          >
                            <span className="cell-day-num">{day.dayNumber}</span>
                            {daySchedules.length > 0 && (
                              <div className="cell-dots-row">
                                {daySchedules.slice(0, 3).map((s) => (
                                  <span
                                    key={s.id}
                                    className={`schedule-dot cat-${s.category}`}
                                    title={s.title}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Selected Date Schedule List */}
                  <div className="selected-date-schedules-box" style={{ marginTop: '18px' }}>
                    <div className="box-header-row">
                      <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#191f28' }}>
                        📌 {adminSelectedDate} 일정 ({schedulesOnSelectedDate.length}건)
                      </h4>
                      <button
                        type="button"
                        className="btn-quick-new-sch"
                        onClick={() => setNewDate(adminSelectedDate)}
                      >
                        + 이 날짜로 폼 채우기
                      </button>
                    </div>

                    {schedulesOnSelectedDate.length > 0 ? (
                      <div className="admin-selected-sch-list" style={{ marginTop: '10px' }}>
                        {schedulesOnSelectedDate.map((sch) => (
                          <div key={sch.id} className="admin-sch-item-card">
                            <div className="sch-item-info">
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span className="schedule-category-badge">{sch.category}</span>
                                <strong style={{ fontSize: '14px', color: '#191f28' }}>{sch.title}</strong>
                              </div>
                              <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#6b7684' }}>
                                🕒 {sch.startTime} ~ {sch.endTime} · 📍 {sch.locationName}
                              </p>
                              {sch.description && (
                                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#8b95a1' }}>
                                  곡목: {sch.description}
                                </p>
                              )}
                            </div>
                            <button
                              type="button"
                              className="btn-delete-sch-mini"
                              onClick={() => handleDeleteSchedule(sch.id, sch.title)}
                              title="일정 삭제"
                            >
                              🗑️ 삭제
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="empty-subtext" style={{ padding: '16px 0', textAlign: 'center', margin: 0 }}>
                        해당 날짜에 등록된 일정이 없습니다. 우측 폼에서 새 일정을 등록해보세요.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Recurring Schedule Creation Form */}
              <div className="admin-form-col">
                <div className="admin-form-card">
                  <h2 className="section-title">연습 및 연주 일정 등록 (반복 엔진 지원)</h2>
                  <p className="section-subtitle">
                    네이버/애플 캘린더처럼 매주 특정 요일 반복 일정을 손쉽게 전개하여 등록합니다.
                  </p>

                  {scheduleSuccessMsg && <div className="success-banner">{scheduleSuccessMsg}</div>}

                  <form onSubmit={handleCreateScheduleSubmit} className="form-stack">
                    <label className="form-label" htmlFor="sch-title">
                      일정 명칭
                    </label>
                    <input
                      id="sch-title"
                      type="text"
                      className="input-text"
                      placeholder="예: 11월 목요 정기연습"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      required
                    />

                    {/* Recurrence Rule Picker */}
                    <div className="toss-section-card" style={{ padding: '14px', margin: '4px 0' }}>
                      <span className="form-label" style={{ marginBottom: '8px', display: 'block' }}>
                        반복 주기 설정
                      </span>
                      <div className="toss-filter-row" style={{ marginBottom: '10px' }}>
                        {(
                          [
                            { key: 'NONE', label: '반복 없음 (단일 일정)' },
                            { key: 'WEEKLY', label: '매주' },
                            { key: 'BIWEEKLY', label: '격주 (2주)' },
                            { key: 'MONTHLY', label: '매월' },
                          ] as const
                        ).map((rf) => (
                          <button
                            key={rf.key}
                            type="button"
                            className={`toss-filter-chip ${recurrenceFreq === rf.key ? 'active' : ''}`}
                            onClick={() => setRecurrenceFreq(rf.key)}
                          >
                            <span>{rf.label}</span>
                          </button>
                        ))}
                      </div>

                      {recurrenceFreq !== 'NONE' && (
                        <>
                          <label className="form-label" style={{ fontSize: '13px' }}>
                            반복 요일 다중 선택
                          </label>
                          <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                            {DAYS_OF_WEEK.map((d) => {
                              const isSel = selectedDays.includes(d.key);
                              return (
                                <button
                                  key={d.key}
                                  type="button"
                                  onClick={() => toggleDaySelection(d.key)}
                                  style={{
                                    flex: 1,
                                    height: '40px',
                                    borderRadius: '8px',
                                    border: isSel ? '1.5px solid var(--brand-accent)' : '1px solid #e5e8eb',
                                    backgroundColor: isSel ? 'var(--brand-purple-soft)' : '#fff',
                                    color: isSel ? 'var(--brand-accent)' : '#4e5968',
                                    fontWeight: isSel ? 700 : 500,
                                    cursor: 'pointer',
                                  }}
                                >
                                  {d.label}
                                </button>
                              );
                            })}
                          </div>

                          <div className="form-row-2">
                            <div>
                              <label className="form-label">반복 횟수 (회차 전개)</label>
                              <input
                                type="number"
                                min={1}
                                max={52}
                                className="input-text"
                                value={repeatCount}
                                onChange={(e) => setRepeatCount(Number(e.target.value))}
                              />
                              <span className="form-hint">* {repeatCount}개 일정이 자동 일괄 생성됩니다.</span>
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="form-row-2">
                      <div>
                        <label className="form-label" htmlFor="sch-date">
                          시작 기준 날짜
                        </label>
                        <input
                          id="sch-date"
                          type="date"
                          className="input-text"
                          value={newDate}
                          onChange={(e) => {
                            setNewDate(e.target.value);
                            setAdminSelectedDate(e.target.value);
                          }}
                          required
                        />
                      </div>

                      <div>
                        <label className="form-label">일정 구분</label>
                        <select
                          className="select-input"
                          value={newCategory}
                          onChange={(e) => setNewCategory(e.target.value as ScheduleCategory)}
                        >
                          {dynamicCategories.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="form-row-2">
                      <div>
                        <label className="form-label" htmlFor="sch-start">
                          시작 시각
                        </label>
                        <input
                          id="sch-start"
                          type="time"
                          className="input-text"
                          value={newStartTime}
                          onChange={(e) => setNewStartTime(e.target.value)}
                          required
                        />
                      </div>

                      <div>
                        <label className="form-label" htmlFor="sch-end">
                          종료 시각
                        </label>
                        <input
                          id="sch-end"
                          type="time"
                          className="input-text"
                          value={newEndTime}
                          onChange={(e) => setNewEndTime(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    {/* Location Preset Selector */}
                    <div>
                      <label className="form-label">연습실 장소 프리셋</label>
                      <select
                        className="select-input"
                        value={selectedLocationPresetId}
                        onChange={(e) => handleLocationPresetChange(e.target.value)}
                      >
                        {locationPresets.map((loc) => (
                          <option key={loc.id} value={loc.id}>
                            {loc.name} (반경 {loc.radiusMeters}m)
                          </option>
                        ))}
                        <option value="custom">직접 장소명 입력</option>
                      </select>
                    </div>

                    <label className="form-label" htmlFor="sch-loc">
                      연습 장소 명칭
                    </label>
                    <input
                      id="sch-loc"
                      type="text"
                      className="input-text"
                      value={newLocName}
                      onChange={(e) => setNewLocName(e.target.value)}
                      required
                    />

                    <label className="form-label" htmlFor="sch-desc">
                      상세 설명 / 연습 곡목 (선택)
                    </label>
                    <textarea
                      id="sch-desc"
                      className="input-textarea"
                      placeholder="예: 모차르트 레퀴엠 파트 연습 및 암보 런스루"
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                      rows={3}
                    />

                    <button type="submit" className="btn-primary-large">
                      {recurrenceFreq === 'NONE'
                        ? '단일 일정 등록 완료'
                        : `${repeatCount}회차 반복 일정 일괄 생성`}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 4: [환경설정] SETTINGS, LOCATIONS & TAXONOMY (Consolidated) */}
      {/* ============================================================== */}
      {adminTab === 'SETTINGS' && (
        <div className="admin-tab-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Sub-segment Pill Bar */}
          <div className="subsegment-pill-bar">
            <button
              type="button"
              className={`subsegment-pill ${settingsSubTab === 'SHEETS' ? 'active' : ''}`}
              onClick={() => setSettingsSubTab('SHEETS')}
            >
              🔗 구글 스프레드시트 연동
            </button>
            <button
              type="button"
              className={`subsegment-pill ${settingsSubTab === 'LOCATIONS' ? 'active' : ''}`}
              onClick={() => setSettingsSubTab('LOCATIONS')}
            >
              📍 연습실 장소 (GPS 반경)
            </button>
            <button
              type="button"
              className={`subsegment-pill ${settingsSubTab === 'TAXONOMY' ? 'active' : ''}`}
              onClick={() => setSettingsSubTab('TAXONOMY')}
            >
              🏷️ 파트 & 태그 설정
            </button>
          </div>

          {/* Sub-tab: LOCATIONS */}
          {settingsSubTab === 'LOCATIONS' && (
        <div className="admin-form-card">
          <div className="section-title-row">
            <div>
              <h2 className="section-title">연습실 장소 및 GPS 반경 설정</h2>
              <p className="section-subtitle">
                단원이 현장에서 출석 체크할 때 GPS 반경 내에 있는지 검증할 장소를 관리합니다.
              </p>
            </div>
          </div>

          {presetSuccessMsg && (
            <div className="success-banner" style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '10px' }}>
              ✅ {presetSuccessMsg}
            </div>
          )}

          {/* Registered Locations List */}
          <div style={{ marginTop: '16px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: '#191f28' }}>
                등록된 장소 목록 ({locationPresets.length}곳)
              </h3>
              {editingLocationId && (
                <button
                  type="button"
                  onClick={resetLocationForm}
                  style={{ background: 'transparent', border: 'none', color: '#5B3E96', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}
                >
                  ➕ 새 장소 등록하기
                </button>
              )}
            </div>

            {locationPresets.length === 0 ? (
              <p className="empty-hint">등록된 연습실 장소가 없습니다. 아래에서 추가해주세요.</p>
            ) : (
              locationPresets.map((loc) => (
                <div
                  key={loc.id}
                  className={`location-item-card ${loc.isDefault ? 'is-default' : ''}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    padding: '14px 16px',
                    background: editingLocationId === loc.id ? '#F8F5FE' : '#FFFFFF',
                    borderRadius: '12px',
                    border: editingLocationId === loc.id ? '2px solid #5B3E96' : loc.isDefault ? '1.5px solid #5B3E96' : '1px solid #E2E8F0',
                    marginBottom: '10px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0, paddingRight: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '16px', fontWeight: 700, color: '#191f28' }}>
                        {loc.name}
                      </span>
                      {loc.isDefault && (
                        <span className="part-badge" style={{ backgroundColor: '#5B3E96', color: '#fff' }}>
                          기본 연습실
                        </span>
                      )}
                      <span className="status-pill" style={{ backgroundColor: '#F3E8FF', color: '#5B3E96', fontWeight: 600 }}>
                        반경 {loc.radiusMeters}m
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', color: '#4e5968', marginTop: '6px' }}>
                      📍 {loc.address || '주소 정보 없음'}
                    </div>
                    {loc.detailAddress && (
                      <div style={{ fontSize: '12.5px', color: '#6B7280', marginTop: '2px' }}>
                        🏢 상세: {loc.detailAddress}
                      </div>
                    )}
                    {loc.entranceNote && (
                      <div style={{ fontSize: '12.5px', color: '#059669', marginTop: '2px' }}>
                        🚪 입구 안내: {loc.entranceNote}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    <button
                      type="button"
                      className="btn-qr-action-secondary"
                      onClick={() => handleStartEditLocation(loc)}
                      style={{ minHeight: '34px', padding: '0 12px', fontSize: '12.5px', borderRadius: '8px' }}
                    >
                      ✏️ 수정
                    </button>
                    <button
                      type="button"
                      className="btn-qr-action-secondary"
                      onClick={() => setLocationToDelete(loc)}
                      style={{ minHeight: '34px', padding: '0 12px', fontSize: '12.5px', borderRadius: '8px', color: '#EF4444', borderColor: '#FCA5A5' }}
                    >
                      🗑️ 삭제
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Location Add / Edit Form */}
          <div
            id="location-preset-form-card"
            className="toss-section-card"
            style={{
              border: editingLocationId ? '1.5px solid #5B3E96' : '1.5px dashed rgba(92, 83, 219, 0.3)',
              background: editingLocationId ? '#FBF9FF' : '#FAF9FF',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--brand-primary)', margin: 0 }}>
                {editingLocationId ? `✏️ 장소 정보 수정 ('${presetFormName}')` : '➕ 새 연습실 / 공연장 등록'}
              </h3>
              {editingLocationId && (
                <button
                  type="button"
                  onClick={resetLocationForm}
                  style={{ background: 'transparent', border: 'none', color: '#6B7280', fontSize: '12.5px', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  새 등록으로 전환
                </button>
              )}
            </div>

            <form onSubmit={handleSaveLocationPreset} className="form-stack">
              <div>
                <label className="form-label" style={{ fontWeight: 700 }}>장소 명칭 (필수)</label>
                <input
                  type="text"
                  className="modern-input"
                  placeholder="예: 문콰이어 제1연습실 (명동), 예술의전당 체임버홀"
                  value={presetFormName}
                  onChange={(e) => setPresetFormName(e.target.value)}
                  required
                />
              </div>

              {/* Modern Interactive Map with Daum Road Address Search & Radius */}
              <div style={{ marginTop: '8px', marginBottom: '8px' }}>
                <label className="form-label" style={{ fontWeight: 700, marginBottom: '6px' }}>
                  🗺️ 장소 위치 및 출석 인정 반경 설정
                </label>
                <LocationPickerMap
                  lat={presetFormLat}
                  lon={presetFormLon}
                  radius={presetFormRadius}
                  address={presetFormAddress}
                  detailAddress={presetFormDetailAddress}
                  entranceNote={presetFormEntranceNote}
                  onChangeLocation={(lat, lon, addr) => {
                    setPresetFormLat(lat);
                    setPresetFormLon(lon);
                    if (addr) {
                      setPresetFormAddress(addr);
                      if (!presetFormName.trim()) {
                        setPresetFormName(addr.split(' ')[0] || addr);
                      }
                    }
                  }}
                  onChangeDetailAddress={(detail) => setPresetFormDetailAddress(detail)}
                  onChangeEntranceNote={(note) => setPresetFormEntranceNote(note)}
                  onChangeRadius={(r) => setPresetFormRadius(r)}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="chk-default-loc"
                  checked={presetFormIsDefault}
                  onChange={(e) => setPresetFormIsDefault(e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--brand-accent)', cursor: 'pointer' }}
                />
                <label htmlFor="chk-default-loc" style={{ fontSize: '14px', cursor: 'pointer', fontWeight: 600 }}>
                  이 장소를 기본 연습실로 설정 (새 일정 생성 시 기본 선택)
                </label>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <button type="submit" className="btn-primary-large" style={{ minHeight: '44px' }}>
                  {editingLocationId ? '💾 장소 수정사항 저장' : '장소 등록 완료'}
                </button>
                {editingLocationId && (
                  <button
                    type="button"
                    className="btn-secondary-cancel"
                    onClick={resetLocationForm}
                    style={{ minHeight: '44px', padding: '0 20px' }}
                  >
                    수정 취소
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

          {/* Sub-tab: TAXONOMY */}
          {settingsSubTab === 'TAXONOMY' && (
        <div className="admin-form-card">
          <div className="section-title-row">
            <div>
              <h2 className="section-title">카테고리 및 태그 동적 관리</h2>
              <p className="section-subtitle">
                합창단 구성에 맞춰 파트, 단원 구분, 연습 분류 태그를 자유롭게 추가하거나 삭제할 수 있습니다.
              </p>
            </div>
          </div>

          <div className="toss-section-card" style={{ marginTop: '16px' }}>
            <div className="tag-manager-group">
              <div className="tag-manager-title">
                <IconTag size={16} color="var(--brand-accent)" />
                <span>파트 (Parts) 태그 관리</span>
              </div>
              <p className="form-hint" style={{ marginBottom: '8px' }}>
                소프라노, 알토 외에 바리톤, 메조소프라노, 반주자, 지휘자 등을 추가할 수 있습니다.
              </p>
              <div className="tag-chips-wrap">
                {dynamicParts.map((part) => (
                  <span key={part} className="removable-tag-chip">
                    <span>{part}</span>
                    <button
                      type="button"
                      className="tag-remove-btn"
                      onClick={() => handleRemovePart(part)}
                      title={`'${part}' 삭제`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="tag-add-row">
                <input
                  type="text"
                  className="input-text"
                  placeholder="새 파트명 (예: 바리톤, 반주자)"
                  value={newPartInput}
                  onChange={(e) => setNewPartInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddPart())}
                />
                <button type="button" className="btn-sync" onClick={handleAddPart}>
                  추가
                </button>
              </div>
            </div>

            <div className="tag-manager-group">
              <div className="tag-manager-title">
                <IconUsers size={16} color="var(--brand-accent)" />
                <span>단원 구분 (Member Status) 태그 관리</span>
              </div>
              <p className="form-hint" style={{ marginBottom: '8px' }}>
                정단원, 준단원 외에 명예단원, 객원연주자 등을 자유롭게 등록하세요.
              </p>
              <div className="tag-chips-wrap">
                {dynamicMemberStatuses.map((st) => (
                  <span key={st} className="removable-tag-chip">
                    <span>{st}</span>
                    <button
                      type="button"
                      className="tag-remove-btn"
                      onClick={() => handleRemoveMemberStatus(st)}
                      title={`'${st}' 삭제`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="tag-add-row">
                <input
                  type="text"
                  className="input-text"
                  placeholder="새 구분명 (예: 명예단원, 인턴단원)"
                  value={newStatusInput}
                  onChange={(e) => setNewStatusInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddMemberStatus())}
                />
                <button type="button" className="btn-sync" onClick={handleAddMemberStatus}>
                  추가
                </button>
              </div>
            </div>

            <div className="tag-manager-group" style={{ marginBottom: 0 }}>
              <div className="tag-manager-title">
                <IconCalendar size={16} color="var(--brand-accent)" />
                <span>일정 카테고리 (Schedule Category) 태그 관리</span>
              </div>
              <p className="form-hint" style={{ marginBottom: '8px' }}>
                정기연습, 추가연습 외에 워크숍, MT, 정기연주회, 프로필촬영 등을 등록하세요.
              </p>
              <div className="tag-chips-wrap">
                {dynamicCategories.map((cat) => (
                  <span key={cat} className="removable-tag-chip">
                    <span>{cat}</span>
                    <button
                      type="button"
                      className="tag-remove-btn"
                      onClick={() => handleRemoveCategory(cat)}
                      title={`'${cat}' 삭제`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="tag-add-row">
                <input
                  type="text"
                  className="input-text"
                  placeholder="새 카테고리명 (예: 하계MT, 음원녹음)"
                  value={newCategoryInput}
                  onChange={(e) => setNewCategoryInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddCategory())}
                />
                <button type="button" className="btn-sync" onClick={handleAddCategory}>
                  추가
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

          {/* Sub-tab: SHEETS */}
          {settingsSubTab === 'SHEETS' && (
        <div className="admin-form-card">
          <h2 className="section-title">스마트 출결 시스템 환경설정</h2>

          {settingsSuccessMsg && <div className="success-banner">{settingsSuccessMsg}</div>}
          {syncStatusMsg && (
            <div className={syncStatusMsg.type === 'success' ? 'success-banner' : 'error-banner'}>
              {syncStatusMsg.text}
            </div>
          )}

          <form onSubmit={handleSaveSettings} className="form-stack">
            <label className="form-label" htmlFor="sheets-url">
              Google Apps Script Web App URL
            </label>
            <input
              id="sheets-url"
              type="url"
              className="input-text"
              placeholder="https://script.google.com/macros/s/AKfycb.../exec"
              value={sheetsUrl}
              onChange={(e) => setSheetsUrl(e.target.value)}
            />
            <p className="form-hint">
              * 배포된 Apps Script URL을 연동하면 구글 시트와 실시간 양방향 동기화됩니다.
            </p>

            <div className="settings-action-row">
              <button
                type="button"
                className="btn-sync"
                onClick={handleSyncRemote}
                disabled={isSyncing}
              >
                <IconSync size={16} className={isSyncing ? 'spin-icon' : ''} />
                <span>
                  {isSyncing ? '구글 시트와 통신 중...' : '구글 시트 연결 테스트 & 데이터 수신'}
                </span>
              </button>
            </div>

            <div className="form-row-2">
              <div>
                <label className="form-label" htmlFor="late-grace">
                  지각 유예 기준 (분)
                </label>
                <input
                  id="late-grace"
                  type="number"
                  min={0}
                  max={60}
                  className="input-text"
                  value={lateGrace}
                  onChange={(e) => setLateGrace(Number(e.target.value))}
                />
                <span className="form-hint">시작 시간 + n분까지 출석 인정</span>
              </div>

              <div>
                <label className="form-label" htmlFor="admin-pin-cfg">
                  관리자 마스터 PIN 번호
                </label>
                <input
                  id="admin-pin-cfg"
                  type="password"
                  maxLength={8}
                  className="input-text"
                  value={adminPinInput}
                  onChange={(e) => setAdminPinInput(e.target.value)}
                />
                <span className="form-hint">대시보드 진입 4~8자리 비밀번호</span>
              </div>
            </div>

            <button type="submit" className="btn-primary-large">
              설정 저장하기
            </button>
          </form>

          {/* Location Presets View */}
          <div className="toss-section-card" style={{ marginTop: '20px' }}>
            <h3 className="section-title">등록된 연습실 장소 프리셋 ({locationPresets.length}곳)</h3>
            <div className="toss-member-list" style={{ marginTop: '10px' }}>
              {locationPresets.map((loc) => (
                <div key={loc.id} className="toss-member-item">
                  <div className="toss-member-left">
                    <span style={{ fontWeight: 600, fontSize: '15px', color: '#191f28' }}>
                      {loc.name} {loc.isDefault && <span className="part-badge">기본</span>}
                    </span>
                    <span className="meta-text" style={{ fontSize: '12px' }}>
                      {loc.address || '주소 미등록'} {loc.detailAddress ? `· ${loc.detailAddress}` : ''} (인정 반경 {loc.radiusMeters}m)
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn-qr-action-secondary"
                    onClick={() => setSettingsSubTab('LOCATIONS')}
                    style={{ fontSize: '12px', padding: '4px 10px', minHeight: '32px' }}
                  >
                    관리 이동
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )}

      {/* ============================================================== */}
      {/* MODAL: Manual Attendance Override Prompt                       */}
      {/* ============================================================== */}
      {overrideTarget && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <div className="modal-badge">감사 로그 보존형 수동 보정</div>
              <h2 className="modal-title">{overrideTarget.name} 님 출석 인정</h2>
              <p className="modal-desc">
                단원의 원천 출결 데이터를 덮어쓰지 않고, <code>[MANUAL_BY_ADMIN]</code> 감사 로그를 추가하여 출석으로 인정합니다.
              </p>
            </div>

            <form onSubmit={handleManualOverrideSubmit} className="form-stack">
              <label className="form-label" htmlFor="override-reason">
                수동 인정 사유
              </label>
              <input
                id="override-reason"
                type="text"
                className="input-text"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="예: 배터리 방전 확인, 지하 연습실 GPS 오차"
                required
                autoFocus
              />

              <div className="modal-button-group">
                <button type="submit" className="btn-primary-large">
                  출석 인정 확정
                </button>
                <button
                  type="button"
                  className="btn-secondary-cancel"
                  onClick={() => setOverrideTarget(null)}
                >
                  취소
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: Delete Location Confirmation                            */}
      {/* ============================================================== */}
      {locationToDelete && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-card" style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <div className="modal-badge" style={{ color: '#EF4444', borderColor: '#FCA5A5', background: '#FEF2F2' }}>
                장소 삭제 확인
              </div>
              <h2 className="modal-title" style={{ fontSize: '18px', marginTop: '8px' }}>
                '{locationToDelete.name}' 장소를 삭제할까요?
              </h2>
              <p className="modal-desc" style={{ marginTop: '6px', fontSize: '13.5px', color: '#4E5968' }}>
                삭제 시 연습실 목록에서 제거되며, 이 장소를 사용 중인 기존 일정은 기본 좌표를 유지합니다. 계속 진행하시겠습니까?
              </p>
            </div>

            <div className="modal-button-group" style={{ marginTop: '20px', display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn-primary-large"
                style={{ backgroundColor: '#EF4444', minHeight: '44px' }}
                onClick={handleConfirmDeleteLocation}
              >
                삭제하기
              </button>
              <button
                type="button"
                className="btn-secondary-cancel"
                style={{ minHeight: '44px' }}
                onClick={() => setLocationToDelete(null)}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function getStatusPillClass(status: AttendanceStatus): string {
  switch (status) {
    case '출석':
    case '수동인정':
      return 'present';
    case '지각':
      return 'late';
    case '사유결석':
      return 'excused';
    case '결석':
    default:
      return 'absent';
  }
}
