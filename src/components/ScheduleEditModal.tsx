import React, { useState } from 'react';
import type { LocationPreset, Schedule, ScheduleCategory } from '../types/rollbook';

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
}

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
  const [description, setDescription] = useState(schedule?.description || '');
  const [checkInPin, setCheckInPin] = useState(schedule?.checkInPin || '');
  const [applyToAllInSeries, setApplyToAllInSeries] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen || !schedule) return null;

  // Find companions with same title (recurring series)
  const companions = allSchedules.filter((s) => s.title === schedule.title && s.id !== schedule.id);
  const isRecurringSeries = companions.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date.trim()) {
      setErrorMsg('일정 명칭과 날짜를 입력해주세요.');
      return;
    }

    const foundLoc = locationPresets.find((l) => l.id === selectedLocPresetId);
    const updates: Partial<Schedule> = {
      title: title.trim(),
      startTime,
      endTime,
      category,
      description: description.trim() || undefined,
      checkInPin: checkInPin.trim() || undefined,
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

      if (isRecurringSeries && applyToAllInSeries && onSaveSeries) {
        // Save updates to all schedules in the series (preserving each one's own date)
        const allIds = [schedule.id, ...companions.map((c) => c.id)];
        await onSaveSeries(allIds, updates);
      } else {
        // Save single schedule (can also update date)
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
    if (window.confirm(`'${schedule.date} ${schedule.title}' 일정을 삭제하시겠습니까?`)) {
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

  const handleDeleteAllInSeries = async () => {
    if (!onDeleteSeries) return;
    const totalCount = companions.length + 1;
    if (
      window.confirm(
        `'${schedule.title}' 명칭의 전체 ${totalCount}개 회차 일정을 모두 일괄 삭제하시겠습니까?\n구글 스프레드시트에서도 모두 영구 삭제됩니다.`
      )
    ) {
      try {
        setIsSubmitting(true);
        const allIds = [schedule.id, ...companions.map((c) => c.id)];
        await onDeleteSeries(allIds, schedule.title);
        onClose();
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : '일괄 삭제 중 오류가 발생했습니다.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-container member-profile-modal-modern"
        style={{ maxWidth: '620px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="modal-header-modern">
          <div className="profile-header-meta">
            <span className="profile-pill-tag" style={{ background: '#EEF2FF', color: '#4F46E5' }}>
              {category}
            </span>
            <div className="profile-header-title-wrap">
              <h2 className="modal-heading-name">일정 수정</h2>
              <span className="modal-heading-sub">{schedule.date} · {schedule.title}</span>
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
          {errorMsg && <div className="profile-alert-danger">⚠️ {errorMsg}</div>}

          {isRecurringSeries && (
            <div
              style={{
                background: '#F0FDF4',
                border: '1px solid #BBF7D0',
                borderRadius: '12px',
                padding: '14px 16px',
                marginBottom: '16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>🔄</span>
                <div>
                  <strong style={{ fontSize: '13px', color: '#166534' }}>
                    반복 등록된 일정 감지 (총 {companions.length + 1}회차)
                  </strong>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#15803D' }}>
                    동일한 명칭(&apos;{schedule.title}&apos;)으로 생성된 다른 일정이 {companions.length}개 있습니다.
                  </p>
                </div>
              </div>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginTop: '10px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#166534',
                }}
              >
                <input
                  type="checkbox"
                  checked={applyToAllInSeries}
                  onChange={(e) => setApplyToAllInSeries(e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: '#10B981', cursor: 'pointer' }}
                />
                동일 명칭의 전체 {companions.length + 1}개 회차에 장소/시간/안내 일괄 적용
              </label>
            </div>
          )}

          <form id="schedule-edit-form" onSubmit={handleSubmit} className="modern-form-wrapper">
            <div className="form-responsive-grid">
              <div className="modern-field-group full-width">
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
                  disabled={isRecurringSeries && applyToAllInSeries}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
                {isRecurringSeries && applyToAllInSeries && (
                  <span style={{ fontSize: '11px', color: '#6b7684', marginTop: '4px' }}>
                    ※ 전체 일괄 수정 시 각 회차의 고유 날짜는 유지됩니다.
                  </span>
                )}
              </div>

              <div className="modern-field-group">
                <label className="modern-field-label">일정 구분</label>
                <select
                  className="modern-select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ScheduleCategory)}
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
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

              <div className="modern-field-group full-width">
                <label className="modern-field-label">연습 장소 (장소 프리셋)</label>
                <select
                  className="modern-select"
                  value={selectedLocPresetId}
                  onChange={(e) => setSelectedLocPresetId(e.target.value)}
                >
                  {locationPresets.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({loc.address || '주소 미입력'} · 반경 {loc.radiusMeters}m)
                    </option>
                  ))}
                </select>
              </div>

              <div className="modern-field-group full-width">
                <label className="modern-field-label">연습 곡목 및 메모</label>
                <textarea
                  className="modern-textarea"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="연습할 곡목이나 단원 공지사항을 입력하세요."
                />
              </div>

              <div className="modern-field-group">
                <label className="modern-field-label">현장 출석 PIN (4자리)</label>
                <input
                  type="text"
                  maxLength={4}
                  className="modern-input"
                  value={checkInPin}
                  onChange={(e) => setCheckInPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="예: 1022"
                />
              </div>
            </div>
          </form>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer-sticky" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {isRecurringSeries ? (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn-danger-outline"
                  onClick={handleDeleteThisOnly}
                  disabled={isSubmitting}
                  style={{ minHeight: '44px', fontSize: '13px' }}
                >
                  🗑️ 이 회차만 삭제
                </button>
                <button
                  type="button"
                  className="btn-danger-outline"
                  onClick={handleDeleteAllInSeries}
                  disabled={isSubmitting}
                  style={{ minHeight: '44px', fontSize: '13px', background: '#FEE2E2', color: '#DC2626', borderColor: '#FCA5A5' }}
                >
                  💥 전체 {companions.length + 1}회차 일괄 삭제
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn-danger-outline"
                onClick={handleDeleteThisOnly}
                disabled={isSubmitting}
                style={{ minHeight: '44px' }}
              >
                🗑️ 일정 삭제
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              className="btn-cancel-modern"
              onClick={onClose}
              disabled={isSubmitting}
              style={{ minHeight: '44px' }}
            >
              취소
            </button>
            <button
              type="submit"
              form="schedule-edit-form"
              className="btn-submit-modern"
              disabled={isSubmitting}
              style={{ minHeight: '44px' }}
            >
              {isSubmitting ? '저장 중...' : applyToAllInSeries ? `전체 ${companions.length + 1}회차 일괄 저장` : '수정사항 저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
