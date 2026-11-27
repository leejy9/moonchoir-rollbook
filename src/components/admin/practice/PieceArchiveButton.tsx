import React, { useState } from 'react';
import type { PracticePiece } from '../../../types/rollbook';
import { sheetsService } from '../../../services/sheets';
import { executeDeletePracticePiece } from '../../../services/practice/deleteFlow';
import { DeleteConfirmModal } from './DeleteConfirmModal';

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
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (!piece.id) return null;

  const handleToggleArchive = async () => {
    if (!piece.id) return;
    await sheetsService.setPracticePieceArchived(piece.id, !piece.isArchived);
    onSaved();
    onClose();
  };

  const handleConfirmDelete = async () => {
    if (!piece.id) return;
    try {
      setIsDeleting(true);
      setDeleteError(null);
      await executeDeletePracticePiece(piece.id);
      setShowDeleteModal(false);
      onSaved();
      onClose();
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : '곡 삭제에 실패했습니다.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div
        style={{
          marginTop: '20px',
          paddingTop: '16px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '8px',
        }}
      >
        <button
          type="button"
          onClick={() => setShowDeleteModal(true)}
          style={{
            minHeight: '44px',
            padding: '8px 16px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            background: 'transparent',
            color: 'var(--status-danger)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          삭제
        </button>
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

      {showDeleteModal && (
        <DeleteConfirmModal
          title={piece.title || '곡'}
          isDeleting={isDeleting}
          errorMessage={deleteError}
          onConfirm={handleConfirmDelete}
          onClose={() => {
            setShowDeleteModal(false);
            setDeleteError(null);
          }}
        />
      )}
    </>
  );
};
