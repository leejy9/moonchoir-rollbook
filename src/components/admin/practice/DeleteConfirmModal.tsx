import React from 'react';

export interface DeleteConfirmModalProps {
  title: string;
  isDeleting?: boolean;
  errorMessage?: string | null;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  title,
  isDeleting = false,
  errorMessage,
  onConfirm,
  onClose,
}) => {
  return (
    <div
      className="admin-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="삭제 확인"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: '16px',
      }}
    >
      <div
        className="admin-modal-card"
        style={{
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius-lg, 16px)',
          width: '100%',
          maxWidth: '360px',
          padding: '24px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.16)',
        }}
      >
        <h3
          style={{
            margin: '0 0 12px 0',
            fontSize: '17px',
            fontWeight: 700,
            color: 'var(--text-main)',
            wordBreak: 'break-word',
          }}
        >
          '{title}'을(를) 삭제할까요?
        </h3>

        <p
          style={{
            margin: '0 0 20px 0',
            fontSize: '14px',
            color: 'var(--text-muted)',
            lineHeight: 1.5,
          }}
        >
          파일도 함께 지워지고 되돌릴 수 없어요.
        </p>

        {errorMessage && (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--radius-md, 8px)',
              background: 'var(--bg-subtle)',
              border: '1px solid var(--status-danger)',
              color: 'var(--status-danger)',
              fontSize: '13px',
              lineHeight: 1.4,
              marginBottom: '16px',
            }}
          >
            {errorMessage}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            style={{
              minHeight: '44px',
              padding: '8px 16px',
              borderRadius: 'var(--radius-md, 8px)',
              border: '1px solid var(--border-subtle)',
              background: 'transparent',
              color: 'var(--text-main)',
              fontSize: '14px',
              fontWeight: 600,
              cursor: isDeleting ? 'not-allowed' : 'pointer',
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            style={{
              minHeight: '44px',
              padding: '8px 16px',
              borderRadius: 'var(--radius-md, 8px)',
              border: 'none',
              background: 'var(--status-danger)',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 600,
              cursor: isDeleting ? 'not-allowed' : 'pointer',
              opacity: isDeleting ? 0.6 : 1,
            }}
          >
            {isDeleting ? '삭제 중...' : '삭제'}
          </button>
        </div>
      </div>
    </div>
  );
};
