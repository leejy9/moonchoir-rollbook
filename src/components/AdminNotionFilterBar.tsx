import React, { useState } from 'react';
import type { MemberStatus, PartType } from '../types/rollbook';
import { IconSearch } from './Icons';
import { getKSTDateString } from '../utils/date';

export interface AdminFilterState {
  dateStart: string; // YYYY-MM-DD or '' for all
  dateEnd: string;   // YYYY-MM-DD or '' for all
  selectedParts: PartType[];
  selectedStatuses: MemberStatus[];
  searchQuery: string;
}

interface AdminNotionFilterBarProps {
  filters: AdminFilterState;
  onChangeFilters: (next: AdminFilterState) => void;
  availableParts: PartType[];
  availableStatuses: MemberStatus[];
  totalMembersCount: number;
  filteredMembersCount: number;
  totalSchedulesCount: number;
}

export const AdminNotionFilterBar: React.FC<AdminNotionFilterBarProps> = ({
  filters,
  onChangeFilters,
  availableParts,
  availableStatuses,
  totalMembersCount,
  filteredMembersCount,
  totalSchedulesCount,
}) => {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [activePropertyModal, setActivePropertyModal] = useState<
    'NONE' | 'DATE' | 'PART' | 'STATUS' | 'SEARCH'
  >('NONE');

  // Quick preset ranges (dynamically calculated based on current KST date)
  const applyDatePreset = (preset: 'ALL' | 'THIS_MONTH' | 'LAST_3_MONTHS' | 'THIS_YEAR') => {
    if (preset === 'ALL') {
      onChangeFilters({ ...filters, dateStart: '', dateEnd: '' });
    } else {
      const today = getKSTDateString();
      const [yStr, mStr] = today.split('-');
      const y = Number(yStr);
      const m = Number(mStr);

      if (preset === 'THIS_MONTH') {
        const lastDay = new Date(y, m, 0).getDate();
        onChangeFilters({
          ...filters,
          dateStart: `${yStr}-${mStr}-01`,
          dateEnd: `${yStr}-${mStr}-${String(lastDay).padStart(2, '0')}`,
        });
      } else if (preset === 'LAST_3_MONTHS') {
        const startDate = new Date(y, m - 3, 1);
        const startY = startDate.getFullYear();
        const startM = String(startDate.getMonth() + 1).padStart(2, '0');
        const lastDay = new Date(y, m, 0).getDate();
        onChangeFilters({
          ...filters,
          dateStart: `${startY}-${startM}-01`,
          dateEnd: `${yStr}-${mStr}-${String(lastDay).padStart(2, '0')}`,
        });
      } else if (preset === 'THIS_YEAR') {
        onChangeFilters({
          ...filters,
          dateStart: `${yStr}-01-01`,
          dateEnd: `${yStr}-12-31`,
        });
      }
    }
    setActivePropertyModal('NONE');
  };

  const togglePart = (part: PartType) => {
    const next = filters.selectedParts.includes(part)
      ? filters.selectedParts.filter((p) => p !== part)
      : [...filters.selectedParts, part];
    onChangeFilters({ ...filters, selectedParts: next });
  };

  const toggleStatus = (st: MemberStatus) => {
    const next = filters.selectedStatuses.includes(st)
      ? filters.selectedStatuses.filter((s) => s !== st)
      : [...filters.selectedStatuses, st];
    onChangeFilters({ ...filters, selectedStatuses: next });
  };

  const resetAllFilters = () => {
    onChangeFilters({
      dateStart: '',
      dateEnd: '',
      selectedParts: [],
      selectedStatuses: [],
      searchQuery: '',
    });
  };

  const hasCustomFilters =
    filters.selectedParts.length > 0 ||
    filters.selectedStatuses.length > 0 ||
    filters.searchQuery.trim().length > 0 ||
    Boolean(filters.dateStart) ||
    Boolean(filters.dateEnd);

  return (
    <div className="notion-filter-container">
      {/* Top Filter Bar: Chips & Add Button */}
      <div className="notion-filter-bar">
        <div className="filter-chips-wrap">
          {/* 1. Date Range Filter Chip */}
          <div className={`notion-chip ${filters.dateStart || filters.dateEnd ? 'active' : ''}`}>
            <span className="notion-chip-icon">📅</span>
            <span className="notion-chip-label">기간:</span>
            <button
              type="button"
              className="notion-chip-val-btn"
              onClick={() => setActivePropertyModal(activePropertyModal === 'DATE' ? 'NONE' : 'DATE')}
            >
              {filters.dateStart || filters.dateEnd
                ? `${filters.dateStart || '처음'} ~ ${filters.dateEnd || '현재'}`
                : '전체 일정'}
            </button>
            {(filters.dateStart || filters.dateEnd) && (
              <button
                type="button"
                className="notion-chip-remove"
                onClick={() => onChangeFilters({ ...filters, dateStart: '', dateEnd: '' })}
                title="기간 필터 해제 (전체 일정 보기)"
              >
                ✕
              </button>
            )}
          </div>

          {/* 2. Parts Filter Chips */}
          {filters.selectedParts.length > 0 ? (
            <div className="notion-chip active">
              <span className="notion-chip-icon">🏷️</span>
              <span className="notion-chip-label">파트:</span>
              <button
                type="button"
                className="notion-chip-val-btn"
                onClick={() => setActivePropertyModal('PART')}
              >
                {filters.selectedParts.join(', ')}
              </button>
              <button
                type="button"
                className="notion-chip-remove"
                onClick={() => onChangeFilters({ ...filters, selectedParts: [] })}
                title="파트 필터 해제"
              >
                ✕
              </button>
            </div>
          ) : null}

          {/* 3. Member Status Filter Chips */}
          {filters.selectedStatuses.length > 0 ? (
            <div className="notion-chip active">
              <span className="notion-chip-icon">👤</span>
              <span className="notion-chip-label">단원구분:</span>
              <button
                type="button"
                className="notion-chip-val-btn"
                onClick={() => setActivePropertyModal('STATUS')}
              >
                {filters.selectedStatuses.join(', ')}
              </button>
              <button
                type="button"
                className="notion-chip-remove"
                onClick={() => onChangeFilters({ ...filters, selectedStatuses: [] })}
                title="단원구분 필터 해제"
              >
                ✕
              </button>
            </div>
          ) : null}

          {/* 4. Text Search Box */}
          <div className="notion-search-chip">
            <IconSearch size={14} className="search-icon-subtle" />
            <input
              type="text"
              className="notion-search-input"
              placeholder="단원명/뒷번호/비고 검색..."
              value={filters.searchQuery}
              onChange={(e) => onChangeFilters({ ...filters, searchQuery: e.target.value })}
            />
            {filters.searchQuery && (
              <button
                type="button"
                className="notion-chip-remove"
                onClick={() => onChangeFilters({ ...filters, searchQuery: '' })}
              >
                ✕
              </button>
            )}
          </div>

          {/* Add Filter Dropdown Button */}
          <div className="notion-add-filter-wrap">
            <button
              type="button"
              className="btn-notion-add-filter"
              onClick={() => setShowAddMenu(!showAddMenu)}
            >
              + 필터 추가
            </button>

            {showAddMenu && (
              <div className="notion-dropdown-menu">
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => {
                    setActivePropertyModal('DATE');
                    setShowAddMenu(false);
                  }}
                >
                  📅 조회 기간 (Date Range)
                </button>
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => {
                    setActivePropertyModal('PART');
                    setShowAddMenu(false);
                  }}
                >
                  🏷️ 파트 필터 (소프/알토/테너/베이스...)
                </button>
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => {
                    setActivePropertyModal('STATUS');
                    setShowAddMenu(false);
                  }}
                >
                  👤 단원 상태 (정단원/준단원/휴단원...)
                </button>
              </div>
            )}
          </div>

          {hasCustomFilters && (
            <button
              type="button"
              className="btn-reset-filters"
              onClick={resetAllFilters}
            >
              초기화
            </button>
          )}
        </div>

        {/* Counter Summary */}
        <div className="filter-summary-tally">
          <span className="tally-number">
            {`${filteredMembersCount}명`}
          </span>
          <span className="tally-total">{`/ 전체 ${totalMembersCount}명`}</span>
          <span className="tally-divider">·</span>
          <span className="tally-schedules">{`일정 ${totalSchedulesCount}회차`}</span>
        </div>
      </div>

      {/* Popovers for specific filter properties */}
      {activePropertyModal === 'DATE' && (
        <div className="notion-popover-card">
          <div className="popover-header">
            <h4>📅 조회 기간 설정</h4>
            <button
              type="button"
              className="btn-popover-close"
              onClick={() => setActivePropertyModal('NONE')}
            >
              ✕
            </button>
          </div>
          <div className="popover-body">
            <div className="preset-buttons-row">
              <button type="button" onClick={() => applyDatePreset('ALL')}>전체 일정</button>
              <button type="button" onClick={() => applyDatePreset('THIS_MONTH')}>이번 달 ({Number(getKSTDateString().slice(5, 7))}월)</button>
              <button type="button" onClick={() => applyDatePreset('LAST_3_MONTHS')}>최근 3개월</button>
              <button type="button" onClick={() => applyDatePreset('THIS_YEAR')}>{getKSTDateString().slice(0, 4)}년 전체</button>
            </div>
            <div className="date-inputs-row">
              <label>
                시작일:
                <input
                  type="date"
                  value={filters.dateStart}
                  onChange={(e) => onChangeFilters({ ...filters, dateStart: e.target.value })}
                />
              </label>
              <span>~</span>
              <label>
                종료일:
                <input
                  type="date"
                  value={filters.dateEnd}
                  onChange={(e) => onChangeFilters({ ...filters, dateEnd: e.target.value })}
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {activePropertyModal === 'PART' && (
        <div className="notion-popover-card">
          <div className="popover-header">
            <h4>🏷️ 파트 다중 선택</h4>
            <button
              type="button"
              className="btn-popover-close"
              onClick={() => setActivePropertyModal('NONE')}
            >
              ✕
            </button>
          </div>
          <div className="popover-body">
            <div className="pills-grid">
              {availableParts.map((p) => {
                const isSelected = filters.selectedParts.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    className={`filter-pill-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => togglePart(p)}
                  >
                    <span className={`part-badge part-${p}`}>{p}</span>
                    <span>{isSelected ? '✓' : '+'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {activePropertyModal === 'STATUS' && (
        <div className="notion-popover-card">
          <div className="popover-header">
            <h4>👤 단원 상태 다중 선택</h4>
            <button
              type="button"
              className="btn-popover-close"
              onClick={() => setActivePropertyModal('NONE')}
            >
              ✕
            </button>
          </div>
          <div className="popover-body">
            <div className="pills-grid">
              {availableStatuses.map((st) => {
                const isSelected = filters.selectedStatuses.includes(st);
                return (
                  <button
                    key={st}
                    type="button"
                    className={`filter-pill-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleStatus(st)}
                  >
                    <span>{st}</span>
                    <span>{isSelected ? '✓' : '+'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
