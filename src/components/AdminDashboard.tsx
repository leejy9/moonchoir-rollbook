import { QRCodeSVG } from 'qrcode.react';
import React, { useMemo, useState } from 'react';
import { setAdminLoggedIn } from '../services/auth';
import { sheetsService } from '../services/sheets';
import type {
  AttendanceStatus,
  LocationPreset,
  Member,
  MemberStatusHistory,
  PartType,
  ProgramCard,
  RawAttendanceLog,
  Schedule,
  ScheduleCategory,
  TargetAudienceType,
} from '../types/rollbook';
import {
  createSchedulesMultiMode,
  duplicateScheduleSeries,
  getCalendarGrid,
  type ScheduleAddMode,
} from '../utils/calendar';
import {
  generateMasterWallQRPayload,
} from '../utils/qr';
import { getKSTTimestampString, getKSTDateString } from '../utils/date';
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
import { LocationPickerModal } from './LocationPickerModal';
import { ScheduleEditModal } from './ScheduleEditModal';
import { BatchScheduleEditModal } from './BatchScheduleEditModal';
import { MemberMergeModal } from './MemberMergeModal';
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

function createManualLogMeta(): { id: string; timestamp: string } {
  return {
    id: `log_manual_${Date.now()}`,
    timestamp: getKSTTimestampString(),
  };
}

function getPeriodRange(periodOption: '1M' | '3M' | '6M' | 'YEAR' | 'ALL') {
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
  const programCards = sheetsService.getProgramCards();

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
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const duplicateMemberGroups = useMemo(() => {
    if (!members) return [];
    return sheetsService.findDuplicateMemberGroups();
  }, [members]);

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

  // --- 5. Add Schedule State (4-Mode Engine & Audience Selector) ---
  const [scheduleAddMode, setScheduleAddMode] = useState<ScheduleAddMode>('SINGLE');
  const [editingScheduleForForm, setEditingScheduleForForm] = useState<Schedule | null>(null);
  const [showPastSchedules, setShowPastSchedules] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState(() => getTodayString());
  const [newStartTime, setNewStartTime] = useState('19:30');
  const [newEndTime, setNewEndTime] = useState('21:30');
  const [selectedLocationPresetId, setSelectedLocationPresetId] = useState<string>(
    locationPresets[0]?.id || 'custom'
  );
  const [newLocName, setNewLocName] = useState(
    defaultLocName
  );
  const [newLat, setNewLat] = useState(locationPresets[0]?.latitude || 37.5665);
  const [newLon, setNewLon] = useState(locationPresets[0]?.longitude || 126.9780);
  const [newRadius, setNewRadius] = useState(locationPresets[0]?.radiusMeters || 100);
  const [newCategory, setNewCategory] = useState<ScheduleCategory>('정기연습');
  const [isCustomNewCategory, setIsCustomNewCategory] = useState(false);
  const [customNewCategoryInput, setCustomNewCategoryInput] = useState('');
  const [isScheduleLocationModalOpen, setIsScheduleLocationModalOpen] = useState(false);
  const [newDesc, setNewDesc] = useState('');
  const [selectedProgramCardId, setSelectedProgramCardId] = useState<string>('');

  // 4-Mode parameters
  const [intervalUnit, setIntervalUnit] = useState<'DAYS' | 'WEEKS' | 'MONTHS'>('WEEKS');
  const [intervalStep, setIntervalStep] = useState<number>(1);
  const [intervalCount, setIntervalCount] = useState<number>(4);
  const [selectedDays, setSelectedDays] = useState<('MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN')[]>(['THU']);
  const [weeksCount, setWeeksCount] = useState<number>(4);
  const [pickedDates, setPickedDates] = useState<string[]>([]);
  const [pickCalYear, setPickCalYear] = useState(() => new Date().getFullYear());
  const [pickCalMonth, setPickCalMonth] = useState(() => new Date().getMonth());

  // Audience selector parameters
  const [newTargetAudienceType, setNewTargetAudienceType] = useState<TargetAudienceType>('ALL');
  const [newTargetParts, setNewTargetParts] = useState<PartType[]>([]);
  const [newTargetMemberIds, setNewTargetMemberIds] = useState<string[]>([]);
  const [customMemberSearch, setCustomMemberSearch] = useState('');
  const [cardMemberSearch, setCardMemberSearch] = useState('');

  const handlePickCalPrevMonth = () => {
    if (pickCalMonth === 0) {
      setPickCalMonth(11);
      setPickCalYear((y) => y - 1);
    } else {
      setPickCalMonth((m) => m - 1);
    }
  };

  const handlePickCalNextMonth = () => {
    if (pickCalMonth === 11) {
      setPickCalMonth(0);
      setPickCalYear((y) => y + 1);
    } else {
      setPickCalMonth((m) => m + 1);
    }
  };

  const togglePickedDate = (dateStr: string) => {
    setPickedDates((prev) => {
      if (prev.includes(dateStr)) {
        return prev.filter((d) => d !== dateStr);
      }
      return [...prev, dateStr].sort();
    });
  };

  // Program Card Management Modal State
  const [isProgramCardModalOpen, setIsProgramCardModalOpen] = useState(false);
  const [editingProgramCard, setEditingProgramCard] = useState<ProgramCard | null>(null);
  const [cardTitle, setCardTitle] = useState('');
  const [cardCategory, setCardCategory] = useState<ScheduleCategory>('정기연습');
  const [cardDesc, setCardDesc] = useState('');
  const [cardDefaultLocationId, setCardDefaultLocationId] = useState('');
  const [cardDefaultStartTime, setCardDefaultStartTime] = useState('19:30');
  const [cardDefaultEndTime, setCardDefaultEndTime] = useState('21:30');
  const [cardAudienceType, setCardAudienceType] = useState<TargetAudienceType>('ALL');
  const [cardTargetParts, setCardTargetParts] = useState<PartType[]>([]);
  const [cardTargetMemberIds, setCardTargetMemberIds] = useState<string[]>([]);

  const [scheduleSuccessMsg, setScheduleSuccessMsg] = useState('');
  const [showArchivedSchedules, setShowArchivedSchedules] = useState(false);

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

  // --- Schedule Editing & Batch Operations State ---
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [isScheduleEditModalOpen, setIsScheduleEditModalOpen] = useState(false);
  const [selectedBatchScheduleIds, setSelectedBatchScheduleIds] = useState<string[]>([]);
  const [isBatchScheduleEditModalOpen, setIsBatchScheduleEditModalOpen] = useState(false);
  const [scheduleViewTab, setScheduleViewTab] = useState<'CALENDAR' | 'ALL_LIST' | 'PROGRAM_CARDS'>('CALENDAR');
  const [expandedCardIds, setExpandedCardIds] = useState<Set<string>>(new Set());
  const [allScheduleSearch, setAllScheduleSearch] = useState('');
  const [allScheduleCatFilter, setAllScheduleCatFilter] = useState('ALL');

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

  const pastSchedulesCount = useMemo(() => {
    const todayStr = getTodayString();
    return schedules.filter((s) => !s.isArchived && s.date < todayStr).length;
  }, [schedules]);

  const filteredAllSchedules = useMemo(() => {
    const todayStr = getTodayString();
    return schedules.filter((s) => {
      if (!showArchivedSchedules && s.isArchived) return false;
      if (!showPastSchedules && s.date < todayStr) return false;
      const q = allScheduleSearch.trim().toLowerCase();
      const matchSearch =
        !q ||
        s.title.toLowerCase().includes(q) ||
        s.locationName.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q)) ||
        s.date.includes(q);
      const matchCat = allScheduleCatFilter === 'ALL' || s.category === allScheduleCatFilter;
      return matchSearch && matchCat;
    });
  }, [schedules, allScheduleSearch, allScheduleCatFilter, showArchivedSchedules, showPastSchedules]);

  const handleAddNewLocationPresetFromModal = async (newPreset: LocationPreset) => {
    await sheetsService.addLocationPreset(newPreset);
    setSelectedLocationPresetId(newPreset.id);
    setNewLocName(newPreset.name);
    setNewLat(newPreset.latitude);
    setNewLon(newPreset.longitude);
    setNewRadius(newPreset.radiusMeters);
    setIsScheduleLocationModalOpen(false);
    setScheduleSuccessMsg(`새 연습실 [${newPreset.name}]이 등록되어 장소로 선택되었습니다.`);
    onDataChanged();
    setTimeout(() => setScheduleSuccessMsg(''), 4000);
  };

  const handleDuplicateSelectedSeries = async (preferredSeriesId?: string) => {
    let targetItems = schedules.filter((s) => selectedBatchScheduleIds.includes(s.id));
    if (preferredSeriesId) {
      targetItems = schedules.filter((s) => s.seriesId === preferredSeriesId);
    }
    if (targetItems.length === 0) {
      alert('복제할 일정을 선택해주세요.');
      return;
    }

    const seriesIdToDup = preferredSeriesId || targetItems[0].seriesId || targetItems[0].id;
    const defaultNextDate = new Date();
    defaultNextDate.setMonth(defaultNextDate.getMonth() + 4);
    const defaultDateStr = getKSTDateString(defaultNextDate);

    const userInput = window.prompt(
      `선택하신 [${targetItems[0].title}] ${targetItems.length}개 회차를 다음 학기/시즌으로 복제합니다.\n새 학기 첫 연습 시작 날짜를 입력해주세요 (YYYY-MM-DD):`,
      defaultDateStr
    );
    if (!userInput || !userInput.trim()) return;

    const newStartDate = userInput.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newStartDate)) {
      alert('올바른 날짜 형식(YYYY-MM-DD)으로 입력해주세요.');
      return;
    }

    try {
      const duplicated = duplicateScheduleSeries(
        schedules.some((s) => s.seriesId === seriesIdToDup)
          ? schedules
          : targetItems.map((s) => ({ ...s, seriesId: seriesIdToDup })),
        seriesIdToDup,
        newStartDate
      );

      if (duplicated.length === 0) {
        alert('복제할 일정을 찾지 못했습니다.');
        return;
      }

      await sheetsService.addSchedules(duplicated);
      setSelectedBatchScheduleIds([]);
      setScheduleSuccessMsg(`🎉 ${duplicated.length}개 회차가 새 학기(${newStartDate}~) 일정으로 복제 생성되었습니다!`);
      onDataChanged();
      setTimeout(() => setScheduleSuccessMsg(''), 4500);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '시즌 복제 중 오류가 발생했습니다.');
    }
  };

  const handleOpenEditSchedule = (sch: Schedule) => {
    setEditingSchedule(sch);
    setIsScheduleEditModalOpen(true);
  };

  const handleSaveScheduleSingle = async (scheduleId: string, updates: Partial<Schedule>) => {
    await sheetsService.updateSchedule(scheduleId, updates);
    setScheduleSuccessMsg(`일정이 성공적으로 수정되었습니다.`);
    onDataChanged();
    setTimeout(() => setScheduleSuccessMsg(''), 3500);
  };

  const handleSaveScheduleSeries = async (matchingIds: string[], updates: Partial<Schedule>) => {
    await sheetsService.batchUpdateSchedules(matchingIds, updates);
    setScheduleSuccessMsg(`동일 시리즈 일정 ${matchingIds.length}개 회차가 일괄 수정되었습니다.`);
    onDataChanged();
    setTimeout(() => setScheduleSuccessMsg(''), 3500);
  };

  const handleDeleteScheduleSingle = async (scheduleId: string, title: string) => {
    await sheetsService.deleteSchedule(scheduleId);
    setScheduleSuccessMsg(`'${title}' 일정이 정상적으로 삭제되었습니다.`);
    setSelectedBatchScheduleIds((prev) => prev.filter((id) => id !== scheduleId));
    onDataChanged();
    setTimeout(() => setScheduleSuccessMsg(''), 3500);
  };

  const handleDeleteScheduleSeries = async (matchingIds: string[], title: string) => {
    await sheetsService.deleteSchedules(matchingIds);
    setScheduleSuccessMsg(`'${title}' 명칭의 전체 ${matchingIds.length}개 일정이 일괄 삭제되었습니다.`);
    setSelectedBatchScheduleIds((prev) => prev.filter((id) => !matchingIds.includes(id)));
    onDataChanged();
    setTimeout(() => setScheduleSuccessMsg(''), 3500);
  };

  const handleApplyBatchScheduleUpdates = async (ids: string[], updates: Partial<Schedule>) => {
    await sheetsService.batchUpdateSchedules(ids, updates);
    setScheduleSuccessMsg(`선택한 ${ids.length}개 일정이 성공적으로 일괄 수정되었습니다.`);
    onDataChanged();
    setTimeout(() => setScheduleSuccessMsg(''), 3500);
  };

  const handleBatchDeleteSelected = async () => {
    if (selectedBatchScheduleIds.length === 0) return;
    if (
      !window.confirm(
        `선택하신 ${selectedBatchScheduleIds.length}개의 일정을 일괄 삭제하시겠습니까?\n구글 스프레드시트에서도 모두 영구 삭제됩니다.`
      )
    ) {
      return;
    }
    const count = selectedBatchScheduleIds.length;
    await sheetsService.deleteSchedules(selectedBatchScheduleIds);
    setSelectedBatchScheduleIds([]);
    setScheduleSuccessMsg(`선택한 ${count}개 일정이 일괄 삭제되었습니다.`);
    onDataChanged();
    setTimeout(() => setScheduleSuccessMsg(''), 3500);
  };

  const handleToggleSelectSchedule = (id: string) => {
    setSelectedBatchScheduleIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllSchedules = (filteredIds: string[]) => {
    const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedBatchScheduleIds.includes(id));
    if (allSelected) {
      setSelectedBatchScheduleIds((prev) => prev.filter((id) => !filteredIds.includes(id)));
    } else {
      setSelectedBatchScheduleIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  const handleDeleteSchedule = async (scheduleId: string, title: string) => {
    // If companion schedules exist with same title, offer choice via edit modal
    const companions = schedules.filter((s) => s.title === title && s.id !== scheduleId);
    if (companions.length > 0) {
      const target = schedules.find((s) => s.id === scheduleId);
      if (target) {
        handleOpenEditSchedule(target);
        return;
      }
    }

    if (!window.confirm(`정말로 '${title}' 일정을 삭제하시겠습니까?\n구글 스프레드시트에서도 해당 행이 삭제됩니다.`)) {
      return;
    }
    try {
      await sheetsService.deleteSchedule(scheduleId);
      setScheduleSuccessMsg(`'${title}' 일정이 정상적으로 삭제되었습니다.`);
      setSelectedBatchScheduleIds((prev) => prev.filter((id) => id !== scheduleId));
      onDataChanged();
      setTimeout(() => setScheduleSuccessMsg(''), 4000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '일정 삭제 중 오류가 발생했습니다.');
    }
  };

  // Archive single schedule
  const handleToggleArchiveSchedule = async (scheduleId: string, isArchived: boolean) => {
    try {
      await sheetsService.updateSchedule(scheduleId, { isArchived });
      setScheduleSuccessMsg(
        isArchived ? '선택한 일정을 지난 시즌 아카이브로 보관했습니다.' : '선택한 일정을 일반 목록으로 복원했습니다.'
      );
      setTimeout(() => setScheduleSuccessMsg(''), 3000);
      onDataChanged();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '아카이브 처리 중 오류가 발생했습니다.');
    }
  };

  // Archive batch schedules
  const handleBatchArchiveSelected = async (isArchived: boolean) => {
    if (selectedBatchScheduleIds.length === 0) return;
    try {
      await sheetsService.batchUpdateSchedules(selectedBatchScheduleIds, { isArchived });
      setScheduleSuccessMsg(
        isArchived
          ? `${selectedBatchScheduleIds.length}개 일정을 지난 시즌 아카이브로 보관했습니다.`
          : `${selectedBatchScheduleIds.length}개 일정을 보관 해제(복원)했습니다.`
      );
      setSelectedBatchScheduleIds([]);
      setTimeout(() => setScheduleSuccessMsg(''), 3500);
      onDataChanged();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '일괄 아카이브 처리 중 오류가 발생했습니다.');
    }
  };

  // Archive entire program group
  const handleToggleArchiveGroup = async (scheduleIds: string[], isArchived: boolean) => {
    try {
      await sheetsService.batchUpdateSchedules(scheduleIds, { isArchived });
      setScheduleSuccessMsg(
        isArchived
          ? '해당 묶음의 모든 일정을 지난 시즌 아카이브로 보관했습니다.'
          : '해당 묶음의 모든 일정을 일반 목록으로 복원했습니다.'
      );
      setTimeout(() => setScheduleSuccessMsg(''), 3500);
      onDataChanged();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '묶음 아카이브 처리 중 오류가 발생했습니다.');
    }
  };

  const handleSaveQrPrintSettings = () => {
    sheetsService.updateConfig({
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

  // Location Preset change in Schedule Creation
  const handleLocationPresetChange = (presetId: string) => {
    if (presetId === '__NEW_LOCATION__') {
      setIsScheduleLocationModalOpen(true);
      return;
    }
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

  // Program Card CRUD Handlers
  const handleOpenCreateProgramCard = () => {
    setEditingProgramCard(null);
    setCardTitle('');
    setCardCategory('정기연습');
    setCardDesc('');
    setCardDefaultLocationId(locationPresets[0]?.id || '');
    setCardDefaultStartTime('19:30');
    setCardDefaultEndTime('21:30');
    setCardAudienceType('ALL');
    setCardTargetParts([]);
    setCardTargetMemberIds([]);
    setIsProgramCardModalOpen(true);
  };

  const handleOpenEditProgramCard = (card: ProgramCard) => {
    setEditingProgramCard(card);
    setCardTitle(card.title);
    setCardCategory(card.category);
    setCardDesc(card.description || '');
    setCardDefaultLocationId(card.defaultLocationId || locationPresets[0]?.id || '');
    setCardDefaultStartTime(card.defaultStartTime || '19:30');
    setCardDefaultEndTime(card.defaultEndTime || '21:30');
    setCardAudienceType(card.targetAudienceType || 'ALL');
    setCardTargetParts(card.targetParts || []);
    setCardTargetMemberIds(card.targetMemberIds || []);
    setIsProgramCardModalOpen(true);
  };

  const handleSaveProgramCardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardTitle.trim()) return;

    const cardData: ProgramCard = {
      id: editingProgramCard?.id || `card_${Date.now()}`,
      title: cardTitle.trim(),
      category: cardCategory,
      description: cardDesc.trim() || undefined,
      defaultLocationId: cardDefaultLocationId || undefined,
      defaultStartTime: cardDefaultStartTime || '19:30',
      defaultEndTime: cardDefaultEndTime || '21:30',
      targetAudienceType: cardAudienceType,
      targetParts: cardAudienceType === 'PARTS' ? cardTargetParts : undefined,
      targetMemberIds: cardAudienceType === 'CUSTOM_MEMBERS' ? cardTargetMemberIds : undefined,
      isArchived: editingProgramCard?.isArchived || false,
      createdAt: editingProgramCard?.createdAt || getKSTTimestampString(),
    };

    try {
      await sheetsService.saveProgramCard(cardData);
      setScheduleSuccessMsg(`일정 카드 [${cardData.title}]가 구글 시트에 영구 저장되었습니다.`);
      setIsProgramCardModalOpen(false);
      onDataChanged();
      setTimeout(() => setScheduleSuccessMsg(''), 4000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '일정 카드 저장 중 오류가 발생했습니다.');
    }
  };

  const handleDeleteProgramCard = async (cardId: string, title: string) => {
    if (!window.confirm(`정말로 일정 카드 [${title}]를 삭제하시겠습니까?\n구글 시트 일정카드 탭에서도 제거됩니다.`)) {
      return;
    }
    try {
      await sheetsService.deleteProgramCard(cardId);
      setScheduleSuccessMsg(`일정 카드 [${title}]가 삭제되었습니다.`);
      onDataChanged();
      setTimeout(() => setScheduleSuccessMsg(''), 4000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '일정 카드 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleBindScheduleToForm = (sch: Schedule) => {
    setEditingScheduleForForm(sch);
    setNewTitle(sch.title);
    setNewDate(sch.date);
    setNewStartTime(sch.startTime);
    setNewEndTime(sch.endTime);
    const resolvedLoc = locationPresets.find((l) => l.id === sch.locationId || l.name === sch.locationName);
    setSelectedLocationPresetId(resolvedLoc ? resolvedLoc.id : (sch.locationId || 'custom'));
    setNewLocName(sch.locationName);
    setNewLat(resolvedLoc ? resolvedLoc.latitude : (sch.targetLat ?? defaultLoc?.latitude ?? 37.5665));
    setNewLon(resolvedLoc ? resolvedLoc.longitude : (sch.targetLon ?? defaultLoc?.longitude ?? 126.9780));
    setNewRadius(resolvedLoc ? resolvedLoc.radiusMeters : (sch.radiusMeters ?? defaultLoc?.radiusMeters ?? 100));
    setNewCategory(sch.category);
    setNewDesc(sch.description || '');
    setSelectedProgramCardId(sch.programId || '');
    setNewTargetAudienceType(sch.targetAudienceType || 'ALL');
    setNewTargetParts(sch.targetParts || []);
    setNewTargetMemberIds(sch.targetMemberIds || []);
    setScheduleAddMode('SINGLE');
    setScheduleSuccessMsg(`[${sch.title}] 일정이 우측 수정 폼에 인라인 바인딩되었습니다.`);
    setTimeout(() => setScheduleSuccessMsg(''), 3000);
  };

  const handleCloneScheduleToForm = (sch: Schedule) => {
    setEditingScheduleForForm(null);
    setNewTitle(`${sch.title} (복제)`);
    setNewDate(getTodayString());
    setNewStartTime(sch.startTime);
    setNewEndTime(sch.endTime);
    setSelectedLocationPresetId(sch.locationId || 'custom');
    setNewLocName(sch.locationName);
    setNewLat(sch.targetLat ?? defaultLoc?.latitude ?? 37.5665);
    setNewLon(sch.targetLon ?? defaultLoc?.longitude ?? 126.9780);
    setNewRadius(sch.radiusMeters ?? defaultLoc?.radiusMeters ?? 100);
    setNewCategory(sch.category);
    setNewDesc(sch.description || '');
    setSelectedProgramCardId(sch.programId || '');
    setNewTargetAudienceType(sch.targetAudienceType || 'ALL');
    setNewTargetParts(sch.targetParts || []);
    setNewTargetMemberIds(sch.targetMemberIds || []);
    setScheduleAddMode('SINGLE');
    setScheduleSuccessMsg(`[${sch.title}] 일정을 복제하여 오늘 날짜(${getTodayString()}) 기준으로 우측 폼에 세팅했습니다.`);
    setTimeout(() => setScheduleSuccessMsg(''), 4500);
  };

  // Create or Update Schedule (In-place & 4-Mode Engine)
  const handleCreateScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    if (scheduleAddMode !== 'CALENDAR_PICK' && !newDate.trim()) return;
    if (scheduleAddMode === 'CALENDAR_PICK' && pickedDates.length === 0) {
      alert('달력에서 최소 1개 이상의 날짜를 선택해주세요.');
      return;
    }

    const finalCategory = isCustomNewCategory
      ? ((customNewCategoryInput.trim() || '기타행사') as ScheduleCategory)
      : newCategory;
    if (isCustomNewCategory && customNewCategoryInput.trim()) {
      sheetsService.addCategory(customNewCategoryInput.trim());
    }

    const foundLoc = locationPresets.find((l) => l.id === selectedLocationPresetId);

    // In-place update existing schedule
    if (editingScheduleForForm) {
      const updates: Partial<Schedule> = {
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
        category: finalCategory,
        description: newDesc.trim() || undefined,
        programId: selectedProgramCardId || undefined,
        targetAudienceType: newTargetAudienceType,
        targetParts: newTargetAudienceType === 'PARTS' ? newTargetParts : undefined,
        targetMemberIds: newTargetAudienceType === 'CUSTOM_MEMBERS' ? newTargetMemberIds : undefined,
      };

      await sheetsService.updateSchedule(editingScheduleForForm.id, updates);
      setEditingScheduleForForm(null);
      setScheduleSuccessMsg(`[${newTitle.trim()}] 일정이 인라인으로 즉시 수정되었습니다.`);
      onDataChanged();
      setTimeout(() => setScheduleSuccessMsg(''), 4000);
      return;
    }

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
      category: finalCategory,
      description: newDesc.trim() || undefined,
      programId: selectedProgramCardId || undefined,
      targetAudienceType: newTargetAudienceType,
      targetParts: newTargetAudienceType === 'PARTS' ? newTargetParts : undefined,
      targetMemberIds: newTargetAudienceType === 'CUSTOM_MEMBERS' ? newTargetMemberIds : undefined,
    };

    const generated = createSchedulesMultiMode({
      mode: scheduleAddMode,
      baseSchedule,
      intervalUnit,
      intervalStep,
      intervalCount,
      byDays: selectedDays,
      weeksCount,
      pickedDates,
    });

    if (generated.length === 1) {
      await sheetsService.addSchedule(generated[0]);
      setSelectedScheduleId(generated[0].id);
      setScheduleSuccessMsg(`새 일정 [${generated[0].title}]이 등록되었습니다.`);
    } else {
      await sheetsService.addSchedules(generated);
      setSelectedScheduleId(generated[0]?.id || '');
      setScheduleSuccessMsg(
        `4대 다채널 엔진을 통해 ${generated.length}개의 일정이 일괄 생성되어 등록되었습니다!`
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
    const newPin = sheetsService.refreshActiveOnSitePin();
    if (currentSchedule) {
      await sheetsService.updateSchedule(currentSchedule.id, { checkInPin: newPin });
    }
    onDataChanged();
    setPinRegenMsg(`당일 현장 PIN이 [${newPin}]으로 재발급되었습니다.`);
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
        <div className="admin-tab-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Duplicate Member Detection Warning Banner */}
          {duplicateMemberGroups.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#FFFBEB',
                border: '1.5px solid #FCD34D',
                borderRadius: '12px',
                padding: '12px 18px',
                gap: '12px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '20px' }}>⚠️</span>
                <div>
                  <strong style={{ fontSize: '13.5px', color: '#B45309', display: 'block' }}>
                    동일 정보 단원 {duplicateMemberGroups.length}건 감지 ({duplicateMemberGroups.map((g) => g.name).join(', ')})
                  </strong>
                  <span style={{ fontSize: '12px', color: '#78350F' }}>
                    동일한 이름과 전화번호 뒤 4자리를 가진 단원이 감지되었습니다. 각 단원은 고유 ID(외래키) 및 개별 기기 바인딩으로 안전하게 분리 관리되며, 임의로 자동 병합되지 않습니다. 필요 시 중복 등록 여부를 검토해주세요.
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMergeModalOpen(true)}
                style={{
                  background: '#D97706',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  minHeight: '38px',
                }}
              >
                🔍 중복 단원 검토
              </button>
            </div>
          )}

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

          <MemberMergeModal
            isOpen={isMergeModalOpen}
            onClose={() => setIsMergeModalOpen(false)}
            onMerged={onDataChanged}
            schedules={schedules}
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
                                backgroundColor:
                                  b === '개근'
                                    ? '#10b981'
                                    : b === '우수'
                                    ? 'var(--brand-accent)'
                                    : b.startsWith('게스트')
                                    ? '#8b5cf6'
                                    : '#f04452',
                                color: '#fff',
                              }}
                            >
                              {b.startsWith('게스트') ? `💡 ${b}` : b}
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
                      onClick={() => setScheduleViewTab('CALENDAR')}
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
                      onClick={() => setScheduleViewTab('ALL_LIST')}
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
                      📋 전체 등록 일정 ({schedules.length}건)
                    </button>
                    <button
                      type="button"
                      className={`btn-sub-tab ${scheduleViewTab === 'PROGRAM_CARDS' ? 'active' : ''}`}
                      onClick={() => setScheduleViewTab('PROGRAM_CARDS')}
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
                      📦 일정 카드 묶음 ({programGroups.length}개 카드)
                    </button>
                  </div>

                  {scheduleViewTab === 'CALENDAR' ? (
                    <div>
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
                            {schedulesOnSelectedDate.map((sch) => {
                              const isSelectedForEdit = editingScheduleForForm?.id === sch.id;
                              return (
                                <div
                                  key={sch.id}
                                  className="admin-sch-item-card"
                                  onClick={() => handleBindScheduleToForm(sch)}
                                  style={{
                                    cursor: 'pointer',
                                    border: isSelectedForEdit ? '1.5px solid #6366F1' : '1px solid #E2E8F0',
                                    background: isSelectedForEdit ? '#EEF2FF' : '#FFFFFF',
                                    boxShadow: isSelectedForEdit ? '0 0 0 2px rgba(99, 102, 241, 0.2)' : 'none',
                                    transition: 'all 0.15s ease',
                                  }}
                                  title="클릭하여 우측에서 일정 정보 수정"
                                >
                                  <div className="sch-item-info">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      {isSelectedForEdit && (
                                        <span style={{ fontSize: '11px', color: '#4F46E5', fontWeight: 700 }}>
                                          ✏️ 편집 중:
                                        </span>
                                      )}
                                      <span className="schedule-category-badge">{sch.category}</span>
                                      <strong style={{ fontSize: '14px', color: '#191f28' }}>{sch.title}</strong>
                                      {sch.checkInPin && (
                                        <span style={{ fontSize: '11px', color: '#64748B', background: '#F1F5F9', padding: '1px 6px', borderRadius: '4px' }}>
                                          PIN: {sch.checkInPin}
                                        </span>
                                      )}
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
                                  <div style={{ display: 'flex', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                                    <button
                                      type="button"
                                      onClick={() => handleToggleArchiveSchedule(sch.id, !sch.isArchived)}
                                      title={sch.isArchived ? '일반 목록으로 복원' : '지난 시즌 아카이브로 보관'}
                                      style={{
                                        background: sch.isArchived ? '#EDE9FE' : '#F1F5F9',
                                        color: sch.isArchived ? '#6D28D9' : '#475569',
                                        border: `1px solid ${sch.isArchived ? '#C4B5FD' : '#CBD5E1'}`,
                                        borderRadius: '6px',
                                        padding: '4px 8px',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                      }}
                                    >
                                      {sch.isArchived ? '📂 복원' : '📦 보관'}
                                    </button>
                                    <button
                                      type="button"
                                      className="btn-edit-sch-mini"
                                      onClick={() => handleCloneScheduleToForm(sch)}
                                      title={sch.date < getTodayString() ? "오늘 날짜로 복제" : "일정 복제"}
                                      style={{
                                        background: sch.date < getTodayString() ? '#ECFDF5' : '#F8FAFC',
                                        color: sch.date < getTodayString() ? '#059669' : '#475569',
                                        border: `1px solid ${sch.date < getTodayString() ? '#A7F3D0' : '#CBD5E1'}`,
                                        borderRadius: '6px',
                                        padding: '4px 8px',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                      }}
                                    >
                                      {sch.date < getTodayString() ? '📋 오늘로 복제' : '📋 복제'}
                                    </button>
                                    <button
                                      type="button"
                                      className="btn-delete-sch-mini"
                                      onClick={() => handleDeleteSchedule(sch.id, sch.title)}
                                      title="일정 삭제"
                                    >
                                      🗑️ 삭제
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="empty-subtext" style={{ padding: '16px 0', textAlign: 'center', margin: 0 }}>
                            해당 날짜에 등록된 일정이 없습니다. 우측 폼에서 새 일정을 등록해보세요.
                          </p>
                        )}
                      </div>
                    </div>
                  ) : scheduleViewTab === 'ALL_LIST' ? (
                    /* ALL LIST BATCH MANAGEMENT VIEW */
                    <div>
                      <div style={{ marginBottom: '14px' }}>
                        <h2 className="section-title" style={{ margin: 0 }}>
                          📋 전체 등록 일정 일괄 관리
                        </h2>
                        <p className="section-subtitle" style={{ margin: '4px 0 0' }}>
                          반복 등록된 일정들을 한눈에 확인하고, 다중 선택하여 일괄 삭제하거나 장소/시간을 일괄 수정합니다.
                        </p>
                      </div>

                      {/* Search & Filter Bar */}
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '180px', position: 'relative' }}>
                          <input
                            type="text"
                            className="modern-input"
                            placeholder="일정명, 날짜, 장소, 곡목 검색..."
                            value={allScheduleSearch}
                            onChange={(e) => setAllScheduleSearch(e.target.value)}
                            style={{ height: '38px', paddingLeft: '32px', fontSize: '13px' }}
                          />
                          <span style={{ position: 'absolute', left: '10px', top: '10px', color: '#94A3B8', fontSize: '13px' }}>🔍</span>
                        </div>
                        <select
                          className="modern-select"
                          value={allScheduleCatFilter}
                          onChange={(e) => setAllScheduleCatFilter(e.target.value)}
                          style={{ width: 'auto', minWidth: '120px', height: '38px', fontSize: '13px' }}
                        >
                          <option value="ALL">전체 카테고리</option>
                          {dynamicCategories.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setShowPastSchedules((prev) => !prev)}
                          style={{
                            background: showPastSchedules ? '#EFF6FF' : '#F8FAFC',
                            color: showPastSchedules ? '#2563EB' : '#64748B',
                            border: `1px solid ${showPastSchedules ? '#93C5FD' : '#CBD5E1'}`,
                            borderRadius: '8px',
                            padding: '0 12px',
                            height: '38px',
                            fontSize: '12.5px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          {showPastSchedules ? '⏱️ 지난 일정 숨기기' : `⏱️ 지난 일정 보기 (${pastSchedulesCount}건)`}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowArchivedSchedules((prev) => !prev)}
                          style={{
                            background: showArchivedSchedules ? '#EDE9FE' : '#F8FAFC',
                            color: showArchivedSchedules ? '#6D28D9' : '#64748B',
                            border: `1px solid ${showArchivedSchedules ? '#C4B5FD' : '#CBD5E1'}`,
                            borderRadius: '8px',
                            padding: '0 12px',
                            height: '38px',
                            fontSize: '12.5px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          {showArchivedSchedules ? '📂 지난 시즌 숨기기' : '📁 지난 시즌 아카이브'}
                        </button>
                      </div>

                      {/* Bulk Action Bar */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: selectedBatchScheduleIds.length > 0 ? '#EEF2FF' : '#F8FAFC',
                          border: `1px solid ${selectedBatchScheduleIds.length > 0 ? '#C7D2FE' : '#E2E8F0'}`,
                          borderRadius: '10px',
                          padding: '10px 14px',
                          marginBottom: '14px',
                          flexWrap: 'wrap',
                          gap: '10px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              cursor: 'pointer',
                              fontSize: '13px',
                              fontWeight: 700,
                              color: '#334155',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={
                                filteredAllSchedules.length > 0 &&
                                filteredAllSchedules.every((s) => selectedBatchScheduleIds.includes(s.id))
                              }
                              onChange={() => handleSelectAllSchedules(filteredAllSchedules.map((s) => s.id))}
                              style={{ width: '18px', height: '18px', accentColor: '#4F46E5', cursor: 'pointer' }}
                            />
                            전체 선택 ({filteredAllSchedules.length}건 중 {selectedBatchScheduleIds.length}개 선택됨)
                          </label>
                        </div>

                        {selectedBatchScheduleIds.length > 0 && (
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              type="button"
                              onClick={() => setIsBatchScheduleEditModalOpen(true)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: '#4F46E5',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '6px 14px',
                                fontSize: '13px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                minHeight: '36px',
                              }}
                            >
                              ✏️ {selectedBatchScheduleIds.length}개 일괄 수정
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDuplicateSelectedSeries()}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: '#10B981',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '6px 14px',
                                fontSize: '13px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                minHeight: '36px',
                              }}
                              title="선택한 일정을 새 학기 시작 날짜로 통째로 복제"
                            >
                              🔁 다음 학기로 복제
                            </button>
                            <button
                              type="button"
                              onClick={() => handleBatchArchiveSelected(true)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: '#8B5CF6',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '6px 14px',
                                fontSize: '13px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                minHeight: '36px',
                              }}
                              title="선택한 일정을 지난 시즌 아카이브로 보관"
                            >
                              📦 {selectedBatchScheduleIds.length}개 아카이브
                            </button>
                            <button
                              type="button"
                              onClick={() => handleBatchArchiveSelected(false)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: '#EDE9FE',
                                color: '#6D28D9',
                                border: '1px solid #C4B5FD',
                                borderRadius: '8px',
                                padding: '6px 14px',
                                fontSize: '13px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                minHeight: '36px',
                              }}
                              title="선택한 일정을 일반 목록으로 복원"
                            >
                              📂 보관 해제
                            </button>
                            <button
                              type="button"
                              onClick={handleBatchDeleteSelected}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: '#EF4444',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '6px 14px',
                                fontSize: '13px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                minHeight: '36px',
                              }}
                            >
                              🗑️ {selectedBatchScheduleIds.length}개 일괄 삭제
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedBatchScheduleIds([])}
                              style={{
                                background: '#FFFFFF',
                                color: '#64748B',
                                border: '1px solid #CBD5E1',
                                borderRadius: '8px',
                                padding: '6px 12px',
                                fontSize: '13px',
                                cursor: 'pointer',
                                minHeight: '36px',
                              }}
                            >
                              선택 해제
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Schedule List Cards */}
                      {filteredAllSchedules.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '520px', overflowY: 'auto' }}>
                          {filteredAllSchedules.map((sch) => {
                            const isChecked = selectedBatchScheduleIds.includes(sch.id);
                            const isSelectedForEdit = editingScheduleForForm?.id === sch.id;
                            return (
                              <div
                                key={sch.id}
                                onClick={() => handleBindScheduleToForm(sch)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  background: isSelectedForEdit ? '#EEF2FF' : isChecked ? '#F5F3FF' : '#FFFFFF',
                                  border: isSelectedForEdit ? '1.5px solid #6366F1' : `1px solid ${isChecked ? '#DDD6FE' : '#E2E8F0'}`,
                                  boxShadow: isSelectedForEdit ? '0 0 0 2px rgba(99, 102, 241, 0.2)' : 'none',
                                  borderRadius: '10px',
                                  padding: '10px 14px',
                                  gap: '12px',
                                  transition: 'all 0.15s ease',
                                  cursor: 'pointer',
                                }}
                                title="클릭하여 우측에서 일정 정보 수정"
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => handleToggleSelectSchedule(sch.id)}
                                    onClick={(e) => e.stopPropagation()}
                                    style={{ width: '18px', height: '18px', accentColor: '#4F46E5', cursor: 'pointer' }}
                                  />
                                  <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                      {isSelectedForEdit && (
                                        <span style={{ fontSize: '11px', color: '#4F46E5', fontWeight: 700 }}>
                                          ✏️ 편집 중:
                                        </span>
                                      )}
                                      <span
                                        style={{
                                          fontSize: '12px',
                                          fontWeight: 800,
                                          color: '#3B82F6',
                                          background: '#EFF6FF',
                                          padding: '2px 8px',
                                          borderRadius: '6px',
                                        }}
                                      >
                                        {sch.date}
                                      </span>
                                      <span className="schedule-category-badge">{sch.category}</span>
                                      <strong style={{ fontSize: '13.5px', color: '#1E293B' }}>{sch.title}</strong>
                                      {sch.seriesIndex && sch.seriesTotal && (
                                        <span
                                          style={{
                                            fontSize: '11px',
                                            color: '#059669',
                                            background: '#ECFDF5',
                                            border: '1px solid #A7F3D0',
                                            padding: '1px 6px',
                                            borderRadius: '4px',
                                            fontWeight: 600,
                                          }}
                                        >
                                          {sch.seriesIndex}/{sch.seriesTotal}회차
                                        </span>
                                      )}
                                      {sch.checkInPin && (
                                        <span style={{ fontSize: '11px', color: '#64748B', background: '#F1F5F9', padding: '1px 6px', borderRadius: '4px' }}>
                                          PIN: {sch.checkInPin}
                                        </span>
                                      )}
                                    </div>
                                    <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#64748B' }}>
                                      🕒 {sch.startTime} ~ {sch.endTime} · 📍 {sch.locationName}
                                    </p>
                                    {sch.description && (
                                      <p style={{ margin: '2px 0 0', fontSize: '11.5px', color: '#94A3B8' }}>
                                        메모: {sch.description}
                                      </p>
                                    )}
                                  </div>
                                </div>

                                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                                  {sch.seriesId && (
                                    <button
                                      type="button"
                                      className="btn-edit-sch-mini"
                                      onClick={() => handleDuplicateSelectedSeries(sch.seriesId)}
                                      title="이 일정 묶음을 다음 학기로 통째로 복제"
                                      style={{
                                        background: '#F0FDF4',
                                        color: '#059669',
                                        border: '1px solid #BBF7D0',
                                        borderRadius: '6px',
                                        padding: '5px 8px',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        minHeight: '34px',
                                      }}
                                    >
                                      🔁 시즌 복제
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleToggleArchiveSchedule(sch.id, !sch.isArchived)}
                                    title={sch.isArchived ? '일반 목록으로 복원' : '지난 시즌 아카이브로 보관'}
                                    style={{
                                      background: sch.isArchived ? '#EDE9FE' : '#F1F5F9',
                                      color: sch.isArchived ? '#6D28D9' : '#475569',
                                      border: `1px solid ${sch.isArchived ? '#C4B5FD' : '#CBD5E1'}`,
                                      borderRadius: '6px',
                                      padding: '5px 8px',
                                      fontSize: '12px',
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                      minHeight: '34px',
                                    }}
                                  >
                                    {sch.isArchived ? '📂 복원' : '📦 보관'}
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-edit-sch-mini"
                                    onClick={() => handleCloneScheduleToForm(sch)}
                                    title={sch.date < getTodayString() ? "오늘 날짜로 복제" : "일정 복제"}
                                    style={{
                                      background: sch.date < getTodayString() ? '#ECFDF5' : '#F8FAFC',
                                      color: sch.date < getTodayString() ? '#059669' : '#475569',
                                      border: `1px solid ${sch.date < getTodayString() ? '#A7F3D0' : '#CBD5E1'}`,
                                      borderRadius: '6px',
                                      padding: '5px 10px',
                                      fontSize: '12px',
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                      minHeight: '34px',
                                    }}
                                  >
                                    {sch.date < getTodayString() ? '📋 오늘로 복제' : '📋 복제'}
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-delete-sch-mini"
                                    onClick={() => handleDeleteSchedule(sch.id, sch.title)}
                                    style={{ minHeight: '34px', padding: '5px 8px' }}
                                  >
                                    🗑️ 삭제
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="empty-subtext" style={{ padding: '24px 0', textAlign: 'center', margin: 0 }}>
                          조건에 부합하는 일정이 없습니다.
                        </p>
                      )}
                    </div>
                  ) : (
                    /* PROGRAM_CARDS CONTAINER VIEW */
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                        <div>
                          <h2 className="section-title" style={{ margin: 0 }}>
                            📦 일정 카드(프로젝트) 묶음 관리
                          </h2>
                          <p className="section-subtitle" style={{ margin: '4px 0 0' }}>
                            구글 시트 [일정카드] 탭과 실시간 동기화되어 학기별 정기연습과 추가연습을 영구 보존 관리합니다.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleOpenCreateProgramCard}
                          style={{
                            background: 'linear-gradient(135deg, #4f46e5, #6366f1)',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '8px 14px',
                            fontSize: '13px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 2px 5px rgba(79, 70, 229, 0.25)',
                          }}
                        >
                          ➕ 새 일정 카드 만들기
                        </button>
                      </div>

                      {programGroups.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '520px', overflowY: 'auto' }}>
                          {programGroups.map((group) => {
                            const isExpanded = expandedCardIds.has(group.cardId);
                            const audienceLabel =
                              group.targetAudienceType === 'PARTS'
                                ? `👥 파트: ${group.targetParts?.join(', ') || '지정 없음'}`
                                : group.targetAudienceType === 'CUSTOM_MEMBERS'
                                ? `🎯 선발단원: ${group.targetMemberIds?.length || 0}명`
                                : '🌐 전체 단원 필참';

                            return (
                              <div
                                key={group.cardId}
                                style={{
                                  background: '#FFFFFF',
                                  border: group.isRegisteredCard ? '1.5px solid #C7D2FE' : '1px solid #E2E8F0',
                                  borderRadius: '12px',
                                  padding: '16px',
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                                  <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                      <span className="schedule-category-badge">{group.category}</span>
                                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#1E293B' }}>
                                        {group.title}
                                      </h3>
                                      <span style={{ fontSize: '12px', color: '#6366F1', background: '#EEF2FF', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>
                                        총 {group.schedules.length}회차
                                      </span>
                                      <span style={{ fontSize: '11px', color: '#047857', background: '#D1FAE5', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                        {audienceLabel}
                                      </span>
                                      {group.isRegisteredCard && (
                                        <span style={{ fontSize: '10.5px', color: '#4338CA', background: '#E0E7FF', padding: '1px 5px', borderRadius: '4px' }}>
                                          시트 저장됨
                                        </span>
                                      )}
                                    </div>
                                    <p style={{ margin: '6px 0 0', fontSize: '12.5px', color: '#64748B' }}>
                                      {group.startDate ? `📅 ${group.startDate} ~ ${group.endDate}` : '📅 등록된 회차 일정 없음'} · 🕒 {group.startTime}~{group.endTime} · 📍 {group.locationName}
                                    </p>
                                    {group.description && (
                                      <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#94A3B8' }}>
                                        메모: {group.description}
                                      </p>
                                    )}
                                  </div>

                                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    {group.isRegisteredCard && group.rawCard && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => handleOpenEditProgramCard(group.rawCard!)}
                                          style={{
                                            background: '#F8FAFC',
                                            color: '#334155',
                                            border: '1px solid #CBD5E1',
                                            borderRadius: '6px',
                                            padding: '6px 8px',
                                            fontSize: '11.5px',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                          }}
                                          title="일정 카드 속성 수정"
                                        >
                                          ✏️ 카드 수정
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteProgramCard(group.cardId, group.title)}
                                          style={{
                                            background: '#FFF1F2',
                                            color: '#E11D48',
                                            border: '1px solid #FECDD3',
                                            borderRadius: '6px',
                                            padding: '6px 8px',
                                            fontSize: '11.5px',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                          }}
                                          title="일정 카드 삭제"
                                        >
                                          🗑️ 카드 삭제
                                        </button>
                                      </>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setNewTitle(`${group.title} 추가연습`);
                                        const matchedLoc = locationPresets.find((l) => l.name === group.locationName);
                                        if (matchedLoc) {
                                          setSelectedLocationPresetId(matchedLoc.id);
                                        }
                                        setNewStartTime(group.startTime);
                                        setNewEndTime(group.endTime);
                                        setNewCategory('추가연습');
                                        setSelectedProgramCardId(group.cardId);
                                        if (group.targetAudienceType) {
                                          setNewTargetAudienceType(group.targetAudienceType);
                                          setNewTargetParts(group.targetParts || []);
                                          setNewTargetMemberIds(group.targetMemberIds || []);
                                        }
                                        setScheduleSuccessMsg(`[${group.title}]에 등록할 추가연습 정보를 우측 폼에 세팅했습니다. 날짜를 확인하고 등록을 눌러주세요.`);
                                        setTimeout(() => setScheduleSuccessMsg(''), 4500);
                                      }}
                                      style={{
                                        background: '#EEF2FF',
                                        color: '#4F46E5',
                                        border: '1px solid #C7D2FE',
                                        borderRadius: '6px',
                                        padding: '6px 10px',
                                        fontSize: '12px',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                      }}
                                    >
                                      ➕ 추가연습 등록
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDuplicateSelectedSeries(group.cardId)}
                                      style={{
                                        background: '#F0FDF4',
                                        color: '#059669',
                                        border: '1px solid #BBF7D0',
                                        borderRadius: '6px',
                                        padding: '6px 10px',
                                        fontSize: '12px',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                      }}
                                    >
                                      🔁 다음 학기로 복제
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleToggleArchiveGroup(group.schedules.map((s) => s.id), !group.isArchived)}
                                      style={{
                                        background: group.isArchived ? '#EDE9FE' : '#F8FAFC',
                                        color: group.isArchived ? '#6D28D9' : '#475569',
                                        border: `1px solid ${group.isArchived ? '#C4B5FD' : '#CBD5E1'}`,
                                        borderRadius: '6px',
                                        padding: '6px 10px',
                                        fontSize: '12px',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                      }}
                                    >
                                      {group.isArchived ? '📂 보관 해제' : '📦 아카이브'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setExpandedCardIds((prev) => {
                                          const next = new Set(prev);
                                          if (next.has(group.cardId)) next.delete(group.cardId);
                                          else next.add(group.cardId);
                                          return next;
                                        });
                                      }}
                                      style={{
                                        background: isExpanded ? '#F1F5F9' : '#FFFFFF',
                                        color: '#475569',
                                        border: '1px solid #CBD5E1',
                                        borderRadius: '6px',
                                        padding: '6px 10px',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                      }}
                                    >
                                      {isExpanded ? '▲ 접기' : `▼ 일정표 (${group.schedules.length})`}
                                    </button>
                                  </div>
                                </div>

                                {isExpanded && (
                                  <div style={{ marginTop: '12px', borderTop: '1px solid #F1F5F9', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {group.schedules.map((sch) => {
                                      const isSelectedForEdit = editingScheduleForForm?.id === sch.id;
                                      return (
                                        <div
                                          key={sch.id}
                                          onClick={() => handleBindScheduleToForm(sch)}
                                          style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            padding: '8px 12px',
                                            background: isSelectedForEdit ? '#EEF2FF' : '#F8FAFC',
                                            border: isSelectedForEdit ? '1.5px solid #6366F1' : '1px solid #E2E8F0',
                                            borderRadius: '6px',
                                            fontSize: '12px',
                                            cursor: 'pointer',
                                            boxShadow: isSelectedForEdit ? '0 0 0 2px rgba(99, 102, 241, 0.2)' : 'none',
                                            transition: 'all 0.15s ease',
                                          }}
                                          title="클릭하여 우측에서 일정 정보 수정"
                                        >
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            {isSelectedForEdit && (
                                              <span style={{ fontSize: '11px', color: '#4F46E5', fontWeight: 700 }}>
                                                ✏️ 편집 중:
                                              </span>
                                            )}
                                            <strong style={{ color: '#2563EB' }}>{sch.date}</strong>
                                            <span style={{ color: '#1E293B', fontWeight: 600 }}>{sch.title}</span>
                                            <span style={{ color: '#64748B' }}>({sch.startTime}~{sch.endTime})</span>
                                          </div>
                                          <div style={{ display: 'flex', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
                                            <button
                                              type="button"
                                              onClick={() => handleCloneScheduleToForm(sch)}
                                              style={{
                                                background: '#F1F5F9',
                                                color: '#475569',
                                                border: '1px solid #CBD5E1',
                                                borderRadius: '4px',
                                                padding: '3px 8px',
                                                fontSize: '11px',
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                              }}
                                              title="일정 복제"
                                            >
                                              복제
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteSchedule(sch.id, sch.title)}
                                              style={{
                                                background: '#FEE2E2',
                                                color: '#DC2626',
                                                border: 'none',
                                                borderRadius: '4px',
                                                padding: '3px 8px',
                                                fontSize: '11px',
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                              }}
                                            >
                                              삭제
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="empty-subtext" style={{ padding: '24px 0', textAlign: 'center', margin: 0 }}>
                          등록된 일정 카드가 없습니다.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Recurring Schedule Creation Form */}
              <div className="admin-form-col">
                <div className="admin-form-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                    <div>
                      <h2 className="section-title" style={{ margin: 0 }}>
                        {editingScheduleForForm ? '✏️ 일정 인라인 수정' : '연습 및 연주 일정 등록 (반복 엔진)'}
                      </h2>
                      <p className="section-subtitle" style={{ margin: '4px 0 0' }}>
                        {editingScheduleForForm
                          ? `선택된 [${editingScheduleForForm.title}] 일정을 수정하여 시트에 즉시 반영합니다.`
                          : '네이버/애플 캘린더처럼 매주 특정 요일 반복 일정을 손쉽게 전개하여 등록합니다.'}
                      </p>
                    </div>
                    {editingScheduleForForm && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingScheduleForForm(null);
                          setNewTitle('');
                          setNewDesc('');
                        }}
                        style={{
                          background: '#F1F5F9',
                          color: '#475569',
                          border: '1px solid #CBD5E1',
                          borderRadius: '6px',
                          padding: '5px 10px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        ✕ 신규 등록으로 복귀
                      </button>
                    )}
                  </div>

                  {scheduleSuccessMsg && <div className="success-banner">{scheduleSuccessMsg}</div>}

                  <form onSubmit={handleCreateScheduleSubmit} className="form-stack">
                    {/* Program Card Container Selector */}
                    <div>
                      <label className="form-label" htmlFor="sch-program-card">
                        소속 일정 카드 (컨테이너)
                      </label>
                      <select
                        id="sch-program-card"
                        className="select-input"
                        value={selectedProgramCardId}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedProgramCardId(val);
                          const found = programCards.find((c) => c.id === val);
                          if (found) {
                            if (found.category) setNewCategory(found.category);
                            if (found.defaultLocationId) handleLocationPresetChange(found.defaultLocationId);
                            if (found.defaultStartTime) setNewStartTime(found.defaultStartTime);
                            if (found.defaultEndTime) setNewEndTime(found.defaultEndTime);
                            if (found.targetAudienceType) {
                              setNewTargetAudienceType(found.targetAudienceType);
                              setNewTargetParts(found.targetParts || []);
                              setNewTargetMemberIds(found.targetMemberIds || []);
                            }
                          }
                        }}
                      >
                        <option value="">📌 소속 없음 (독립 일정)</option>
                        {programCards.map((card) => (
                          <option key={card.id} value={card.id}>
                            📦 [{card.category}] {card.title}
                          </option>
                        ))}
                      </select>
                      <span className="form-hint" style={{ fontSize: '11.5px', color: '#64748B' }}>
                        * 일정 카드를 선택하면 해당 카드의 기본 시간/장소/대상자 설정이 자동으로 반영됩니다.
                      </span>
                    </div>

                    <label className="form-label" htmlFor="sch-title" style={{ marginTop: '4px' }}>
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

                    {/* 4-Mode Recurrence Engine Selector */}
                    <div className="toss-section-card" style={{ padding: '14px', margin: '4px 0' }}>
                      <span className="form-label" style={{ marginBottom: '8px', display: 'block' }}>
                        일정 생성 방식 선택 (4대 다채널 엔진)
                      </span>
                      <div className="toss-filter-row" style={{ marginBottom: '10px', flexWrap: 'wrap', gap: '6px' }}>
                        {(
                          [
                            { key: 'SINGLE', label: '📌 단일 일정 (1회)' },
                            { key: 'INTERVAL', label: '🔁 주기 반복 (매 N일/주/월)' },
                            { key: 'DAYS_OF_WEEK', label: '🗓️ 요일 지정 (특정 요일 N주간)' },
                            { key: 'CALENDAR_PICK', label: '📅 달력 직접 픽 (날짜 복수 선택)' },
                          ] as const
                        ).map((mode) => (
                          <button
                            key={mode.key}
                            type="button"
                            className={`toss-filter-chip ${scheduleAddMode === mode.key ? 'active' : ''}`}
                            onClick={() => setScheduleAddMode(mode.key)}
                          >
                            <span>{mode.label}</span>
                          </button>
                        ))}
                      </div>

                      {/* Mode: INTERVAL */}
                      {scheduleAddMode === 'INTERVAL' && (
                        <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: '1px solid #E2E8F0', marginTop: '6px' }}>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>매</span>
                            <input
                              type="number"
                              min={1}
                              max={365}
                              className="input-text"
                              style={{ width: '70px', padding: '6px 8px' }}
                              value={intervalStep}
                              onChange={(e) => setIntervalStep(Math.max(1, Number(e.target.value)))}
                            />
                            <select
                              className="select-input"
                              style={{ width: '100px', padding: '6px 8px' }}
                              value={intervalUnit}
                              onChange={(e) => setIntervalUnit(e.target.value as 'DAYS' | 'WEEKS' | 'MONTHS')}
                            >
                              <option value="DAYS">일마다</option>
                              <option value="WEEKS">주마다</option>
                              <option value="MONTHS">개월마다</option>
                            </select>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>총</span>
                            <input
                              type="number"
                              min={1}
                              max={52}
                              className="input-text"
                              style={{ width: '70px', padding: '6px 8px' }}
                              value={intervalCount}
                              onChange={(e) => setIntervalCount(Math.max(1, Number(e.target.value)))}
                            />
                            <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>회차 전개</span>
                          </div>
                          <span className="form-hint" style={{ marginTop: '8px', display: 'block', color: '#6366F1' }}>
                            💡 {newDate}부터 {intervalStep}{intervalUnit === 'DAYS' ? '일' : intervalUnit === 'WEEKS' ? '주' : '개월'} 간격으로 총 {intervalCount}개의 일정이 자동 일괄 생성됩니다.
                          </span>
                        </div>
                      )}

                      {/* Mode: DAYS_OF_WEEK */}
                      {scheduleAddMode === 'DAYS_OF_WEEK' && (
                        <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: '1px solid #E2E8F0', marginTop: '6px' }}>
                          <label className="form-label" style={{ fontSize: '13px', marginBottom: '6px' }}>
                            반복 요일 다중 선택
                          </label>
                          <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>반복 주수: 총</span>
                            <input
                              type="number"
                              min={1}
                              max={52}
                              className="input-text"
                              style={{ width: '80px', padding: '6px 8px' }}
                              value={weeksCount}
                              onChange={(e) => setWeeksCount(Math.max(1, Number(e.target.value)))}
                            />
                            <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>주 동안 전개</span>
                          </div>
                          <span className="form-hint" style={{ marginTop: '8px', display: 'block', color: '#6366F1' }}>
                            💡 {newDate} 주차부터 {selectedDays.length}개 요일에 맞춰 {weeksCount}주간 총 {selectedDays.length * weeksCount}개 일정이 자동 일괄 생성됩니다.
                          </span>
                        </div>
                      )}

                      {/* Mode: CALENDAR_PICK */}
                      {scheduleAddMode === 'CALENDAR_PICK' && (
                        <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: '1px solid #E2E8F0', marginTop: '6px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <button
                              type="button"
                              onClick={handlePickCalPrevMonth}
                              style={{ background: '#fff', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer' }}
                            >
                              ◀ 이전 달
                            </button>
                            <span style={{ fontWeight: 700, fontSize: '14px', color: '#1E293B' }}>
                              {pickCalYear}년 {pickCalMonth + 1}월
                            </span>
                            <button
                              type="button"
                              onClick={handlePickCalNextMonth}
                              style={{ background: '#fff', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer' }}
                            >
                              다음 달 ▶
                            </button>
                          </div>

                          {/* Calendar Grid */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center', marginBottom: '8px' }}>
                            {['일', '월', '화', '수', '목', '금', '토'].map((dw, idx) => (
                              <div key={dw} style={{ fontSize: '11px', fontWeight: 600, color: idx === 0 ? '#EF4444' : idx === 6 ? '#3B82F6' : '#64748B', padding: '4px 0' }}>
                                {dw}
                              </div>
                            ))}
                            {getCalendarGrid(pickCalYear, pickCalMonth).map((day) => {
                              const isPicked = pickedDates.includes(day.dateStr);
                              return (
                                <button
                                  key={day.dateStr}
                                  type="button"
                                  onClick={() => togglePickedDate(day.dateStr)}
                                  style={{
                                    minHeight: '34px',
                                    borderRadius: '6px',
                                    border: isPicked ? '1.5px solid var(--brand-accent)' : '1px solid #E2E8F0',
                                    background: isPicked ? 'var(--brand-accent)' : '#FFFFFF',
                                    color: isPicked ? '#FFFFFF' : day.isCurrentMonth ? '#1E293B' : '#94A3B8',
                                    fontWeight: isPicked ? 700 : 500,
                                    fontSize: '12.5px',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                    opacity: day.isCurrentMonth ? 1 : 0.45,
                                  }}
                                >
                                  {day.dayNumber}
                                </button>
                              );
                            })}
                          </div>

                          {/* Picked Dates Chips */}
                          <div style={{ marginTop: '8px', borderTop: '1px dashed #CBD5E1', paddingTop: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                              <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                                선택된 날짜 ({pickedDates.length}개)
                              </span>
                              {pickedDates.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setPickedDates([])}
                                  style={{ fontSize: '11px', color: '#EF4444', background: 'transparent', border: 'none', cursor: 'pointer' }}
                                >
                                  전체 선택 해제
                                </button>
                              )}
                            </div>
                            {pickedDates.length === 0 ? (
                              <span style={{ fontSize: '12px', color: '#94A3B8' }}>달력에서 일정을 추가할 날짜들을 클릭하세요.</span>
                            ) : (
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', maxHeight: '100px', overflowY: 'auto' }}>
                                {pickedDates.map((pDate) => (
                                  <span
                                    key={pDate}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      background: '#EEF2FF',
                                      color: '#4338CA',
                                      padding: '2px 8px',
                                      borderRadius: '12px',
                                      fontSize: '11.5px',
                                      fontWeight: 600,
                                    }}
                                  >
                                    {pDate}
                                    <button
                                      type="button"
                                      onClick={() => togglePickedDate(pDate)}
                                      style={{ background: 'transparent', border: 'none', color: '#4338CA', cursor: 'pointer', padding: 0, fontSize: '12px' }}
                                    >
                                      ✕
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Attendance Target Audience Selector */}
                    <div className="toss-section-card" style={{ padding: '14px', margin: '4px 0' }}>
                      <span className="form-label" style={{ marginBottom: '8px', display: 'block' }}>
                        참석 대상자 지정 (통계 모수 필터)
                      </span>
                      <div className="toss-filter-row" style={{ marginBottom: '10px', gap: '6px', flexWrap: 'wrap' }}>
                        {(
                          [
                            { key: 'ALL', label: '🌐 전체 단원 필참' },
                            { key: 'PARTS', label: '👥 특정 파트 한정' },
                            { key: 'CUSTOM_MEMBERS', label: '🎯 선발 단원 (수동 지정)' },
                          ] as const
                        ).map((aud) => (
                          <button
                            key={aud.key}
                            type="button"
                            className={`toss-filter-chip ${newTargetAudienceType === aud.key ? 'active' : ''}`}
                            onClick={() => setNewTargetAudienceType(aud.key)}
                          >
                            <span>{aud.label}</span>
                          </button>
                        ))}
                      </div>

                      {/* Audience Type: PARTS */}
                      {newTargetAudienceType === 'PARTS' && (
                        <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                          <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '6px' }}>
                            참석 대상 파트 선택 (복수 선택 가능)
                          </span>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {dynamicParts.map((part) => {
                              const isSel = newTargetParts.includes(part);
                              return (
                                <button
                                  key={part}
                                  type="button"
                                  onClick={() => {
                                    setNewTargetParts((prev) =>
                                      prev.includes(part) ? prev.filter((p) => p !== part) : [...prev, part]
                                    );
                                  }}
                                  style={{
                                    padding: '6px 12px',
                                    borderRadius: '8px',
                                    border: isSel ? '1.5px solid #059669' : '1px solid #CBD5E1',
                                    background: isSel ? '#D1FAE5' : '#FFFFFF',
                                    color: isSel ? '#047857' : '#334155',
                                    fontWeight: isSel ? 700 : 500,
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                  }}
                                >
                                  {part} {isSel ? '✓' : ''}
                                </button>
                              );
                            })}
                          </div>
                          <span className="form-hint" style={{ marginTop: '8px', display: 'block', color: '#047857' }}>
                            * 선택되지 않은 파트 단원은 출결 통계에서 자동으로 '모수제외' 처리됩니다.
                          </span>
                        </div>
                      )}

                      {/* Audience Type: CUSTOM_MEMBERS */}
                      {newTargetAudienceType === 'CUSTOM_MEMBERS' && (
                        <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                          <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '6px' }}>
                            선발 단원 지정 ({newTargetMemberIds.length}명 선택됨)
                          </span>
                          <input
                            type="text"
                            className="input-text"
                            placeholder="이름 또는 파트로 단원 검색..."
                            value={customMemberSearch}
                            onChange={(e) => setCustomMemberSearch(e.target.value)}
                            style={{ marginBottom: '8px', fontSize: '12px', padding: '6px 8px' }}
                          />
                          {/* Member Selection List */}
                          <div style={{ maxHeight: '140px', overflowY: 'auto', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '6px' }}>
                            {members
                              .filter((m) => {
                                if (!customMemberSearch.trim()) return true;
                                const q = customMemberSearch.toLowerCase();
                                return m.name.toLowerCase().includes(q) || m.part.toLowerCase().includes(q);
                              })
                              .map((m) => {
                                const isSel = newTargetMemberIds.includes(m.id);
                                return (
                                  <div
                                    key={m.id}
                                    onClick={() => {
                                      setNewTargetMemberIds((prev) =>
                                        isSel ? prev.filter((id) => id !== m.id) : [...prev, m.id]
                                      );
                                    }}
                                    style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      padding: '5px 8px',
                                      borderRadius: '4px',
                                      background: isSel ? '#EEF2FF' : 'transparent',
                                      cursor: 'pointer',
                                      fontSize: '12px',
                                    }}
                                  >
                                    <span>
                                      <strong>{m.name}</strong> ({m.part} · {m.phoneLast4 || '0000'})
                                    </span>
                                    <span style={{ color: isSel ? '#4F46E5' : '#94A3B8', fontWeight: 700 }}>
                                      {isSel ? '선택됨 ✓' : '+ 추가'}
                                    </span>
                                  </div>
                                );
                              })}
                          </div>
                          <span className="form-hint" style={{ marginTop: '8px', display: 'block', color: '#4F46E5' }}>
                            * 지정된 선발 단원 외 단원은 자율 참여 일정으로 분류됩니다.
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="form-row-2">
                      {scheduleAddMode !== 'CALENDAR_PICK' ? (
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
                      ) : (
                        <div>
                          <label className="form-label">달력 선택 날짜</label>
                          <div style={{ padding: '10px 12px', background: '#F1F5F9', borderRadius: '8px', fontSize: '13px', color: '#475569' }}>
                            {pickedDates.length > 0 ? `선택된 ${pickedDates.length}개 날짜로 전개` : '달력에서 날짜를 1개 이상 선택하세요.'}
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="form-label">일정 구분</label>
                        <select
                          className="select-input"
                          value={isCustomNewCategory ? '__CUSTOM__' : newCategory}
                          onChange={(e) => {
                            if (e.target.value === '__CUSTOM__') {
                              setIsCustomNewCategory(true);
                            } else {
                              setIsCustomNewCategory(false);
                              setNewCategory(e.target.value as ScheduleCategory);
                            }
                          }}
                        >
                          {dynamicCategories.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                          <option value="__CUSTOM__">✏️ + 새 구분 직접 추가...</option>
                        </select>
                        {isCustomNewCategory && (
                          <input
                            type="text"
                            className="input-text"
                            style={{ marginTop: '6px' }}
                            value={customNewCategoryInput}
                            onChange={(e) => setCustomNewCategoryInput(e.target.value)}
                            placeholder="새 일정 구분 직접 입력 (예: 총연습)"
                            required={isCustomNewCategory}
                            autoFocus
                          />
                        )}
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

                    {/* Unified Location Selector */}
                    <div style={{ marginTop: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <label className="form-label" htmlFor="sch-loc-select" style={{ marginBottom: 0 }}>
                          연습 장소
                        </label>
                        <button
                          type="button"
                          onClick={() => setIsScheduleLocationModalOpen(true)}
                          style={{
                            fontSize: '12px',
                            color: '#4F46E5',
                            fontWeight: 600,
                            background: '#EEF2FF',
                            border: '1px solid #C7D2FE',
                            borderRadius: '6px',
                            padding: '4px 10px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          🗺️ + 새 장소 등록 (검색/GPS)
                        </button>
                      </div>
                      <select
                        id="sch-loc-select"
                        className="select-input"
                        value={selectedLocationPresetId}
                        onChange={(e) => {
                          if (e.target.value === '__NEW_LOCATION__') {
                            setIsScheduleLocationModalOpen(true);
                          } else {
                            handleLocationPresetChange(e.target.value);
                          }
                        }}
                      >
                        {locationPresets.map((loc) => (
                          <option key={loc.id} value={loc.id}>
                            {loc.name} {loc.address ? `(${loc.address})` : ''} · 반경 {loc.radiusMeters}m
                          </option>
                        ))}
                        <option value="__NEW_LOCATION__">🗺️ + 새 연습실 등록 (지도/키워드 검색)...</option>
                      </select>
                      <div style={{ marginTop: '6px' }}>
                        <label className="form-label" htmlFor="sch-loc" style={{ fontSize: '12px', color: '#64748B' }}>
                          일정 표기용 장소명 (수정 가능)
                        </label>
                        <input
                          id="sch-loc"
                          type="text"
                          className="input-text"
                          value={newLocName}
                          onChange={(e) => setNewLocName(e.target.value)}
                          placeholder="장소명 (예: 서초 앙상블 연습실)"
                          required
                        />
                      </div>
                    </div>

                    <label className="form-label" htmlFor="sch-desc">
                      상세 설명 / 연습 곡목 (선택)
                    </label>
                    <textarea
                      id="sch-desc"
                      className="input-textarea"
                      placeholder="예: 모차르트 레퀴엠 파트 연습 및 암보 런스루"
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                      rows={5}
                    />

                    {editingScheduleForForm ? (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button type="submit" className="btn-primary-large" style={{ minHeight: '44px', flex: 1 }}>
                          저장
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingScheduleForForm(null);
                            setNewTitle('');
                            setNewDesc('');
                          }}
                          style={{
                            minHeight: '44px',
                            padding: '0 18px',
                            background: '#F1F5F9',
                            border: '1px solid #CBD5E1',
                            borderRadius: '8px',
                            fontSize: '14px',
                            fontWeight: 600,
                            color: '#475569',
                            cursor: 'pointer',
                          }}
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <button type="submit" className="btn-primary-large" style={{ minHeight: '44px' }}>
                        {scheduleAddMode === 'SINGLE' && '단일 일정 등록 완료'}
                        {scheduleAddMode === 'INTERVAL' && `${intervalCount}회차 주기 반복 일정 일괄 생성`}
                        {scheduleAddMode === 'DAYS_OF_WEEK' && `${selectedDays.length * weeksCount}개 요일 반복 일정 일괄 생성`}
                        {scheduleAddMode === 'CALENDAR_PICK' && `선택한 ${pickedDates.length}개 날짜 일정 일괄 생성`}
                      </button>
                    )}
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
      {/* MODAL: Single / Series Schedule Edit Modal                     */}
      {/* ============================================================== */}
      <ScheduleEditModal
        key={editingSchedule?.id || 'none'}
        isOpen={isScheduleEditModalOpen}
        schedule={editingSchedule}
        allSchedules={schedules}
        locationPresets={locationPresets}
        categories={dynamicCategories}
        onClose={() => {
          setIsScheduleEditModalOpen(false);
          setEditingSchedule(null);
        }}
        onSaveSingle={handleSaveScheduleSingle}
        onSaveSeries={handleSaveScheduleSeries}
        onDeleteSingle={handleDeleteScheduleSingle}
        onDeleteSeries={handleDeleteScheduleSeries}
        onSaveNewLocationPreset={handleAddNewLocationPresetFromModal}
      />

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
      {/* MODAL: Program Card (Container) Create / Edit Modal            */}
      {/* ============================================================== */}
      {isProgramCardModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-card" style={{ maxWidth: '540px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <div className="modal-badge" style={{ color: '#4F46E5', borderColor: '#C7D2FE', background: '#EEF2FF' }}>
                {editingProgramCard ? '일정 카드 속성 수정' : '새 일정 카드 (프로그램) 생성'}
              </div>
              <h2 className="modal-title" style={{ fontSize: '18px', marginTop: '8px' }}>
                {editingProgramCard ? `[${editingProgramCard.title}] 속성 변경` : '새로운 일정 묶음 카드 만들기'}
              </h2>
              <p className="modal-desc" style={{ marginTop: '4px', fontSize: '13px', color: '#64748B' }}>
                정기연주회, 특별행사, 특정 연습 시리즈를 카드 하나로 묶고 구글 시트에 영구 저장합니다.
              </p>
            </div>

            <form onSubmit={handleSaveProgramCardSubmit} className="form-stack" style={{ marginTop: '16px' }}>
              <label className="form-label" htmlFor="card-title">
                카드 명칭 (프로그램/행사명)
              </label>
              <input
                id="card-title"
                type="text"
                className="input-text"
                placeholder="예: 2026 봄 정기연주회, 10월 경찰의 날 행사"
                value={cardTitle}
                onChange={(e) => setCardTitle(e.target.value)}
                required
              />

              <div className="form-row-2">
                <div>
                  <label className="form-label">기본 일정 구분</label>
                  <select
                    className="select-input"
                    value={cardCategory}
                    onChange={(e) => setCardCategory(e.target.value as ScheduleCategory)}
                  >
                    {dynamicCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">기본 연습실 장소</label>
                  <select
                    className="select-input"
                    value={cardDefaultLocationId}
                    onChange={(e) => setCardDefaultLocationId(e.target.value)}
                  >
                    <option value="">선택 안 함 (회차별 개별 지정)</option>
                    {locationPresets.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row-2">
                <div>
                  <label className="form-label">기본 시작 시각</label>
                  <input
                    type="time"
                    className="input-text"
                    value={cardDefaultStartTime}
                    onChange={(e) => setCardDefaultStartTime(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">기본 종료 시각</label>
                  <input
                    type="time"
                    className="input-text"
                    value={cardDefaultEndTime}
                    onChange={(e) => setCardDefaultEndTime(e.target.value)}
                  />
                </div>
              </div>

              {/* Card Default Audience Selector */}
              <div className="toss-section-card" style={{ padding: '12px', margin: '4px 0' }}>
                <span className="form-label" style={{ marginBottom: '6px', display: 'block', fontSize: '13px' }}>
                  기본 참석 대상자 (통계 모수 필터)
                </span>
                <div className="toss-filter-row" style={{ marginBottom: '8px', gap: '6px', flexWrap: 'wrap' }}>
                  {(
                    [
                      { key: 'ALL', label: '🌐 전체 단원 필참' },
                      { key: 'PARTS', label: '👥 특정 파트 한정' },
                      { key: 'CUSTOM_MEMBERS', label: '🎯 선발 단원' },
                    ] as const
                  ).map((aud) => (
                    <button
                      key={aud.key}
                      type="button"
                      className={`toss-filter-chip ${cardAudienceType === aud.key ? 'active' : ''}`}
                      onClick={() => setCardAudienceType(aud.key)}
                    >
                      <span>{aud.label}</span>
                    </button>
                  ))}
                </div>

                {cardAudienceType === 'PARTS' && (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                    {dynamicParts.map((part) => {
                      const isSel = cardTargetParts.includes(part);
                      return (
                        <button
                          key={part}
                          type="button"
                          onClick={() => {
                            setCardTargetParts((prev) =>
                              prev.includes(part) ? prev.filter((p) => p !== part) : [...prev, part]
                            );
                          }}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '6px',
                            border: isSel ? '1.5px solid #059669' : '1px solid #CBD5E1',
                            background: isSel ? '#D1FAE5' : '#FFFFFF',
                            color: isSel ? '#047857' : '#334155',
                            fontWeight: isSel ? 700 : 500,
                            fontSize: '11.5px',
                            cursor: 'pointer',
                          }}
                        >
                          {part} {isSel ? '✓' : ''}
                        </button>
                      );
                    })}
                  </div>
                )}

                {cardAudienceType === 'CUSTOM_MEMBERS' && (
                  <div style={{ marginTop: '6px' }}>
                    <input
                      type="text"
                      className="input-text"
                      placeholder="이름 또는 파트로 검색..."
                      value={cardMemberSearch}
                      onChange={(e) => setCardMemberSearch(e.target.value)}
                      style={{ marginBottom: '6px', fontSize: '12px', padding: '5px 8px' }}
                    />
                    <div style={{ maxHeight: '120px', overflowY: 'auto', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '4px' }}>
                      {members
                        .filter((m) => {
                          if (!cardMemberSearch.trim()) return true;
                          const q = cardMemberSearch.toLowerCase();
                          return m.name.toLowerCase().includes(q) || m.part.toLowerCase().includes(q);
                        })
                        .map((m) => {
                          const isSel = cardTargetMemberIds.includes(m.id);
                          return (
                            <div
                              key={m.id}
                              onClick={() => {
                                setCardTargetMemberIds((prev) =>
                                  isSel ? prev.filter((id) => id !== m.id) : [...prev, m.id]
                                );
                              }}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '4px 6px',
                                borderRadius: '4px',
                                background: isSel ? '#EEF2FF' : 'transparent',
                                cursor: 'pointer',
                                fontSize: '11.5px',
                              }}
                            >
                              <span>
                                <strong>{m.name}</strong> ({m.part} · {m.phoneLast4 || '0000'})
                              </span>
                              <span style={{ color: isSel ? '#4F46E5' : '#94A3B8', fontWeight: 600 }}>
                                {isSel ? '선택됨 ✓' : '+ 추가'}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>

              <label className="form-label" htmlFor="card-desc">
                카드 상세 설명 (선택)
              </label>
              <textarea
                id="card-desc"
                className="input-textarea"
                placeholder="예: 2026년 정기연주회 준비를 위한 총 12회차 집중 연습 및 본공연"
                value={cardDesc}
                onChange={(e) => setCardDesc(e.target.value)}
                rows={2}
              />

              <div className="modal-button-group" style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                <button
                  type="submit"
                  className="btn-primary-large"
                  style={{ minHeight: '44px' }}
                >
                  💾 구글 시트에 카드 저장
                </button>
                <button
                  type="button"
                  className="btn-secondary-cancel"
                  style={{ minHeight: '44px' }}
                  onClick={() => setIsProgramCardModalOpen(false)}
                >
                  취소
                </button>
              </div>
            </form>
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
