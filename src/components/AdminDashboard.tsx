import { QRCodeSVG } from 'qrcode.react';
import React, { useMemo, useState } from 'react';
import { setAdminLoggedIn } from '../services/auth';
import { sheetsService } from '../services/sheets';
import type {
  AttendanceStatus,
  LocationPreset,
  PartType,
  ProgramCard,
  Schedule,
  ScheduleCategory,
  TargetAudienceType,
} from '../types/rollbook';
import {
  getCalendarGrid,
} from '../utils/calendar';
import {
  generateMasterWallQRPayload,
} from '../utils/qr';
import {
  IconCalendar,
  IconRefresh,
  IconSettings,
  IconStats,
  IconSync,
  IconTag,
  IconUsers,
} from './Icons';
import { LocationPickerMap } from './LocationPickerMap';
import { LocationPickerModal } from './LocationPickerModal';
import { BatchScheduleEditModal } from './BatchScheduleEditModal';
import { AdminAttendanceTab } from './admin/AdminAttendanceTab';
import { AdminProgramCardForm } from './admin/AdminProgramCardForm';
import { AdminScheduleForm } from './admin/AdminScheduleForm';
import { AdminCalendarView } from './admin/AdminCalendarView';
import { AdminScheduleListView } from './admin/AdminScheduleListView';
import { AdminProgramCardsView } from './admin/AdminProgramCardsView';
import { AdminStatsTab } from './admin/AdminStatsTab';
import { useScheduleAdmin } from '../hooks/useScheduleAdmin';
import { useAttendanceAdmin } from '../hooks/useAttendanceAdmin';
import moonchoirLogo from '../assets/moonchoir-logo.png';

interface AdminDashboardProps {
  onBackToHome: () => void;
  onDataChanged: () => void;
  refreshTrigger?: number;
}

type AdminTab = 'ROSTER' | 'SCHEDULES' | 'STATS' | 'SETTINGS';

function getTodayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  onBackToHome,
  onDataChanged,
  refreshTrigger,
}) => {
  const [adminTab, setAdminTab] = useState<AdminTab>('ROSTER');

  // Sub-segments for unified major categories
  const [scheduleSubTab, setScheduleSubTab] = useState<'LIST' | 'QR' | 'SESSION'>('LIST');
  const [settingsSubTab, setSettingsSubTab] = useState<'SHEETS' | 'LOCATIONS' | 'TAXONOMY'>('SHEETS');

  // Schedules & Config (reactive to refreshTrigger)
  const schedules = useMemo(() => {
    void refreshTrigger;
    return sheetsService.getSchedules();
  }, [refreshTrigger]);
  const config = useMemo(() => {
    void refreshTrigger;
    return sheetsService.getConfig();
  }, [refreshTrigger]);
  const locationPresets = useMemo(() => {
    void refreshTrigger;
    return sheetsService.getLocationPresets();
  }, [refreshTrigger]);
  const members = useMemo(() => {
    void refreshTrigger;
    return sheetsService.getMembers();
  }, [refreshTrigger]);
  const programCards = useMemo(() => {
    void refreshTrigger;
    return sheetsService.getProgramCards();
  }, [refreshTrigger]);

  // --- Attendance & Member Administration (useAttendanceAdmin Hook) ---
  const {
    selectedMemberForModal,
    isProfileModalOpen,
    setIsProfileModalOpen,
    memberActionMsg,
    handleOpenAddMemberModal,
    handleOpenEditMemberModal,
    handleSaveMemberProfile,
    handleDeleteMemberProfile,
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
    handleManualOverrideSubmit,
    periodOption,
    setPeriodOption,
    partFilter,
    setPartFilter,
    memberStatusFilter,
    setMemberStatusFilter,
    searchQuery,
    setSearchQuery,
    selectedMemberIds,
    cumulativeSessions,
    filteredSummaries,
    selectedSummaries,
    selectedAvgRate,
    toggleSelectMember,
    selectAllFiltered,
    clearSelection,
  } = useAttendanceAdmin({
    schedules,
    members,
    onDataChanged,
  });

  // --- 4. QR & PIN Management State ---
  const choirConfig = sheetsService.getConfig();
  const defaultLoc = locationPresets.find((l) => l.isDefault) || locationPresets[0];
  const defaultLocName = defaultLoc?.name || '문콰이어 연습실';

  const [printTitle, setPrintTitle] = useState(
    () => choirConfig.qrPrintTitle || (choirConfig.choirName ? `🎵 ${choirConfig.choirName} 출석 QR` : '🎵 문콰이어 정기연습 출석 QR')
  );
  const [printSubtitle, setPrintSubtitle] = useState(
    () => choirConfig.qrPrintSubtitle || `${defaultLocName} 상설 출석부`
  );
  const [printNotice, setPrintNotice] = useState(
    () => choirConfig.qrPrintNotice || '스마트폰 카메라로 비추거나 문콰이어 앱 [출석하기] 버튼을 눌러 스캔하세요.'
  );
  const [qrTextSavedMsg, setQrTextSavedMsg] = useState(false);
  const [pinRegenMsg, setPinRegenMsg] = useState('');

  // --- 5. Add Schedule State & Operations (useScheduleAdmin Hook) ---
  const [isScheduleLocationModalOpen, setIsScheduleLocationModalOpen] = useState(false);
  const [showArchivedSchedules, setShowArchivedSchedules] = useState(false);

  const {
    rightPanelMode,
    setRightPanelMode,
    editingScheduleForForm,
    setEditingScheduleForForm,
    editingProgramCard,
    setEditingProgramCard,
    selectedProgramCardId,
    scheduleSuccessMsg,
    setScheduleSuccessMsg,
    scheduleViewTab,
    setScheduleViewTab,
    selectedBatchScheduleIds,
    setSelectedBatchScheduleIds,
    isBatchScheduleEditModalOpen,
    setIsBatchScheduleEditModalOpen,
    scheduleToDelete,
    setScheduleToDelete,
    forceHardDeleteSelected,
    setForceHardDeleteSelected,
    cardGroupToDelete,
    setCardGroupToDelete,
    handleOpenCreateProgramCard,
    handleOpenEditProgramCard,
    handleBindScheduleToForm,
    handleCloneScheduleToForm,
    handleSaveScheduleFromForm,
    handleSaveProgramCard,
    handleDeleteScheduleSingle,
    handleDeleteScheduleSeries,
    handleRestoreScheduleSingle,
    handleDeleteSchedule,
    handleApplyBatchScheduleUpdates,
    handleBatchDeleteSelected,
    handleToggleSelectSchedule,
    handleSelectAllSchedules,
    handleToggleArchiveSchedule,
    handleBatchArchiveSelected,
    handleToggleArchiveGroup,
    handleDuplicateSelectedSeries,
  } = useScheduleAdmin({
    schedules,
    programCards,
    onDataChanged,
    setSelectedScheduleId,
  });

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

  const [showCancelledSchedules, setShowCancelledSchedules] = useState(false);

  const schedulesByDate = useMemo(() => {
    const map = new Map<string, Schedule[]>();
    schedules.forEach((s) => {
      const list = map.get(s.date) || [];
      list.push(s);
      map.set(s.date, list);
    });
    return map;
  }, [schedules]);

  // 활성(Active) 일정만 필터링한 맵 (달력 날짜 셀 도트 표시용 - 취소된 일정은 도트 제외)
  const activeSchedulesByDate = useMemo(() => {
    const map = new Map<string, Schedule[]>();
    schedules.forEach((s) => {
      if (s.isCancelled) return;
      const list = map.get(s.date) || [];
      list.push(s);
      map.set(s.date, list);
    });
    return map;
  }, [schedules]);

  const schedulesOnSelectedDate = useMemo(() => {
    const list = schedulesByDate.get(adminSelectedDate) || [];
    if (showCancelledSchedules) return list;
    return list.filter((s) => !s.isCancelled);
  }, [schedulesByDate, adminSelectedDate, showCancelledSchedules]);



  // 일정 카드(Program Card) 컨테이너 그룹핑 (시트 DB 카드 + 미분류 일정)
  const programGroups = useMemo(() => {
    const cards = sheetsService.getProgramCards();
    const groups = new Map<string, {
      cardId: string;
      title: string;
      category: ScheduleCategory;
      description?: string;
      locationName: string;
      startTime: string;
      endTime: string;
      targetAudienceType?: TargetAudienceType;
      targetParts?: PartType[];
      targetMemberIds?: string[];
      schedules: Schedule[];
      startDate: string;
      endDate: string;
      isArchived: boolean;
      isRegisteredCard: boolean;
      rawCard?: ProgramCard;
    }>();

    // 1. 등록된 카드들 먼저 세팅
    for (const card of cards) {
      if (!showArchivedSchedules && card.isArchived) continue;
      const cardLoc = locationPresets.find((l) => l.id === card.defaultLocationId);
      groups.set(card.id, {
        cardId: card.id,
        title: card.title,
        category: card.category,
        description: card.description,
        locationName: cardLoc?.name || defaultLocName,
        startTime: card.defaultStartTime || '19:30',
        endTime: card.defaultEndTime || '21:30',
        targetAudienceType: card.targetAudienceType || 'ALL',
        targetParts: card.targetParts,
        targetMemberIds: card.targetMemberIds,
        schedules: [],
        startDate: '',
        endDate: '',
        isArchived: Boolean(card.isArchived),
        isRegisteredCard: true,
        rawCard: card,
      });
    }

    // 2. 일정들을 카드에 매핑 또는 독립 그룹으로 수납
    for (const sch of schedules) {
      if (!showArchivedSchedules && sch.isArchived) continue;
      let key = sch.programId;
      if (!key || !groups.has(key)) {
        key = sch.programId || sch.seriesId || sch.title;
      }
      if (!groups.has(key)) {
        groups.set(key, {
          cardId: key,
          title: sch.title,
          category: sch.category,
          description: sch.description,
          locationName: sch.locationName,
          startTime: sch.startTime,
          endTime: sch.endTime,
          targetAudienceType: sch.targetAudienceType || 'ALL',
          targetParts: sch.targetParts,
          targetMemberIds: sch.targetMemberIds,
          schedules: [],
          startDate: sch.date,
          endDate: sch.date,
          isArchived: Boolean(sch.isArchived),
          isRegisteredCard: false,
        });
      }
      const g = groups.get(key)!;
      g.schedules.push(sch);
      if (!g.startDate || sch.date < g.startDate) g.startDate = sch.date;
      if (!g.endDate || sch.date > g.endDate) g.endDate = sch.date;
    }

    return Array.from(groups.values()).map((g) => {
      g.schedules.sort((a, b) => a.date.localeCompare(b.date));
      return g;
    });
  }, [schedules, showArchivedSchedules, locationPresets, defaultLocName]);


  const handleAddNewLocationPresetFromModal = async (newPreset: LocationPreset) => {
    await sheetsService.addLocationPreset(newPreset);
    setIsScheduleLocationModalOpen(false);
    setScheduleSuccessMsg(`새 연습실 [${newPreset.name}]이 등록되었습니다.`);
    onDataChanged();
    setTimeout(() => setScheduleSuccessMsg(''), 4000);
  };

  const handleSaveQrPrintSettings = async () => {
    await sheetsService.updateConfig({
      qrPrintTitle: printTitle,
      qrPrintSubtitle: printSubtitle,
      qrPrintNotice: printNotice,
    });
    setQrTextSavedMsg(true);
    setTimeout(() => setQrTextSavedMsg(false), 3000);
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

    const isDefaultCoords = Math.abs(presetFormLat - 37.5665) < 0.0001 && Math.abs(presetFormLon - 126.9780) < 0.0001;
    if (presetFormAddress.trim() && isDefaultCoords && !presetFormAddress.includes('명동')) {
      alert('📍 지도 검색 또는 현재 위치 설정을 통해 실제 좌표를 지정해주세요.\n(기본 서울 명동 좌표로 잘못 저장되지 않도록 보호합니다.)');
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

  // Master QR Refresh
  const handleRefreshMasterQR = () => {
    const newToken = sheetsService.refreshMasterQrToken();
    onDataChanged();
    setPinRegenMsg(`상설 마스터 QR이 새로운 보안 토큰(${newToken.slice(0, 12)}...)으로 갱신되었습니다.`);
    setTimeout(() => setPinRegenMsg(''), 3000);
  };

  // Regenerate Session PIN
  const handleRegenSessionPin = async () => {
    const newPin = sheetsService.refreshActiveOnSitePin();
    if (currentSchedule) {
      await sheetsService.updateSchedule(currentSchedule.id, { checkInPin: newPin });
    }
    onDataChanged();
    setPinRegenMsg(`당일 현장 PIN이 [${newPin}]으로 재발급되었습니다.`);
    setTimeout(() => setPinRegenMsg(''), 3000);
  };

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSyncing(true);
    try {
      await sheetsService.updateConfig({
        sheetsWebAppUrl: sheetsUrl.trim(),
        lateGraceMinutes: Number(lateGrace),
        adminPin: adminPinInput.trim(),
      });
      setSettingsSuccessMsg('어드민 설정이 성공적으로 저장되었습니다 (구글 시트 동기화 완료)!');
      onDataChanged();
      setTimeout(() => setSettingsSuccessMsg(''), 3000);
    } catch (err: unknown) {
      console.error('[AdminDashboard] Failed to save settings:', err);
      setSettingsSuccessMsg('설정 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSyncing(false);
    }
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

  // Unified Master Wall QR payload
  const activeQrPayload = generateMasterWallQRPayload(
    config.masterQrToken || 'mq_master_default'
  );

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
        <AdminAttendanceTab
          members={members}
          schedules={schedules}
          onDataChanged={onDataChanged}
          dynamicParts={dynamicParts}
          dynamicMemberStatuses={dynamicMemberStatuses}
          selectedMemberForModal={selectedMemberForModal}
          isProfileModalOpen={isProfileModalOpen}
          setIsProfileModalOpen={setIsProfileModalOpen}
          handleOpenAddMemberModal={handleOpenAddMemberModal}
          handleOpenEditMemberModal={handleOpenEditMemberModal}
          handleSaveMemberProfile={handleSaveMemberProfile}
          handleDeleteMemberProfile={handleDeleteMemberProfile}
        />
      )}

      {/* ============================================================== */}
      {/* TAB 3: [통계 & 대시보드] CUMULATIVE STATS & MULTI-COMPARE     */}
      {/* ============================================================== */}
      {adminTab === 'STATS' && (
        <AdminStatsTab
          periodOption={periodOption}
          setPeriodOption={setPeriodOption}
          partFilter={partFilter}
          setPartFilter={setPartFilter}
          memberStatusFilter={memberStatusFilter}
          setMemberStatusFilter={setMemberStatusFilter}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          selectedMemberIds={selectedMemberIds}
          cumulativeSessions={cumulativeSessions}
          filteredSummaries={filteredSummaries}
          selectedSummaries={selectedSummaries}
          selectedAvgRate={selectedAvgRate}
          toggleSelectMember={toggleSelectMember}
          selectAllFiltered={selectAllFiltered}
          clearSelection={clearSelection}
          dynamicParts={dynamicParts}
          dynamicMemberStatuses={dynamicMemberStatuses}
        />
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
              🖨️ 출석 QR 코드
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

          {/* Sub-tab 2: 출석 QR 코드 & 현장 PIN 보조 */}
          {scheduleSubTab === 'QR' && (
            <div className="qr-print-card">
              <div style={{ marginBottom: '16px' }}>
                <h2 className="section-title" style={{ margin: 0 }}>출석 QR 코드</h2>
                <p className="section-subtitle" style={{ margin: '4px 0 0' }}>
                  연습실 벽면 부착 및 스크린 디스플레이용 QR 코드입니다. 단원들이 스캔하면 진행 중인 일정으로 자동 매칭되어 즉시 출석 체크됩니다.
                </p>
              </div>

              {/* Printable Frame */}
              <div className="printable-qr-container">
                <h2 className="print-choir-title">{printTitle}</h2>
                <h3 className="print-schedule-title">{printSubtitle}</h3>

                <div className="printable-qr-frame">
                  <QRCodeSVG value={activeQrPayload} size={280} level="H" />
                </div>

                <p className="print-instruction">{printNotice}</p>
              </div>

              {/* Slim 1-line Universal On-Site PIN Assistance Card */}
              <div
                style={{
                  marginTop: '16px',
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '12px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '13px', color: '#475569', fontWeight: 600 }}>
                    🔑 당일 현장 출석 PIN:
                  </span>
                  <span
                    style={{
                      fontSize: '22px',
                      fontWeight: 800,
                      color: 'var(--brand-accent)',
                      letterSpacing: '4px',
                      background: '#EEF2FF',
                      padding: '2px 12px',
                      borderRadius: '8px',
                    }}
                  >
                    {sheetsService.getActiveOnSitePin() || currentSchedule?.checkInPin || '5027'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {pinRegenMsg && (
                    <span style={{ fontSize: '11.5px', color: '#059669', fontWeight: 600 }}>
                      {pinRegenMsg}
                    </span>
                  )}
                  <button
                    type="button"
                    className="btn-sync"
                    style={{ fontSize: '12px', padding: '5px 10px', margin: 0 }}
                    onClick={handleRegenSessionPin}
                  >
                    🔄 PIN 재발급
                  </button>
                </div>
              </div>

              {/* Customize Text Form (Naver QR Style) */}
              <div className="admin-form-card" style={{ marginTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h3 className="section-title" style={{ margin: 0 }}>출석 QR 인쇄 문구 커스텀</h3>
                  <button
                    type="button"
                    onClick={handleSaveQrPrintSettings}
                    style={{
                      background: '#4F46E5',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '6px 14px',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <span>💾 문구 영구 저장</span>
                  </button>
                </div>
                {qrTextSavedMsg && (
                  <div className="success-banner" style={{ marginBottom: '12px', fontSize: '13px' }}>
                    ✅ QR 인쇄 문구가 저장되었습니다. 페이지를 새로고침해도 유지됩니다.
                  </div>
                )}
                <div className="form-stack">
                  <div>
                    <label className="form-label">인쇄 상단 타이틀</label>
                    <input
                      type="text"
                      className="input-text"
                      value={printTitle}
                      onChange={(e) => {
                        setPrintTitle(e.target.value);
                        sheetsService.updateConfig({ qrPrintTitle: e.target.value });
                      }}
                    />
                  </div>
                  <div>
                    <label className="form-label">부제목 및 장소</label>
                    <input
                      type="text"
                      className="input-text"
                      value={printSubtitle}
                      onChange={(e) => {
                        setPrintSubtitle(e.target.value);
                        sheetsService.updateConfig({ qrPrintSubtitle: e.target.value });
                      }}
                    />
                  </div>
                  <div>
                    <label className="form-label">안내 문구</label>
                    <input
                      type="text"
                      className="input-text"
                      value={printNotice}
                      onChange={(e) => {
                        setPrintNotice(e.target.value);
                        sheetsService.updateConfig({ qrPrintNotice: e.target.value });
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="print-action-row" style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                <button
                  type="button"
                  className="btn-qr-action-secondary"
                  onClick={handleRefreshMasterQR}
                >
                  <IconRefresh size={18} />
                  <span>마스터 QR 보안 갱신</span>
                </button>
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
                  {/* View Mode Switcher */}
                  <div
                    style={{
                      display: 'flex',
                      gap: '8px',
                      marginBottom: '16px',
                      background: '#F1F5F9',
                      padding: '4px',
                      borderRadius: '10px',
                      width: 'fit-content',
                    }}
                  >
                    <button
                      type="button"
                      className={`btn-sub-tab ${scheduleViewTab === 'CALENDAR' ? 'active' : ''}`}
                      onClick={() => {
                        setScheduleViewTab('CALENDAR');
                        setRightPanelMode('SCHEDULE_FORM');
                      }}
                      style={{
                        minHeight: '36px',
                        padding: '0 16px',
                        fontSize: '13px',
                        fontWeight: 700,
                        border: 'none',
                        borderRadius: '8px',
                        background: scheduleViewTab === 'CALENDAR' ? '#FFFFFF' : 'transparent',
                        color: scheduleViewTab === 'CALENDAR' ? '#1E293B' : '#64748B',
                        boxShadow: scheduleViewTab === 'CALENDAR' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        cursor: 'pointer',
                      }}
                    >
                      📅 캘린더 날짜별 보기
                    </button>
                    <button
                      type="button"
                      className={`btn-sub-tab ${scheduleViewTab === 'ALL_LIST' ? 'active' : ''}`}
                      onClick={() => {
                        setScheduleViewTab('ALL_LIST');
                        setRightPanelMode('SCHEDULE_FORM');
                      }}
                      style={{
                        minHeight: '36px',
                        padding: '0 16px',
                        fontSize: '13px',
                        fontWeight: 700,
                        border: 'none',
                        borderRadius: '8px',
                        background: scheduleViewTab === 'ALL_LIST' ? '#FFFFFF' : 'transparent',
                        color: scheduleViewTab === 'ALL_LIST' ? '#1E293B' : '#64748B',
                        boxShadow: scheduleViewTab === 'ALL_LIST' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        cursor: 'pointer',
                      }}
                    >
                      📋 전체 등록 일정
                    </button>
                    <button
                      type="button"
                      className={`btn-sub-tab ${scheduleViewTab === 'PROGRAM_CARDS' ? 'active' : ''}`}
                      onClick={() => {
                        setScheduleViewTab('PROGRAM_CARDS');
                        setRightPanelMode('CARD_FORM');
                      }}
                      style={{
                        minHeight: '36px',
                        padding: '0 16px',
                        fontSize: '13px',
                        fontWeight: 700,
                        border: 'none',
                        borderRadius: '8px',
                        background: scheduleViewTab === 'PROGRAM_CARDS' ? '#FFFFFF' : 'transparent',
                        color: scheduleViewTab === 'PROGRAM_CARDS' ? '#1E293B' : '#64748B',
                        boxShadow: scheduleViewTab === 'PROGRAM_CARDS' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        cursor: 'pointer',
                      }}
                    >
                      📦 일정 카드 묶음
                    </button>
                  </div>

                  {scheduleViewTab === 'CALENDAR' ? (
                    <AdminCalendarView
                      adminCalYear={adminCalYear}
                      adminCalMonth={adminCalMonth}
                      onPrevMonth={handleAdminPrevMonth}
                      onNextMonth={handleAdminNextMonth}
                      calendarGrid={adminCalendarGrid}
                      schedulesByDate={schedulesByDate}
                      activeSchedulesByDate={activeSchedulesByDate}
                      selectedDate={adminSelectedDate}
                      onSelectDate={(dateStr) => {
                        setAdminSelectedDate(dateStr);
                        setRightPanelMode('SCHEDULE_FORM');
                      }}
                      showCancelledSchedules={showCancelledSchedules}
                      onToggleShowCancelled={() => setShowCancelledSchedules((prev) => !prev)}
                      schedulesOnSelectedDate={schedulesOnSelectedDate}
                      editingScheduleId={editingScheduleForForm?.id}
                      onSelectScheduleForEdit={handleBindScheduleToForm}
                      onQuickNewSchedule={() => {
                        setEditingScheduleForForm(null);
                        setRightPanelMode('SCHEDULE_FORM');
                        setScheduleSuccessMsg(`우측 폼에 [${adminSelectedDate}] 날짜가 세팅되었습니다. 새 일정을 작성해주세요.`);
                        setTimeout(() => setScheduleSuccessMsg(''), 3000);
                        const el = document.getElementById('admin-schedule-form-container');
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                      }}
                      onRestoreSchedule={handleRestoreScheduleSingle}
                      onDeleteScheduleSingle={handleDeleteScheduleSingle}
                      onToggleArchiveSchedule={handleToggleArchiveSchedule}
                      onCloneSchedule={handleCloneScheduleToForm}
                      onDeleteSchedule={handleDeleteSchedule}
                    />
                  ) : scheduleViewTab === 'ALL_LIST' ? (
                    <AdminScheduleListView
                      schedules={schedules}
                      categories={dynamicCategories}
                      selectedBatchScheduleIds={selectedBatchScheduleIds}
                      onToggleSelectSchedule={handleToggleSelectSchedule}
                      onSelectAllSchedules={handleSelectAllSchedules}
                      onClearSelection={() => setSelectedBatchScheduleIds([])}
                      onOpenBatchEdit={() => setIsBatchScheduleEditModalOpen(true)}
                      onDuplicateSeries={handleDuplicateSelectedSeries}
                      onBatchArchive={handleBatchArchiveSelected}
                      onBatchDelete={handleBatchDeleteSelected}
                      showArchivedSchedules={showArchivedSchedules}
                      onToggleShowArchived={() => setShowArchivedSchedules((prev) => !prev)}
                      editingScheduleId={editingScheduleForForm?.id}
                      onSelectScheduleForEdit={handleBindScheduleToForm}
                      onToggleArchiveSchedule={handleToggleArchiveSchedule}
                      onCloneSchedule={handleCloneScheduleToForm}
                      onDeleteSchedule={handleDeleteSchedule}
                    />
                  ) : (
                    <AdminProgramCardsView
                      programGroups={programGroups}
                      locationPresets={locationPresets}
                      editingScheduleId={editingScheduleForForm?.id}
                      onOpenCreateCard={handleOpenCreateProgramCard}
                      onOpenEditCard={handleOpenEditProgramCard}
                      onRequestDeleteCard={setCardGroupToDelete}
                      onAddRehearsal={(group) => {
                        const addRehearsalSchedule: Schedule = {
                          id: '',
                          title: `${group.title} 추가연습`,
                          date: getTodayString(),
                          startTime: group.startTime,
                          endTime: group.endTime,
                          locationName: group.locationName,
                          category: '추가연습',
                          programId: group.cardId,
                          targetAudienceType: group.targetAudienceType || 'ALL',
                          targetParts: group.targetParts,
                          targetMemberIds: group.targetMemberIds,
                        };
                        setEditingScheduleForForm(addRehearsalSchedule);
                        setRightPanelMode('SCHEDULE_FORM');
                        setScheduleSuccessMsg(`[${group.title}]에 등록할 추가연습 정보를 우측 폼에 세팅했습니다. 날짜를 확인하고 등록을 눌러주세요.`);
                        setTimeout(() => setScheduleSuccessMsg(''), 4500);
                        const el = document.getElementById('admin-schedule-form-container');
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                      }}
                      onDuplicateSeries={handleDuplicateSelectedSeries}
                      onToggleArchiveGroup={handleToggleArchiveGroup}
                      onSelectScheduleForEdit={handleBindScheduleToForm}
                      onCloneSchedule={handleCloneScheduleToForm}
                      onDeleteSchedule={handleDeleteSchedule}
                    />
                  )}
                </div>
              </div>

              {/* Right Column: Inline Program Card Form OR Schedule Registration Form */}
              <div className="admin-form-col">
                <div className="admin-form-card">
                  {rightPanelMode === 'CARD_FORM' ? (
                    <AdminProgramCardForm
                      key={editingProgramCard ? editingProgramCard.id : 'new-card'}
                      initialCard={editingProgramCard}
                      dynamicCategories={dynamicCategories}
                      dynamicParts={dynamicParts}
                      locationPresets={locationPresets}
                      members={members}
                      onSave={handleSaveProgramCard}
                      onCancel={() => {
                        setRightPanelMode('SCHEDULE_FORM');
                        setEditingProgramCard(null);
                      }}
                      successMessage={scheduleSuccessMsg}
                    />
                  ) : (
                    <AdminScheduleForm
                      key={editingScheduleForForm ? editingScheduleForForm.id : 'new-sch-' + adminSelectedDate}
                      editingSchedule={editingScheduleForForm}
                      prefilledDate={adminSelectedDate}
                      prefilledProgramCardId={selectedProgramCardId}
                      programCards={programCards}
                      dynamicCategories={dynamicCategories}
                      dynamicParts={dynamicParts}
                      locationPresets={locationPresets}
                      members={members}
                      onSave={handleSaveScheduleFromForm}
                      onCancelEdit={() => setEditingScheduleForForm(null)}
                      onOpenCreateCard={handleOpenCreateProgramCard}
                      onOpenEditCard={handleOpenEditProgramCard}
                      onOpenLocationPickerModal={() => setIsScheduleLocationModalOpen(true)}
                      successMessage={scheduleSuccessMsg}
                    />
                  )}
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
                  placeholder="예: 문콰이어 연습실, 예술의전당 리허설룸"
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


      {/* ============================================================== */}
      {/* MODAL: Batch Schedule Edit Modal                               */}
      {/* ============================================================== */}
      <BatchScheduleEditModal
        isOpen={isBatchScheduleEditModalOpen}
        selectedScheduleIds={selectedBatchScheduleIds}
        allSchedules={schedules}
        locationPresets={locationPresets}
        categories={dynamicCategories}
        onClose={() => setIsBatchScheduleEditModalOpen(false)}
        onApplyBatch={handleApplyBatchScheduleUpdates}
      />

      {/* ============================================================== */}
      {/* MODAL: Standalone Location Picker Modal                        */}
      {/* ============================================================== */}
      {isScheduleLocationModalOpen && (
        <LocationPickerModal
          isOpen={isScheduleLocationModalOpen}
          onClose={() => setIsScheduleLocationModalOpen(false)}
          onSave={handleAddNewLocationPresetFromModal}
        />
      )}

      {/* ============================================================== */}
      {/* MODAL: Dedicated Schedule Delete Confirmation Modal            */}
      {/* ============================================================== */}
      {scheduleToDelete && (() => {
        const companions = schedules.filter((s) => {
          if (s.id === scheduleToDelete.id) return false;
          // 1. 소속 일정 카드(programId) 일치 최우선
          if (scheduleToDelete.programId && s.programId) {
            return s.programId === scheduleToDelete.programId;
          }
          // 2. 반복 시리즈(seriesId) 일치
          if (scheduleToDelete.seriesId && s.seriesId) {
            return s.seriesId === scheduleToDelete.seriesId;
          }
          // 3. 동일 제목
          return s.title === scheduleToDelete.title;
        });
        const futureCompanions = companions.filter((c) => c.date >= scheduleToDelete.date);
        const isRepeating = companions.length > 0;
        const attachedCard = scheduleToDelete.programId
          ? programCards.find((c) => c.id === scheduleToDelete.programId)
          : null;

        return (
          <div className="modal-overlay" style={{ zIndex: 9999 }}>
            <div
              className="modal-card"
              style={{ maxWidth: '440px', padding: '24px' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header" style={{ marginBottom: '14px' }}>
                <div className="modal-badge" style={{ color: '#DC2626', borderColor: '#FECDD3', background: '#FEF2F2' }}>
                  🗑️ 일정 삭제 확인
                </div>
                <h2 className="modal-title" style={{ fontSize: '18px', marginTop: '10px', color: '#1E293B' }}>
                  '{scheduleToDelete.title}' 일정을 삭제할까요?
                </h2>
                <div style={{ marginTop: '10px', padding: '12px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12.5px', color: '#475569', lineHeight: '1.6' }}>
                  <div>📅 <strong>날짜:</strong> {scheduleToDelete.date}</div>
                  <div>🕒 <strong>시간:</strong> {scheduleToDelete.startTime} ~ {scheduleToDelete.endTime}</div>
                  <div>📍 <strong>장소:</strong> {scheduleToDelete.locationName}</div>
                  {attachedCard && (
                    <div style={{ color: '#0284C7', fontWeight: 600 }}>
                      📦 <strong>소속 카드:</strong> {attachedCard.title}
                    </div>
                  )}
                  {isRepeating && (
                    <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed #CBD5E1', color: '#4F46E5', fontWeight: 600 }}>
                      ※ 동일 카드/명칭의 회차가 총 {companions.length + 1}회차 존재합니다.
                    </div>
                  )}
                </div>
              </div>

              {/* 영구 삭제 옵션 체크박스 */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '13px',
                  color: forceHardDeleteSelected ? '#DC2626' : '#64748B',
                  background: forceHardDeleteSelected ? '#FEF2F2' : '#F8FAFC',
                  border: `1px solid ${forceHardDeleteSelected ? '#FECACA' : '#E2E8F0'}`,
                  borderRadius: '6px',
                  padding: '8px 10px',
                  cursor: 'pointer',
                  marginBottom: '12px',
                }}
              >
                <input
                  type="checkbox"
                  checked={forceHardDeleteSelected}
                  onChange={(e) => setForceHardDeleteSelected(e.target.checked)}
                />
                <span style={{ fontWeight: forceHardDeleteSelected ? 700 : 500 }}>
                  💥 영구 삭제
                </span>
              </label>

              {!isRepeating ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <p style={{ margin: '0 0 10px', fontSize: '13px', color: '#64748B' }}>
                    {forceHardDeleteSelected
                      ? '일정을 완전히 영구 삭제합니다.'
                      : '출결이나 투표 기록이 있으면 기록 보존을 위해 [취소] 처리되며, 없으면 영구 삭제됩니다.'}
                  </p>
                  <button
                    type="button"
                    className="btn-primary-large"
                    style={{ backgroundColor: forceHardDeleteSelected ? '#B91C1C' : '#DC2626', minHeight: '44px', fontWeight: 700 }}
                    onClick={async () => {
                      const id = scheduleToDelete.id;
                      const title = scheduleToDelete.title;
                      const force = forceHardDeleteSelected;
                      setScheduleToDelete(null);
                      setForceHardDeleteSelected(false);
                      await handleDeleteScheduleSingle(id, title, force);
                    }}
                  >
                    {forceHardDeleteSelected ? '💥 영구 삭제' : '🗑️ 일정 삭제'}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary-cancel"
                    style={{ minHeight: '42px' }}
                    onClick={() => {
                      setScheduleToDelete(null);
                      setForceHardDeleteSelected(false);
                    }}
                  >
                    취소
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>삭제할 범위를 선택하세요:</span>
                  <button
                    type="button"
                    style={{
                      background: '#FFF1F2',
                      color: '#E11D48',
                      border: '1px solid #FECDD3',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'left',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                    onClick={async () => {
                      const id = scheduleToDelete.id;
                      const title = scheduleToDelete.title;
                      const force = forceHardDeleteSelected;
                      setScheduleToDelete(null);
                      setForceHardDeleteSelected(false);
                      await handleDeleteScheduleSingle(id, title, force);
                    }}
                  >
                    <span>1️⃣ 이 회차만 삭제 ({scheduleToDelete.date})</span>
                    <span style={{ fontSize: '11px', color: '#9F1239', fontWeight: 400, marginTop: '2px' }}>
                      {forceHardDeleteSelected ? '이 회차만 영구 삭제합니다.' : '다른 회차 일정은 그대로 유지됩니다.'}
                    </span>
                  </button>

                  {futureCompanions.length > 0 && (
                    <button
                      type="button"
                      style={{
                        background: '#FFF7ED',
                        color: '#EA580C',
                        border: '1px solid #FFEDD5',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                      onClick={async () => {
                        const targetIds = [scheduleToDelete.id, ...futureCompanions.map((c) => c.id)];
                        const title = scheduleToDelete.title;
                        const force = forceHardDeleteSelected;
                        setScheduleToDelete(null);
                        setForceHardDeleteSelected(false);
                        await handleDeleteScheduleSeries(targetIds, title, force);
                      }}
                    >
                      <span>⏩ 오늘 포함 이후 회차 일괄 삭제 ({futureCompanions.length + 1}개)</span>
                      <span style={{ fontSize: '11px', color: '#9A3412', fontWeight: 400, marginTop: '2px' }}>
                        {forceHardDeleteSelected ? '이후 회차를 영구 삭제합니다.' : '과거 회차는 보존하고 남은 연습 일정만 삭제합니다.'}
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    style={{
                      background: '#FEF2F2',
                      color: '#DC2626',
                      border: '1.5px solid #FCA5A5',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'left',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                    onClick={async () => {
                      const allIds = [scheduleToDelete.id, ...companions.map((c) => c.id)];
                      const title = scheduleToDelete.title;
                      const force = forceHardDeleteSelected;
                      setScheduleToDelete(null);
                      setForceHardDeleteSelected(false);
                      await handleDeleteScheduleSeries(allIds, title, force);
                    }}
                  >
                    <span>💥 전체 {companions.length + 1}개 회차 모두 삭제</span>
                    <span style={{ fontSize: '11px', color: '#B91C1C', fontWeight: 400, marginTop: '2px' }}>
                      {forceHardDeleteSelected ? '연결된 모든 회차를 영구 삭제합니다.' : '시리즈에 속한 모든 회차 일정을 삭제합니다.'}
                    </span>
                  </button>

                  <button
                    type="button"
                    className="btn-secondary-cancel"
                    style={{ minHeight: '40px', marginTop: '4px' }}
                    onClick={() => {
                      setScheduleToDelete(null);
                      setForceHardDeleteSelected(false);
                    }}
                  >
                    취소
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ============================================================== */}
      {/* MODAL: Dedicated Program Card Delete Confirmation Modal        */}
      {/* ============================================================== */}
      {cardGroupToDelete && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div
            className="modal-card"
            style={{ maxWidth: '460px', padding: '24px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header" style={{ marginBottom: '14px' }}>
              <div className="modal-badge" style={{ color: '#DC2626', borderColor: '#FECDD3', background: '#FEF2F2' }}>
                📦 일정 카드 삭제 확인
              </div>
              <h2 className="modal-title" style={{ fontSize: '18px', marginTop: '10px', color: '#1E293B' }}>
                '[{cardGroupToDelete.title}]' 일정을 카드에서 삭제할까요?
              </h2>
              <div style={{ marginTop: '10px', padding: '12px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12.5px', color: '#475569', lineHeight: '1.6' }}>
                <div>🏷️ <strong>구분:</strong> {cardGroupToDelete.category}</div>
                <div>📋 <strong>소속 회차:</strong> 총 {cardGroupToDelete.schedules.length}회차 등록됨</div>
                <div>📍 <strong>카드 상태:</strong> {cardGroupToDelete.isRegisteredCard ? '시트 저장된 정식 카드' : '일정 기반 자동 묶음 카드'}</div>
              </div>
            </div>

            {cardGroupToDelete.schedules.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <p style={{ margin: '0 0 6px', fontSize: '12.5px', color: '#4E5968', lineHeight: '1.5' }}>
                  일정이 이 카드에 소속되어 있습니다. 카드를 삭제할 때 소속된 일정({cardGroupToDelete.schedules.length}개)도 함께 처리할 방법을 선택하세요:
                </p>

                {/* Option 1: Delete Card + Contained Schedules (Recommended) */}
                <button
                  type="button"
                  style={{
                    background: '#FEF2F2',
                    color: '#DC2626',
                    border: '1.5px solid #FCA5A5',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    boxShadow: '0 1px 3px rgba(220, 38, 38, 0.1)',
                  }}
                  onClick={async () => {
                    const target = cardGroupToDelete;
                    setCardGroupToDelete(null);
                    try {
                      if (target.isRegisteredCard) {
                        await sheetsService.deleteProgramCard(target.cardId);
                      }
                      if (target.schedules.length > 0) {
                        await sheetsService.deleteSchedules(target.schedules.map((s) => s.id));
                      }
                      setScheduleSuccessMsg(`[${target.title}] 카드와 소속된 ${target.schedules.length}개 일정이 모두 영구 삭제되었습니다.`);
                      onDataChanged();
                      setTimeout(() => setScheduleSuccessMsg(''), 4000);
                    } catch (err: unknown) {
                      alert(err instanceof Error ? err.message : '삭제 중 오류가 발생했습니다.');
                    }
                  }}
                >
                  <span style={{ fontSize: '13.5px' }}>🔥 카드 및 소속 일정({cardGroupToDelete.schedules.length}개) 모두 일괄 삭제 (권장)</span>
                  <span style={{ fontSize: '11px', color: '#B91C1C', fontWeight: 400 }}>
                    구글 시트의 [일정카드] 및 [일정] 탭에서 모두 삭제되어 카드가 완전히 제거됩니다.
                  </span>
                </button>

                {/* Option 2: Delete Card Only, Keep Schedules as Unbundled */}
                {cardGroupToDelete.isRegisteredCard && (
                  <button
                    type="button"
                    style={{
                      background: '#F8FAFC',
                      color: '#334155',
                      border: '1px solid #CBD5E1',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textAlign: 'left',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                    }}
                    onClick={async () => {
                      const target = cardGroupToDelete;
                      setCardGroupToDelete(null);
                      try {
                        await sheetsService.deleteProgramCard(target.cardId);
                        // Unlink programId from schedules so they don't recreate the virtual card
                        if (target.schedules.length > 0) {
                          await sheetsService.batchUpdateSchedules(
                            target.schedules.map((s) => s.id),
                            { programId: undefined }
                          );
                        }
                        setScheduleSuccessMsg(`[${target.title}] 카드 묶음만 삭제되었습니다. 소속 일정은 독립 일정으로 보존됩니다.`);
                        onDataChanged();
                        setTimeout(() => setScheduleSuccessMsg(''), 4000);
                      } catch (err: unknown) {
                        alert(err instanceof Error ? err.message : '카드 삭제 중 오류가 발생했습니다.');
                      }
                    }}
                  >
                    <span>📦 카드만 삭제 (일정 {cardGroupToDelete.schedules.length}개는 미분류로 보존)</span>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 400 }}>
                      카드 등록 정보만 지우고, 개별 일정 데이터와 출결 기록은 유지합니다.
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  className="btn-secondary-cancel"
                  style={{ minHeight: '40px', marginTop: '6px' }}
                  onClick={() => setCardGroupToDelete(null)}
                >
                  취소
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <p style={{ margin: '0 0 10px', fontSize: '13px', color: '#64748B' }}>
                  이 카드에 소속된 일정이 없습니다. 카드를 영구 삭제하시겠습니까?
                </p>
                <button
                  type="button"
                  className="btn-primary-large"
                  style={{ backgroundColor: '#DC2626', minHeight: '44px', fontWeight: 700 }}
                  onClick={async () => {
                    const target = cardGroupToDelete;
                    setCardGroupToDelete(null);
                    try {
                      if (target.isRegisteredCard) {
                        await sheetsService.deleteProgramCard(target.cardId);
                      }
                      setScheduleSuccessMsg(`[${target.title}] 카드가 삭제되었습니다.`);
                      onDataChanged();
                      setTimeout(() => setScheduleSuccessMsg(''), 4000);
                    } catch (err: unknown) {
                      alert(err instanceof Error ? err.message : '카드 삭제 중 오류가 발생했습니다.');
                    }
                  }}
                >
                  🗑️ 빈 카드 삭제하기
                </button>
                <button
                  type="button"
                  className="btn-secondary-cancel"
                  style={{ minHeight: '42px' }}
                  onClick={() => setCardGroupToDelete(null)}
                >
                  취소
                </button>
              </div>
            )}
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
