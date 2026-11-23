import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MediaUploadSheet } from './MediaUploadSheet';
import { uploadQueue } from '../../../services/media/uploadQueue';
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
        performances: [],
        performancePieces: [],
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
        performances: [],
        performancePieces: [],
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
        performances: [],
        performancePieces: [],
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

  describe('F8: saveFn persists durationSeconds', () => {
    it('persists durationSeconds on new track upload', async () => {
      vi.spyOn(sheetsService, 'getPracticeCatalog').mockReturnValue({
        pieces: [],
        tracks: [],
        programPieces: [],
        performances: [],
        performancePieces: [],
      });

      const saveTrackSpy = vi.spyOn(sheetsService, 'savePracticeTrack').mockResolvedValue({} as any);

      const saveFn = createUploadSaveFn('audio', 'p1', '길이 있는 트랙', '가이드', undefined, 245);
      await saveFn('2026/audio/track_dur.m4a', 2048);

      expect(saveTrackSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          pieceId: 'p1',
          label: '길이 있는 트랙',
          durationSeconds: 245,
        })
      );
    });
  });

  describe('G2: handle storage connection and upload failure transparency', () => {
    it('disables upload button and shows guide message when mediaPublicBaseUrl is empty', () => {
      const configWithoutMedia: AppConfig = {
        ...dummyConfig,
        mediaPublicBaseUrl: '',
      };

      const html = renderToString(
        <MediaUploadSheet
          pieceId="p1"
          kind="audio"
          config={configWithoutMedia}
          onClose={vi.fn()}
        />
      );

      expect(html).toContain('파일 저장소가 아직 연결되지 않았어요');
      expect(html).toMatch(/<button[^>]*disabled[^>]*>.*올리기.*<\/button>/s);
    });

    it('renders audio file input with extended accept attribute for wav, aiff, and flac (J3)', () => {
      const html = renderToString(
        <MediaUploadSheet
          pieceId="p1"
          kind="audio"
          config={dummyConfig}
          onClose={vi.fn()}
        />
      );

      expect(html).toContain('audio/wav');
      expect(html).toContain('audio/aiff');
      expect(html).toContain('audio/flac');
      expect(html).toContain('.wav,.aif,.aiff,.flac');
    });

    it('L2: has multiple attribute for new audio upload, but not for score or track replacement', () => {
      // 1. New audio upload -> has multiple
      const audioHtml = renderToString(
        <MediaUploadSheet
          pieceId="p1"
          kind="audio"
          config={dummyConfig}
          onClose={vi.fn()}
        />
      );
      expect(audioHtml).toMatch(/<input[^>]*type="file"[^>]*multiple/);

      // 2. Score upload -> NO multiple attribute
      const scoreHtml = renderToString(
        <MediaUploadSheet
          pieceId="p1"
          kind="score"
          config={dummyConfig}
          onClose={vi.fn()}
        />
      );
      expect(scoreHtml).not.toMatch(/<input[^>]*type="file"[^>]*multiple/);

      // 3. Audio replacement -> NO multiple attribute
      const replaceHtml = renderToString(
        <MediaUploadSheet
          pieceId="p1"
          kind="audio"
          replaceTrackId="trk_1"
          config={dummyConfig}
          onClose={vi.fn()}
        />
      );
      expect(replaceHtml).not.toMatch(/<input[^>]*type="file"[^>]*multiple/);
    });

    it('L2: prepares batch and enqueues multiple items in selection order with filename as title', async () => {
      const enqueueSpy = vi.spyOn(uploadQueue, 'enqueue').mockReturnValue('job_test');
      const files = [
        new File(['1'], 'soprano_lead.m4a', { type: 'audio/mp4' }),
        new File(['2'], 'alto_harmony.m4a', { type: 'audio/mp4' }),
        new File(['3'], 'bass_track.m4a', { type: 'audio/mp4' }),
      ];

      const { prepareUploadBatch } = await import('../../../services/media/uploadBatch');
      const batch = prepareUploadBatch(files, { kind: 'audio', allowCompress: true });

      expect(batch.accepted).toHaveLength(3);
      expect(batch.accepted.map((b) => b.title)).toEqual(['soprano_lead', 'alto_harmony', 'bass_track']);

      for (const item of batch.accepted) {
        uploadQueue.enqueue({
          pieceId: 'p1',
          kind: 'audio',
          title: item.title,
          fileName: item.file.name,
          file: item.file,
          baseUrl: dummyConfig.mediaPublicBaseUrl || '',
          saveFn: vi.fn(),
        });
      }

      expect(enqueueSpy).toHaveBeenCalledTimes(3);
      expect(enqueueSpy.mock.calls[0][0].title).toBe('soprano_lead');
      expect(enqueueSpy.mock.calls[1][0].title).toBe('alto_harmony');
      expect(enqueueSpy.mock.calls[2][0].title).toBe('bass_track');
    });
  });
});
