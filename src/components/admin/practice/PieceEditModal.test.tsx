import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { PieceEditModal } from './PieceEditModal';
import { sheetsService } from '../../../services/sheets';
import type { AppConfig, PracticePiece, PracticeTrack } from '../../../types/rollbook';

let capturedTrackSectionProps: any = null;

vi.mock('./PieceTrackSection', () => ({
  PieceTrackSection: (props: any) => {
    capturedTrackSectionProps = props;
    return <div data-testid="mock-track-section" />;
  },
}));

describe('PieceEditModal Component', () => {
  const dummyConfig: AppConfig = {
    choirName: '문콰이어',
    rehearsalDay: '일요일',
    startTime: '18:00',
    defaultLat: 37.5,
    defaultLon: 127.0,
    defaultRadius: 100,
    sheetsWebAppUrl: 'https://script.google.com/macros/s/test/exec',
    lateGraceMinutes: 10,
    adminPin: '1234',
  };

  const dummyPiece: PracticePiece = {
    id: 'p1',
    title: '아리랑',
    composer: '민요',
    isArchived: false,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const dummyTrack: PracticeTrack = {
    id: 't1',
    pieceId: 'p1',
    label: '소프라노 가이드',
    kind: '가이드',
    source: 'r2',
    storageKey: 'audio/t1.m4a',
    orderIndex: 0,
    isArchived: false,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    capturedTrackSectionProps = null;
    vi.spyOn(sheetsService, 'getPracticeCatalog').mockReturnValue({
      pieces: [dummyPiece],
      tracks: [dummyTrack],
      programPieces: [],
    });
  });

  describe('F3: track archive uses setPracticeTrackArchived', () => {
    it('calls setPracticeTrackArchived and does NOT call savePracticeTrack when archiving a track', async () => {
      const setArchivedSpy = vi
        .spyOn(sheetsService, 'setPracticeTrackArchived')
        .mockResolvedValue(undefined);
      const saveTrackSpy = vi
        .spyOn(sheetsService, 'savePracticeTrack')
        .mockResolvedValue(dummyTrack);

      renderToString(
        <PieceEditModal
          piece={dummyPiece}
          catalog={{
            pieces: [dummyPiece],
            tracks: [dummyTrack],
            programPieces: [],
          }}
          programCards={[]}
          config={dummyConfig}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      );

      expect(capturedTrackSectionProps).not.toBeNull();
      await capturedTrackSectionProps.onArchiveTrack(dummyTrack);

      expect(setArchivedSpy).toHaveBeenCalledWith('t1', true);
      expect(saveTrackSpy).not.toHaveBeenCalled();
    });
  });

  describe('F4: piece and track archive, restore, reorder, edit', () => {
    it('shows archive button for active piece in HTML', async () => {
      const html = renderToString(
        <PieceEditModal
          piece={dummyPiece}
          catalog={{
            pieces: [dummyPiece],
            tracks: [dummyTrack],
            programPieces: [],
          }}
          programCards={[]}
          config={dummyConfig}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      );

      // Should render archive button in footer
      expect(html).toContain('곡 보관');
    });

    it('shows restore button for archived piece in HTML', async () => {
      const archivedPiece: PracticePiece = {
        ...dummyPiece,
        isArchived: true,
      };

      const html = renderToString(
        <PieceEditModal
          piece={archivedPiece}
          catalog={{
            pieces: [archivedPiece],
            tracks: [dummyTrack],
            programPieces: [],
          }}
          programCards={[]}
          config={dummyConfig}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      );

      expect(html).toContain('곡 복원');
    });

    it('passes archived tracks to PieceTrackSection and restores track when onRestoreTrack is called', async () => {
      const archivedTrack: PracticeTrack = {
        id: 't_archived',
        pieceId: 'p1',
        label: '과거 가이드',
        kind: '가이드',
        source: 'r2',
        storageKey: 'audio/old.m4a',
        orderIndex: 0,
        isArchived: true,
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
      };

      const setTrackArchivedSpy = vi
        .spyOn(sheetsService, 'setPracticeTrackArchived')
        .mockResolvedValue(undefined);

      renderToString(
        <PieceEditModal
          piece={dummyPiece}
          catalog={{
            pieces: [dummyPiece],
            tracks: [dummyTrack, archivedTrack],
            programPieces: [],
          }}
          programCards={[]}
          config={dummyConfig}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      );

      expect(capturedTrackSectionProps.archivedTracks).toHaveLength(1);
      expect(capturedTrackSectionProps.archivedTracks[0].id).toBe('t_archived');

      await capturedTrackSectionProps.onRestoreTrack(archivedTrack);
      expect(setTrackArchivedSpy).toHaveBeenCalledWith('t_archived', false);
    });

    it('calls reorderPracticeTracks when onMoveTrackOrder is triggered', async () => {
      const track1 = { ...dummyTrack, id: 't1', orderIndex: 0 };
      const track2 = { ...dummyTrack, id: 't2', orderIndex: 1 };
      const track3 = { ...dummyTrack, id: 't3', orderIndex: 2 };

      const reorderSpy = vi
        .spyOn(sheetsService, 'reorderPracticeTracks')
        .mockResolvedValue(undefined);

      renderToString(
        <PieceEditModal
          piece={dummyPiece}
          catalog={{
            pieces: [dummyPiece],
            tracks: [track1, track2, track3],
            programPieces: [],
          }}
          programCards={[]}
          config={dummyConfig}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      );

      await capturedTrackSectionProps.onMoveTrackOrder('t2', 'UP');
      expect(reorderSpy).toHaveBeenCalledWith('p1', ['t2', 't1', 't3']);
    });

    it('calls savePracticeTrack with preserved metadata when onEditTrack is triggered', async () => {
      const saveTrackSpy = vi
        .spyOn(sheetsService, 'savePracticeTrack')
        .mockResolvedValue(dummyTrack);

      renderToString(
        <PieceEditModal
          piece={dummyPiece}
          catalog={{
            pieces: [dummyPiece],
            tracks: [dummyTrack],
            programPieces: [],
          }}
          programCards={[]}
          config={dummyConfig}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      );

      await capturedTrackSectionProps.onEditTrack(dummyTrack, { label: '수정된 라벨' });
      expect(saveTrackSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 't1',
          pieceId: 'p1',
          label: '수정된 라벨',
          kind: '가이드',
          storageKey: 'audio/t1.m4a',
        })
      );
    });
  });
});
