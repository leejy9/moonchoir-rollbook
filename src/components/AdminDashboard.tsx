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
  IconStats,
  IconUsers,
} from './Icons';
import { LocationPickerModal } from './LocationPickerModal';
import { BatchScheduleEditModal } from './BatchScheduleEditModal';
import { AdminAttendanceTab } from './admin/AdminAttendanceTab';
import { AdminStatsTab } from './admin/AdminStatsTab';
import { AdminSchedulesTab } from './admin/AdminSchedulesTab';
import { AdminSettingsTab } from './admin/AdminSettingsTab';
import { useScheduleAdmin } from '../hooks/useScheduleAdmin';
import { useAttendanceAdmin } from '../hooks/useAttendanceAdmin';
import moonchoirLogo from '../assets/moonchoir-logo.png';

interface AdminDashboardProps {
  onBackToHome: () => void;
  onDataChanged: () => void;
  refreshTrigger?: number;
}

type AdminTab = 'ROSTER' | 'SCHEDULES' | 'STATS' | 'SETTINGS';

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
    const newPin = sheetsService.refreshActiveOnSitePin();
    if (currentSchedule) {
      await sheetsService.updateSchedule(currentSchedule.id, { checkInPin: newPin });
    }
    onDataChanged();
    setPinRegenMsg(`당일 현장 PIN이 [${newPin}]으로 재발급되었습니다.`);
    setTimeout(() => setPinRegenMsg(''), 3000);
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
