import React, { useState } from 'react';
import type {
  LocationPreset,
  Member,
  PartType,
  ProgramCard,
  Schedule,
  ScheduleCategory,
  TargetAudienceType,
} from '../../types/rollbook';
import {
  createSchedulesMultiMode,
  getCalendarGrid,
  type ScheduleAddMode,
} from '../../utils/calendar';
import { getKSTDateString } from '../../utils/date';
import { RoundDatePicker } from '../RoundDatePicker';
import { RoundTimePicker } from '../RoundTimePicker';

const DAYS_OF_WEEK = [
  { key: 'MON', label: '월' },
  { key: 'TUE', label: '화' },
  { key: 'WED', label: '수' },
  { key: 'THU', label: '목' },
  { key: 'FRI', label: '금' },
  { key: 'SAT', label: '토' },
  { key: 'SUN', label: '일' },
] as const;

export interface AdminScheduleFormSavePayload {
  mode: 'UPDATE' | 'CREATE';
  targetScheduleId?: string;
  updates?: Partial<Schedule>;
  schedules?: Schedule[];
}

export interface AdminScheduleFormProps {
  editingSchedule: Schedule | null;
  prefilledDate?: string;
  prefilledProgramCardId?: string;
  programCards: ProgramCard[];
  dynamicCategories: ScheduleCategory[];
  dynamicParts: PartType[];
  locationPresets: LocationPreset[];
  members: Member[];
  onSave: (payload: AdminScheduleFormSavePayload) => Promise<void>;
  onCancelEdit: () => void;
  onOpenCreateCard: () => void;
  onOpenEditCard: (card: ProgramCard) => void;
  onOpenLocationPickerModal: () => void;
  successMessage?: string;
}

export const AdminScheduleForm: React.FC<AdminScheduleFormProps> = ({
  editingSchedule,
  prefilledDate,
  prefilledProgramCardId,
  programCards,
  dynamicCategories,
  dynamicParts,
  locationPresets,
  members,
  onSave,
  onCancelEdit,
  onOpenCreateCard,
  onOpenEditCard,
  onOpenLocationPickerModal,
  successMessage,
}) => {
  const defaultLoc = locationPresets[0];

  // Form local state initialized cleanly from editingSchedule or props
  const [scheduleAddMode, setScheduleAddMode] = useState<ScheduleAddMode>('SINGLE');
  const [newTitle, setNewTitle] = useState(() => editingSchedule?.title || '');
  const [newDate, setNewDate] = useState(() => editingSchedule?.date || prefilledDate || getKSTDateString());

  // Interval & Repetition parameters
  const [intervalUnit, setIntervalUnit] = useState<'DAYS' | 'WEEKS' | 'MONTHS' | 'YEARS'>('WEEKS');
  const [intervalStep] = useState(1);
  const [intervalCount, setIntervalCount] = useState(8);
  const [weeksCount, setWeeksCount] = useState(12);
  const [selectedDays, setSelectedDays] = useState<Array<'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN'>>([
    'THU',
  ]);
  const [selectedMonthDays] = useState<number[]>([15]);
  const [selectedYearDates] = useState<{ month: number; day: number }[]>([]);
  const [pickCalYear, setPickCalYear] = useState(() => new Date().getFullYear());
  const [pickCalMonth, setPickCalMonth] = useState(() => new Date().getMonth());
  const [pickedDates, setPickedDates] = useState<string[]>([]);

  // Time & Location
  const [newStartTime, setNewStartTime] = useState(() => editingSchedule?.startTime || '19:30');
  const [newEndTime, setNewEndTime] = useState(() => editingSchedule?.endTime || '21:30');
  const [selectedLocationPresetId, setSelectedLocationPresetId] = useState(() => {
    if (editingSchedule) {
      const resolved = locationPresets.find(
        (l) => l.id === editingSchedule.locationId || l.name === editingSchedule.locationName
      );
      return resolved ? resolved.id : editingSchedule.locationId || 'custom';
    }
    return defaultLoc?.id || 'custom';
  });
  const [newLocName, setNewLocName] = useState(() => editingSchedule?.locationName || defaultLoc?.name || '');
  const [newLat, setNewLat] = useState(() => editingSchedule?.targetLat ?? defaultLoc?.latitude ?? 37.5665);
  const [newLon, setNewLon] = useState(() => editingSchedule?.targetLon ?? defaultLoc?.longitude ?? 126.978);
  const [newRadius, setNewRadius] = useState(() => editingSchedule?.radiusMeters ?? defaultLoc?.radiusMeters ?? 100);

  // Category & Taxonomy
  const [newCategory, setNewCategory] = useState<ScheduleCategory>(
    () => editingSchedule?.category || dynamicCategories[0] || '정기연습'
  );
  const [isCustomNewCategory, setIsCustomNewCategory] = useState(false);
  const [customNewCategoryInput, setCustomNewCategoryInput] = useState('');
  const [newDesc, setNewDesc] = useState(() => editingSchedule?.description || '');
  const [selectedProgramCardId, setSelectedProgramCardId] = useState(
    () => editingSchedule?.programId || prefilledProgramCardId || ''
  );

  // Audience selector parameters
  const [newTargetAudienceType, setNewTargetAudienceType] = useState<TargetAudienceType>(
    () => editingSchedule?.targetAudienceType || 'ALL'
  );
  const [newTargetParts, setNewTargetParts] = useState<PartType[]>(() => editingSchedule?.targetParts || []);
  const [newTargetMemberIds, setNewTargetMemberIds] = useState<string[]>(
    () => editingSchedule?.targetMemberIds || []
  );
  const [customMemberSearch, setCustomMemberSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Day toggle
  const toggleDaySelection = (dayKey: 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN') => {
    setSelectedDays((prev) => {
      if (prev.includes(dayKey)) {
        if (prev.length === 1) return prev;
        return prev.filter((d) => d !== dayKey);
      }
      return [...prev, dayKey];
    });
  };

  // Location Preset Handler
  const handleLocationPresetChange = (presetId: string) => {
    setSelectedLocationPresetId(presetId);
    if (presetId === 'custom') {
      setNewLocName('');
      setNewLat(37.5665);
      setNewLon(126.978);
      setNewRadius(100);
      return;
    }
    const loc = locationPresets.find((l) => l.id === presetId);
    if (loc) {
      setNewLocName(loc.name);
      setNewLat(loc.latitude);
      setNewLon(loc.longitude);
      setNewRadius(loc.radiusMeters);
    }
  };

  // Program Card change handler
  const handleProgramCardChange = (cardId: string) => {
    setSelectedProgramCardId(cardId);
    if (!cardId) return;
    const card = programCards.find((c) => c.id === cardId);
    if (!card) return;

    if (!newTitle.trim() || newTitle === defaultLoc?.name) {
      setNewTitle(card.title);
    }
    if (card.category) setNewCategory(card.category);
    if (card.defaultLocationId) {
      handleLocationPresetChange(card.defaultLocationId);
    }
    if (card.defaultStartTime) setNewStartTime(card.defaultStartTime);
    if (card.defaultEndTime) setNewEndTime(card.defaultEndTime);
    if (card.targetAudienceType) {
      setNewTargetAudienceType(card.targetAudienceType);
      setNewTargetParts(card.targetParts || []);
      setNewTargetMemberIds(card.targetMemberIds || []);
    }
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!newTitle.trim()) {
      alert('일정 명칭을 입력해주세요.');
      document.getElementById('sch-title')?.focus();
      return;
    }
    if (scheduleAddMode !== 'CALENDAR_PICK' && !newDate.trim()) {
      alert('시작 기준 날짜를 입력해주세요.');
      return;
    }
    if (scheduleAddMode === 'CALENDAR_PICK' && pickedDates.length === 0) {
      alert('달력에서 최소 1개 이상의 날짜를 선택해주세요.');
      return;
    }
    if (
      (scheduleAddMode === 'DAYS_OF_WEEK' || (scheduleAddMode === 'INTERVAL' && intervalUnit === 'WEEKS')) &&
      selectedDays.length === 0
    ) {
      alert('반복할 요일을 최소 1개 이상 선택해주세요.');
      return;
    }

    const effectiveLocName = newLocName.trim() || defaultLoc?.name || '연습실';
    const finalCategory = isCustomNewCategory
      ? ((customNewCategoryInput.trim() || '기타행사') as ScheduleCategory)
      : newCategory;
    const foundLoc = locationPresets.find((l) => l.id === selectedLocationPresetId);

    setIsSubmitting(true);
    try {
      if (editingSchedule) {
        const updates: Partial<Schedule> = {
          title: newTitle.trim(),
          date: newDate,
          startTime: newStartTime,
          endTime: newEndTime,
          locationName: effectiveLocName,
          locationId: foundLoc ? foundLoc.id : undefined,
          detailAddress: foundLoc?.detailAddress,
          entranceNote: foundLoc?.entranceNote,
          targetLat: newLat,
          targetLon: newLon,
          radiusMeters: newRadius,
          category: finalCategory,
          description: newDesc.trim() || undefined,
          programId: selectedProgramCardId || undefined,
          targetAudienceType: newTargetAudienceType,
          targetParts: newTargetAudienceType === 'PARTS' ? newTargetParts : undefined,
          targetMemberIds: newTargetAudienceType === 'CUSTOM_MEMBERS' ? newTargetMemberIds : undefined,
        };

        await onSave({
          mode: 'UPDATE',
          targetScheduleId: editingSchedule.id,
          updates,
        });
      } else {
        const baseSchedule = {
          title: newTitle.trim(),
          date: newDate,
          startTime: newStartTime,
          endTime: newEndTime,
          locationName: effectiveLocName,
          locationId: foundLoc ? foundLoc.id : undefined,
          detailAddress: foundLoc?.detailAddress,
          entranceNote: foundLoc?.entranceNote,
          targetLat: newLat,
          targetLon: newLon,
          radiusMeters: newRadius,
          category: finalCategory,
          description: newDesc.trim() || undefined,
          programId: selectedProgramCardId || undefined,
          targetAudienceType: newTargetAudienceType,
          targetParts: newTargetAudienceType === 'PARTS' ? newTargetParts : undefined,
          targetMemberIds: newTargetAudienceType === 'CUSTOM_MEMBERS' ? newTargetMemberIds : undefined,
        };

        const generated = createSchedulesMultiMode({
          mode: scheduleAddMode,
          baseSchedule,
          intervalUnit,
          intervalStep,
          intervalCount,
          byDays: selectedDays,
          byMonthDays: selectedMonthDays,
          byYearDates: selectedYearDates,
          weeksCount,
          pickedDates,
        });

        if (generated.length === 0) {
          alert('생성할 수 있는 일정 날짜가 없습니다. 날짜 및 반복 설정을 확인해주세요.');
          return;
        }

        await onSave({
          mode: 'CREATE',
          schedules: generated,
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div id="admin-schedule-form-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
        <div>
          <h2 className="section-title" style={{ margin: 0 }}>
            {editingSchedule ? '✏️ 일정 인라인 수정' : '연습 및 연주 일정 등록 (반복 엔진)'}
          </h2>
          <p className="section-subtitle" style={{ margin: '4px 0 0' }}>
            {editingSchedule
              ? `선택된 [${editingSchedule.title}] 일정을 수정하여 시트에 즉시 반영합니다.`
              : '네이버/애플 캘린더처럼 매주 특정 요일 반복 일정을 손쉽게 전개하여 등록합니다.'}
          </p>
        </div>
        {editingSchedule && (
          <button
            type="button"
            onClick={onCancelEdit}
            style={{
              background: '#F1F5F9',
              color: '#475569',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              padding: '5px 10px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            ✕ 신규 등록으로 복귀
          </button>
        )}
      </div>

      {successMessage && <div className="success-banner">{successMessage}</div>}

      <form onSubmit={handleSubmit} className="form-stack">
        {/* Program Card Container Selector */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <label className="form-label" htmlFor="sch-program-card" style={{ margin: 0 }}>
              소속 일정 카드 (컨테이너)
            </label>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                type="button"
                onClick={onOpenCreateCard}
                style={{
                  background: '#EEF2FF',
                  color: '#4F46E5',
                  border: '1px solid #C7D2FE',
                  borderRadius: '6px',
                  padding: '2px 8px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                + 새 카드 만들기
              </button>
              {selectedProgramCardId && (
                <button
                  type="button"
                  onClick={() => {
                    const found = programCards.find((c) => c.id === selectedProgramCardId);
                    if (found) onOpenEditCard(found);
                  }}
                  style={{
                    background: '#F8FAFC',
                    color: '#334155',
                    border: '1px solid #CBD5E1',
                    borderRadius: '6px',
                    padding: '2px 8px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  ✏️ 선택 카드 수정
                </button>
              )}
            </div>
          </div>
          <select
            id="sch-program-card"
            className="select-input"
            value={selectedProgramCardId}
            onChange={(e) => handleProgramCardChange(e.target.value)}
          >
            <option value="">선택 안 함 (독립 단일 일정)</option>
            {programCards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.title} [{card.category}]
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="form-label" htmlFor="sch-title">
            일정 명칭 (회차명)
          </label>
          <input
            id="sch-title"
            type="text"
            className="input-text"
            placeholder="예: 2026 하반기 정기연습 1회차, 10월 경찰의 날 연주"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            required
          />
        </div>

        {/* Schedule Mode Selector (Hidden during edit) */}
        {!editingSchedule && (
          <div className="schedule-mode-tabs" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`mode-tab-btn ${scheduleAddMode === 'SINGLE' ? 'active' : ''}`}
              onClick={() => setScheduleAddMode('SINGLE')}
            >
              1회성 단일 일정
            </button>
            <button
              type="button"
              className={`mode-tab-btn ${scheduleAddMode === 'DAYS_OF_WEEK' ? 'active' : ''}`}
              onClick={() => setScheduleAddMode('DAYS_OF_WEEK')}
            >
              요일별 주간 반복
            </button>
            <button
              type="button"
              className={`mode-tab-btn ${scheduleAddMode === 'INTERVAL' ? 'active' : ''}`}
              onClick={() => setScheduleAddMode('INTERVAL')}
            >
              간격 주기 반복
            </button>
            <button
              type="button"
              className={`mode-tab-btn ${scheduleAddMode === 'CALENDAR_PICK' ? 'active' : ''}`}
              onClick={() => setScheduleAddMode('CALENDAR_PICK')}
            >
              달력에서 콕콕 선택
            </button>
          </div>
        )}

        {/* Mode: DAYS_OF_WEEK Sub-settings */}
        {!editingSchedule && scheduleAddMode === 'DAYS_OF_WEEK' && (
          <div className="toss-section-card" style={{ padding: '12px' }}>
            <span className="form-label" style={{ marginBottom: '6px', display: 'block' }}>
              반복할 요일 선택
            </span>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
              {DAYS_OF_WEEK.map((d) => {
                const isSel = selectedDays.includes(d.key as any);
                return (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => toggleDaySelection(d.key as any)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      border: isSel ? '1.5px solid #4F46E5' : '1px solid #CBD5E1',
                      background: isSel ? '#EEF2FF' : '#FFFFFF',
                      color: isSel ? '#4F46E5' : '#334155',
                      fontWeight: isSel ? 700 : 500,
                      cursor: 'pointer',
                    }}
                  >
                    {d.label}요일
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label className="form-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>
                반복 주차 수:
              </label>
              <input
                type="number"
                className="input-text"
                min={1}
                max={52}
                value={weeksCount}
                onChange={(e) => setWeeksCount(Math.max(1, parseInt(e.target.value) || 1))}
                style={{ width: '80px', padding: '6px 8px' }}
              />
              <span style={{ fontSize: '13px', color: '#64748B' }}>주간 전개 (총 {selectedDays.length * weeksCount}회차)</span>
            </div>
          </div>
        )}

        {/* Mode: INTERVAL Sub-settings */}
        {!editingSchedule && scheduleAddMode === 'INTERVAL' && (
          <div className="toss-section-card" style={{ padding: '12px' }}>
            <div className="form-row-2">
              <div>
                <label className="form-label">반복 주기 단위</label>
                <select
                  className="select-input"
                  value={intervalUnit}
                  onChange={(e) => setIntervalUnit(e.target.value as any)}
                >
                  <option value="DAYS">일(Day) 간격</option>
                  <option value="WEEKS">주(Week) 간격</option>
                  <option value="MONTHS">월(Month) 간격</option>
                  <option value="YEARS">년(Year) 간격</option>
                </select>
              </div>
              <div>
                <label className="form-label">반복 횟수</label>
                <input
                  type="number"
                  className="input-text"
                  min={1}
                  max={100}
                  value={intervalCount}
                  onChange={(e) => setIntervalCount(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>
            </div>
          </div>
        )}

        {/* Mode: CALENDAR_PICK Sub-settings */}
        {!editingSchedule && scheduleAddMode === 'CALENDAR_PICK' && (
          <div className="toss-section-card" style={{ padding: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700 }}>
                {pickCalYear}년 {pickCalMonth + 1}월 (선택된 날짜: {pickedDates.length}개)
              </span>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="button"
                  onClick={() => {
                    if (pickCalMonth === 0) {
                      setPickCalMonth(11);
                      setPickCalYear((y) => y - 1);
                    } else setPickCalMonth((m) => m - 1);
                  }}
                  style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid #CBD5E1', background: '#F8FAFC', cursor: 'pointer' }}
                >
                  ◀
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (pickCalMonth === 11) {
                      setPickCalMonth(0);
                      setPickCalYear((y) => y + 1);
                    } else setPickCalMonth((m) => m + 1);
                  }}
                  style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid #CBD5E1', background: '#F8FAFC', cursor: 'pointer' }}
                >
                  ▶
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center' }}>
              {getCalendarGrid(pickCalYear, pickCalMonth).map((d) => {
                const isSelected = pickedDates.includes(d.dateStr);
                return (
                  <button
                    key={d.dateStr}
                    type="button"
                    onClick={() => {
                      setPickedDates((prev) =>
                        prev.includes(d.dateStr) ? prev.filter((x) => x !== d.dateStr) : [...prev, d.dateStr].sort()
                      );
                    }}
                    style={{
                      padding: '6px 2px',
                      borderRadius: '6px',
                      border: isSelected ? '1.5px solid #4F46E5' : '1px solid #E2E8F0',
                      background: isSelected ? '#EEF2FF' : d.isCurrentMonth ? '#FFFFFF' : '#F8FAFC',
                      color: isSelected ? '#4F46E5' : d.isCurrentMonth ? '#1E293B' : '#94A3B8',
                      fontWeight: isSelected ? 700 : 400,
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    {d.dayNumber}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Audience Selector */}
        <div className="toss-section-card" style={{ padding: '12px', margin: '4px 0' }}>
          <span className="form-label" style={{ marginBottom: '6px', display: 'block' }}>
            참석 대상자 (통계 모수 필터)
          </span>
          <div className="toss-filter-row" style={{ marginBottom: '8px', gap: '6px', flexWrap: 'wrap' }}>
            {(
              [
                { key: 'ALL', label: '🌐 전체 (선생님 포함)' },
                { key: 'ALL_WITH_GUESTS', label: '🎼 전체 + 객원' },
                { key: 'PARTS', label: '👥 특정 파트' },
                { key: 'CUSTOM_MEMBERS', label: '🎯 선발 단원' },
              ] as const
            ).map((aud) => (
              <button
                key={aud.key}
                type="button"
                className={`toss-filter-chip ${newTargetAudienceType === aud.key ? 'active' : ''}`}
                onClick={() => setNewTargetAudienceType(aud.key)}
              >
                <span>{aud.label}</span>
              </button>
            ))}
          </div>

          {newTargetAudienceType === 'PARTS' && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
              {dynamicParts.map((part) => {
                const isSel = newTargetParts.includes(part);
                return (
                  <button
                    key={part}
                    type="button"
                    onClick={() => {
                      setNewTargetParts((prev) =>
                        prev.includes(part) ? prev.filter((p) => p !== part) : [...prev, part]
                      );
                    }}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: isSel ? '1.5px solid #059669' : '1px solid #CBD5E1',
                      background: isSel ? '#D1FAE5' : '#FFFFFF',
                      color: isSel ? '#047857' : '#334155',
                      fontWeight: isSel ? 700 : 500,
                      fontSize: '11.5px',
                      cursor: 'pointer',
                    }}
                  >
                    {part} {isSel ? '✓' : ''}
                  </button>
                );
              })}
            </div>
          )}

          {newTargetAudienceType === 'CUSTOM_MEMBERS' && (
            <div style={{ marginTop: '6px' }}>
              <input
                type="text"
                className="input-text"
                placeholder="이름 또는 파트로 단원 검색..."
                value={customMemberSearch}
                onChange={(e) => setCustomMemberSearch(e.target.value)}
                style={{ marginBottom: '6px', fontSize: '12px', padding: '5px 8px' }}
              />
              <div style={{ maxHeight: '120px', overflowY: 'auto', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '4px' }}>
                {members
                  .filter((m) => {
                    if (!customMemberSearch.trim()) return true;
                    const q = customMemberSearch.toLowerCase();
                    return m.name.toLowerCase().includes(q) || m.part.toLowerCase().includes(q);
                  })
                  .map((m) => {
                    const isSel = newTargetMemberIds.includes(m.id);
                    return (
                      <div
                        key={m.id}
                        onClick={() => {
                          setNewTargetMemberIds((prev) =>
                            isSel ? prev.filter((id) => id !== m.id) : [...prev, m.id]
                          );
                        }}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '4px 6px',
                          borderRadius: '4px',
                          background: isSel ? '#EEF2FF' : 'transparent',
                          cursor: 'pointer',
                          fontSize: '11.5px',
                        }}
                      >
                        <span>
                          <strong>{m.name}</strong> ({m.part} · {m.phoneLast4 || '0000'})
                        </span>
                        <span style={{ color: isSel ? '#4F46E5' : '#94A3B8', fontWeight: 600 }}>
                          {isSel ? '선택됨 ✓' : '+ 추가'}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>

        <div className="form-row-2">
          {scheduleAddMode !== 'CALENDAR_PICK' ? (
            <div>
              <label className="form-label" htmlFor="sch-date">
                시작 기준 날짜
              </label>
              <RoundDatePicker
                id="sch-date"
                value={newDate}
                onChange={(d) => setNewDate(d)}
              />
            </div>
          ) : (
            <div>
              <label className="form-label">달력 선택 날짜</label>
              <div style={{ padding: '10px 12px', background: '#F1F5F9', borderRadius: '8px', fontSize: '13px', color: '#475569' }}>
                {pickedDates.length > 0 ? `선택된 ${pickedDates.length}개 날짜로 전개` : '달력에서 날짜를 1개 이상 선택하세요.'}
              </div>
            </div>
          )}

          <div>
            <label className="form-label">일정 구분</label>
            <select
              className="select-input"
              value={isCustomNewCategory ? '__CUSTOM__' : newCategory}
              onChange={(e) => {
                if (e.target.value === '__CUSTOM__') {
                  setIsCustomNewCategory(true);
                } else {
                  setIsCustomNewCategory(false);
                  setNewCategory(e.target.value as ScheduleCategory);
                }
              }}
            >
              {dynamicCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
              <option value="__CUSTOM__">✏️ + 새 구분 직접 추가...</option>
            </select>
            {isCustomNewCategory && (
              <input
                type="text"
                className="input-text"
                style={{ marginTop: '6px' }}
                value={customNewCategoryInput}
                onChange={(e) => setCustomNewCategoryInput(e.target.value)}
                placeholder="새 일정 구분 직접 입력 (예: 총연습)"
                required={isCustomNewCategory}
                autoFocus
              />
            )}
          </div>
        </div>

        <div className="form-row-2">
          <div>
            <label className="form-label" htmlFor="sch-start">
              시작 시각
            </label>
            <RoundTimePicker
              id="sch-start"
              value={newStartTime}
              onChange={(val) => setNewStartTime(val)}
            />
          </div>

          <div>
            <label className="form-label" htmlFor="sch-end">
              종료 시각
            </label>
            <RoundTimePicker
              id="sch-end"
              value={newEndTime}
              onChange={(val) => setNewEndTime(val)}
            />
          </div>
        </div>

        {/* Unified Location Selector */}
        <div style={{ marginTop: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <label className="form-label" htmlFor="sch-loc-select" style={{ marginBottom: 0 }}>
              연습 장소
            </label>
            <button
              type="button"
              onClick={onOpenLocationPickerModal}
              style={{
                fontSize: '12px',
                color: '#4F46E5',
                fontWeight: 600,
                background: '#EEF2FF',
                border: '1px solid #C7D2FE',
                borderRadius: '6px',
                padding: '4px 10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              🗺️ + 새 장소 등록 (검색/GPS)
            </button>
          </div>
          <select
            id="sch-loc-select"
            className="select-input"
            value={selectedLocationPresetId}
            onChange={(e) => {
              if (e.target.value === '__NEW_LOCATION__') {
                onOpenLocationPickerModal();
              } else {
                handleLocationPresetChange(e.target.value);
              }
            }}
          >
            {locationPresets.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name} {loc.address ? `(${loc.address})` : ''} · 반경 {loc.radiusMeters}m
              </option>
            ))}
            <option value="__NEW_LOCATION__">🗺️ + 새 연습실 등록 (지도/키워드 검색)...</option>
          </select>
          <div style={{ marginTop: '6px' }}>
            <label className="form-label" htmlFor="sch-loc" style={{ fontSize: '12px', color: '#64748B' }}>
              일정 표기용 장소명 (수정 가능)
            </label>
            <input
              id="sch-loc"
              type="text"
              className="input-text"
              value={newLocName}
              onChange={(e) => setNewLocName(e.target.value)}
              placeholder="장소명 (예: 서초 앙상블 연습실)"
            />
          </div>
        </div>

        <label className="form-label" htmlFor="sch-desc">
          상세 설명 / 연습 곡목 (선택)
        </label>
        <textarea
          id="sch-desc"
          className="input-textarea"
          placeholder="예: 모차르트 레퀴엠 파트 연습 및 암보 런스루"
          value={newDesc}
          onChange={(e) => setNewDesc(e.target.value)}
          rows={4}
        />

        {editingSchedule ? (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="submit"
              className="btn-primary-large"
              disabled={isSubmitting}
              style={{ minHeight: '44px', flex: 1, fontWeight: 700 }}
            >
              {isSubmitting ? '⏳ 저장 중...' : '💾 수정 내용 저장'}
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              style={{
                minHeight: '44px',
                padding: '0 18px',
                background: '#F1F5F9',
                border: '1px solid #CBD5E1',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                color: '#475569',
                cursor: 'pointer',
              }}
            >
              취소
            </button>
          </div>
        ) : (
          <button
            type="submit"
            className="btn-primary-large"
            disabled={isSubmitting}
            style={{ minHeight: '44px', fontWeight: 700 }}
          >
            {isSubmitting ? (
              '⏳ 일정 등록 중...'
            ) : (
              <>
                {scheduleAddMode === 'SINGLE' && '💾 단일 일정 등록 완료'}
                {scheduleAddMode === 'INTERVAL' && `💾 총 ${intervalCount}회 주기 반복 일정 추가`}
                {scheduleAddMode === 'DAYS_OF_WEEK' && `💾 총 ${weeksCount}주간 요일 지정 일정 추가 (${selectedDays.length * weeksCount}개)`}
                {scheduleAddMode === 'CALENDAR_PICK' && `💾 선택한 ${pickedDates.length}개 날짜 일정 일괄 추가`}
              </>
            )}
          </button>
        )}
      </form>
    </div>
  );
};
