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
  const defaultLoc = locationPresets.find((l) => l.isDefault) || locationPresets[0];

  // Default 4 choir parts (exclude guest/teacher by default for new schedule)
  const defaultChoirParts = React.useMemo(() => {
    const filtered = dynamicParts.filter(
      (p) => !p.includes('선생님') && !p.includes('객원') && !p.includes('지휘') && !p.includes('반주')
    );
    return filtered.length > 0 ? filtered : dynamicParts;
  }, [dynamicParts]);

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

  // Audience selector parameters (Default: PARTS with 4 main choir parts)
  const [newTargetAudienceType, setNewTargetAudienceType] = useState<TargetAudienceType>(() => {
    if (editingSchedule?.targetAudienceType) {
      return editingSchedule.targetAudienceType;
    }
    return 'PARTS';
  });
  const [newTargetParts, setNewTargetParts] = useState<PartType[]>(() => {
    if (editingSchedule) {
      if (editingSchedule.targetAudienceType === 'PARTS' && editingSchedule.targetParts) {
        return editingSchedule.targetParts;
      }
      if (editingSchedule.targetAudienceType === 'ALL' || editingSchedule.targetAudienceType === 'ALL_WITH_GUESTS') {
        return [...dynamicParts];
      }
      return defaultChoirParts;
    }
    return defaultChoirParts;
  });
  const [newTargetMemberIds, setNewTargetMemberIds] = useState<string[]>(
    () => editingSchedule?.targetMemberIds || []
  );
  const [isAudienceDropdownOpen, setIsAudienceDropdownOpen] = useState(false);
  const [isCustomMemberModalOpen, setIsCustomMemberModalOpen] = useState(false);
  const [customMemberSearch, setCustomMemberSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEditingExisting = Boolean(editingSchedule && editingSchedule.id);

  const toggleDaySelection = (dayKey: 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN') => {
    setSelectedDays((prev) => {
      if (prev.includes(dayKey)) {
        if (prev.length === 1) return prev;
        return prev.filter((d) => d !== dayKey);
      }
      return [...prev, dayKey];
    });
  };

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
      setNewTargetParts(card.targetParts || defaultChoirParts);
      setNewTargetMemberIds(card.targetMemberIds || []);
    }
  };

  const getAudienceSummaryLabel = () => {
    if (newTargetAudienceType === 'CUSTOM_MEMBERS') {
      return `개별 선택 (${newTargetMemberIds.length}명)`;
    }
    if (newTargetAudienceType === 'ALL' || newTargetParts.length === dynamicParts.length) {
      return `전체 (${dynamicParts.join(', ')})`;
    }
    if (newTargetParts.length === 0) {
      return '대상 선택';
    }
    return newTargetParts.join(', ');
  };

  const handleTogglePartInDropdown = (part: PartType) => {
    setNewTargetAudienceType('PARTS');
    setNewTargetParts((prev) =>
      prev.includes(part) ? prev.filter((p) => p !== part) : [...prev, part]
    );
  };

  const handleToggleAllParts = () => {
    setNewTargetAudienceType('PARTS');
    if (newTargetParts.length === dynamicParts.length) {
      setNewTargetParts(defaultChoirParts);
    } else {
      setNewTargetParts([...dynamicParts]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!newTitle.trim()) {
      alert('일정 이름을 입력해주세요.');
      document.getElementById('sch-title')?.focus();
      return;
    }
    if (scheduleAddMode !== 'CALENDAR_PICK' && !newDate.trim()) {
      alert('날짜를 입력해주세요.');
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
      alert('요일을 최소 1개 이상 선택해주세요.');
      return;
    }

    const foundLoc = locationPresets.find((l) => l.id === selectedLocationPresetId);
    const effectiveLocName = foundLoc?.name || newLocName.trim() || defaultLoc?.name || '연습실';
    const finalCategory = isCustomNewCategory
      ? ((customNewCategoryInput.trim() || '기타행사') as ScheduleCategory)
      : newCategory;

    setIsSubmitting(true);
    try {
      if (isEditingExisting && editingSchedule) {
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
          alert('생성할 수 있는 일정 날짜가 없습니다.');
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
      {/* Top Focus Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            onClick={onCancelEdit}
            className="btn-nav-back"
            style={{ padding: '6px 12px', fontSize: '13px', whiteSpace: 'nowrap' }}
          >
            ← 뒤로
          </button>
          <h2 className="section-title" style={{ margin: 0 }}>
            {isEditingExisting ? '일정 수정' : '일정 등록'}
          </h2>
        </div>
      </div>

      {successMessage && <div className="success-banner">{successMessage}</div>}

      <form onSubmit={handleSubmit} className="form-stack">
        {/* Program Card Container Selector */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <label className="form-label" htmlFor="sch-program-card" style={{ margin: 0 }}>
              카드
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
                  whiteSpace: 'nowrap',
                }}
              >
                + 새 카드
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
                    whiteSpace: 'nowrap',
                  }}
                >
                  카드 수정
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
            <option value="">선택 안 함 (단일 일정)</option>
            {programCards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.title} [{card.category}]
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="form-label" htmlFor="sch-title">
            이름
          </label>
          <input
            id="sch-title"
            type="text"
            className="input-text"
            placeholder="예: 정기연습 1회차, 가을 연주회"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            required
          />
        </div>

        {/* Schedule Mode Selector (Hidden during edit) */}
        {!isEditingExisting && (
          <div className="subsegment-pill-bar" style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <button
              type="button"
              className={`subsegment-pill ${scheduleAddMode === 'SINGLE' ? 'active' : ''}`}
              onClick={() => setScheduleAddMode('SINGLE')}
              style={{ textAlign: 'center', padding: '6px 4px' }}
            >
              단일
            </button>
            <button
              type="button"
              className={`subsegment-pill ${scheduleAddMode === 'DAYS_OF_WEEK' ? 'active' : ''}`}
              onClick={() => setScheduleAddMode('DAYS_OF_WEEK')}
              style={{ textAlign: 'center', padding: '6px 4px' }}
            >
              매주
            </button>
            <button
              type="button"
              className={`subsegment-pill ${scheduleAddMode === 'INTERVAL' ? 'active' : ''}`}
              onClick={() => setScheduleAddMode('INTERVAL')}
              style={{ textAlign: 'center', padding: '6px 4px' }}
            >
              주기
            </button>
            <button
              type="button"
              className={`subsegment-pill ${scheduleAddMode === 'CALENDAR_PICK' ? 'active' : ''}`}
              onClick={() => setScheduleAddMode('CALENDAR_PICK')}
              style={{ textAlign: 'center', padding: '6px 4px' }}
            >
              직접선택
            </button>
          </div>
        )}

        {/* Mode: DAYS_OF_WEEK Sub-settings */}
        {!isEditingExisting && scheduleAddMode === 'DAYS_OF_WEEK' && (
          <div className="toss-section-card" style={{ padding: '12px' }}>
            <span className="form-label" style={{ marginBottom: '6px', display: 'block' }}>
              요일
            </span>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
              {DAYS_OF_WEEK.map((d) => {
                const isSel = selectedDays.includes(d.key);
                return (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => toggleDaySelection(d.key)}
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
                    {d.label}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label className="form-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>
                반복 주수
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
              <span style={{ fontSize: '13px', color: '#64748B' }}>주 ({selectedDays.length * weeksCount}회)</span>
            </div>
          </div>
        )}

        {/* Mode: INTERVAL Sub-settings */}
        {!isEditingExisting && scheduleAddMode === 'INTERVAL' && (
          <div className="toss-section-card" style={{ padding: '12px' }}>
            <div className="form-row-2">
              <div>
                <label className="form-label">주기 단위</label>
                <select
                  className="select-input"
                  value={intervalUnit}
                  onChange={(e) => setIntervalUnit(e.target.value as 'DAYS' | 'WEEKS' | 'MONTHS' | 'YEARS')}
                >
                  <option value="DAYS">일 간격</option>
                  <option value="WEEKS">주 간격</option>
                  <option value="MONTHS">월 간격</option>
                  <option value="YEARS">년 간격</option>
                </select>
              </div>
              <div>
                <label className="form-label">횟수</label>
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
        {!isEditingExisting && scheduleAddMode === 'CALENDAR_PICK' && (
          <div className="toss-section-card" style={{ padding: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700 }}>
                {pickCalYear}년 {pickCalMonth + 1}월 ({pickedDates.length}개 선택)
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

        {/* Audience Multi-Select Dropdown */}
        <div style={{ position: 'relative' }}>
          <label className="form-label">참석 대상</label>
          <button
            type="button"
            onClick={() => setIsAudienceDropdownOpen((prev) => !prev)}
            className="select-input"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              textAlign: 'left',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {getAudienceSummaryLabel()}
            </span>
            <span style={{ fontSize: '11px', color: '#64748B', marginLeft: '8px' }}>
              {isAudienceDropdownOpen ? '▲' : '▼'}
            </span>
          </button>

          {isAudienceDropdownOpen && (
            <div
              style={{
                marginTop: '6px',
                background: '#FFFFFF',
                border: '1px solid #CBD5E1',
                borderRadius: '12px',
                padding: '10px',
                boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '6px', borderBottom: '1px solid #F1F5F9' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>파트 중복 선택</span>
                <button
                  type="button"
                  onClick={handleToggleAllParts}
                  style={{
                    fontSize: '11.5px',
                    fontWeight: 700,
                    color: '#4F46E5',
                    background: '#EEF2FF',
                    padding: '3px 8px',
                    borderRadius: '6px',
                  }}
                >
                  {newTargetParts.length === dynamicParts.length ? '기본 4파트만' : '전체 선택'}
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                {dynamicParts.map((part) => {
                  const isChecked = newTargetAudienceType === 'PARTS' && newTargetParts.includes(part);
                  return (
                    <label
                      key={part}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        background: isChecked ? '#EEF2FF' : '#F8FAFC',
                        border: isChecked ? '1px solid #C7D2FE' : '1px solid #E2E8F0',
                        fontSize: '13px',
                        fontWeight: isChecked ? 700 : 500,
                        color: isChecked ? '#4F46E5' : '#334155',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleTogglePartInDropdown(part)}
                        style={{ width: '16px', height: '16px', accentColor: '#4F46E5' }}
                      />
                      <span>{part}</span>
                    </label>
                  );
                })}
              </div>

              <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => {
                    setNewTargetAudienceType('CUSTOM_MEMBERS');
                    setIsAudienceDropdownOpen(false);
                    setIsCustomMemberModalOpen(true);
                  }}
                  style={{
                    fontSize: '12.5px',
                    fontWeight: 700,
                    color: '#0F766E',
                    background: '#F0FDFA',
                    border: '1px solid #99F6E4',
                    padding: '6px 10px',
                    borderRadius: '8px',
                    width: '100%',
                    textAlign: 'center',
                  }}
                >
                  개별 단원 직접 선택 ({newTargetMemberIds.length}명)
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="form-row-2">
          {scheduleAddMode !== 'CALENDAR_PICK' ? (
            <div>
              <label className="form-label" htmlFor="sch-date">
                날짜
              </label>
              <RoundDatePicker
                id="sch-date"
                value={newDate}
                onChange={(d) => setNewDate(d)}
              />
            </div>
          ) : (
            <div>
              <label className="form-label">선택 날짜</label>
              <div style={{ padding: '10px 12px', background: '#F1F5F9', borderRadius: '8px', fontSize: '13px', color: '#475569' }}>
                {pickedDates.length > 0 ? `${pickedDates.length}개 선택됨` : '날짜를 선택하세요'}
              </div>
            </div>
          )}

          <div>
            <label className="form-label">구분</label>
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
              <option value="__CUSTOM__">+ 직접 입력...</option>
            </select>
            {isCustomNewCategory && (
              <input
                type="text"
                className="input-text"
                style={{ marginTop: '6px' }}
                value={customNewCategoryInput}
                onChange={(e) => setCustomNewCategoryInput(e.target.value)}
                placeholder="구분 입력 (예: 총연습)"
                required={isCustomNewCategory}
                autoFocus
              />
            )}
          </div>
        </div>

        <div className="form-row-2">
          <div>
            <label className="form-label" htmlFor="sch-start">
              시작
            </label>
            <RoundTimePicker
              id="sch-start"
              value={newStartTime}
              onChange={(val) => setNewStartTime(val)}
            />
          </div>

          <div>
            <label className="form-label" htmlFor="sch-end">
              종료
            </label>
            <RoundTimePicker
              id="sch-end"
              value={newEndTime}
              onChange={(val) => setNewEndTime(val)}
            />
          </div>
        </div>

        {/* Unified Location Selector (Single clean dropdown) */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <label className="form-label" htmlFor="sch-loc-select" style={{ marginBottom: 0 }}>
              장소
            </label>
            <button
              type="button"
              onClick={onOpenLocationPickerModal}
              style={{
                fontSize: '11.5px',
                color: '#4F46E5',
                fontWeight: 700,
                background: '#EEF2FF',
                border: '1px solid #C7D2FE',
                borderRadius: '6px',
                padding: '3px 8px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              + 장소 추가
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
                {loc.name} ({loc.radiusMeters}m)
              </option>
            ))}
            <option value="custom">직접 입력</option>
            <option value="__NEW_LOCATION__">+ 새 장소 등록...</option>
          </select>

          {selectedLocationPresetId === 'custom' && (
            <input
              id="sch-loc"
              type="text"
              className="input-text"
              style={{ marginTop: '6px' }}
              value={newLocName}
              onChange={(e) => setNewLocName(e.target.value)}
              placeholder="장소명 직접 입력"
            />
          )}
        </div>

        <div>
          <label className="form-label" htmlFor="sch-desc">
            메모
          </label>
          <textarea
            id="sch-desc"
            className="input-textarea"
            placeholder="연습 곡목 또는 안내사항 (선택)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            rows={3}
          />
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
          <button
            type="submit"
            className="btn-primary-large"
            disabled={isSubmitting}
            style={{ minHeight: '46px', flex: 1, fontWeight: 700 }}
          >
            {isSubmitting ? '저장 중...' : isEditingExisting ? '저장' : '등록'}
          </button>
          <button
            type="button"
            onClick={onCancelEdit}
            className="btn-secondary-cancel"
            style={{ minHeight: '46px', whiteSpace: 'nowrap' }}
          >
            취소
          </button>
        </div>
      </form>

      {/* Custom Member Picker Modal */}
      {isCustomMemberModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-card" style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ fontSize: '17px' }}>
                개별 단원 선택 ({newTargetMemberIds.length}명)
              </h2>
            </div>

            <input
              type="text"
              className="input-text"
              placeholder="이름 또는 파트 검색..."
              value={customMemberSearch}
              onChange={(e) => setCustomMemberSearch(e.target.value)}
              style={{ minHeight: '40px' }}
            />

            <div
              style={{
                maxHeight: '280px',
                overflowY: 'auto',
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
                padding: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              {members
                .filter((m) => {
                  if (!customMemberSearch.trim()) return true;
                  const q = customMemberSearch.toLowerCase();
                  return m.name.toLowerCase().includes(q) || m.part.toLowerCase().includes(q);
                })
                .map((m) => {
                  const isSel = newTargetMemberIds.includes(m.id);
                  return (
                    <label
                      key={m.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        background: isSel ? '#EEF2FF' : 'transparent',
                        cursor: 'pointer',
                        fontSize: '13px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => {
                            setNewTargetMemberIds((prev) =>
                              isSel ? prev.filter((id) => id !== m.id) : [...prev, m.id]
                            );
                          }}
                          style={{ width: '16px', height: '16px', accentColor: '#4F46E5' }}
                        />
                        <strong>{m.name}</strong>
                        <span style={{ color: '#64748B', fontSize: '12px' }}>{m.part}</span>
                      </div>
                      <span style={{ color: '#94A3B8', fontSize: '11.5px' }}>{m.phoneLast4 || ''}</span>
                    </label>
                  );
                })}
            </div>

            <div className="modal-button-group">
              <button
                type="button"
                className="btn-primary-large"
                onClick={() => setIsCustomMemberModalOpen(false)}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
