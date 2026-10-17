import React, { useState } from 'react';
import type { LocationPreset, Schedule, ScheduleCategory } from '../types/rollbook';
import { LocationPickerModal } from './LocationPickerModal';

interface ScheduleEditModalProps {
  isOpen: boolean;
  schedule: Schedule | null;
  allSchedules: Schedule[];
  locationPresets: LocationPreset[];
  categories: string[];
  onClose: () => void;
  onSaveSingle: (scheduleId: string, updates: Partial<Schedule>) => Promise<void>;
  onSaveSeries?: (matchingScheduleIds: string[], updates: Partial<Schedule>) => Promise<void>;
  onDeleteSingle?: (scheduleId: string, title: string) => Promise<void>;
  onDeleteSeries?: (matchingScheduleIds: string[], title: string) => Promise<void>;
  onSaveNewLocationPreset?: (preset: LocationPreset) => Promise<void>;
}

export type EditScope = 'THIS_ONLY' | 'THIS_AND_FUTURE' | 'ALL';

export const ScheduleEditModal: React.FC<ScheduleEditModalProps> = ({
  isOpen,
  schedule,
  allSchedules,
  locationPresets,
  categories,
  onClose,
  onSaveSingle,
  onSaveSeries,
  onDeleteSingle,
  onDeleteSeries,
  onSaveNewLocationPreset,
}) => {
  const [title, setTitle] = useState(schedule?.title || '');
  const [date, setDate] = useState(schedule?.date || '');
  const [startTime, setStartTime] = useState(schedule?.startTime || '19:30');
  const [endTime, setEndTime] = useState(schedule?.endTime || '21:30');
  const [selectedLocPresetId, setSelectedLocPresetId] = useState(
    schedule?.locationId ||
      locationPresets.find((l) => l.name === schedule?.locationName)?.id ||
      locationPresets[0]?.id ||
      ''
  );
  const [category, setCategory] = useState<ScheduleCategory>(schedule?.category || '정기연습');
  const [isCustomCategory, setIsCustomCategory] = useState(
    () => !categories.includes(schedule?.category || '') && Boolean(schedule?.category)
  );
  const [customCategoryInput, setCustomCategoryInput] = useState(() =>
    !categories.includes(schedule?.category || '') ? String(schedule?.category || '') : ''
  );
  const [description, setDescription] = useState(schedule?.description || '');
  const [editScope, setEditScope] = useState<EditScope>('THIS_ONLY');
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen || !schedule) return null;

  // Find companions: if schedule has seriesId, match by seriesId! Otherwise fallback to title.
  const companions = allSchedules.filter((s) => {
    if (s.id === schedule.id) return false;
    if (schedule.seriesId && s.seriesId) {
      return s.seriesId === schedule.seriesId;
    }
    return s.title === schedule.title;
  });
  const isRecurringSeries = companions.length > 0;
  const futureCompanions = companions.filter((c) => c.date >= schedule.date);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date.trim()) {
      setErrorMsg('일정 명칭과 날짜를 입력해주세요.');
      return;
    }

    const finalCategory = isCustomCategory
      ? (customCategoryInput.trim() || '기타행사')
      : category;

    const foundLoc = locationPresets.find((l) => l.id === selectedLocPresetId);
    const updates: Partial<Schedule> = {
      title: title.trim(),
      startTime,
      endTime,
      category: finalCategory,
      description: description.trim() || undefined,
      locationName: foundLoc ? foundLoc.name : schedule.locationName,
      locationId: foundLoc ? foundLoc.id : schedule.locationId,
      detailAddress: foundLoc?.detailAddress,
      entranceNote: foundLoc?.entranceNote,
      targetLat: foundLoc?.latitude,
      targetLon: foundLoc?.longitude,
      radiusMeters: foundLoc?.radiusMeters,
    };

    try {
      setIsSubmitting(true);
      setErrorMsg('');

      if (isRecurringSeries && editScope !== 'THIS_ONLY' && onSaveSeries) {
        if (editScope === 'THIS_AND_FUTURE') {
          // This event and upcoming occurrences
          const targetIds = [schedule.id, ...futureCompanions.map((c) => c.id)];
          await onSaveSeries(targetIds, updates);
        } else {
          // All occurrences in the series
          const targetIds = [schedule.id, ...companions.map((c) => c.id)];
          await onSaveSeries(targetIds, updates);
        }
      } else {
        // Save single schedule (can also update its specific date)
        await onSaveSingle(schedule.id, { ...updates, date });
      }

      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteThisOnly = async () => {
    if (!onDeleteSingle) return;
    if (window.confirm(`'${schedule.date} ${schedule.title}' 이 일정을 삭제하시겠습니까?`)) {
      try {
        setIsSubmitting(true);
        await onDeleteSingle(schedule.id, schedule.title);
        onClose();
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : '삭제 중 오류가 발생했습니다.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleDeleteThisAndFuture = async () => {
    if (!onDeleteSeries) return;
    const targetCount = futureCompanions.length + 1;
    if (
      window.confirm(
        `'${schedule.date}' 일정을 포함하여 이후 남은 ${targetCount}개 회차를 모두 일괄 삭제하시겠습니까?\n(과거의 연습 및 출결 기록은 안전하게 보존됩니다)`
      )
    ) {
      try {
        setIsSubmitting(true);
        const targetIds = [schedule.id, ...futureCompanions.map((c) => c.id)];
        await onDeleteSeries(targetIds, schedule.title);
        onClose();
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : '향후 일정 삭제 중 오류가 발생했습니다.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleDeleteAllInSeries = async () => {
    if (!onDeleteSeries) return;
    const totalCount = companions.length + 1;
    if (
      window.confirm(
        `'${schedule.title}' 전체 ${totalCount}개 회차 일정을 모두 삭제하시겠습니까?`
      )
    ) {
      try {
        setIsSubmitting(true);
        const allIds = [schedule.id, ...companions.map((c) => c.id)];
        await onDeleteSeries(allIds, schedule.title);
        onClose();
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : '전체 일괄 삭제 중 오류가 발생했습니다.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleDeleteByScope = async () => {
    if (!isRecurringSeries || editScope === 'THIS_ONLY') {
      await handleDeleteThisOnly();
    } else if (editScope === 'THIS_AND_FUTURE') {
      await handleDeleteThisAndFuture();
    } else {
      await handleDeleteAllInSeries();
    }
  };

  const handleSaveNewLocation = async (newPreset: LocationPreset) => {
    try {
      if (onSaveNewLocationPreset) {
        await onSaveNewLocationPreset(newPreset);
      }
      setSelectedLocPresetId(newPreset.id);
      setIsLocationPickerOpen(false);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '장소 등록 실패');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-container member-profile-modal-modern"
        style={{ maxWidth: '640px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="modal-header-clean">
          <div className="profile-header-meta">
            <span className="profile-pill-tag">
              {schedule.seriesIndex
                ? `${schedule.category} (${schedule.seriesIndex}/${schedule.seriesTotal || companions.length + 1}회차)`
                : schedule.category}
            </span>
            <div className="profile-header-title-wrap">
              <h2 className="modal-heading-name">{schedule.title}</h2>
              <span className="modal-heading-sub">{schedule.date} 일정 관리</span>
            </div>
          </div>
          <button
            type="button"
            className="btn-modal-round-close"
            onClick={onClose}
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body-scrollable">
          {errorMsg && (
            <div className="profile-alert-danger" style={{ marginBottom: '14px' }}>
              ⚠️ {errorMsg}
            </div>
          )}

          <form id="schedule-edit-form" onSubmit={handleSubmit} className="modern-form-wrapper">
            <div className="form-responsive-grid">
              <div className="modern-field-group">
                <label className="modern-field-label">일정 명칭 *</label>
                <input
                  type="text"
                  className="modern-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div className="modern-field-group">
                <label className="modern-field-label">날짜 *</label>
                <input
                  type="date"
                  className="modern-input"
                  value={date}
                  disabled={isRecurringSeries && editScope !== 'THIS_ONLY'}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
                {isRecurringSeries && editScope !== 'THIS_ONLY' && (
                  <span style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>
                    ※ 일괄 변경 시 각 회차의 고유 날짜는 유지됩니다.
                  </span>
                )}
              </div>

              <div className="modern-field-group">
                <label className="modern-field-label">일정 구분</label>
                <div className="modern-select-wrapper">
                  <select
                    className="modern-select"
                    value={isCustomCategory ? '__CUSTOM__' : category}
                    onChange={(e) => {
                      if (e.target.value === '__CUSTOM__') {
                        setIsCustomCategory(true);
                      } else {
                        setIsCustomCategory(false);
                        setCategory(e.target.value as ScheduleCategory);
                      }
                    }}
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                    {!categories.includes(category) && Boolean(category) && (
                      <option value={category}>{category}</option>
                    )}
                    <option value="__CUSTOM__">✏️ + 새 카테고리 직접 추가...</option>
                  </select>
                </div>
                {isCustomCategory && (
                  <input
                    type="text"
                    className="modern-input"
                    style={{ marginTop: '8px' }}
                    value={customCategoryInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomCategoryInput(val);
                      setCategory((val.trim() || '기타행사') as ScheduleCategory);
                    }}
                    placeholder="새 카테고리명 직접 입력 (예: 총연습, 캠프)"
                    required={isCustomCategory}
                    autoFocus
                  />
                )}
              </div>

              <div className="modern-field-group">
                <label className="modern-field-label">시작 시간</label>
                <input
                  type="time"
                  className="modern-input"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>

              <div className="modern-field-group">
                <label className="modern-field-label">종료 시간</label>
                <input
                  type="time"
                  className="modern-input"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>

              <div className="modern-field-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="modern-field-label">연습 장소 (장소 프리셋)</label>
                  <button
                    type="button"
                    onClick={() => setIsLocationPickerOpen(true)}
                    style={{
                      fontSize: '12px',
                      color: 'var(--brand-primary, #4F46E5)',
                      fontWeight: 600,
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    🗺️ 새 장소 검색
                  </button>
                </div>
                <div className="modern-select-wrapper">
                  <select
                    className="modern-select"
                    value={selectedLocPresetId}
                    onChange={(e) => {
                      if (e.target.value === '__NEW_LOCATION__') {
                        setIsLocationPickerOpen(true);
                      } else {
                        setSelectedLocPresetId(e.target.value);
                      }
                    }}
                  >
                    {locationPresets.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} ({loc.address || '주소 미입력'} · 반경 {loc.radiusMeters}m)
                      </option>
                    ))}
                    <option value="__NEW_LOCATION__">🗺️ + 새 연습실 등록...</option>
                  </select>
                </div>
              </div>

              <div
                className="modern-field-group full-width"
                style={{ gridColumn: '1 / -1', width: '100%' }}
              >
                <label className="modern-field-label">연습 곡목 및 메모</label>
                <textarea
                  className="modern-textarea"
                  rows={5}
                  style={{ minHeight: '130px', width: '100%', boxSizing: 'border-box', lineHeight: '1.6' }}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="연습할 곡목이나 단원 공지사항을 입력하세요 (줄바꿈 지원)"
                />
              </div>
            </div>
          </form>

          {/* Scope Selector: placed cleanly at bottom */}
          {isRecurringSeries && (
            <div className="schedule-scope-container">
              <span className="schedule-scope-label">적용 범위</span>
              <div className="schedule-scope-segmented" role="radiogroup" aria-label="적용 범위">
                <button
                  type="button"
                  className={`schedule-scope-pill ${editScope === 'THIS_ONLY' ? 'active' : ''}`}
                  onClick={() => setEditScope('THIS_ONLY')}
                >
                  이 일정만 변경
                </button>
                {futureCompanions.length > 0 && (
                  <button
                    type="button"
                    className={`schedule-scope-pill ${editScope === 'THIS_AND_FUTURE' ? 'active' : ''}`}
                    onClick={() => setEditScope('THIS_AND_FUTURE')}
                  >
                    이후 일정 변경
                  </button>
                )}
                <button
                  type="button"
                  className={`schedule-scope-pill ${editScope === 'ALL' ? 'active' : ''}`}
                  onClick={() => setEditScope('ALL')}
                >
                  모든 일정 변경
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="schedule-modal-footer">
          <button
            type="button"
            className="btn-schedule-delete"
            onClick={handleDeleteByScope}
            disabled={isSubmitting}
            title={
              isRecurringSeries
                ? editScope === 'THIS_ONLY'
                  ? '현재 이 회차만 삭제합니다'
                  : editScope === 'THIS_AND_FUTURE'
                  ? `오늘 포함 이후 ${futureCompanions.length + 1}개 회차를 삭제합니다`
                  : `시리즈 전체 ${companions.length + 1}개 회차를 모두 삭제합니다`
                : '이 일정을 삭제합니다'
            }
          >
            <span>🗑️</span>
            <span>
              {isRecurringSeries
                ? editScope === 'THIS_ONLY'
                  ? '이 일정 삭제'
                  : editScope === 'THIS_AND_FUTURE'
                  ? '이후 일정 삭제'
                  : '모든 일정 삭제'
                : '일정 삭제'}
            </span>
          </button>

          <div className="schedule-footer-actions">
            <button
              type="button"
              className="btn-schedule-cancel"
              onClick={onClose}
              disabled={isSubmitting}
            >
              취소
            </button>
            <button
              type="submit"
              form="schedule-edit-form"
              className="btn-schedule-save"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? '저장 중...'
                : isRecurringSeries
                ? editScope === 'THIS_ONLY'
                  ? '이 일정만 저장'
                  : editScope === 'THIS_AND_FUTURE'
                  ? '이후 일정 일괄 저장'
                  : '모든 일정 일괄 저장'
                : '변경사항 저장'}
            </button>
          </div>
        </div>
      </div>

      {/* Nested Location Picker Map Modal */}
      {isLocationPickerOpen && (
        <LocationPickerModal
          isOpen={isLocationPickerOpen}
          onClose={() => setIsLocationPickerOpen(false)}
          onSave={handleSaveNewLocation}
        />
      )}
    </div>
  );
};
