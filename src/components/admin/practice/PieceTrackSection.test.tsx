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
    storageKey: 'audio/t1.mp3',
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
    storageKey: 'audio/t2.mp3',
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
    storageKey: 'audio/t_arch.mp3',
    orderIndex: 2,
    isArchived: true,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const testConfig = { mediaPublicBaseUrl: 'https://media.moonchoir.workers.dev' };

  it('renders reorder controls and ⋯ menu with proper disabled states', () => {
    const html = renderToString(
      <PieceTrackSection
        tracks={[track1, track2]}
        archivedTracks={[archivedTrack]}
        activeJob={null}
        pieceId="p1"
        config={testConfig}
        onOpenUpload={vi.fn()}
        onArchiveTrack={vi.fn()}
        onRestoreTrack={vi.fn()}
        onMoveTrackOrder={vi.fn()}
        onEditTrack={vi.fn()}
        onOpenYoutubeModal={vi.fn()}
        onDeleteTrack={vi.fn()}
      />
    );

    // Reorder and action controls
    expect(html).toContain('↑');
    expect(html).toContain('아래로');
    expect(html).toContain('보관된 트랙');
    expect(html).toContain('복원');
    expect(html).toContain('삭제');
  });

  it('displays "대표" badge on the first playable audio track in orderIndex order', () => {
    const html = renderToString(
      <PieceTrackSection
        tracks={[track1, track2]}
        archivedTracks={[]}
        activeJob={null}
        pieceId="p1"
        config={testConfig}
        onOpenUpload={vi.fn()}
        onArchiveTrack={vi.fn()}
        onRestoreTrack={vi.fn()}
        onMoveTrackOrder={vi.fn()}
        onEditTrack={vi.fn()}
        onOpenYoutubeModal={vi.fn()}
      />
    );

    expect(html).toContain('대표');
    // Ensure "대표" badge appears next to track 1 label
    const t1Idx = html.indexOf('트랙 1');
    const badgeIdx = html.indexOf('track-rep-badge');
    const t2Idx = html.indexOf('트랙 2');
    expect(badgeIdx).toBeGreaterThan(t1Idx);
    expect(badgeIdx).toBeLessThan(t2Idx);
  });

  it('moves "대표" badge when track order is changed', () => {
    const reorderedTrack1 = { ...track1, orderIndex: 1 };
    const reorderedTrack2 = { ...track2, orderIndex: 0 };

    const html = renderToString(
      <PieceTrackSection
        tracks={[reorderedTrack2, reorderedTrack1]}
        archivedTracks={[]}
        activeJob={null}
        pieceId="p1"
        config={testConfig}
        onOpenUpload={vi.fn()}
        onArchiveTrack={vi.fn()}
        onRestoreTrack={vi.fn()}
        onMoveTrackOrder={vi.fn()}
        onEditTrack={vi.fn()}
        onOpenYoutubeModal={vi.fn()}
      />
    );

    expect(html).toContain('대표');
    // Badge should now appear next to track 2
    const t2Idx = html.indexOf('트랙 2');
    const badgeIdx = html.indexOf('track-rep-badge');
    const t1Idx = html.indexOf('트랙 1');
    expect(badgeIdx).toBeGreaterThan(t2Idx);
    expect(badgeIdx).toBeLessThan(t1Idx);
  });

  it('does not display "대표" badge when no playable audio tracks exist', () => {
    const videoTrack: PracticeTrack = {
      id: 'yt1',
      pieceId: 'p1',
      label: '유튜브 영상',
      kind: '참고영상',
      source: 'youtube',
      url: 'https://youtube.com/watch?v=123',
      orderIndex: 0,
      isArchived: false,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };

    const html = renderToString(
      <PieceTrackSection
        tracks={[videoTrack]}
        archivedTracks={[]}
        activeJob={null}
        pieceId="p1"
        config={testConfig}
        onOpenUpload={vi.fn()}
        onArchiveTrack={vi.fn()}
        onRestoreTrack={vi.fn()}
        onMoveTrackOrder={vi.fn()}
        onEditTrack={vi.fn()}
        onOpenYoutubeModal={vi.fn()}
      />
    );

    expect(html).not.toContain('대표');
  });
});
