import React, { useState } from 'react';
import type { PracticePiece } from '../../../types/rollbook';

interface AddPieceToPerformanceModalProps {
  candidatePieces: PracticePiece[];
  onClose: () => void;
  onSelectPiece: (pieceId: string) => void;
}

export const AddPieceToPerformanceModal: React.FC<AddPieceToPerformanceModalProps> = ({
  candidatePieces,
  onClose,
  onSelectPiece,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = candidatePieces.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return p.title.toLowerCase().includes(q) || (p.composer || '').toLowerCase().includes(q);
  });

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div
        className="admin-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '440px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h4 style={{ margin: 0 }}>곡 선택</h4>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer' }}
          >
            ×
          </button>
        </div>

        <input
          type="text"
          className="admin-field-input"
          placeholder="곡 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ marginBottom: '12px' }}
        />

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)' }}>
              추가 가능한 곡이 없습니다.
            </div>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectPiece(p.id)}
                style={{
                  minHeight: '44px',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-card)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-main)' }}>
                  {p.title}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {p.composer || '작곡가 미상'}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
