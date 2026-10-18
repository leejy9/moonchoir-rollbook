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
  const [cardTitle, setCardTitle] = useState(() => initialCard?.title || '');
  const [cardCategory, setCardCategory] = useState<ScheduleCategory>(() => initialCard?.category || '정기연습');
  const [cardDesc, setCardDesc] = useState(() => initialCard?.description || '');
  const [cardDefaultLocationId, setCardDefaultLocationId] = useState(
    () => initialCard?.defaultLocationId || locationPresets[0]?.id || ''
  );
  const [cardDefaultStartTime, setCardDefaultStartTime] = useState(() => initialCard?.defaultStartTime || '19:30');
  const [cardDefaultEndTime, setCardDefaultEndTime] = useState(() => initialCard?.defaultEndTime || '21:30');
  const [cardAudienceType, setCardAudienceType] = useState<TargetAudienceType>(
    () => initialCard?.targetAudienceType || 'ALL'
  );
  const [cardTargetParts, setCardTargetParts] = useState<string[]>(() => initialCard?.targetParts || []);
  const [cardTargetMemberIds, setCardTargetMemberIds] = useState<string[]>(() => initialCard?.targetMemberIds || []);
  const [cardMemberSearch, setCardMemberSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '12px' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#EEF2FF', color: '#4F46E5', fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '12px', marginBottom: '6px' }}>
            📦 일정 카드(컨테이너) 관리
          </div>
          <h2 className="section-title" style={{ margin: 0 }}>
            {initialCard ? `[${initialCard.title}] 속성 수정` : '새 일정 카드(묶음) 등록'}
          </h2>
          <p className="section-subtitle" style={{ margin: '4px 0 0' }}>
            정기연습, 연주회, 특정 프로젝트를 카드 하나로 묶고 구글 시트에 영구 보존합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: '#F1F5F9',
            color: '#475569',
            border: '1px solid #CBD5E1',
            borderRadius: '8px',
            padding: '6px 12px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          ✕ 일정 등록으로 복귀
        </button>
      </div>

      {successMessage && <div className="success-banner">{successMessage}</div>}

      <form onSubmit={handleSubmit} className="form-stack">
        <div>
          <label className="form-label" htmlFor="card-title">
            카드 명칭 (프로그램/행사명)
          </label>
          <input
            id="card-title"
            type="text"
            className="input-text"
            placeholder="예: 2026 하반기 정기연습, 10월 경찰의 날 행사"
            value={cardTitle}
            onChange={(e) => setCardTitle(e.target.value)}
            required
          />
        </div>

        <div className="form-row-2">
          <div>
            <label className="form-label">기본 일정 구분</label>
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
            <label className="form-label">기본 연습실 장소</label>
            <select
              className="select-input"
              value={cardDefaultLocationId}
              onChange={(e) => setCardDefaultLocationId(e.target.value)}
            >
              <option value="">선택 안 함 (회차별 개별 지정)</option>
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
            <label className="form-label">기본 시작 시각</label>
            <RoundTimePicker
              value={cardDefaultStartTime}
              onChange={(val) => setCardDefaultStartTime(val)}
            />
          </div>
          <div>
            <label className="form-label">기본 종료 시각</label>
            <RoundTimePicker
              value={cardDefaultEndTime}
              onChange={(val) => setCardDefaultEndTime(val)}
            />
          </div>
        </div>

        {/* Card Default Audience Selector */}
        <div className="toss-section-card" style={{ padding: '12px', margin: '4px 0' }}>
          <span className="form-label" style={{ marginBottom: '6px', display: 'block', fontSize: '13px' }}>
            기본 참석 대상자 (통계 모수 필터)
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
                className={`toss-filter-chip ${cardAudienceType === aud.key ? 'active' : ''}`}
                onClick={() => setCardAudienceType(aud.key)}
              >
                <span>{aud.label}</span>
              </button>
            ))}
          </div>

          {cardAudienceType === 'PARTS' && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
              {dynamicParts.map((part) => {
                const isSel = cardTargetParts.includes(part);
                return (
                  <button
                    key={part}
                    type="button"
                    onClick={() => {
                      setCardTargetParts((prev) =>
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

          {cardAudienceType === 'CUSTOM_MEMBERS' && (
            <div style={{ marginTop: '6px' }}>
              <input
                type="text"
                className="input-text"
                placeholder="이름 또는 파트로 검색..."
                value={cardMemberSearch}
                onChange={(e) => setCardMemberSearch(e.target.value)}
                style={{ marginBottom: '6px', fontSize: '12px', padding: '5px 8px' }}
              />
              <div style={{ maxHeight: '120px', overflowY: 'auto', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '4px' }}>
                {members
                  .filter((m) => {
                    if (!cardMemberSearch.trim()) return true;
                    const q = cardMemberSearch.toLowerCase();
                    return m.name.toLowerCase().includes(q) || m.part.toLowerCase().includes(q);
                  })
                  .map((m) => {
                    const isSel = cardTargetMemberIds.includes(m.id);
                    return (
                      <div
                        key={m.id}
                        onClick={() => {
                          setCardTargetMemberIds((prev) =>
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

        <div>
          <label className="form-label" htmlFor="card-desc">
            카드 상세 설명 (선택)
          </label>
          <textarea
            id="card-desc"
            className="input-textarea"
            placeholder="예: 2026년 정기연주회 준비를 위한 총 12회차 집중 연습 및 본공연"
            value={cardDesc}
            onChange={(e) => setCardDesc(e.target.value)}
            rows={3}
          />
        </div>

        <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
          <button
            type="submit"
            className="btn-primary-large"
            style={{ minHeight: '44px', flex: 1 }}
            disabled={isSubmitting}
          >
            {isSubmitting ? '저장 중...' : '💾 구글 시트에 카드 저장'}
          </button>
          <button
            type="button"
            className="btn-secondary-cancel"
            style={{ minHeight: '44px' }}
            onClick={onCancel}
            disabled={isSubmitting}
          >
            ✕ 닫기
          </button>
        </div>
      </form>
    </div>
  );
};
