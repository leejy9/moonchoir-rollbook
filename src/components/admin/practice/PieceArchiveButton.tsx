import React from 'react';
import type { PracticePiece } from '../../../types/rollbook';
import { sheetsService } from '../../../services/sheets';

interface PieceArchiveButtonProps {
  piece: Partial<PracticePiece>;
  onSaved: () => void;
  onClose: () => void;
}

export const PieceArchiveButton: React.FC<PieceArchiveButtonProps> = ({
  piece,
  onSaved,
  onClose,
}) => {
  if (!piece.id) return null;

  const handleToggleArchive = async () => {
    if (!piece.id) return;
    await sheetsService.setPracticePieceArchived(piece.id, !piece.isArchived);
    onSaved();
    onClose();
  };

  return (
    <div
      style={{
        marginTop: '20px',
        paddingTop: '16px',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <button
        type="button"
        onClick={handleToggleArchive}
        style={{
          minHeight: '44px',
          padding: '8px 16px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
          background: 'transparent',
          color: piece.isArchived ? 'var(--brand-primary)' : 'var(--text-muted)',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        {piece.isArchived ? '곡 복원' : '곡 보관'}
      </button>
    </div>
  );
};
