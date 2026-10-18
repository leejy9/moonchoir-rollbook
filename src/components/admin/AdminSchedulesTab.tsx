import React, { useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { sheetsService } from '../../services/sheets';
import type {
  AppConfig,
  AttendanceReconciliation,
  AttendanceStatus,
  LocationPreset,
  Member,
  PartType,
  ProgramCard,
  Schedule,
  ScheduleCategory,
  TargetAudienceType,
} from '../../types/rollbook';
import { getCalendarGrid } from '../../utils/calendar';
import { getKSTDateString } from '../../utils/date';
import { IconRefresh } from '../Icons';
import { AdminCalendarView } from './AdminCalendarView';
import { AdminScheduleListView } from './AdminScheduleListView';
import { AdminProgramCardsView } from './AdminProgramCardsView';
import { AdminScheduleForm, type AdminScheduleFormSavePayload } from './AdminScheduleForm';
import { AdminProgramCardForm } from './AdminProgramCardForm';
import type { CardGroupToDelete } from '../../hooks/useScheduleAdmin';

function getTodayString(): string {
  return getKSTDateString(new Date());
}

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

export interface AdminSchedulesTabProps {
  schedules: Schedule[];
  programCards: ProgramCard[];
  locationPresets: LocationPreset[];
  members: Member[];
  defaultLocName: string;
  config: AppConfig;
  activeQrPayload: string;
  dynamicParts: string[];
  dynamicCategories: string[];
  onDataChanged: () => void;

  // useScheduleAdmin bindings
  rightPanelMode: 'SCHEDULE_FORM' | 'CARD_FORM';
  setRightPanelMode: (mode: 'SCHEDULE_FORM' | 'CARD_FORM') => void;
  editingScheduleForForm: Schedule | null;
  setEditingScheduleForForm: (sch: Schedule | null) => void;
  editingProgramCard: ProgramCard | null;
  setEditingProgramCard: (card: ProgramCard | null) => void;
  selectedProgramCardId: string | null;
  scheduleSuccessMsg: string;
  setScheduleSuccessMsg: (msg: string) => void;
  scheduleViewTab: 'CALENDAR' | 'ALL_LIST' | 'PROGRAM_CARDS';
  setScheduleViewTab: (tab: 'CALENDAR' | 'ALL_LIST' | 'PROGRAM_CARDS') => void;
  selectedBatchScheduleIds: string[];
  setSelectedBatchScheduleIds: React.Dispatch<React.SetStateAction<string[]>>;
  setIsBatchScheduleEditModalOpen: (open: boolean) => void;
  handleOpenCreateProgramCard: () => void;
  handleOpenEditProgramCard: (card: ProgramCard) => void;
  handleBindScheduleToForm: (sch: Schedule) => void;
  handleCloneScheduleToForm: (sch: Schedule) => void;
  handleSaveScheduleFromForm: (payload: AdminScheduleFormSavePayload) => Promise<void>;
  handleSaveProgramCard: (card: ProgramCard) => Promise<void>;
  handleDeleteScheduleSingle: (scheduleId: string, title: string, forceHardDelete?: boolean) => Promise<void>;
  handleDeleteScheduleSeries: (matchingIds: string[], title: string, forceHardDelete?: boolean) => Promise<void>;
  handleRestoreScheduleSingle: (scheduleId: string, title: string) => Promise<void>;
  handleDeleteSchedule: (scheduleId: string, title?: string) => void;
  handleApplyBatchScheduleUpdates: (ids: string[], updates: Partial<Schedule>) => Promise<void>;
  handleBatchDeleteSelected: () => Promise<void>;
  handleToggleSelectSchedule: (id: string) => void;
  handleSelectAllSchedules: (filteredIds: string[]) => void;
  handleToggleArchiveSchedule: (scheduleId: string, isArchived: boolean) => Promise<void>;
  handleBatchArchiveSelected: (isArchived: boolean) => Promise<void>;
  handleToggleArchiveGroup: (scheduleIds: string[], isArchived: boolean) => Promise<void>;
  handleDuplicateSelectedSeries: (preferredSeriesId?: string) => Promise<void>;
  setCardGroupToDelete: (target: CardGroupToDelete | null) => void;
  showArchivedSchedules: boolean;
  setShowArchivedSchedules: React.Dispatch<React.SetStateAction<boolean>>;
  setIsScheduleLocationModalOpen: (open: boolean) => void;

  // useAttendanceAdmin session bindings
  selectedScheduleId: string;
  setSelectedScheduleId: (id: string) => void;
  currentSchedule: Schedule | undefined;
  reconciledList: AttendanceReconciliation[];
  sessionFilter: '전체' | '출석' | '지각' | '사유결석' | '결석';
  setSessionFilter: (filter: '전체' | '출석' | '지각' | '사유결석' | '결석') => void;
  filteredSessionList: AttendanceReconciliation[];
  setOverrideTarget: (target: { id: string; name: string; part: string } | null) => void;

  // Actions
  handleRefreshMasterQR: () => void;
  handleRegenSessionPin: () => void;
  pinRegenMsg?: string;
}

export const AdminSchedulesTab: React.FC<AdminSchedulesTabProps> = ({
  schedules,
  programCards,
  locationPresets,
  members,
  defaultLocName,
  config,
  activeQrPayload,
  dynamicParts,
  dynamicCategories,
  onDataChanged: _onDataChanged,
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
  setIsBatchScheduleEditModalOpen,
  handleOpenCreateProgramCard,
  handleOpenEditProgramCard,
  handleBindScheduleToForm,
  handleCloneScheduleToForm,
  handleSaveScheduleFromForm,
  handleSaveProgramCard,
  handleDeleteScheduleSingle,
  handleDeleteScheduleSeries: _handleDeleteScheduleSeries,
  handleRestoreScheduleSingle,
  handleDeleteSchedule,
  handleApplyBatchScheduleUpdates: _handleApplyBatchScheduleUpdates,
  handleBatchDeleteSelected,
  handleToggleSelectSchedule,
  handleSelectAllSchedules,
  handleToggleArchiveSchedule,
  handleBatchArchiveSelected,
  handleToggleArchiveGroup,
  handleDuplicateSelectedSeries,
  setCardGroupToDelete,
  showArchivedSchedules,
  setShowArchivedSchedules,
  setIsScheduleLocationModalOpen,
  selectedScheduleId: _selectedScheduleId,
  setSelectedScheduleId,
  currentSchedule,
  reconciledList,
  sessionFilter,
  setSessionFilter,
  filteredSessionList,
  setOverrideTarget,
  handleRefreshMasterQR,
  handleRegenSessionPin,
  pinRegenMsg,
}) => {
  // Sub-segments for unified major categories: LIST (default), QR, SESSION
  const [scheduleSubTab, setScheduleSubTab] = useState<'LIST' | 'QR' | 'SESSION'>('LIST');

  // Interactive Month Calendar State (SCHEDULES > LIST)
  const [adminCalYear, setAdminCalYear] = useState(() => new Date().getFullYear());
  const [adminCalMonth, setAdminCalMonth] = useState(() => new Date().getMonth());
  const [adminSelectedDate, setAdminSelectedDate] = useState<string>(() => getTodayString());
  const [showCancelledSchedules, setShowCancelledSchedules] = useState(false);

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
    const groups = new Map<
      string,
      {
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
      }
    >();

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

  // QR Print text settings state
  const [printTitle, setPrintTitle] = useState(
    () => config.qrPrintTitle || (config.choirName ? `🎵 ${config.choirName} 출석 QR` : '🎵 문콰이어 정기연습 출석 QR')
  );
  const [printSubtitle, setPrintSubtitle] = useState(
    () => config.qrPrintSubtitle || `${defaultLocName} 상설 출석부`
  );
  const [printNotice, setPrintNotice] = useState(
    () => config.qrPrintNotice || '스마트폰 카메라로 비추거나 문콰이어 앱 [출석하기] 버튼을 눌러 스캔하세요.'
  );
  const [qrTextSavedMsg, setQrTextSavedMsg] = useState(false);

  const handleSaveQrPrintSettings = async () => {
    await sheetsService.updateConfig({
      qrPrintTitle: printTitle,
      qrPrintSubtitle: printSubtitle,
      qrPrintNotice: printNotice,
    });
    setQrTextSavedMsg(true);
    setTimeout(() => setQrTextSavedMsg(false), 3000);
  };

  return (
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
                  className={`toss-filter-tab ${sessionFilter === tabName ? 'active' : ''}`}
                  onClick={() => setSessionFilter(tabName)}
                >
                  {tabName}
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
                        <span className="badge-manual" title="관리자가 직접 출석 인정 처리함">
                          수동인정
                        </span>
                      )}
                    </div>

                    <div className="toss-member-meta">
                      {row.checkInTime ? (
                        <span className="meta-text text-checked">
                          ✓ 체크인 {row.checkInTime.slice(11, 16)} ({row.authMethod?.startsWith('QR') ? 'QR 스캔' : 'PIN 입력'})
                          {row.distanceMeters !== undefined && ` · ${row.distanceMeters}m`}
                        </span>
                      ) : row.rsvpStatus ? (
                        <span className={`meta-text text-rsvp-${row.rsvpStatus}`}>
                          사전투표: {row.rsvpStatus === 'ATTEND' ? '참석' : '결석'}
                          {row.rsvpReason && ` (${row.rsvpReason})`}
                        </span>
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
                  fontFamily: 'monospace',
                  background: '#EEF2FF',
                  padding: '2px 12px',
                  borderRadius: '8px',
                }}
              >
                {sheetsService.getActiveOnSitePin() || currentSchedule?.checkInPin || '5027'}
              </span>
              <span style={{ fontSize: '12px', color: '#64748B' }}>
                (카메라 스캔이 불가능한 단원은 [홈 → 출석하기 → PIN 입력]을 이용하세요)
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
                title="새로운 4자리 PIN을 즉시 재발급합니다"
              >
                🔄 PIN 재발급
              </button>
            </div>
          </div>

          {/* Custom QR Title Editor */}
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
            <div className="admin-form-card" id="admin-schedule-form-container">
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
                  prefilledProgramCardId={selectedProgramCardId || undefined}
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
  );
};
