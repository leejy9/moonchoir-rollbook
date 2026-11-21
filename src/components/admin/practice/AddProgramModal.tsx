import React from 'react';
import type { ProgramCard } from '../../../types/rollbook';

interface AddProgramModalProps {
  programCards: ProgramCard[];
  onClose: () => void;
  onSelect: (programId: string) => void;
}

export const AddProgramModal: React.FC<AddProgramModalProps> = ({
  programCards,
  onClose,
  onSelect,
}) => (
  <div className="admin-modal-backdrop" onClick={onClose}>
    <div className="admin-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
      <h4 style={{ margin: '0 0 12px 0' }}>공연에 추가</h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {programCards
          .filter((p) => !p.isArchived)
          .map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              style={{
                width: '100%',
                minHeight: '44px',
                padding: '10px 14px',
                textAlign: 'left',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-card)',
                color: 'var(--text-main)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {p.title}
            </button>
          ))}
      </div>
    </div>
  </div>
);
