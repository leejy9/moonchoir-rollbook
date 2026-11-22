import React from 'react';
import type { Performance, ProgramCard } from '../../../types/rollbook';

interface AddProgramModalProps {
  performances?: Performance[];
  programCards?: ProgramCard[];
  onClose: () => void;
  onSelect: (id: string) => void;
  onAddNewPerformance?: () => void;
}

export const AddProgramModal: React.FC<AddProgramModalProps> = ({
  performances,
  programCards = [],
  onClose,
  onSelect,
  onAddNewPerformance,
}) => {
  const items = performances
    ? performances
        .filter((p) => !p.isArchived)
        .map((p) => ({ id: p.id, title: p.title }))
    : programCards
        .filter((p) => !p.isArchived)
        .map((p) => ({ id: p.id, title: p.title }));

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div className="admin-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
        <h4 style={{ margin: '0 0 12px 0' }}>공연에 추가</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
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
              {item.title}
            </button>
          ))}
        </div>

        {onAddNewPerformance && (
          <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
            <button
              type="button"
              onClick={onAddNewPerformance}
              style={{
                width: '100%',
                minHeight: '44px',
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                border: '1px dashed var(--border-subtle)',
                background: 'var(--bg-card)',
                color: 'var(--brand-primary)',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              + 새 공연
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
