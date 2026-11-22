import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ScoreViewer } from './ScoreViewer';
import { sheetsService } from '../../services/sheets';
import { AudioPlayerContext } from '../audio/audioPlayerContext';
import type { PracticePiece } from '../../types/rollbook';
import type { PlayableTrackItem } from '../../utils/audioQueue';

describe('ScoreViewer Component (V3-16)', () => {
  const originalOpen = typeof window !== 'undefined' ? window.open : undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof window !== 'undefined') {
      window.open = vi.fn();
    }
  });

  afterEach(() => {
    if (typeof window !== 'undefined' && originalOpen) {
      window.open = originalOpen;
    }
  });

  const samplePieceWithStorage: PracticePiece = {
    id: 'piece_storage_1',
    title: '테스트 합창곡',
    composer: '작곡가',
    arranger: '편곡자',
    scoreUrl: 'https://external-drive.com/score.pdf',
    scoreStorageKey: 'scores/piece_storage_1.pdf',
    isArchived: false,
    createdAt: '2026-11-20T00:00:00Z',
    updatedAt: '2026-11-20T00:00:00Z',
  };

  const samplePieceExternalOnly: PracticePiece = {
    id: 'piece_external_only',
    title: '외부 구글 드라이브 곡',
    composer: '작곡가',
    arranger: '편곡자',
    scoreUrl: 'https://drive.google.com/file/d/123/view',
    isArchived: false,
    createdAt: '2026-11-20T00:00:00Z',
    updatedAt: '2026-11-20T00:00:00Z',
  };

  it('renders score viewer overlay with title, close button, and zoom buttons when scoreStorageKey exists', () => {
    vi.spyOn(sheetsService, 'getPracticeCatalog').mockReturnValue({
      pieces: [samplePieceWithStorage],
      tracks: [],
      programPieces: [],
      performances: [],
      performancePieces: [],
    });
    vi.spyOn(sheetsService, 'getConfig').mockReturnValue({
      mediaPublicBaseUrl: 'https://media.test.workers.dev',
    } as any);

    const html = renderToString(
      <ScoreViewer pieceId={samplePieceWithStorage.id} onClose={vi.fn()} />
    );

    expect(html).toContain('score-viewer-overlay');
    expect(html).toContain('테스트 합창곡');
    expect(html).toContain('aria-label="닫기"');
    expect(html).toContain('aria-label="축소"');
    expect(html).toContain('aria-label="확대"');
    expect(html).toContain('악보를 불러오는 중...');
  });

  it('shows failure state "악보를 열 수 없어요" and "새 탭에서 열기" button when only external scoreUrl exists', () => {
    vi.spyOn(sheetsService, 'getPracticeCatalog').mockReturnValue({
      pieces: [samplePieceExternalOnly],
      tracks: [],
      programPieces: [],
      performances: [],
      performancePieces: [],
    });
    vi.spyOn(sheetsService, 'getConfig').mockReturnValue({
      mediaPublicBaseUrl: 'https://media.test.workers.dev',
    } as any);

    const html = renderToString(
      <ScoreViewer pieceId={samplePieceExternalOnly.id} onClose={vi.fn()} />
    );

    expect(html).toContain('악보를 열 수 없어요');
    expect(html).toContain('새 탭에서 열기');
  });

  it('shows failure state when piece is not found in catalog', () => {
    vi.spyOn(sheetsService, 'getPracticeCatalog').mockReturnValue({
      pieces: [],
      tracks: [],
      programPieces: [],
      performances: [],
      performancePieces: [],
    });
    vi.spyOn(sheetsService, 'getConfig').mockReturnValue({
      mediaPublicBaseUrl: 'https://media.test.workers.dev',
    } as any);

    const html = renderToString(
      <ScoreViewer pieceId="non_existent" onClose={vi.fn()} />
    );

    expect(html).toContain('악보를 열 수 없어요');
  });

  it('renders mini player spacer only when currentTrack is active in player context', () => {
    vi.spyOn(sheetsService, 'getPracticeCatalog').mockReturnValue({
      pieces: [samplePieceWithStorage],
      tracks: [],
      programPieces: [],
      performances: [],
      performancePieces: [],
    });
    vi.spyOn(sheetsService, 'getConfig').mockReturnValue({
      mediaPublicBaseUrl: 'https://media.test.workers.dev',
    } as any);

    const mockTrackItem: PlayableTrackItem = {
      track: {
        id: 'track_1',
        pieceId: samplePieceWithStorage.id,
        kind: '가이드',
        label: '소프라노',
        source: 'r2',
        orderIndex: 0,
        storageKey: 'audio/track_1.m4a',
        url: '',
        durationSeconds: 120,
        sizeBytes: 1024,
        isArchived: false,
        createdAt: '2026-11-20T00:00:00Z',
        updatedAt: '2026-11-20T00:00:00Z',
      },
      pieceTitle: samplePieceWithStorage.title,
      playbackUrl: 'https://media.test.workers.dev/audio/track_1.m4a',
    };

    const mockCtx = (track: PlayableTrackItem | null): any => ({
      currentTrack: track,
      queue: track ? [track] : [],
      currentIndex: track ? 0 : -1,
      isPlaying: Boolean(track),
      isBlocked: false,
      playbackSpeed: 1.0,
      repeatOne: false,
      autoNext: false,
      playTrack: vi.fn(),
      togglePlay: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      seekTo: vi.fn(),
      seekRelative: vi.fn(),
      setSpeed: vi.fn(),
      cycleSpeed: vi.fn(),
      toggleRepeatOne: vi.fn(),
      toggleAutoNext: vi.fn(),
      nextTrack: vi.fn(),
      closePlayer: vi.fn(),
      audioElementRef: { current: null },
    });

    // 1) When currentTrack is null: no spacer
    const noTrackHtml = renderToString(
      <AudioPlayerContext.Provider value={mockCtx(null)}>
        <ScoreViewer pieceId={samplePieceWithStorage.id} onClose={vi.fn()} />
      </AudioPlayerContext.Provider>
    );

    expect(noTrackHtml).not.toContain('score-viewer-mini-spacer');

    // 2) When currentTrack is present: spacer is rendered
    const hasTrackHtml = renderToString(
      <AudioPlayerContext.Provider value={mockCtx(mockTrackItem)}>
        <ScoreViewer pieceId={samplePieceWithStorage.id} onClose={vi.fn()} />
      </AudioPlayerContext.Provider>
    );

    expect(hasTrackHtml).toContain('score-viewer-mini-spacer');
  });

  it('contains zero emojis in UI strings (R16 pure Korean discipline)', () => {
    vi.spyOn(sheetsService, 'getPracticeCatalog').mockReturnValue({
      pieces: [samplePieceWithStorage],
      tracks: [],
      programPieces: [],
      performances: [],
      performancePieces: [],
    });
    vi.spyOn(sheetsService, 'getConfig').mockReturnValue({
      mediaPublicBaseUrl: 'https://media.test.workers.dev',
    } as any);

    const html = renderToString(
      <ScoreViewer pieceId={samplePieceWithStorage.id} onClose={vi.fn()} />
    );

    const emojiRegex = /\p{Extended_Pictographic}/u;
    expect(emojiRegex.test(html)).toBe(false);
  });
});
