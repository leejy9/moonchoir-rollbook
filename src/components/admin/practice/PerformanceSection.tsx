import React, { useState, useMemo } from 'react';
import type { Performance, PracticeCatalog } from '../../../types/rollbook';
import { getKSTDateString } from '../../../utils/date';
import { PerformanceEditSheet } from './PerformanceEditSheet';
import { PerformancePieceOrderView } from './PerformancePieceOrderView';

interface PerformanceSectionProps {
  catalog: PracticeCatalog;
  onDataChanged: () => void;
}

function formatMonthDay(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  return `${m}월 ${d}일`;
}

export const PerformanceSection: React.FC<PerformanceSectionProps> = ({
  catalog,
  onDataChanged,
}) => {
  const [selectedPerformanceId, setSelectedPerformanceId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [editingPerformance, setEditingPerformance] = useState<Performance | null | undefined>(undefined);

  const todayStr = useMemo(() => getKSTDateString(), []);

  const piecesByPerfId = useMemo(() => {
    const map = new Map<string, string[]>();
    const archivedPieceIds = new Set((catalog.pieces || []).filter((p) => p.isArchived).map((p) => p.id));
    const unarchivedLinks = (catalog.performancePieces || [])
      .filter((pp) => !pp.isArchived && !archivedPieceIds.has(pp.pieceId))
      .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

    for (const pp of unarchivedLinks) {
      const existing = map.get(pp.performanceId);
      if (existing) {
        existing.push(pp.pieceId);
      } else {
        map.set(pp.performanceId, [pp.pieceId]);
      }
    }
    return map;
  }, [catalog.performancePieces, catalog.pieces]);

  const { upcomingPerfs, pastPerfs, archivedPerfs } = useMemo(() => {
    const all = catalog.performances || [];
    const archived: Performance[] = [];
    const upcoming: Performance[] = [];
    const past: Performance[] = [];

    for (const p of all) {
      if (p.isArchived) {
        archived.push(p);
      } else {
        const rawDate = p.performanceDate?.trim();
        if (rawDate && rawDate < todayStr) {
          past.push(p);
        } else {
          upcoming.push(p);
        }
      }
    }

    upcoming.sort((a, b) => {
      if (!a.performanceDate && !b.performanceDate) return a.title.localeCompare(b.title);
      if (!a.performanceDate) return 1;
      if (!b.performanceDate) return -1;
      return a.performanceDate.localeCompare(b.performanceDate) || a.title.localeCompare(b.title);
    });

    past.sort((a, b) => {
      if (!a.performanceDate && !b.performanceDate) return a.title.localeCompare(b.title);
      if (!a.performanceDate) return 1;
      if (!b.performanceDate) return -1;
      return b.performanceDate.localeCompare(a.performanceDate) || a.title.localeCompare(b.title);
    });

    return { upcomingPerfs: upcoming, pastPerfs: past, archivedPerfs: archived };
  }, [catalog.performances, todayStr]);

  const selectedPerformance = useMemo(() => {
    if (!selectedPerformanceId) return null;
    return (catalog.performances || []).find((p) => p.id === selectedPerformanceId) || null;
  }, [selectedPerformanceId, catalog.performances]);

  if (selectedPerformance) {
    return (
      <div className="program-order-section">
        <PerformancePieceOrderView
          performance={selectedPerformance}
          catalog={catalog}
          onBack={() => setSelectedPerformanceId(null)}
          onEditPerformance={() => setEditingPerformance(selectedPerformance)}
          onDataChanged={onDataChanged}
        />

        {editingPerformance !== undefined && (
          <PerformanceEditSheet
            performance={editingPerformance}
            onClose={() => setEditingPerformance(undefined)}
            onSaved={onDataChanged}
          />
        )}
      </div>
    );
  }

  const renderPerfRow = (perf: Performance, _isPast: boolean) => {
    const pieceCount = (piecesByPerfId.get(perf.id) || []).length;
    const dateFormatted = perf.performanceDate ? formatMonthDay(perf.performanceDate) : undefined;
    const metaParts = [dateFormatted, perf.venue].filter(Boolean);
    const metaText = metaParts.length > 0 ? metaParts.join(' · ') : '날짜 미정';

    return (
      <div
        key={perf.id}
        onClick={() => setSelectedPerformanceId(perf.id)}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '14px 16px',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)',
          background: 'var(--bg-card)',
          cursor: 'pointer',
          opacity: perf.isArchived ? 0.65 : 1,
          minHeight: '56px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-main)' }}>
              {perf.title}
            </span>
            {perf.isArchived && (
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
                [보관됨]
              </span>
            )}
          </div>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            {metaText}
          </span>
        </div>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--brand-primary)' }}>
          곡 {pieceCount}
        </span>
      </div>
    );
  };

  return (
    <div className="program-order-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <button
          type="button"
          onClick={() => setShowArchived(!showArchived)}
          style={{
            background: 'transparent',
            border: 'none',
            fontSize: '13px',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: 0,
            minHeight: '44px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {showArchived ? '활성 공연 보기' : `보관함 (${archivedPerfs.length})`}
        </button>

        <button
          type="button"
          onClick={() => setEditingPerformance(null)}
          style={{
            minHeight: '44px',
            padding: '6px 16px',
            borderRadius: 'var(--radius-md)',
            border: 'none',
            background: 'var(--brand-primary)',
            color: 'var(--text-white, #ffffff)',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          + 공연
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {showArchived ? (
          archivedPerfs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-muted)' }}>
              보관된 공연이 없습니다.
            </div>
          ) : (
            archivedPerfs.map((p) => renderPerfRow(p, false))
          )
        ) : (
          <>
            {upcomingPerfs.length === 0 && pastPerfs.length === 0 && (
              <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-muted)' }}>
                등록된 공연이 없습니다. 오른쪽 위 '+ 공연' 버튼으로 추가해 보세요.
              </div>
            )}
            {upcomingPerfs.map((p) => renderPerfRow(p, false))}
            {pastPerfs.map((p) => renderPerfRow(p, true))}
          </>
        )}
      </div>

      {editingPerformance !== undefined && (
        <PerformanceEditSheet
          performance={editingPerformance}
          onClose={() => setEditingPerformance(undefined)}
          onSaved={onDataChanged}
        />
      )}
    </div>
  );
};
