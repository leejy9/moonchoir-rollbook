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
});
