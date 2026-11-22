import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MiniPlayer } from './MiniPlayer';
import { AudioPlayerContext, AudioPositionContext, type AudioPlayerContextValue } from './audioPlayerContext';
import type { PlayableTrackItem } from '../../utils/audioQueue';

describe('MiniPlayer Component (V3-16, §3-3)', () => {
  const sampleTrack1: PlayableTrackItem = {
    track: {
      id: 'trk_1',
      pieceId: 'p_1',
      label: '소프라노 파트',
      kind: '파트음원',
      source: 'r2',
      orderIndex: 0,
      storageKey: 'audio/trk_1.m4a',
      url: '',
      isArchived: false,
      createdAt: '2026-11-20T00:00:00Z',
      updatedAt: '2026-11-20T00:00:00Z',
    },
    pieceTitle: '아름다운 나라',
    playbackUrl: 'https://media.moonchoir.org/audio/trk_1.m4a',
  };

  const sampleTrack2: PlayableTrackItem = {
    track: {
      id: 'trk_2',
      pieceId: 'p_1',
      label: '알토 파트',
      kind: '파트음원',
      source: 'r2',
      orderIndex: 1,
      storageKey: 'audio/trk_2.m4a',
      url: '',
      isArchived: false,
      createdAt: '2026-11-20T00:00:00Z',
      updatedAt: '2026-11-20T00:00:00Z',
    },
    pieceTitle: '아름다운 나라',
    playbackUrl: 'https://media.moonchoir.org/audio/trk_2.m4a',
  };

  const createMockContext = (overrides: Partial<AudioPlayerContextValue>): AudioPlayerContextValue => ({
    currentTrack: sampleTrack1,
    queue: [sampleTrack1, sampleTrack2],
    currentIndex: 0,
    isPlaying: true,
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
    ...overrides,
  });

  it('renders track label, piece title, and enabled next button when not the last track', () => {
    const ctx = createMockContext({
      currentTrack: sampleTrack1,
      queue: [sampleTrack1, sampleTrack2],
      currentIndex: 0, // First of two tracks
    });

    const html = renderToString(
      <AudioPlayerContext.Provider value={ctx}>
        <AudioPositionContext.Provider value={{ currentTime: 15, duration: 120 }}>
          <MiniPlayer />
        </AudioPositionContext.Provider>
      </AudioPlayerContext.Provider>
    );

    expect(html).toContain('소프라노 파트');
    expect(html).toContain('아름다운 나라');
    // Button has aria-label="다음 트랙" and is NOT disabled
    expect(html).toContain('aria-label="다음 트랙"');
    expect(html).not.toContain('disabled=""');
  });

  it('disables "다음" button when current track is the last track in the queue', () => {
    const ctx = createMockContext({
      currentTrack: sampleTrack2,
      queue: [sampleTrack1, sampleTrack2],
      currentIndex: 1, // Last track of two
    });

    const html = renderToString(
      <AudioPlayerContext.Provider value={ctx}>
        <AudioPositionContext.Provider value={{ currentTime: 50, duration: 120 }}>
          <MiniPlayer />
        </AudioPositionContext.Provider>
      </AudioPlayerContext.Provider>
    );

    expect(html).toContain('알토 파트');
    // Button has disabled attribute and aria-label
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-label="다음 트랙"');
  });

  it('renders nothing when currentTrack is null', () => {
    const ctx = createMockContext({
      currentTrack: null,
      queue: [],
      currentIndex: -1,
    });

    const html = renderToString(
      <AudioPlayerContext.Provider value={ctx}>
        <AudioPositionContext.Provider value={{ currentTime: 0, duration: 0 }}>
          <MiniPlayer />
        </AudioPositionContext.Provider>
      </AudioPlayerContext.Provider>
    );

    expect(html).toBe('');
  });

  it('contains zero emojis in UI strings (R16 pure Korean)', () => {
    const ctx = createMockContext({
      currentTrack: sampleTrack1,
      queue: [sampleTrack1],
      currentIndex: 0,
    });

    const html = renderToString(
      <AudioPlayerContext.Provider value={ctx}>
        <AudioPositionContext.Provider value={{ currentTime: 10, duration: 60 }}>
          <MiniPlayer />
        </AudioPositionContext.Provider>
      </AudioPlayerContext.Provider>
    );

    const emojiRegex = /\p{Extended_Pictographic}/u;
    expect(emojiRegex.test(html)).toBe(false);
  });
});
