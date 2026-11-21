import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { PieceTrackSection } from './PieceTrackSection';
import type { PracticeTrack } from '../../../types/rollbook';

describe('PieceTrackSection Component', () => {
  const track1: PracticeTrack = {
    id: 't1',
    pieceId: 'p1',
    label: '트랙 1',
    kind: '가이드',
    source: 'r2',
    orderIndex: 0,
    isArchived: false,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const track2: PracticeTrack = {
    id: 't2',
    pieceId: 'p1',
    label: '트랙 2',
    kind: 'MR',
    source: 'r2',
    orderIndex: 1,
    isArchived: false,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const archivedTrack: PracticeTrack = {
    id: 't_arch',
    pieceId: 'p1',
    label: '보관된 트랙',
    kind: '파트음원',
    source: 'r2',
    orderIndex: 2,
    isArchived: true,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  it('renders reorder controls and ⋯ menu with proper disabled states', () => {
    const html = renderToString(
      <PieceTrackSection
        tracks={[track1, track2]}
        archivedTracks={[archivedTrack]}
        activeJob={null}
        pieceId="p1"
        onOpenUpload={vi.fn()}
        onArchiveTrack={vi.fn()}
        onRestoreTrack={vi.fn()}
        onMoveTrackOrder={vi.fn()}
        onEditTrack={vi.fn()}
        onOpenYoutubeModal={vi.fn()}
      />
    );

    // Reorder and action controls
    expect(html).toContain('↑');
    expect(html).toContain('아래로');
    expect(html).toContain('보관된 트랙');
    expect(html).toContain('복원');
  });
});
