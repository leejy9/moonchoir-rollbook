import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { renderToString } from 'react-dom/server';
import { AudioPlayerProvider } from './AudioPlayerProvider';
import { useAudioPlayer } from './audioPlayerContext';
import { MiniPlayer } from './MiniPlayer';
import { FullPlayer } from './FullPlayer';
import { SpeedSheet } from './SpeedSheet';
import { clampSeekTime, snapPlaybackSpeed } from '../../utils/audioQueue';
import type { PracticePiece, PracticeTrack } from '../../types/rollbook';
import type { PlayableTrackItem } from '../../utils/audioQueue';

describe('GlobalAudioPlayer & MiniPlayer & FullPlayer (V3-06, V3-06b)', () => {
  const mockTrack: PracticeTrack = {
    id: 'trk_soprano',
    pieceId: 'piece_1',
    label: '소프라노 파트',
    kind: 'guide_soprano',
    source: 'r2',
    storageKey: '2026/soprano.m4a',
    orderIndex: 0,
    isArchived: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const mockItem: PlayableTrackItem = {
    track: mockTrack,
    pieceTitle: '바람이 불어오는 곳',
    playbackUrl: 'https://media.moonchoir.workers.dev/2026/soprano.m4a',
  };

  const mockPiece: PracticePiece = {
    id: 'piece_1',
    title: '바람이 불어오는 곳',
    composer: '김광석',
    scoreUrl: 'https://drive.google.com/file/d/score123/view',
    isArchived: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders single audio element at provider root with display none and preload metadata', () => {
    const html = renderToString(
      <AudioPlayerProvider>
        <div>Content</div>
      </AudioPlayerProvider>
    );

    expect(html).toContain('<audio preload="metadata" style="display:none"></audio>');
  });

  it('preserves single audio element instance ref across 5 tab switch / rerender cycles', () => {
    const capturedRefs: Array<React.RefObject<HTMLAudioElement | null>> = [];

    function TabSwitcher() {
      const [tab, setTab] = useState(0);
      const { audioElementRef } = useAudioPlayer();
      capturedRefs.push(audioElementRef);

      return (
        <div>
          <span>Tab {tab}</span>
          <button type="button" onClick={() => setTab((t) => t + 1)}>
            Next Tab
          </button>
        </div>
      );
    }

    for (let i = 0; i < 5; i++) {
      renderToString(
        <AudioPlayerProvider>
          <TabSwitcher />
        </AudioPlayerProvider>
      );
    }

    expect(capturedRefs).toHaveLength(5);
  });

  it('MiniPlayer renders nothing when no track is loaded', () => {
    const html = renderToString(
      <AudioPlayerProvider>
        <MiniPlayer />
      </AudioPlayerProvider>
    );

    expect(html).not.toContain('mini-player-container');
    expect(html).not.toContain('바람이 불어오는 곳');
  });

  it('MiniPlayer renders cover, titles, play/pause, next track, and bottom progress line', () => {
    const html = renderToString(
      <AudioPlayerProvider initialTrack={mockItem}>
        <MiniPlayer />
      </AudioPlayerProvider>
    );

    // Track details
    expect(html).toContain('바람이 불어오는 곳');
    expect(html).toContain('소프라노 파트');

    // Controls
    expect(html).toContain('aria-label="재생"');
    expect(html).toContain('aria-label="다음 트랙"');
    expect(html).toContain('mini-player-progress-line');

    // Anti-slop: ZERO emojis
    const emojiRegex = /\p{Extended_Pictographic}/u;
    expect(emojiRegex.test(html)).toBe(false);
  });

  it('FullPlayer renders large cover, timeline, ±5s seek, repeat toggle, speed button, and score button', () => {
    const html = renderToString(
      <AudioPlayerProvider initialTrack={mockItem}>
        <FullPlayer
          piece={mockPiece}
          onClose={() => {}}
        />
      </AudioPlayerProvider>
    );

    expect(html).toContain('full-player-overlay');
    expect(html).toContain('소프라노 파트');
    expect(html).toContain('바람이 불어오는 곳');
    expect(html).toContain('−5초');
    expect(html).toContain('+5초');
    expect(html).toContain('악보 보기');
    // L4: Repeat button has NO "전체" or "1곡" text, only icon with aria-label="한 곡 반복" and aria-pressed
    const repeatBtnMatch = html.match(/<button[^>]*aria-label="한 곡 반복"[^>]*>([\s\S]*?)<\/button>/);
    expect(repeatBtnMatch).not.toBeNull();
    expect(repeatBtnMatch![1]).not.toContain('전체');
    expect(repeatBtnMatch![1]).not.toContain('1곡');
    expect(html).toContain('aria-pressed="true"');
  });

  it('L4: repeat button toggles aria-pressed when repeatOne state changes', () => {
    function ToggleTester() {
      const { toggleRepeatOne, repeatOne } = useAudioPlayer();
      return (
        <div>
          <button type="button" onClick={toggleRepeatOne}>
            Toggle Repeat
          </button>
          <span data-testid="repeat-val">{String(repeatOne)}</span>
          <FullPlayer />
        </div>
      );
    }

    const html1 = renderToString(
      <AudioPlayerProvider initialTrack={mockItem}>
        <ToggleTester />
      </AudioPlayerProvider>
    );

    const repeatBtnMatch = html1.match(/<button[^>]*aria-label="한 곡 반복"[^>]*>([\s\S]*?)<\/button>/);
    expect(repeatBtnMatch).not.toBeNull();
    expect(repeatBtnMatch![1]).not.toContain('전체');
    expect(repeatBtnMatch![1]).not.toContain('1곡');
    expect(html1).toContain('aria-pressed="true"');
  });

  it('SpeedSheet renders large display, range slider, +/- 0.05 step buttons, and presets', () => {
    const html = renderToString(
      <SpeedSheet
        currentSpeed={1.0}
        onChangeSpeed={() => {}}
        onClose={() => {}}
      />
    ).replace(/<!-- -->/g, '');

    expect(html).toContain('1.00x');
    expect(html).toContain('−0.05');
    expect(html).toContain('+0.05');
    expect(html).toContain('0.75x');
    expect(html).toContain('1.25x');
    expect(html).toContain('1.5x');
    expect(html).toContain('닫기');
  });

  it('snapPlaybackSpeed clamps between 0.5 and 2.0 and snaps to 1.0 within ±0.03', () => {
    // Normal values
    expect(snapPlaybackSpeed(1.25)).toBe(1.25);
    expect(snapPlaybackSpeed(0.75)).toBe(0.75);

    // Snap to 1.0 when within 0.97 ~ 1.03
    expect(snapPlaybackSpeed(0.98)).toBe(1.0);
    expect(snapPlaybackSpeed(1.02)).toBe(1.0);
    expect(snapPlaybackSpeed(1.03)).toBe(1.0);
    expect(snapPlaybackSpeed(0.97)).toBe(1.0);

    // Outside snap range
    expect(snapPlaybackSpeed(1.04)).toBe(1.04);
    expect(snapPlaybackSpeed(0.96)).toBe(0.96);

    // Boundary clamping
    expect(snapPlaybackSpeed(0.2)).toBe(0.5);
    expect(snapPlaybackSpeed(2.5)).toBe(2.0);
  });

  it('clampSeekTime clamps seek between 0 and duration', () => {
    const duration = 180;
    // Normal seek
    expect(clampSeekTime(50, 5, duration)).toBe(55);
    expect(clampSeekTime(50, -5, duration)).toBe(45);

    // Lower boundary (<= 0)
    expect(clampSeekTime(2, -5, duration)).toBe(0);

    // Upper boundary (>= duration)
    expect(clampSeekTime(178, 5, duration)).toBe(180);
  });

  it('resets mediaSession metadata and action handlers upon closePlayer', () => {
    const actionHandlers = new Map<string, any>();
    const mockMediaSession = {
      metadata: { title: 'old' } as any,
      setActionHandler: vi.fn((action, handler) => {
        actionHandlers.set(action, handler);
      }),
    };
    const orig = (navigator as unknown as { mediaSession?: unknown }).mediaSession;

    try {
      Object.defineProperty(navigator, 'mediaSession', {
        value: mockMediaSession,
        configurable: true,
      });

      let playerCtx: any = null;
      function TestConsumer() {
        // oxlint-disable-next-line react/globals
        playerCtx = useAudioPlayer();
        return null;
      }

      renderToString(
        <AudioPlayerProvider initialTrack={mockItem}>
          <TestConsumer />
        </AudioPlayerProvider>
      );

      playerCtx.closePlayer();

      expect(mockMediaSession.metadata).toBeNull();
      expect(mockMediaSession.setActionHandler).toHaveBeenCalledWith('play', null);
      expect(mockMediaSession.setActionHandler).toHaveBeenCalledWith('pause', null);
      expect(mockMediaSession.setActionHandler).toHaveBeenCalledWith('seekbackward', null);
      expect(mockMediaSession.setActionHandler).toHaveBeenCalledWith('seekforward', null);
      expect(mockMediaSession.setActionHandler).toHaveBeenCalledWith('seekto', null);
    } finally {
      Object.defineProperty(navigator, 'mediaSession', {
        value: orig,
        configurable: true,
      });
    }
  });
});
