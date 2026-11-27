import React, { useState } from 'react';
import type { PracticeTrack } from '../../../types/rollbook';

interface TrackEditModalProps {
  track: PracticeTrack;
  mode: 'label' | 'kind';
  availableKinds: string[];
  onClose: () => void;
  onSave: (updates: { label?: string; kind?: string }) => void;
}

export const TrackEditModal: React.FC<TrackEditModalProps> = ({
  track,
  mode,
  availableKinds,
  onClose,
  onSave,
}) => {
  const [label, setLabel] = useState(track.label);
  const [kind, setKind] = useState(track.kind);
  const [customKind, setCustomKind] = useState('');
  const [isCustomKind, setIsCustomKind] = useState(() => !availableKinds.includes(track.kind));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'label') {
      if (!label.trim()) return;
      onSave({ label: label.trim() });
    } else {
      const finalKind = isCustomKind ? (customKind.trim() || '가이드') : kind;
      onSave({ kind: finalKind });
    }
    onClose();
  };

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div className="admin-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h4 style={{ margin: 0 }}>
            {mode === 'label' ? '트랙 이름 바꾸기' : '트랙 종류 바꾸기'}
          </h4>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', fontSize: '20px', cursor: 'pointer', minWidth: '44px', minHeight: '44px' }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === 'label' ? (
            <div className="admin-field-group">
              <label className="admin-field-label">트랙 이름</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="admin-field-input"
                placeholder="트랙 이름을 입력해 주세요"
                autoFocus
              />
            </div>
          ) : (
            <div className="admin-field-group">
              <label className="admin-field-label">트랙 종류</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' }}>
                {availableKinds.map((k) => (
                  <label key={k} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', minHeight: '44px' }}>
                    <input
                      type="radio"
                      name="trackKind"
                      value={k}
                      checked={!isCustomKind && kind === k}
                      onChange={() => {
                        setIsCustomKind(false);
                        setKind(k);
                      }}
                    />
                    <span>{k}</span>
                  </label>
                ))}
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', minHeight: '44px' }}>
                  <input
                    type="radio"
                    name="trackKind"
                    value="custom"
                    checked={isCustomKind}
                    onChange={() => setIsCustomKind(true)}
                  />
                  <span>기타 (직접 입력)</span>
                </label>
              </div>
              {isCustomKind && (
                <input
                  type="text"
                  value={customKind}
                  onChange={(e) => setCustomKind(e.target.value)}
                  className="admin-field-input"
                  placeholder="종류 직접 입력"
                  autoFocus
                />
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                minHeight: '44px',
                padding: '8px 16px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              취소
            </button>
            <button
              type="submit"
              style={{
                minHeight: '44px',
                padding: '8px 16px',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                background: 'var(--brand-primary)',
                color: '#fff',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              저장
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
