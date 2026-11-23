import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { Performance, PracticeCatalog } from '../../../types/rollbook';
import { sheetsService } from '../../../services/sheets';
import { AddPieceToPerformanceModal } from './AddPieceToPerformanceModal';

interface PerformancePieceOrderViewProps {
  performance: Performance;
  catalog: PracticeCatalog;
  onBack: () => void;
  onEditPerformance: () => void;
  onDataChanged: () => void;
}

function formatMonthDay(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  return `${m}월 ${d}일`;
}

export const PerformancePieceOrderView: React.FC<PerformancePieceOrderViewProps> = ({
  performance,
  catalog,
  onBack,
  onEditPerformance,
  onDataChanged,
}) => {
  const [showAddPieceModal, setShowAddPieceModal] = useState(false);
  const [localOverride, setLocalOverride] = useState<{ performanceId: string; pieceIds: string[] } | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const serverOrder = useMemo(() => {
    return (catalog.performancePieces || [])
      .filter((pp) => pp.performanceId === performance.id && !pp.isArchived)
      .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
      .map((pp) => pp.pieceId);
  }, [performance.id, catalog.performancePieces]);

  const orderedPieceIds =
    localOverride && localOverride.performanceId === performance.id
      ? localOverride.pieceIds
      : serverOrder;

  const pieceMap = useMemo(() => {
    return new Map((catalog.pieces || []).map((p) => [p.id, p]));
  }, [catalog.pieces]);

  const candidatePieces = useMemo(() => {
    const existing = new Set(orderedPieceIds);
    return (catalog.pieces || []).filter((p) => !p.isArchived && !existing.has(p.id));
  }, [catalog.pieces, orderedPieceIds]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const triggerDebouncedSave = (newPieceIds: string[]) => {
    setLocalOverride({ performanceId: performance.id, pieceIds: newPieceIds });
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(async () => {
      try {
        await sheetsService.setPerformancePieces(performance.id, newPieceIds);
        setLocalOverride(null);
        onDataChanged();
      } catch (err: unknown) {
        console.warn('[PerformancePieceOrderView] Failed to save order:', err);
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

  const handleRemovePiece = (pieceId: string) => {
    const next = orderedPieceIds.filter((id) => id !== pieceId);
    triggerDebouncedSave(next);
  };

  const handleAddPiece = (pieceId: string) => {
    const next = [...orderedPieceIds, pieceId];
    triggerDebouncedSave(next);
    setShowAddPieceModal(false);
  };

  const dateFormatted = performance.performanceDate
    ? formatMonthDay(performance.performanceDate)
    : '날짜 미정';

  return (
    <div className="program-order-section">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--brand-primary)',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            minHeight: '44px',
            display: 'flex',
            alignItems: 'center',
            padding: 0,
          }}
        >
          ← 공연 목록
        </button>
        <button
          type="button"
          onClick={onEditPerformance}
          style={{
            padding: '6px 14px',
            minHeight: '44px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-card)',
            color: 'var(--text-main)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          편집
        </button>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: 700 }}>
          {performance.title}
        </h3>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          {dateFormatted}{performance.venue ? ` · ${performance.venue}` : ''}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0 12px 0' }}>
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
          <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
            이 공연에 등록된 곡이 없습니다.
          </div>
        ) : (
          orderedPieceIds.map((pieceId, idx) => {
            const piece = pieceMap.get(pieceId);
            if (!piece) return null;
            const isFirst = idx === 0;
            const isLast = idx === orderedPieceIds.length - 1;

            return (
              <div key={pieceId} className="program-order-row">
                <div className="program-order-index">{idx + 1}</div>
                <div className="program-order-info">
                  <span className="program-order-title">{piece.title}</span>
                  <span className="program-order-composer">
                    {piece.composer || '작곡가 미상'}
                  </span>
                </div>
                <div className="program-order-actions">
                  <button
                    type="button"
                    disabled={isFirst}
                    onClick={() => handleMoveUp(idx)}
                    className="order-btn"
                    aria-label="위로 이동"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={isLast}
                    onClick={() => handleMoveDown(idx)}
                    className="order-btn"
                    aria-label="아래로 이동"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemovePiece(pieceId)}
                    className="order-btn remove"
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
        <AddPieceToPerformanceModal
          candidatePieces={candidatePieces}
          onClose={() => setShowAddPieceModal(false)}
          onSelectPiece={handleAddPiece}
        />
      )}
    </div>
  );
};
