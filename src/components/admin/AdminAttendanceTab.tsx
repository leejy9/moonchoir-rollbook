import React, { useMemo, useState } from 'react';
import type { Member, MemberStatusHistory, Schedule } from '../../types/rollbook';
import { sheetsService } from '../../services/sheets';
import { AdminNotionFilterBar, type AdminFilterState } from '../AdminNotionFilterBar';
import { AdminMatrixGrid } from '../AdminMatrixGrid';
import { MemberProfileModal } from '../MemberProfileModal';
import { MemberMergeModal } from '../MemberMergeModal';

export interface AdminAttendanceTabProps {
  members: Member[];
  schedules: Schedule[];
  onDataChanged: () => void;
  dynamicParts: string[];
  dynamicMemberStatuses: string[];
  selectedMemberForModal: Member | null;
  isProfileModalOpen: boolean;
  setIsProfileModalOpen: (open: boolean) => void;
  handleOpenAddMemberModal: () => void;
  handleOpenEditMemberModal: (member: Member) => void;
  handleSaveMemberProfile: (memberData: Member, historyItem?: MemberStatusHistory) => Promise<void>;
  handleDeleteMemberProfile: (memberId: string) => Promise<void>;
}

export const AdminAttendanceTab: React.FC<AdminAttendanceTabProps> = ({
  members,
  schedules,
  onDataChanged,
  dynamicParts,
  dynamicMemberStatuses,
  selectedMemberForModal,
  isProfileModalOpen,
  setIsProfileModalOpen,
  handleOpenAddMemberModal,
  handleOpenEditMemberModal,
  handleSaveMemberProfile,
  handleDeleteMemberProfile,
}) => {
  // 1. Duplicate Member Detection & Merge State
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const duplicateMemberGroups = useMemo(() => {
    if (!members) return [];
    return sheetsService.findDuplicateMemberGroups();
  }, [members]);

  // 2. Universal Matrix Grid State (Notion Filter Bar)
  const [matrixFilters, setMatrixFilters] = useState<AdminFilterState>(() => ({
    dateStart: '',
    dateEnd: '',
    selectedParts: [],
    selectedStatuses: [],
    searchQuery: '',
  }));

  const filteredMatrixSchedules = useMemo(() => {
    return schedules.filter((s) => {
      if (matrixFilters.dateStart && s.date < matrixFilters.dateStart) return false;
      if (matrixFilters.dateEnd && s.date > matrixFilters.dateEnd) return false;
      return true;
    });
  }, [schedules, matrixFilters.dateStart, matrixFilters.dateEnd]);

  const filteredMatrixMembers = useMemo(() => {
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

  return (
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
  );
};
