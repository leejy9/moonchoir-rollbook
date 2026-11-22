import React from 'react';

interface UnsavedChangesModalProps {
  onConfirmClose: () => void;
  onContinueEditing: () => void;
}

export const UnsavedChangesModal: React.FC<UnsavedChangesModalProps> = ({
  onConfirmClose,
  onContinueEditing,
}) => {
  return (
    <div className="admin-modal-backdrop" onClick={onContinueEditing}>
      <div
        className="admin-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '360px', textAlign: 'center', padding: '24px 20px' }}
      >
        <h4 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 700 }}>
          저장하지 않고 닫을까요?
        </h4>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={onConfirmClose}
            style={{
              flex: 1,
              minHeight: '44px',
              padding: '10px 16px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              background: 'transparent',
              color: 'var(--text-muted)',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            닫기
          </button>
          <button
            type="button"
            onClick={onContinueEditing}
            style={{
              flex: 1,
              minHeight: '44px',
              padding: '10px 16px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: 'var(--brand-primary)',
              color: 'var(--text-white)',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            계속 편집
          </button>
        </div>
      </div>
    </div>
  );
};
