import React from 'react';

interface PieceSaveButtonProps {
  disabled: boolean;
  isSaving: boolean;
  fieldError: string | null;
  onSave: () => void;
}

export const PieceSaveButton: React.FC<PieceSaveButtonProps> = ({
  disabled,
  isSaving,
  fieldError,
  onSave,
}) => {
  return (
    <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-card)' }}>
      {fieldError && (
        <div className="admin-field-error" style={{ marginBottom: '8px', textAlign: 'center', color: 'var(--status-danger)', fontSize: '13px' }}>
          {fieldError}
        </div>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={onSave}
        style={{
          width: '100%',
          height: '52px',
          minHeight: '52px',
          borderRadius: 'var(--radius-md)',
          border: 'none',
          background: 'var(--brand-primary)',
          color: 'var(--text-white)',
          fontSize: '16px',
          fontWeight: 700,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {isSaving ? '저장 중…' : '저장'}
      </button>
    </div>
  );
};
