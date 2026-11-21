import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MediaUploadSheet } from './MediaUploadSheet';
import { createUploadSaveFn } from '../../../services/media/uploadSave';
import { sheetsService } from '../../../services/sheets';
import type { AppConfig, PracticePiece } from '../../../types/rollbook';

describe('MediaUploadSheet Component', () => {
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
    mediaPublicBaseUrl: 'https://media.moonchoir.org',
    practiceTrackKinds: ['가이드', '파트음원', 'MR', '참고영상'],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders upload sheet with track kinds and storage quota display', () => {
    vi.spyOn(sheetsService, 'getMediaUsage').mockResolvedValue({
      tracksBytes: 3 * 1024 * 1024 * 1024,
      scoresBytes: 2 * 1024 * 1024 * 1024,
      totalBytes: 5 * 1024 * 1024 * 1024,
    });

    const html = renderToString(
      <MediaUploadSheet
        pieceId="p1"
        kind="audio"
        config={dummyConfig}
        onClose={vi.fn()}
      />
    );

    expect(html).toContain('음원 올리기');
    expect(html).toContain('가이드');
    expect(html).toContain('MR');
    expect(html).toContain('참고영상');
    expect(html).toContain('직접');
    expect(html).toContain('저장 공간 사용량');
  });

  it('contains ZERO emojis and 44px min touch target buttons', () => {
    const html = renderToString(
      <MediaUploadSheet
        pieceId="p1"
        kind="score"
        config={dummyConfig}
        onClose={vi.fn()}
      />
    );

    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(emojiRegex.test(html)).toBe(false);
    expect(html).toContain('min-height:44px');
  });

  describe('F1: score saveFn preserves piece fields', () => {
    it('preserves existing piece fields (title, composer, arranger, scoreUrl, notes) when saving uploaded score', async () => {
      const dummyPiece: PracticePiece = {
        id: 'p1',
        title: '아리랑',
        composer: '민요',
        arranger: '김편곡',
        scoreUrl: 'https://example.com/score.pdf',
        notes: '연습용 메모',
        isArchived: false,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      };

      vi.spyOn(sheetsService, 'getPracticeCatalog').mockReturnValue({
        pieces: [dummyPiece],
        tracks: [],
        programPieces: [],
      });

      const savePieceSpy = vi.spyOn(sheetsService, 'savePracticePiece').mockResolvedValue(dummyPiece);

      const saveFn = createUploadSaveFn('score', 'p1', '악보', '가이드');
      await saveFn('2026/score/newkey.pdf', 1024);

      expect(savePieceSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'p1',
          title: '아리랑',
          composer: '민요',
          arranger: '김편곡',
          scoreUrl: 'https://example.com/score.pdf',
          notes: '연습용 메모',
          scoreStorageKey: '2026/score/newkey.pdf',
          scoreSizeBytes: 1024,
        })
      );
    });
  });

  describe('F2: audio replace saveFn preserves track id and metadata', () => {
    it('updates existing track with same id and preserves track metadata', async () => {
      const existingTrack = {
        id: 'track_123',
        pieceId: 'p1',
        label: '소프라노 가이드',
        kind: '파트음원',
        source: 'r2',
        storageKey: '2025/audio/old.m4a',
        orderIndex: 2,
        isArchived: false,
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
      } as any;

      vi.spyOn(sheetsService, 'getPracticeCatalog').mockReturnValue({
        pieces: [],
        tracks: [existingTrack],
        programPieces: [],
      });

      const saveTrackSpy = vi.spyOn(sheetsService, 'savePracticeTrack').mockResolvedValue(existingTrack);

      const saveFn = createUploadSaveFn('audio', 'p1', '소프라노 가이드 수정', '파트음원', 'track_123');
      await saveFn('2026/audio/new.m4a', 2048);

      expect(saveTrackSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'track_123',
          pieceId: 'p1',
          label: '소프라노 가이드 수정',
          kind: '파트음원',
          source: 'r2',
          storageKey: '2026/audio/new.m4a',
          sizeBytes: 2048,
          orderIndex: 2,
        })
      );
    });
  });

  describe('F5: new track orderIndex is maxOrderIndex + 1', () => {
    it('sets orderIndex to max active track orderIndex + 1 for new tracks', async () => {
      const track1 = {
        id: 'track_1',
        pieceId: 'p1',
        label: '트랙 1',
        kind: '가이드',
        source: 'r2',
        orderIndex: 0,
        isArchived: false,
      } as any;

      const track2 = {
        id: 'track_2',
        pieceId: 'p1',
        label: '트랙 2',
        kind: 'MR',
        source: 'r2',
        orderIndex: 2,
        isArchived: false,
      } as any;

      const archivedTrack = {
        id: 'track_archived',
        pieceId: 'p1',
        label: '보관 트랙',
        kind: '가이드',
        source: 'r2',
        orderIndex: 10,
        isArchived: true,
      } as any;

      vi.spyOn(sheetsService, 'getPracticeCatalog').mockReturnValue({
        pieces: [],
        tracks: [track1, track2, archivedTrack],
        programPieces: [],
      });

      const saveTrackSpy = vi.spyOn(sheetsService, 'savePracticeTrack').mockResolvedValue(track1);

      const saveFn = createUploadSaveFn('audio', 'p1', '새 트랙', '가이드');
      await saveFn('2026/audio/new_track.m4a', 1024);

      expect(saveTrackSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          pieceId: 'p1',
          label: '새 트랙',
          kind: '가이드',
          orderIndex: 3, // max active is 2, so 2 + 1 = 3 (archived track with orderIndex 10 is ignored)
        })
      );
    });
  });
});
