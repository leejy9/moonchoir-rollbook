import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { PerformanceSection } from './PerformanceSection';
import { PerformancePieceOrderView } from './PerformancePieceOrderView';
import type { Performance, PracticeCatalog } from '../../../types/rollbook';
import { buildPerformanceScopes } from '../../../utils/practiceScope';

describe('PerformanceSection & PerformancePieceOrderView (V3-15 Stage 5)', () => {
  const dummyPerformances: Performance[] = [
    {
      id: 'perf_up',
      title: '미래 공연',
      performanceDate: '2026-12-25',
      venue: '세종문화회관',
      isArchived: false,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
    {
      id: 'perf_past',
      title: '과거 공연',
      performanceDate: '2026-01-01',
      venue: '예술의전당',
      isArchived: false,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
    {
      id: 'perf_archived',
      title: '보관된 공연',
      performanceDate: '2026-12-30',
      venue: '',
      isArchived: true,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
  ];

  const dummyCatalog: PracticeCatalog = {
    pieces: [
      { id: 'p1', title: '첫째 곡', composer: '작곡가 1', isArchived: false, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
      { id: 'p2', title: '둘째 곡', composer: '작곡가 2', isArchived: false, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
      { id: 'p3', title: '셋째 곡', composer: '작곡가 3', isArchived: false, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
    ],
    tracks: [],
    programPieces: [],
    performances: dummyPerformances,
    performancePieces: [
      { performanceId: 'perf_up', pieceId: 'p1', orderIndex: 0, isArchived: false },
      { performanceId: 'perf_up', pieceId: 'p2', orderIndex: 1, isArchived: false },
      { performanceId: 'perf_up', pieceId: 'p3', orderIndex: 2, isArchived: false },
    ],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders performance list with upcoming and past sections and + 공연 button', () => {
    const html = renderToString(
      <PerformanceSection catalog={dummyCatalog} onDataChanged={vi.fn()} />
    );

    expect(html).toContain('미래 공연');
    expect(html).toContain('과거 공연');
    expect(html).toContain('+ 공연');
    expect(html).toContain('보관함 (1)');
    // Active view does not render archived performance by default
    expect(html).not.toContain('보관된 공연');
  });

  it('ensures archived performances are NOT in member practice scope dropdown (spec §10.4)', () => {
    const scopes = buildPerformanceScopes(dummyCatalog, '2026-11-20');
    const scopeIds = scopes.map((s) => s.id);

    expect(scopeIds).toContain('perf_up');
    expect(scopeIds).not.toContain('perf_archived');
  });

  it('boundary disabling for piece order buttons (↑ disabled for first, ↓ disabled for last)', () => {
    const html = renderToString(
      <PerformancePieceOrderView
        performance={dummyPerformances[0]}
        catalog={dummyCatalog}
        onBack={vi.fn()}
        onEditPerformance={vi.fn()}
        onDataChanged={vi.fn()}
      />
    );

    expect(html).toContain('미래 공연');
    expect(html.replace(/<!-- -->/g, '')).toContain('공연 곡 순서 (3곡)');
    expect(html).toContain('첫째 곡');
    expect(html).toContain('둘째 곡');
    expect(html).toContain('셋째 곡');

    // Matches the disabled up button for first piece
    const upDisabled = /<button[^>]*disabled[^>]*aria-label="위로 이동"|<button[^>]*aria-label="위로 이동"[^>]*disabled/.test(html);
    expect(upDisabled).toBe(true);

    // Matches the disabled down button for last piece
    const downDisabled = /<button[^>]*disabled[^>]*aria-label="아래로 이동"|<button[^>]*aria-label="아래로 이동"[^>]*disabled/.test(html);
    expect(downDisabled).toBe(true);
  });
});
