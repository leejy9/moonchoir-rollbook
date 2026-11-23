import React from 'react';
import { LEVEL_TIERS, type MemberLevelInfo } from '../../utils/memberProgress';

export interface LevelLineageSheetProps {
  levelInfo: MemberLevelInfo;
  part?: string;
  onClose: () => void;
}

export const LevelLineageSheet: React.FC<LevelLineageSheetProps> = ({
  levelInfo,
  part,
  onClose,
}) => {
  const partText = (part || '').trim() || '단원';

  return (
    <div
      className="profile-sheet-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="level-lineage-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="profile-sheet-content">
        <div className="profile-sheet-header">
          <h2 id="level-lineage-title" className="profile-sheet-title">
            내 레벨 계보
          </h2>
          <button
            type="button"
            className="profile-sheet-close-btn"
            onClick={onClose}
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        {/* Current Level Summary Box */}
        <div className="level-lineage-current-box">
          <div className="level-lineage-current-header">
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--brand-lavender-text)' }}>
              현재 단계
            </span>
            {levelInfo.summaryText && (
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--brand-lavender-text)' }}>
                {levelInfo.summaryText}
              </span>
            )}
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-main)' }}>
            {`Lv.${levelInfo.level} ${levelInfo.name}`}
          </div>
          <div className="profile-level-progress-bg" style={{ background: 'rgba(0,0,0,0.08)' }}>
            <div
              className="profile-level-progress-bar"
              style={{
                width: `${levelInfo.progressPercent}%`,
                background: 'var(--brand-lavender)',
              }}
            />
          </div>
        </div>

        {/* 6 Tiers List */}
        <div className="level-lineage-list">
          {LEVEL_TIERS.map((tier) => {
            const isDone = levelInfo.level > tier.level;
            const isCurrent = levelInfo.level === tier.level;
            const tierTitle = tier.titleTemplate.replace('{파트}', partText);
            const conditionText =
              tier.nextMin !== null
                ? `${tier.min}~${tier.nextMin - 1}회 출석`
                : `${tier.min}회 이상 출석`;

            return (
              <div
                key={tier.level}
                className={`level-lineage-item ${isCurrent ? 'current' : ''}`}
              >
                <div style={{ width: '40px', display: 'flex', justifyContent: 'center' }}>
                  {isDone ? (
                    <span className="level-lineage-badge done">달성</span>
                  ) : isCurrent ? (
                    <span className="level-lineage-badge current">지금</span>
                  ) : (
                    <span className="level-lineage-badge locked">○</span>
                  )}
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ fontSize: '14px', fontWeight: isCurrent ? 700 : 600, color: 'var(--text-main)' }}>
                    {`Lv.${tier.level} ${tierTitle}`}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-sub)' }}>
                    {conditionText}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
