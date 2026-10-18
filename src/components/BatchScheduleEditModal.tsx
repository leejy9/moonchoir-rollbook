import React, { useState } from 'react';
import type { LocationPreset, Schedule, ScheduleCategory } from '../types/rollbook';
import { RoundTimePicker } from './RoundTimePicker';

interface BatchScheduleEditModalProps {
  isOpen: boolean;
  selectedScheduleIds: string[];
  allSchedules: Schedule[];
  locationPresets: LocationPreset[];
  categories: string[];
  onClose: () => void;
  onApplyBatch: (scheduleIds: string[], updates: Partial<Schedule>) => Promise<void>;
}

export const BatchScheduleEditModal: React.FC<BatchScheduleEditModalProps> = ({
  isOpen,
  selectedScheduleIds,
  allSchedules,
  locationPresets,
  categories,
  onClose,
  onApplyBatch,
}) => {
  // Change toggle flags
  const [changeLocation, setChangeLocation] = useState(false);
  const [selectedLocPresetId, setSelectedLocPresetId] = useState(locationPresets[0]?.id || '');

  const [changeTime, setChangeTime] = useState(false);
  const [startTime, setStartTime] = useState('19:30');
  const [endTime, setEndTime] = useState('21:30');

  const [changeCategory, setChangeCategory] = useState(false);
  const [category, setCategory] = useState<ScheduleCategory>(categories[0] || '정기연습');

  const [changeDescription, setChangeDescription] = useState(false);
  const [description, setDescription] = useState('');

  const [changeAudience, setChangeAudience] = useState(false);
  const [targetAudienceType, setTargetAudienceType] = useState<import('../types/rollbook').TargetAudienceType>('ALL');
  const [targetParts, setTargetParts] = useState<import('../types/rollbook').PartType[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen || selectedScheduleIds.length === 0) return null;

  const selectedSchedules = allSchedules.filter((s) => selectedScheduleIds.includes(s.id));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changeLocation && !changeTime && !changeCategory && !changeDescription && !changeAudience) {
      setErrorMsg('일괄 변경할 항목을 1개 이상 선택(체크)해주세요.');
      return;
    }

    const updates: Partial<Schedule> = {};

    if (changeLocation) {
      const foundLoc = locationPresets.find((l) => l.id === selectedLocPresetId);
      if (foundLoc) {
        updates.locationName = foundLoc.name;
        updates.locationId = foundLoc.id;
        updates.detailAddress = foundLoc.detailAddress;
        updates.entranceNote = foundLoc.entranceNote;
        updates.targetLat = foundLoc.latitude;
        updates.targetLon = foundLoc.longitude;
        updates.radiusMeters = foundLoc.radiusMeters;
      }
    }

    if (changeTime) {
      updates.startTime = startTime;
      updates.endTime = endTime;
    }

    if (changeCategory) {
      updates.category = category;
    }

    if (changeDescription) {
      updates.description = description.trim() || undefined;
    }

    if (changeAudience) {
      updates.targetAudienceType = targetAudienceType;
      updates.targetParts = targetAudienceType === 'PARTS' ? targetParts : undefined;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg('');
      await onApplyBatch(selectedScheduleIds, updates);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : '일괄 수정 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-container member-profile-modal-modern"
        style={{ maxWidth: '580px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="modal-header-modern">
          <div className="profile-header-meta">
            <span className="profile-pill-tag" style={{ background: '#EDE9FE', color: '#6D28D9' }}>
              일괄 편집
            </span>
            <div className="profile-header-title-wrap">
              <h2 className="modal-heading-name">선택한 {selectedScheduleIds.length}개 일정 일괄 수정</h2>
              <span className="modal-heading-sub">체크한 항목만 선택된 모든 일정에 일괄 반영됩니다.</span>
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

          {/* Selected Schedules Preview */}
          <div
            style={{
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '10px',
              padding: '12px 14px',
              marginBottom: '16px',
              maxHeight: '110px',
              overflowY: 'auto',
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>
              대상 일정 목록 ({selectedSchedules.length}건):
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
              {selectedSchedules.map((s) => (
                <span
                  key={s.id}
                  style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    background: '#FFFFFF',
                    border: '1px solid #CBD5E1',
                    borderRadius: '6px',
                    color: '#334155',
                  }}
                >
                  {s.date} · {s.title}
                </span>
              ))}
            </div>
          </div>

          <form id="batch-schedule-form" onSubmit={handleSubmit} className="modern-form-wrapper">
            {/* 1. Location Change */}
            <div
              style={{
                border: '1px solid #E5E7EB',
                borderRadius: '10px',
                padding: '14px',
                marginBottom: '12px',
                background: changeLocation ? '#F9FAFB' : '#FFFFFF',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontWeight: 700,
                  fontSize: '14px',
                  cursor: 'pointer',
                  color: '#1F2937',
                }}
              >
                <input
                  type="checkbox"
                  checked={changeLocation}
                  onChange={(e) => setChangeLocation(e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: '#4F46E5', cursor: 'pointer' }}
                />
                📍 연습 장소 일괄 변경
              </label>

              {changeLocation && (
                <div style={{ marginTop: '10px' }}>
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
              )}
            </div>

            {/* 2. Time Change */}
            <div
              style={{
                border: '1px solid #E5E7EB',
                borderRadius: '10px',
                padding: '14px',
                marginBottom: '12px',
                background: changeTime ? '#F9FAFB' : '#FFFFFF',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontWeight: 700,
                  fontSize: '14px',
                  cursor: 'pointer',
                  color: '#1F2937',
                }}
              >
                <input
                  type="checkbox"
                  checked={changeTime}
                  onChange={(e) => setChangeTime(e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: '#4F46E5', cursor: 'pointer' }}
                />
                🕒 연습 시간 일괄 변경
              </label>

              {changeTime && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
                  <div>
                    <label style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>시작 시간</label>
                    <RoundTimePicker
                      value={startTime}
                      onChange={(val) => setStartTime(val)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>종료 시간</label>
                    <RoundTimePicker
                      value={endTime}
                      onChange={(val) => setEndTime(val)}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 3. Category Change */}
            <div
              style={{
                border: '1px solid #E5E7EB',
                borderRadius: '10px',
                padding: '14px',
                marginBottom: '12px',
                background: changeCategory ? '#F9FAFB' : '#FFFFFF',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontWeight: 700,
                  fontSize: '14px',
                  cursor: 'pointer',
                  color: '#1F2937',
                }}
              >
                <input
                  type="checkbox"
                  checked={changeCategory}
                  onChange={(e) => setChangeCategory(e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: '#4F46E5', cursor: 'pointer' }}
                />
                🏷️ 일정 구분(카테고리) 일괄 변경
              </label>

              {changeCategory && (
                <div style={{ marginTop: '10px' }}>
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
              )}
            </div>

            {/* 4. Notes Change */}
            <div
              style={{
                border: '1px solid #E5E7EB',
                borderRadius: '10px',
                padding: '14px',
                marginBottom: '12px',
                background: changeDescription ? '#F9FAFB' : '#FFFFFF',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontWeight: 700,
                  fontSize: '14px',
                  cursor: 'pointer',
                  color: '#1F2937',
                }}
              >
                <input
                  type="checkbox"
                  checked={changeDescription}
                  onChange={(e) => setChangeDescription(e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: '#4F46E5', cursor: 'pointer' }}
                />
                📝 연습 곡목 및 공지사항 일괄 변경
              </label>

              {changeDescription && (
                <div style={{ marginTop: '10px' }}>
                  <textarea
                    className="modern-textarea"
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="선택한 모든 일정에 동일하게 들어갈 곡목/공지사항"
                  />
                </div>
              )}
            </div>

            {/* 5. Audience Change */}
            <div
              style={{
                border: '1px solid #E5E7EB',
                borderRadius: '10px',
                padding: '14px',
                marginBottom: '12px',
                background: changeAudience ? '#F9FAFB' : '#FFFFFF',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontWeight: 700,
                  fontSize: '14px',
                  cursor: 'pointer',
                  color: '#1F2937',
                }}
              >
                <input
                  type="checkbox"
                  checked={changeAudience}
                  onChange={(e) => setChangeAudience(e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: '#4F46E5', cursor: 'pointer' }}
                />
                👥 참석 대상자 설정 일괄 변경
              </label>

              {changeAudience && (
                <div style={{ marginTop: '10px' }}>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                    {(
                      [
                        { key: 'ALL', label: '🌐 전체 단원 필참' },
                        { key: 'PARTS', label: '👥 특정 파트 한정' },
                      ] as const
                    ).map((aud) => (
                      <button
                        key={aud.key}
                        type="button"
                        onClick={() => setTargetAudienceType(aud.key)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '20px',
                          border: targetAudienceType === aud.key ? '1.5px solid #4F46E5' : '1px solid #CBD5E1',
                          background: targetAudienceType === aud.key ? '#EEF2FF' : '#FFFFFF',
                          color: targetAudienceType === aud.key ? '#4F46E5' : '#475569',
                          fontWeight: targetAudienceType === aud.key ? 700 : 500,
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        {aud.label}
                      </button>
                    ))}
                  </div>

                  {targetAudienceType === 'PARTS' && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', padding: '8px 10px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                      {['소프라노', '알토', '테너', '베이스'].map((p) => {
                        const isSel = targetParts.includes(p as import('../types/rollbook').PartType);
                        return (
                          <button
                            key={p}
                            type="button"
                            onClick={() => {
                              setTargetParts((prev) =>
                                prev.includes(p as any) ? prev.filter((item) => item !== p) : [...prev, p as any]
                              );
                            }}
                            style={{
                              padding: '4px 10px',
                              borderRadius: '6px',
                              border: isSel ? '1.5px solid #059669' : '1px solid #CBD5E1',
                              background: isSel ? '#D1FAE5' : '#FFFFFF',
                              color: isSel ? '#047857' : '#334155',
                              fontWeight: isSel ? 700 : 500,
                              fontSize: '12px',
                              cursor: 'pointer',
                            }}
                          >
                            {p} {isSel ? '✓' : ''}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </form>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer-sticky" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
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
            form="batch-schedule-form"
            className="btn-submit-modern"
            disabled={isSubmitting}
            style={{ minHeight: '44px' }}
          >
            {isSubmitting ? '일괄 적용 중...' : `${selectedScheduleIds.length}개 일정 일괄 변경 적용`}
          </button>
        </div>
      </div>
    </div>
  );
};
