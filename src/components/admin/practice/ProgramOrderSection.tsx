import React, { useState, useEffect, useRef } from 'react';
import type { PracticeCatalog, ProgramCard } from '../../../types/rollbook';
import { sheetsService } from '../../../services/sheets';

interface ProgramOrderSectionProps {
  catalog: PracticeCatalog;
  programCards: ProgramCard[];
  onDataChanged: () => void;
}

export const ProgramOrderSection: React.FC<ProgramOrderSectionProps> = ({
  catalog,
  programCards,
  onDataChanged,
}) => {
  const activePrograms = programCards.filter((c) => !c.isArchived);
  const [selectedProgramId, setSelectedProgramId] = useState<string>(activePrograms[0]?.id || '');
  const [localOverride, setLocalOverride] = useState<{ programId: string; pieceIds: string[] } | null>(null);
  const [showAddPieceModal, setShowAddPieceModal] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const serverOrder = React.useMemo(() => {
    if (!selectedProgramId) return [];
    return catalog.programPieces
      .filter((pp) => pp.programId === selectedProgramId && !pp.isArchived)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((pp) => pp.pieceId);
  }, [selectedProgramId, catalog.programPieces]);

  const orderedPieceIds = (localOverride && localOverride.programId === selectedProgramId)
    ? localOverride.pieceIds
    : serverOrder;

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const triggerDebouncedSave = (newPieceIds: string[]) => {
    setLocalOverride({ programId: selectedProgramId, pieceIds: newPieceIds });
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(async () => {
      try {
        await sheetsService.setProgramPieces(selectedProgramId, newPieceIds);
        setLocalOverride(null);
        onDataChanged();
      } catch (err) {
        console.warn('[ProgramOrder] Failed to save program order:', err);
      }
    }, 300);
  };

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const next = [...orderedPieceIds];
    const temp = next[index - 1];
    next[index - 1] = next[index];
    next[index] = temp;
    triggerDebouncedSave(next);
  };

  const handleMoveDown = (index: number) => {
    if (index >= orderedPieceIds.length - 1) return;
    const next = [...orderedPieceIds];
    const temp = next[index + 1];
    next[index + 1] = next[index];
    next[index] = temp;
    triggerDebouncedSave(next);
  };

  const handleRemoveFromProgram = (pieceId: string) => {
    const next = orderedPieceIds.filter((id) => id !== pieceId);
    triggerDebouncedSave(next);
  };

  const handleAddPiece = (pieceId: string) => {
    const next = [...orderedPieceIds, pieceId];
    triggerDebouncedSave(next);
    setShowAddPieceModal(false);
  };

  const pieceMap = React.useMemo(() => {
    return new Map(catalog.pieces.map((p) => [p.id, p]));
  }, [catalog.pieces]);

  const candidatePieces = React.useMemo(() => {
    const set = new Set(orderedPieceIds);
    return catalog.pieces
      .filter((p) => !p.isArchived && !set.has(p.id))
      .filter((p) => {
        if (!searchFilter.trim()) return true;
        const q = searchFilter.toLowerCase();
        return (
          p.title.toLowerCase().includes(q) ||
          (p.composer || '').toLowerCase().includes(q)
        );
      });
  }, [catalog.pieces, orderedPieceIds, searchFilter]);

  return (
    <div className="program-order-section">
      <div className="program-order-header">
        <label className="admin-field-label">공연 선택</label>
        <select
          className="admin-field-input"
          value={selectedProgramId}
          onChange={(e) => setSelectedProgramId(e.target.value)}
        >
          {activePrograms.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title} {p.targetAudienceType ? `(${p.targetAudienceType})` : ''}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0 12px 0' }}>
        <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>
          공연 곡 순서 ({orderedPieceIds.length}곡)
        </h4>
        <button
          type="button"
          onClick={() => setShowAddPieceModal(true)}
          style={{
            minHeight: '44px',
            padding: '6px 14px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-card)',
            color: 'var(--brand-primary)',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          + 곡 넣기
        </button>
      </div>

      <div className="program-order-list">
        {orderedPieceIds.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
            이 공연에 등록된 곡이 없습니다.
          </div>
        ) : (
          orderedPieceIds.map((id, index) => {
            const piece = pieceMap.get(id);
            if (!piece) return null;

            return (
              <div key={id} className="program-order-row">
                <span className="program-order-num">{index + 1}</span>
                <span className="program-order-title">
                  {piece.title}
                  {piece.composer && (
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '6px' }}>
                      ({piece.composer})
                    </span>
                  )}
                </span>
                <div className="program-order-actions">
                  <button
                    type="button"
                    className="program-order-btn"
                    disabled={index === 0}
                    onClick={() => handleMoveUp(index)}
                    aria-label="위로 이동"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="program-order-btn"
                    disabled={index === orderedPieceIds.length - 1}
                    onClick={() => handleMoveDown(index)}
                    aria-label="아래로 이동"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="program-order-btn"
                    onClick={() => handleRemoveFromProgram(id)}
                    aria-label="공연에서 빼기"
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {showAddPieceModal && (
        <div className="admin-modal-backdrop" onClick={() => setShowAddPieceModal(false)}>
          <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>공연에 곡 추가</h4>
              <button
                type="button"
                onClick={() => setShowAddPieceModal(false)}
                style={{ border: 'none', background: 'transparent', fontSize: '20px', cursor: 'pointer', minWidth: '44px', minHeight: '44px' }}
              >
                ×
              </button>
            </div>

            <input
              type="search"
              className="admin-field-input"
              placeholder="곡 검색"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              style={{ marginBottom: '12px' }}
            />

            <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {candidatePieces.length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                  추가할 수 있는 곡이 없습니다.
                </div>
              ) : (
                candidatePieces.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleAddPiece(p.id)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      width: '100%',
                      minHeight: '44px',
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-subtle)',
                      background: 'var(--bg-card)',
                      color: 'var(--text-main)',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span>{p.title}</span>
                    <span style={{ fontSize: '12px', color: 'var(--brand-primary)' }}>+ 추가</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
