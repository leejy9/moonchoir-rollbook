import React, { useMemo, useState } from 'react';
import type { Schedule } from '../../types/rollbook';
import { getKSTDateString } from '../../utils/date';

export interface AdminScheduleListViewProps {
  schedules: Schedule[];
  categories: string[];
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

export const AdminScheduleListView: React.FC<AdminScheduleListViewProps> = ({
  schedules,
  categories,
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

  return (
    <div className="admin-schedule-list-view-root">
      {/* Title & Description */}
      <div style={{ marginBottom: '14px' }}>
        <h2 className="section-title" style={{ margin: 0 }}>
          📋 전체 등록 일정 일괄 관리
        </h2>
        <p className="section-subtitle" style={{ margin: '4px 0 0' }}>
          반복 등록된 일정들을 한눈에 확인하고, 다중 선택하여 일괄 삭제하거나 장소/시간을 일괄 수정합니다.
        </p>
      </div>

      {/* Search & Filter Bar */}
      <div
        style={{
          display: 'flex',
          gap: '10px',
          alignItems: 'center',
          marginBottom: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: '180px', position: 'relative' }}>
          <input
            type="text"
            className="modern-input"
            placeholder="일정명, 날짜, 장소, 곡목 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ height: '38px', paddingLeft: '32px', fontSize: '13px' }}
          />
          <span
            style={{
              position: 'absolute',
              left: '10px',
              top: '10px',
              color: '#94A3B8',
              fontSize: '13px',
            }}
          >
            🔍
          </span>
        </div>

        <select
          className="modern-select"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          style={{ width: 'auto', minWidth: '120px', height: '38px', fontSize: '13px' }}
        >
          <option value="ALL">전체 카테고리</option>
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
          onClick={onToggleShowArchived}
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
              checked={isAllSelected}
              onChange={() => onSelectAllSchedules(filteredSchedules.map((s) => s.id))}
              style={{ width: '18px', height: '18px', accentColor: '#4F46E5', cursor: 'pointer' }}
            />
            전체 선택 ({filteredSchedules.length}건 중 {selectedBatchScheduleIds.length}개 선택됨)
          </label>
        </div>

        {selectedBatchScheduleIds.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={onOpenBatchEdit}
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
              onClick={() => onDuplicateSeries()}
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
              title="선택한 일정을 새 시작 날짜로 통째로 복제"
            >
              🔁 복제
            </button>
            <button
              type="button"
              onClick={() => onBatchArchive(true)}
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
              onClick={() => onBatchArchive(false)}
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
              onClick={onBatchDelete}
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
              onClick={onClearSelection}
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
      {filteredSchedules.length > 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            maxHeight: '520px',
            overflowY: 'auto',
          }}
        >
          {filteredSchedules.map((sch) => {
            const isChecked = selectedBatchScheduleIds.includes(sch.id);
            const isSelectedForEdit = editingScheduleId === sch.id;

            return (
              <div
                key={sch.id}
                data-testid={`all-sch-item-${sch.id}`}
                onClick={() => onSelectScheduleForEdit(sch)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: isSelectedForEdit ? '#EEF2FF' : isChecked ? '#F5F3FF' : '#FFFFFF',
                  border: isSelectedForEdit
                    ? '1.5px solid #6366F1'
                    : `1px solid ${isChecked ? '#DDD6FE' : '#E2E8F0'}`,
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
                    onChange={() => onToggleSelectSchedule(sch.id)}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: '18px',
                      height: '18px',
                      accentColor: '#4F46E5',
                      cursor: 'pointer',
                    }}
                  />
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        flexWrap: 'wrap',
                      }}
                    >
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
                        <span
                          style={{
                            fontSize: '11px',
                            color: '#64748B',
                            background: '#F1F5F9',
                            padding: '1px 6px',
                            borderRadius: '4px',
                          }}
                        >
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

                <div
                  style={{ display: 'flex', gap: '6px', flexShrink: 0 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {sch.seriesId && (
                    <button
                      type="button"
                      className="btn-edit-sch-mini"
                      onClick={() => onDuplicateSeries(sch.seriesId)}
                      title="이 일정 묶음을 통째로 복제"
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
                    onClick={() => onToggleArchiveSchedule(sch.id, !sch.isArchived)}
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
                    onClick={() => onCloneSchedule(sch)}
                    title={sch.date < todayStr ? '오늘 날짜로 복제' : '일정 복제'}
                    style={{
                      background: sch.date < todayStr ? '#ECFDF5' : '#F8FAFC',
                      color: sch.date < todayStr ? '#059669' : '#475569',
                      border: `1px solid ${sch.date < todayStr ? '#A7F3D0' : '#CBD5E1'}`,
                      borderRadius: '6px',
                      padding: '5px 10px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      minHeight: '34px',
                    }}
                  >
                    {sch.date < todayStr ? '📋 오늘로 복제' : '📋 복제'}
                  </button>
                  <button
                    type="button"
                    className="btn-delete-sch-mini"
                    onClick={() => onDeleteSchedule(sch.id, sch.title)}
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
  );
};
