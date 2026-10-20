import React, { useState } from 'react';
import type { ProgramCard, ScheduleCategory, TargetAudienceType, LocationPreset, Member } from '../../types/rollbook';
import { getKSTTimestampString } from '../../utils/date';
import { RoundTimePicker } from '../RoundTimePicker';

export interface AdminProgramCardFormProps {
  initialCard: ProgramCard | null;
  dynamicCategories: ScheduleCategory[];
  dynamicParts: string[];
  locationPresets: LocationPreset[];
  members: Member[];
  onSave: (cardData: ProgramCard) => Promise<void>;
  onCancel: () => void;
  successMessage?: string;
}

export const AdminProgramCardForm: React.FC<AdminProgramCardFormProps> = ({
  initialCard,
  dynamicCategories,
  dynamicParts,
  locationPresets,
  members,
  onSave,
  onCancel,
  successMessage,
}) => {
  const defaultChoirParts = React.useMemo(() => {
    const filtered = dynamicParts.filter(
      (p) => !p.includes('선생님') && !p.includes('객원') && !p.includes('지휘') && !p.includes('반주')
    );
    return filtered.length > 0 ? filtered : dynamicParts;
  }, [dynamicParts]);

  const [cardTitle, setCardTitle] = useState(() => initialCard?.title || '');
  const [cardCategory, setCardCategory] = useState<ScheduleCategory>(() => initialCard?.category || '정기연습');
  const [cardDesc, setCardDesc] = useState(() => initialCard?.description || '');
  const [cardDefaultLocationId, setCardDefaultLocationId] = useState(
    () => initialCard?.defaultLocationId || locationPresets[0]?.id || ''
  );
  const [cardDefaultStartTime, setCardDefaultStartTime] = useState(() => initialCard?.defaultStartTime || '19:30');
  const [cardDefaultEndTime, setCardDefaultEndTime] = useState(() => initialCard?.defaultEndTime || '21:30');
  const [cardAudienceType, setCardAudienceType] = useState<TargetAudienceType>(
    () => initialCard?.targetAudienceType || 'PARTS'
  );
  const [cardTargetParts, setCardTargetParts] = useState<string[]>(() => {
    if (initialCard) {
      if (initialCard.targetAudienceType === 'PARTS' && initialCard.targetParts) {
        return initialCard.targetParts;
      }
      if (initialCard.targetAudienceType === 'ALL' || initialCard.targetAudienceType === 'ALL_WITH_GUESTS') {
        return [...dynamicParts];
      }
      return defaultChoirParts;
    }
    return defaultChoirParts;
  });
  const [cardTargetMemberIds, setCardTargetMemberIds] = useState<string[]>(() => initialCard?.targetMemberIds || []);
  const [isAudienceDropdownOpen, setIsAudienceDropdownOpen] = useState(false);
  const [isCustomMemberModalOpen, setIsCustomMemberModalOpen] = useState(false);
  const [cardMemberSearch, setCardMemberSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const getAudienceSummaryLabel = () => {
    if (cardAudienceType === 'CUSTOM_MEMBERS') {
      return `개별 선택 (${cardTargetMemberIds.length}명)`;
    }
    if (cardAudienceType === 'ALL' || cardTargetParts.length === dynamicParts.length) {
      return `전체 (${dynamicParts.join(', ')})`;
    }
    if (cardTargetParts.length === 0) {
      return '대상 선택';
    }
    return cardTargetParts.join(', ');
  };

  const handleTogglePartInDropdown = (part: string) => {
    setCardAudienceType('PARTS');
    setCardTargetParts((prev) =>
      prev.includes(part) ? prev.filter((p) => p !== part) : [...prev, part]
    );
  };

  const handleToggleAllParts = () => {
    setCardAudienceType('PARTS');
    if (cardTargetParts.length === dynamicParts.length) {
      setCardTargetParts(defaultChoirParts);
    } else {
      setCardTargetParts([...dynamicParts]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardTitle.trim() || isSubmitting) return;

    const cardData: ProgramCard = {
      id: initialCard?.id || `card_${Date.now()}`,
      title: cardTitle.trim(),
      category: cardCategory,
      description: cardDesc.trim() || undefined,
      defaultLocationId: cardDefaultLocationId || undefined,
      defaultStartTime: cardDefaultStartTime || '19:30',
      defaultEndTime: cardDefaultEndTime || '21:30',
      targetAudienceType: cardAudienceType,
      targetParts: cardAudienceType === 'PARTS' ? cardTargetParts : undefined,
      targetMemberIds: cardAudienceType === 'CUSTOM_MEMBERS' ? cardTargetMemberIds : undefined,
      isArchived: initialCard?.isArchived || false,
      createdAt: initialCard?.createdAt || getKSTTimestampString(),
    };

    setIsSubmitting(true);
    try {
      await onSave(cardData);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            onClick={onCancel}
            className="btn-nav-back"
            style={{ padding: '6px 12px', fontSize: '13px', whiteSpace: 'nowrap' }}
          >
            ← 뒤로
          </button>
          <h2 className="section-title" style={{ margin: 0 }}>
            {initialCard ? '카드 수정' : '카드 등록'}
          </h2>
        </div>
      </div>

      {successMessage && <div className="success-banner">{successMessage}</div>}

      <form onSubmit={handleSubmit} className="form-stack">
        <div>
          <label className="form-label" htmlFor="card-title">
            이름
          </label>
          <input
            id="card-title"
            type="text"
            className="input-text"
            placeholder="예: 2026 하반기 정기연습, 가을 연주회"
            value={cardTitle}
            onChange={(e) => setCardTitle(e.target.value)}
            required
          />
        </div>

        <div className="form-row-2">
          <div>
            <label className="form-label">구분</label>
            <select
              className="select-input"
              value={cardCategory}
              onChange={(e) => setCardCategory(e.target.value as ScheduleCategory)}
            >
              {dynamicCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">장소</label>
            <select
              className="select-input"
              value={cardDefaultLocationId}
              onChange={(e) => setCardDefaultLocationId(e.target.value)}
            >
              <option value="">선택 안 함</option>
              {locationPresets.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-row-2">
          <div>
            <label className="form-label">시작</label>
            <RoundTimePicker
              value={cardDefaultStartTime}
              onChange={(val) => setCardDefaultStartTime(val)}
            />
          </div>
          <div>
            <label className="form-label">종료</label>
            <RoundTimePicker
              value={cardDefaultEndTime}
              onChange={(val) => setCardDefaultEndTime(val)}
            />
          </div>
        </div>

        {/* Card Default Audience Multi-Select Dropdown */}
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
                  {cardTargetParts.length === dynamicParts.length ? '기본 4파트만' : '전체 선택'}
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                {dynamicParts.map((part) => {
                  const isChecked = cardAudienceType === 'PARTS' && cardTargetParts.includes(part);
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

              <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setCardAudienceType('CUSTOM_MEMBERS');
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
                  개별 단원 직접 선택 ({cardTargetMemberIds.length}명)
                </button>
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="form-label" htmlFor="card-desc">
            메모
          </label>
          <textarea
            id="card-desc"
            className="input-textarea"
            placeholder="설명 (선택)"
            value={cardDesc}
            onChange={(e) => setCardDesc(e.target.value)}
            rows={3}
          />
        </div>

        <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
          <button
            type="submit"
            className="btn-primary-large"
            style={{ minHeight: '46px', flex: 1 }}
            disabled={isSubmitting}
          >
            {isSubmitting ? '저장 중...' : '저장'}
          </button>
          <button
            type="button"
            className="btn-secondary-cancel"
            style={{ minHeight: '46px', whiteSpace: 'nowrap' }}
            onClick={onCancel}
            disabled={isSubmitting}
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
                개별 단원 선택 ({cardTargetMemberIds.length}명)
              </h2>
            </div>

            <input
              type="text"
              className="input-text"
              placeholder="이름 또는 파트 검색..."
              value={cardMemberSearch}
              onChange={(e) => setCardMemberSearch(e.target.value)}
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
                  if (!cardMemberSearch.trim()) return true;
                  const q = cardMemberSearch.toLowerCase();
                  return m.name.toLowerCase().includes(q) || m.part.toLowerCase().includes(q);
                })
                .map((m) => {
                  const isSel = cardTargetMemberIds.includes(m.id);
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
                            setCardTargetMemberIds((prev) =>
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
