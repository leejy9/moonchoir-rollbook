import React, { useMemo, useState } from 'react';
import type { ProgramCard, Schedule } from '../../types/rollbook';
import { getKSTDateString } from '../../utils/date';

export interface AdminScheduleListViewProps {
  schedules: Schedule[];
  categories: string[];
  programCards?: ProgramCard[];
  onAssignProgramCard?: (scheduleId: string, cardId: string | undefined) => void;
  selectedBatchScheduleIds: string[];
  onToggleSelectSchedule: (id: string) => void;
  onSelectAllSchedules: (ids: string[]) => void;
  onClearSelection: () => void;
  onOpenBatchEdit: () => void;
  onDuplicateSeries: (preferredSeriesId?: string) => void;
  onBatchArchive: (isArchived: boolean) => void;
  onBatchDelete: () => void;
  showArchivedSchedules: boolean;
  onToggleShowArchived: () => void;
  editingScheduleId?: string | null;
  onSelectScheduleForEdit: (schedule: Schedule) => void;
  onToggleArchiveSchedule: (id: string, archive: boolean) => void;
  onCloneSchedule: (schedule: Schedule) => void;
  onDeleteSchedule: (id: string, title: string) => void;
}

const WEEKDAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

function formatShortDateWithWeekday(dateStr: string): string {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return dateStr;
  const [y, m, d] = parts;
  const dateObj = new Date(y, m - 1, d);
  const weekday = WEEKDAY_NAMES[dateObj.getDay()] || '';
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${mm}.${dd} (${weekday})`;
}

export const AdminScheduleListView: React.FC<AdminScheduleListViewProps> = ({
  schedules,
  categories,
  programCards = [],
  onAssignProgramCard,
  selectedBatchScheduleIds,
  onToggleSelectSchedule,
  onSelectAllSchedules,
  onClearSelection,
  onOpenBatchEdit,
  onDuplicateSeries,
  onBatchArchive,
  onBatchDelete,
  showArchivedSchedules,
  onToggleShowArchived,
  editingScheduleId,
  onSelectScheduleForEdit,
  onToggleArchiveSchedule,
  onCloneSchedule,
  onDeleteSchedule,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [showPastSchedules, setShowPastSchedules] = useState(false);
  const [isSelectMode, setIsSelectMode] = useState(() => selectedBatchScheduleIds.length > 0);
  const [expandedScheduleIds, setExpandedScheduleIds] = useState<Set<string>>(new Set());

  const todayStr = getKSTDateString();

  const pastSchedulesCount = useMemo(() => {
    return schedules.filter((s) => !s.isArchived && s.date < todayStr).length;
  }, [schedules, todayStr]);

  const filteredSchedules = useMemo(() => {
    return schedules.filter((s) => {
      if (!showArchivedSchedules && s.isArchived) return false;
      if (!showPastSchedules && s.date < todayStr) return false;
      const q = searchQuery.trim().toLowerCase();
      const matchSearch =
        !q ||
        s.title.toLowerCase().includes(q) ||
        s.locationName.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q)) ||
        s.date.includes(q);
      const matchCat = categoryFilter === 'ALL' || s.category === categoryFilter;
      return matchSearch && matchCat;
    });
  }, [schedules, searchQuery, categoryFilter, showArchivedSchedules, showPastSchedules, todayStr]);

  const isAllSelected =
    filteredSchedules.length > 0 &&
    filteredSchedules.every((s) => selectedBatchScheduleIds.includes(s.id));

  const showBulkControls = isSelectMode || selectedBatchScheduleIds.length > 0;

  const toggleExpandRow = (id: string) => {
    setExpandedScheduleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="admin-schedule-list-view-root" style={{ width: '100%' }}>
      {/* Search & Filter Bar */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          marginBottom: '10px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: '1 1 160px', minWidth: '140px' }}>
          <input
            type="text"
            className="modern-input"
            placeholder="검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ height: '38px', padding: '0 12px', fontSize: '13px' }}
          />
        </div>

        <select
          className="modern-select"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          style={{ width: 'auto', minWidth: '96px', height: '38px', fontSize: '13px', padding: '0 28px 0 10px' }}
        >
          <option value="ALL">전체 구분</option>
          {categories.map((cat) => (
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
            padding: '0 10px',
            height: '38px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {showPastSchedules ? '지난 일정 숨김' : `지난 일정 (${pastSchedulesCount})`}
        </button>

        <button
          type="button"
          onClick={onToggleShowArchived}
          style={{
            background: showArchivedSchedules ? '#EDE9FE' : '#F8FAFC',
            color: showArchivedSchedules ? '#6D28D9' : '#64748B',
            border: `1px solid ${showArchivedSchedules ? '#C4B5FD' : '#CBD5E1'}`,
            borderRadius: '8px',
            padding: '0 10px',
            height: '38px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {showArchivedSchedules ? '보관함 숨김' : '보관함'}
        </button>

        <button
          type="button"
          onClick={() => {
            if (showBulkControls) {
              setIsSelectMode(false);
              onClearSelection();
            } else {
              setIsSelectMode(true);
            }
          }}
          style={{
            background: showBulkControls ? '#EEF2FF' : '#F8FAFC',
            color: showBulkControls ? '#4F46E5' : '#475569',
            border: `1px solid ${showBulkControls ? '#C7D2FE' : '#CBD5E1'}`,
            borderRadius: '8px',
            padding: '0 10px',
            height: '38px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {showBulkControls ? '선택 종료' : '선택'}
        </button>
      </div>

      {/* Bulk Action Bar (Only visible when select mode is active or items are selected) */}
      {showBulkControls && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: selectedBatchScheduleIds.length > 0 ? '#EEF2FF' : '#F8FAFC',
            border: `1px solid ${selectedBatchScheduleIds.length > 0 ? '#C7D2FE' : '#E2E8F0'}`,
            borderRadius: '10px',
            padding: '8px 12px',
            marginBottom: '10px',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              fontSize: '12.5px',
              fontWeight: 700,
              color: '#334155',
              whiteSpace: 'nowrap',
            }}
          >
            <input
              type="checkbox"
              checked={isAllSelected}
              onChange={() => onSelectAllSchedules(filteredSchedules.map((s) => s.id))}
              style={{ width: '16px', height: '16px', accentColor: '#4F46E5', cursor: 'pointer' }}
            />
            전체 ({selectedBatchScheduleIds.length}/{filteredSchedules.length})
          </label>

          {selectedBatchScheduleIds.length > 0 && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={onOpenBatchEdit}
                style={{
                  background: '#4F46E5',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '5px 10px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                일괄 수정
              </button>
              <button
                type="button"
                onClick={() => onDuplicateSeries()}
                style={{
                  background: '#10B981',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '5px 10px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                복제
              </button>
              <button
                type="button"
                onClick={() => onBatchArchive(true)}
                style={{
                  background: '#8B5CF6',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '5px 10px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                보관
              </button>
              <button
                type="button"
                onClick={() => onBatchArchive(false)}
                style={{
                  background: '#EDE9FE',
                  color: '#6D28D9',
                  border: '1px solid #C4B5FD',
                  borderRadius: '6px',
                  padding: '5px 10px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                복원
              </button>
              <button
                type="button"
                onClick={onBatchDelete}
                style={{
                  background: '#EF4444',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '5px 10px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                일괄 삭제
              </button>
              <button
                type="button"
                onClick={onClearSelection}
                style={{
                  background: '#FFFFFF',
                  color: '#64748B',
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  padding: '5px 10px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                해제
              </button>
            </div>
          )}
        </div>
      )}

      {/* 100% Width Mobile Accordion Schedule List */}
      {filteredSchedules.length > 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            width: '100%',
          }}
        >
          {filteredSchedules.map((sch) => {
            const isChecked = selectedBatchScheduleIds.includes(sch.id);
            const isSelectedForEdit = editingScheduleId === sch.id;
            const isExpanded = expandedScheduleIds.has(sch.id);

            return (
              <div
                key={sch.id}
                data-testid={`all-sch-item-${sch.id}`}
                style={{
                  width: '100%',
                  background: isSelectedForEdit ? '#EEF2FF' : isChecked ? '#F5F3FF' : '#FFFFFF',
                  border: isSelectedForEdit
                    ? '1.5px solid #6366F1'
                    : `1px solid ${isChecked ? '#DDD6FE' : '#E2E8F0'}`,
                  borderRadius: '10px',
                  overflow: 'hidden',
                  transition: 'all 0.15s ease',
                }}
              >
                {/* Default 1-line Summary Row: Date · Time · Title */}
                <div
                  onClick={() => toggleExpandRow(sch.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '11px 12px',
                    gap: '8px',
                    cursor: 'pointer',
                    minHeight: '44px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                    {showBulkControls && (
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => onToggleSelectSchedule(sch.id)}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          width: '16px',
                          height: '16px',
                          accentColor: '#4F46E5',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <span
                      style={{
                        fontSize: '12.5px',
                        fontWeight: 700,
                        color: '#2563EB',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {formatShortDateWithWeekday(sch.date)}
                    </span>
                    <span
                      style={{
                        fontSize: '12.5px',
                        fontWeight: 600,
                        color: '#64748B',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {sch.startTime}
                    </span>
                    <strong
                      style={{
                        fontSize: '13.5px',
                        color: '#1E293B',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      {sch.title}
                    </strong>
                  </div>

                  <span
                    style={{
                      fontSize: '11px',
                      color: '#94A3B8',
                      flexShrink: 0,
                      marginLeft: '4px',
                    }}
                  >
                    {isExpanded ? '▴' : '▾'}
                  </span>
                </div>

                {/* Expanded Detail & Action Panel */}
                {isExpanded && (
                  <div
                    style={{
                      padding: '10px 12px 12px',
                      borderTop: '1px solid #F1F5F9',
                      background: '#F8FAFC',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        flexWrap: 'wrap',
                        fontSize: '12px',
                        color: '#475569',
                      }}
                    >
                      <span className="schedule-category-badge">{sch.category}</span>
                      <span>
                        {sch.date} ({sch.startTime}~{sch.endTime})
                      </span>
                      <span>· {sch.locationName}</span>
                      {sch.seriesIndex && sch.seriesTotal && (
                        <span
                          style={{
                            fontSize: '11px',
                            color: '#059669',
                            background: '#ECFDF5',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            fontWeight: 600,
                          }}
                        >
                          {sch.seriesIndex}/{sch.seriesTotal}회차
                        </span>
                      )}
                      {sch.checkInPin && (
                        <span
                          style={{
                            fontSize: '11px',
                            color: '#64748B',
                            background: '#E2E8F0',
                            padding: '1px 6px',
                            borderRadius: '4px',
                          }}
                        >
                          PIN {sch.checkInPin}
                        </span>
                      )}
                    </div>

                    {sch.description && (
                      <p style={{ margin: 0, fontSize: '12px', color: '#64748B' }}>
                        {sch.description}
                      </p>
                    )}

                    {/* Individual Card Assignment Selector (소속 카드 연결/변경) */}
                    {programCards.length > 0 && onAssignProgramCard && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          fontSize: '12px',
                          color: '#475569',
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>소속 카드</span>
                        <select
                          className="modern-select"
                          value={sch.programId || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            onAssignProgramCard(sch.id, val ? val : undefined);
                          }}
                          style={{
                            height: '32px',
                            fontSize: '12px',
                            padding: '0 26px 0 8px',
                            width: 'auto',
                            maxWidth: '220px',
                          }}
                        >
                          <option value="">미지정 (단일 일정)</option>
                          {programCards
                            .filter((c) => !c.isArchived || c.id === sch.programId)
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.title} ({c.category})
                              </option>
                            ))}
                        </select>
                      </div>
                    )}

                    <div
                      style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectScheduleForEdit(sch)}
                        style={{
                          background: '#EEF2FF',
                          color: '#4F46E5',
                          border: '1px solid #C7D2FE',
                          borderRadius: '6px',
                          padding: '5px 12px',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => onCloneSchedule(sch)}
                        style={{
                          background: '#FFFFFF',
                          color: '#475569',
                          border: '1px solid #CBD5E1',
                          borderRadius: '6px',
                          padding: '5px 12px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        복제
                      </button>
                      {sch.seriesId && (
                        <button
                          type="button"
                          onClick={() => onDuplicateSeries(sch.seriesId)}
                          style={{
                            background: '#F0FDF4',
                            color: '#059669',
                            border: '1px solid #BBF7D0',
                            borderRadius: '6px',
                            padding: '5px 12px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          시즌 복제
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onToggleArchiveSchedule(sch.id, !sch.isArchived)}
                        style={{
                          background: sch.isArchived ? '#EDE9FE' : '#FFFFFF',
                          color: sch.isArchived ? '#6D28D9' : '#475569',
                          border: `1px solid ${sch.isArchived ? '#C4B5FD' : '#CBD5E1'}`,
                          borderRadius: '6px',
                          padding: '5px 12px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {sch.isArchived ? '복원' : '보관'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteSchedule(sch.id, sch.title)}
                        style={{
                          background: '#FEF2F2',
                          color: '#DC2626',
                          border: '1px solid #FECACA',
                          borderRadius: '6px',
                          padding: '5px 12px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                )}
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
  );
};
