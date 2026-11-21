import React from 'react';
import type { PracticePiece } from '../../../types/rollbook';

interface PieceScoreSectionProps {
  piece: Partial<PracticePiece>;
  onOpenUpload: (previousStorageKey?: string) => void;
}

export const PieceScoreSection: React.FC<PieceScoreSectionProps> = ({
  piece,
  onOpenUpload,
}) => {
  return (
    <>
      <hr className="admin-section-divider" />

      {/* 악보 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <label className="admin-field-label" style={{ margin: 0 }}>악보 (PDF)</label>
        <button
          type="button"
          onClick={() => onOpenUpload(piece.scoreStorageKey)}
          style={{
            minHeight: '44px',
            padding: '4px 10px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-card)',
            color: 'var(--brand-primary)',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {piece.scoreStorageKey || piece.scoreUrl ? '교체' : '+ 악보 올리기'}
        </button>
      </div>
      {piece.scoreStorageKey ? (
        <div style={{ padding: '8px 12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', fontSize: '13px', marginBottom: '12px' }}>
          <span>{piece.scoreStorageKey.split('/').pop()}</span>
          {piece.scoreSizeBytes && (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>
              ({(piece.scoreSizeBytes / (1024 * 1024)).toFixed(1)}MB)
            </span>
          )}
        </div>
      ) : piece.scoreUrl ? (
        <div style={{ padding: '8px 12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', fontSize: '13px', marginBottom: '12px' }}>
          <span>외부 링크: {piece.scoreUrl}</span>
        </div>
      ) : (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          등록된 악보가 없습니다.
        </div>
      )}
    </>
  );
};
