import React, { useMemo, useState } from 'react';
import { setAdminLoggedIn } from '../services/auth';
import { sheetsService } from '../services/sheets';
import type {
  LocationPreset,
} from '../types/rollbook';
import {
  generateMasterWallQRPayload,
} from '../utils/qr';
import {
  IconCalendar,
  IconSettings,
  IconUsers,
} from './Icons';
import { LocationPickerModal } from './LocationPickerModal';
import { BatchScheduleEditModal } from './BatchScheduleEditModal';
import { AdminAttendanceTab } from './admin/AdminAttendanceTab';
import { AdminSchedulesTab } from './admin/AdminSchedulesTab';
import { AdminSettingsTab } from './admin/AdminSettingsTab';
import { ScheduleDeleteModal } from './admin/ScheduleDeleteModal';
import { CardGroupDeleteModal } from './admin/CardGroupDeleteModal';
import { ManualOverrideModal } from './admin/ManualOverrideModal';
import { useScheduleAdmin } from '../hooks/useScheduleAdmin';
import { getLateThresholdTime } from '../utils/manualAttendance';
import { useAttendanceAdmin } from '../hooks/useAttendanceAdmin';
import moonchoirLogo from '../assets/moonchoir-logo.png';

interface AdminDashboardProps {
  onBackToHome: () => void;
  onDataChanged: () => void;
  refreshTrigger?: number;
}

type AdminTab = 'ROSTER' | 'SCHEDULES' | 'SETTINGS';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  onBackToHome,
  onDataChanged,
  refreshTrigger,
}) => {
  const [adminTab, setAdminTab] = useState<AdminTab>('ROSTER');

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
    currentScheduleStartTime,
    handleManualOverrideSubmit,
  } = useAttendanceAdmin({
    schedules,
    members,
    onDataChanged,
  });

  // --- 4. QR & PIN Management State ---
  const defaultLoc = locationPresets.find((l) => l.isDefault) || locationPresets[0];
  const defaultLocName = defaultLoc?.name || '문콰이어 연습실';
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

  const handleAddNewLocationPresetFromModal = async (newPreset: LocationPreset) => {
    await sheetsService.addLocationPreset(newPreset);
    setIsScheduleLocationModalOpen(false);
    setScheduleSuccessMsg(`새 연습실 [${newPreset.name}]이 등록되었습니다.`);
    onDataChanged();
    setTimeout(() => setScheduleSuccessMsg(''), 4000);
  };

  // Dynamic Taxonomy Lists
  const dynamicParts = sheetsService.getParts();
  const dynamicMemberStatuses = sheetsService.getMemberStatuses();
  const dynamicCategories = sheetsService.getCategories();

  // ================= HANDLERS =================
  const handleLogout = () => {
    setAdminLoggedIn(false);
    onBackToHome();
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
    try {
      const newPin = await sheetsService.refreshActiveOnSitePin();
      onDataChanged();
      setPinRegenMsg(`당일 현장 PIN이 [${newPin}]으로 재발급되었습니다. 이전 PIN은 더 이상 사용할 수 없습니다.`);
      setTimeout(() => setPinRegenMsg(''), 4000);
    } catch (err: unknown) {
      setPinRegenMsg(
        `현장 PIN 재발급 실패: ${err instanceof Error ? err.message : String(err)}`
      );
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
          <button
            type="button"
            className="btn-nav-back"
            onClick={onBackToHome}
            style={{ whiteSpace: 'nowrap' }}
          >
            ← 홈
          </button>
          <img
            src={moonchoirLogo}
            alt="Moonchoir"
            style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
          />
          <h1 className="admin-title" style={{ whiteSpace: 'nowrap' }}>
            관리자
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <a
            href="https://docs.google.com/spreadsheets/d/1VYT0HgsrR82ORbd4bxq8doVXvyBvwobgIv3kjE3flX8/edit"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-open-sheet-header"
            title="구글 스프레드시트 열기"
            style={{ whiteSpace: 'nowrap' }}
          >
            시트 ↗
          </a>
          <button
            type="button"
            className="btn-logout"
            onClick={handleLogout}
            style={{ whiteSpace: 'nowrap' }}
          >
            로그아웃
          </button>
        </div>
      </header>

      {/* Primary Navigation Tabs */}
      <nav className="admin-subtabs admin-primary-tabs" style={{ display: 'flex', gap: '6px', padding: '4px' }}>
        <button
          type="button"
          className={`subtab-btn ${adminTab === 'ROSTER' ? 'active' : ''}`}
          onClick={() => setAdminTab('ROSTER')}
        >
          <IconUsers size={16} />
          <span>단원</span>
        </button>
        <button
          type="button"
          className={`subtab-btn ${adminTab === 'SCHEDULES' ? 'active' : ''}`}
          onClick={() => setAdminTab('SCHEDULES')}
        >
          <IconCalendar size={16} />
          <span>일정</span>
        </button>
        <button
          type="button"
          className={`subtab-btn ${adminTab === 'SETTINGS' ? 'active' : ''}`}
          onClick={() => setAdminTab('SETTINGS')}
        >
          <IconSettings size={16} />
          <span>설정</span>
        </button>
      </nav>

      {/* Global Feedback Banner */}
      {memberActionMsg && <div className="success-banner">{memberActionMsg}</div>}
      {pinRegenMsg && (
        <div className={pinRegenMsg.startsWith('현장 PIN 재발급 실패') ? 'error-banner' : 'success-banner'}>
          {pinRegenMsg}
        </div>
      )}

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
      {/* TAB 2: [연습관리] SCHEDULES, QR & SESSIONS (Modularized)        */}
      {/* ============================================================== */}
      {adminTab === 'SCHEDULES' && (
        <AdminSchedulesTab
          schedules={schedules}
          programCards={programCards}
          locationPresets={locationPresets}
          members={members}
          defaultLocName={defaultLocName}
          config={config}
          activeQrPayload={activeQrPayload}
          dynamicParts={dynamicParts}
          dynamicCategories={dynamicCategories}
          onDataChanged={onDataChanged}
          rightPanelMode={rightPanelMode}
          setRightPanelMode={setRightPanelMode}
          editingScheduleForForm={editingScheduleForForm}
          setEditingScheduleForForm={setEditingScheduleForForm}
          editingProgramCard={editingProgramCard}
          setEditingProgramCard={setEditingProgramCard}
          selectedProgramCardId={selectedProgramCardId}
          scheduleSuccessMsg={scheduleSuccessMsg}
          setScheduleSuccessMsg={setScheduleSuccessMsg}
          scheduleViewTab={scheduleViewTab}
          setScheduleViewTab={setScheduleViewTab}
          selectedBatchScheduleIds={selectedBatchScheduleIds}
          setSelectedBatchScheduleIds={setSelectedBatchScheduleIds}
          setIsBatchScheduleEditModalOpen={setIsBatchScheduleEditModalOpen}
          handleOpenCreateProgramCard={handleOpenCreateProgramCard}
          handleOpenEditProgramCard={handleOpenEditProgramCard}
          handleBindScheduleToForm={handleBindScheduleToForm}
          handleCloneScheduleToForm={handleCloneScheduleToForm}
          handleSaveScheduleFromForm={handleSaveScheduleFromForm}
          handleSaveProgramCard={handleSaveProgramCard}
          handleDeleteScheduleSingle={handleDeleteScheduleSingle}
          handleDeleteScheduleSeries={handleDeleteScheduleSeries}
          handleRestoreScheduleSingle={handleRestoreScheduleSingle}
          handleDeleteSchedule={handleDeleteSchedule}
          handleApplyBatchScheduleUpdates={handleApplyBatchScheduleUpdates}
          handleBatchDeleteSelected={handleBatchDeleteSelected}
          handleToggleSelectSchedule={handleToggleSelectSchedule}
          handleSelectAllSchedules={handleSelectAllSchedules}
          handleToggleArchiveSchedule={handleToggleArchiveSchedule}
          handleBatchArchiveSelected={handleBatchArchiveSelected}
          handleToggleArchiveGroup={handleToggleArchiveGroup}
          handleDuplicateSelectedSeries={handleDuplicateSelectedSeries}
          setCardGroupToDelete={setCardGroupToDelete}
          showArchivedSchedules={showArchivedSchedules}
          setShowArchivedSchedules={setShowArchivedSchedules}
          setIsScheduleLocationModalOpen={setIsScheduleLocationModalOpen}
          selectedScheduleId={selectedScheduleId}
          setSelectedScheduleId={setSelectedScheduleId}
          currentSchedule={currentSchedule}
          reconciledList={reconciledList}
          sessionFilter={sessionFilter}
          setSessionFilter={setSessionFilter}
          filteredSessionList={filteredSessionList}
          setOverrideTarget={setOverrideTarget}
          handleRefreshMasterQR={handleRefreshMasterQR}
          handleRegenSessionPin={handleRegenSessionPin}
          pinRegenMsg={pinRegenMsg}
        />
      )}
      {/* ============================================================== */}
      {/* TAB 4: [환경설정] SETTINGS, LOCATIONS & TAXONOMY (Modularized) */}
      {/* ============================================================== */}
      {adminTab === 'SETTINGS' && (
        <AdminSettingsTab
          config={config}
          locationPresets={locationPresets}
          dynamicParts={dynamicParts}
          dynamicMemberStatuses={dynamicMemberStatuses}
          dynamicCategories={dynamicCategories}
          onDataChanged={onDataChanged}
        />
      )}

      {/* ============================================================== */}
      {/* MODAL: Manual Attendance Override Prompt                       */}
      {/* ============================================================== */}
      <ManualOverrideModal
        overrideTarget={overrideTarget}
        overrideReason={overrideReason}
        setOverrideReason={setOverrideReason}
        arrivalTime={overrideTime}
        setArrivalTime={setOverrideTime}
        arrivalError={overrideTimeError}
        lateThresholdTime={
          currentScheduleStartTime
            ? getLateThresholdTime(currentScheduleStartTime, sheetsService.getConfig().lateGraceMinutes ?? 10)
            : undefined
        }
        onSubmit={handleManualOverrideSubmit}
        onClose={() => setOverrideTarget(null)}
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
      {/* MODAL: Dedicated Schedule Delete Confirmation Modal            */}
      {/* ============================================================== */}
      <ScheduleDeleteModal
        scheduleToDelete={scheduleToDelete}
        schedules={schedules}
        programCards={programCards}
        forceHardDeleteSelected={forceHardDeleteSelected}
        setForceHardDeleteSelected={setForceHardDeleteSelected}
        onClose={() => {
          setScheduleToDelete(null);
          setForceHardDeleteSelected(false);
        }}
        onDeleteSingle={handleDeleteScheduleSingle}
        onDeleteSeries={handleDeleteScheduleSeries}
      />

      {/* ============================================================== */}
      {/* MODAL: Dedicated Program Card Delete Confirmation Modal        */}
      {/* ============================================================== */}
      <CardGroupDeleteModal
        cardGroupToDelete={cardGroupToDelete}
        onClose={() => setCardGroupToDelete(null)}
        onDataChanged={onDataChanged}
        onSetSuccessMsg={(msg) => {
          setScheduleSuccessMsg(msg);
          setTimeout(() => setScheduleSuccessMsg(''), 4000);
        }}
      />

    </div>
  );
};