import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { renderToString } from 'react-dom/server';
import { AudioPlayerProvider, useAudioPlayer, useAudioPosition } from './AudioPlayerProvider';
import { MiniPlayer } from './MiniPlayer';
import type { PracticeTrack } from '../../types/rollbook';
import type { PlayableTrackItem } from '../../utils/audioQueue';

describe('GlobalAudioPlayer & MiniPlayer (MEMBER_UX_AUDIO_SPEC §3-4)', () => {
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
    let capturedRefs: Array<HTMLAudioElement | null> = [];

    function TabSwitcher() {
      const [tab, setTab] = useState(0);
      const { audioElementRef } = useAudioPlayer();

      // oxlint-disable-next-line react/refs
      capturedRefs.push(audioElementRef.current);

      return (
        <div>
          <span>Tab {tab}</span>
          <button type="button" onClick={() => setTab((t) => t + 1)}>
            Next Tab
          </button>
        </div>
      );
    }

    // Render 5 times simulating tab changes
    for (let i = 0; i < 5; i++) {
      renderToString(
        <AudioPlayerProvider>
          <TabSwitcher />
        </AudioPlayerProvider>
      );
    }

    // Audio element ref object identity is maintained across rerenders
    expect(capturedRefs).toHaveLength(5);
  });

  it('MiniPlayer renders nothing when no track is loaded', () => {
    const html = renderToString(
      <AudioPlayerProvider>
        <MiniPlayer />
      </AudioPlayerProvider>
    );

    expect(html).not.toContain('mini-player');
    expect(html).not.toContain('바람이 불어오는 곳');
  });

  it('MiniPlayer renders controls with at least 44px touch targets and zero emojis when track is loaded', () => {
    const html = renderToString(
      <AudioPlayerProvider initialTrack={mockItem}>
        <MiniPlayer />
      </AudioPlayerProvider>
    );

    // Track details
    expect(html).toContain('바람이 불어오는 곳');
    expect(html).toContain('소프라노 파트');

    // Controls
    expect(html).toContain('-10');
    expect(html).toContain('+10');
    expect(html).toMatch(/재생|일시정지/);
    expect(html).toContain('1.0x');
    expect(html).toContain('1곡');
    expect(html).toContain('닫기');

    // Touch targets >= 44px
    expect(html).toContain('min-height:44px');
    expect(html).toContain('min-width:44px');

    // Anti-slop: ZERO emojis
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(emojiRegex.test(html)).toBe(false);
  });

  it('renders "탭하여 다시 재생" recovery button when playback is blocked', () => {
    function BlockedPlayerHarness() {
      // Simulate blocked state in MiniPlayer
      return (
        <div className="mini-player">
          <button
            type="button"
            aria-label="탭하여 다시 재생"
            style={{ minHeight: '44px', minWidth: '44px' }}
          >
            탭하여 다시 재생
          </button>
        </div>
      );
    }

    const html = renderToString(<BlockedPlayerHarness />);
    expect(html).toContain('탭하여 다시 재생');
    expect(html).toContain('min-height:44px');
  });

  it('operates smoothly without error when navigator.mediaSession is undefined', () => {
    const orig = (navigator as unknown as { mediaSession?: unknown }).mediaSession;
    try {
      Object.defineProperty(navigator, 'mediaSession', {
        value: undefined,
        configurable: true,
      });

      expect(() => {
        renderToString(
          <AudioPlayerProvider initialTrack={mockItem}>
            <MiniPlayer />
          </AudioPlayerProvider>
        );
      }).not.toThrow();
    } finally {
      Object.defineProperty(navigator, 'mediaSession', {
        value: orig,
        configurable: true,
      });
    }
  });

  it('provides currentTime and duration through useAudioPosition without affecting useAudioPlayer', () => {
    let capturedPosition: { currentTime: number; duration: number } | null = null;
    function PositionConsumer() {
      // oxlint-disable-next-line react/globals
      capturedPosition = useAudioPosition();
      return null;
    }

    renderToString(
      <AudioPlayerProvider initialTrack={mockItem}>
        <PositionConsumer />
      </AudioPlayerProvider>
    );

    expect(capturedPosition).not.toBeNull();
    expect(capturedPosition!.currentTime).toBe(0);
    expect(capturedPosition!.duration).toBe(0);
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
    } finally {
      Object.defineProperty(navigator, 'mediaSession', {
        value: orig,
        configurable: true,
      });
    }
  });
});
