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
});
