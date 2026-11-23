import React from 'react';

interface TrackKindSelectorProps {
  kinds: string[];
  trackKind: string;
  isCustomKind: boolean;
  customKind: string;
  onSelectKind: (k: string) => void;
  onSetCustomKind: (isCustom: boolean) => void;
  onChangeCustomText: (text: string) => void;
}

export const TrackKindSelector: React.FC<TrackKindSelectorProps> = ({
  kinds,
  trackKind,
  isCustomKind,
  customKind,
  onSelectKind,
  onSetCustomKind,
  onChangeCustomText,
}) => {
  return (
    <div className="admin-field-group">
      <label className="admin-field-label">트랙 종류</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
        {kinds.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onSelectKind(k)}
            style={{
              minHeight: '44px',
              padding: '8px 14px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              background: !isCustomKind && trackKind === k ? 'var(--brand-primary-light)' : 'var(--bg-card)',
              color: !isCustomKind && trackKind === k ? 'var(--brand-primary)' : 'var(--text-main)',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {k}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onSetCustomKind(true)}
          style={{
            minHeight: '44px',
            padding: '8px 14px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            background: isCustomKind ? 'var(--brand-primary-light)' : 'var(--bg-card)',
            color: isCustomKind ? 'var(--brand-primary)' : 'var(--text-main)',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          직접
        </button>
      </div>
      {isCustomKind && (
        <input
          type="text"
          className="admin-field-input"
          placeholder="종류 직접 입력"
          value={customKind}
          onChange={(e) => onChangeCustomText(e.target.value)}
        />
      )}
    </div>
  );
};
