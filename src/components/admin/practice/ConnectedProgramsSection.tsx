import React from 'react';

interface ConnectedProgramsSectionProps {
  connectedPrograms: Array<{
    programId: string;
    orderIndex: number;
    title: string;
    isStaged?: boolean;
  }>;
  onOpenAddModal: () => void;
  onRemoveProgram: (programId: string) => void;
}

export const ConnectedProgramsSection: React.FC<ConnectedProgramsSectionProps> = ({
  connectedPrograms,
  onOpenAddModal,
  onRemoveProgram,
}) => {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <label className="admin-field-label" style={{ margin: 0 }}>연결된 공연</label>
        <button
          type="button"
          onClick={onOpenAddModal}
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
          + 공연에 넣기
        </button>
      </div>
      {connectedPrograms.length === 0 ? (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          연결된 공연이 없습니다. (공연 미정)
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
          {connectedPrograms.map((cp) => (
            <div
              key={cp.programId}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-subtle)',
                fontSize: '13px',
              }}
            >
              <div>
                <span>{cp.title}{!cp.isStaged && ` · ${cp.orderIndex + 1}번째`}</span>
                {cp.isStaged && (
                  <span style={{ fontSize: '11px', color: 'var(--brand-primary)', marginLeft: '8px', fontWeight: 600 }}>
                    저장 대기
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => onRemoveProgram(cp.programId)}
                aria-label="공연 연결 해제"
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', minWidth: '44px', minHeight: '44px', fontSize: '16px' }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
};
