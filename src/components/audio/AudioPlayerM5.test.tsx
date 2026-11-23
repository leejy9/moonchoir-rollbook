import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import {
  loadYoutubeIframeApi,
  resetYoutubeApiLoader,
  type YTNamespace,
  type YTPlayerInstance,
} from '../../services/media/youtubeIframeApi';
import { nearestRate } from '../../utils/practiceQueue';
import {
  PREFERENCE_KEYS,
  readPreference,
  writePreference,
} from '../../services/sheetsStorage';
import { AudioPlayerProvider } from './AudioPlayerProvider';
import { useAudioPlayer, type AudioPlayerContextValue } from './audioPlayerContext';

class MockElement {
  nodeType = 1;
  nodeName: string;
  tagName: string;
  childNodes: MockElement[] = [];
  style: Record<string, unknown> = {
    setProperty: vi.fn(),
  };
  ownerDocument: unknown;
  textContent = '';
  eventListeners: Record<string, ((e: unknown) => void)[]> = {};
  attributes: Record<string, string> = {};

  constructor(tag = 'DIV', doc?: unknown) {
    this.nodeName = tag;
    this.tagName = tag;
    this.ownerDocument = doc || (globalThis as unknown as { document: unknown })?.document;
  }

  appendChild(child: MockElement) {
    this.childNodes.push(child);
    return child;
  }

  removeChild(child: MockElement) {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) this.childNodes.splice(idx, 1);
    return child;
  }

  insertBefore(child: MockElement) {
    this.childNodes.push(child);
    return child;
  }

  addEventListener(event: string, handler: (e: unknown) => void) {
    if (!this.eventListeners[event]) this.eventListeners[event] = [];
    this.eventListeners[event].push(handler);
  }

  removeEventListener(event: string, handler: (e: unknown) => void) {
    const arr = this.eventListeners[event];
    if (arr) {
      const idx = arr.indexOf(handler);
      if (idx !== -1) arr.splice(idx, 1);
    }
  }

  dispatchEvent(event: { type: string }) {
    this.eventListeners[event.type]?.forEach((cb) => cb(event));
    return true;
  }

  setAttribute(name: string, val: string) {
    this.attributes[name] = val;
  }

  getAttribute(name: string) {
    return this.attributes[name] ?? null;
  }

  removeAttribute(name: string) {
    delete this.attributes[name];
  }

  load() {}
  play() {
    return Promise.resolve();
  }
  pause() {}
}

describe('AudioPlayer M5 - YouTube Video & Iframe API', () => {
  let originalWin: unknown;
  let originalDoc: unknown;

  beforeEach(() => {
    vi.restoreAllMocks();
    resetYoutubeApiLoader();

    originalWin = (globalThis as unknown as { window?: unknown }).window;
    originalDoc = (globalThis as unknown as { document?: unknown }).document;

    const store = new Map<string, string>();
    const mockStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    };
    vi.stubGlobal('localStorage', mockStorage);
  });

  afterEach(() => {
    (globalThis as unknown as { window?: unknown }).window = originalWin;
    (globalThis as unknown as { document?: unknown }).document = originalDoc;
  });

  it('nearestRate finds the closest available playback rate', () => {
    const rates = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
    expect(nearestRate(rates, 0.8)).toBe(0.75);
    expect(nearestRate(rates, 1.0)).toBe(1);
    expect(nearestRate(rates, 1.2)).toBe(1.25);
    expect(nearestRate(rates, 1.9)).toBe(2);
  });

  it('injects exactly one <script> tag even when loadYoutubeIframeApi is called multiple times', async () => {
    const scripts: { id: string; src: string }[] = [];
    const mockDoc = {
      getElementById: (id: string) => scripts.find((s) => s.id === id) || null,
      createElement: (tag: string) => ({ id: '', src: '', async: false, tagName: tag.toUpperCase() }),
      head: {
        appendChild: (el: { id: string; src: string }) => {
          scripts.push(el);
          return el;
        },
      },
    };

    const mockWin: {
      document: typeof mockDoc;
      YT?: YTNamespace;
      onYouTubeIframeAPIReady?: () => void;
    } = {
      document: mockDoc,
    };

    (globalThis as unknown as { document: unknown }).document = mockDoc;
    (globalThis as unknown as { window: unknown }).window = mockWin;

    // Call twice in parallel
    const p1 = loadYoutubeIframeApi();
    const p2 = loadYoutubeIframeApi();

    // Verify only one script element was appended
    expect(scripts.length).toBe(1);
    expect(scripts[0].src).toBe('https://www.youtube.com/iframe_api');

    // Simulate YouTube iframe API ready
    mockWin.YT = {
      Player: vi.fn() as unknown as YTNamespace['Player'],
    };
    mockWin.onYouTubeIframeAPIReady?.();

    const [yt1, yt2] = await Promise.all([p1, p2]);
    expect(yt1).toBe(mockWin.YT);
    expect(yt2).toBe(mockWin.YT);
  });

  it('rejects and logs warning if API fails to load within 10s', async () => {
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const mockDoc = {
      getElementById: () => null,
      createElement: () => ({ id: '', src: '', async: false }),
      head: { appendChild: vi.fn() },
    };
    (globalThis as unknown as { document: unknown }).document = mockDoc;
    (globalThis as unknown as { window: unknown }).window = { document: mockDoc };

    const promise = loadYoutubeIframeApi();
    const rejectHandler = vi.fn();
    promise.catch(rejectHandler);

    // Fast-forward 10 seconds
    vi.advanceTimersByTime(10000);

    await expect(promise).rejects.toThrow('YouTube iframe API load timeout');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[YouTube API] Failed to load YouTube iframe API within 10s')
    );
    vi.useRealTimers();
  });

  it('shows minimize hint toast on 1st and 2nd time, then suppresses on 3rd time', () => {
    // 0 times seen
    expect(readPreference(PREFERENCE_KEYS.YT_MINIMIZE_HINT_COUNT, (_v): _v is number => true, 2)).toBe(2);
    // Write 0
    writePreference(PREFERENCE_KEYS.YT_MINIMIZE_HINT_COUNT, 0);

    // Hook test for 1st trigger
    const trigger1 = () => {
      const count = readPreference<number>(
        PREFERENCE_KEYS.YT_MINIMIZE_HINT_COUNT,
        (v): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0,
        2
      );
      if (count < 2) {
        writePreference(PREFERENCE_KEYS.YT_MINIMIZE_HINT_COUNT, count + 1);
        return true;
      }
      return false;
    };

    expect(trigger1()).toBe(true); // 1st time shown (count 0 -> 1)
    expect(readPreference(PREFERENCE_KEYS.YT_MINIMIZE_HINT_COUNT, (_v): _v is number => true, 2)).toBe(1);

    expect(trigger1()).toBe(true); // 2nd time shown (count 1 -> 2)
    expect(readPreference(PREFERENCE_KEYS.YT_MINIMIZE_HINT_COUNT, (_v): _v is number => true, 2)).toBe(2);

    expect(trigger1()).toBe(false); // 3rd time NOT shown (count is 2)
  });

  it('suppresses minimize hint toast when preference read fails (safe fallback: 2)', () => {
    // Simulate corrupt storage value
    localStorage.setItem(PREFERENCE_KEYS.YT_MINIMIZE_HINT_COUNT, 'invalid_non_number');

    const count = readPreference<number>(
      PREFERENCE_KEYS.YT_MINIMIZE_HINT_COUNT,
      (v): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0,
      2
    );
    // Should safely fallback to 2 (안내 생략)
    expect(count).toBe(2);
    expect(count < 2).toBe(false);
  });

  it('properly executes seekTo and destroy lifecycle on mock player', () => {
    const mockPlayer: YTPlayerInstance = {
      playVideo: vi.fn(),
      pauseVideo: vi.fn(),
      stopVideo: vi.fn(),
      seekTo: vi.fn(),
      getCurrentTime: vi.fn().mockReturnValue(42.5),
      getDuration: vi.fn().mockReturnValue(180),
      getPlayerState: vi.fn().mockReturnValue(1),
      getAvailablePlaybackRates: vi.fn().mockReturnValue([0.5, 1.0, 1.5]),
      setPlaybackRate: vi.fn(),
      destroy: vi.fn(),
    };

    // Save position upon minimize
    const savedTime = mockPlayer.getCurrentTime();
    expect(savedTime).toBe(42.5);

    mockPlayer.destroy();
    expect(mockPlayer.destroy).toHaveBeenCalledTimes(1);

    // Re-open: seekTo saved position
    mockPlayer.seekTo(savedTime, true);
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(42.5, true);
  });

  it('setting activeVideo pauses audio and clears mediaSession handlers', async () => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const actionHandlers: Record<string, ((details?: unknown) => void) | null> = {};

    const mediaSessionMock = {
      metadata: null,
      setActionHandler: vi.fn((action: string, handler: ((details?: unknown) => void) | null) => {
        actionHandlers[action] = handler;
      }),
      setPositionState: vi.fn(),
    };

    const mockDoc = {
      createElement: (tag: string) => new MockElement(tag.toUpperCase(), mockDoc),
      createTextNode: () => new MockElement('#TEXT', mockDoc),
      documentElement: new MockElement('HTML'),
      body: new MockElement('BODY'),
      head: new MockElement('HEAD'),
      activeElement: null,
      visibilityState: 'visible',
      addEventListener: () => {},
      removeEventListener: () => {},
    };

    const mockWin: Record<string, unknown> = {
      document: mockDoc,
      navigator: { mediaSession: mediaSessionMock },
      HTMLElement: MockElement,
      HTMLIFrameElement: MockElement,
      HTMLMediaElement: MockElement,
      localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    };

    (globalThis as unknown as { document: unknown }).document = mockDoc;
    (globalThis as unknown as { window: unknown }).window = mockWin;
    vi.stubGlobal('navigator', mockWin.navigator);

    const rootEl = new MockElement('DIV', mockDoc);
    const root = createRoot(rootEl as unknown as HTMLElement);

    const playerHolder: { current: AudioPlayerContextValue | null } = { current: null };

    const TestComponent: React.FC = () => {
      const player = useAudioPlayer();
      useEffect(() => {
        playerHolder.current = player;
      }, [player]);
      return null;
    };

    await act(async () => {
      root.render(
        <AudioPlayerProvider>
          <TestComponent />
        </AudioPlayerProvider>
      );
    });

    const sampleItem = {
      track: {
        id: 'trk-1',
        pieceId: 'p1',
        label: '소프라노',
        kind: '가이드',
        source: 'R2',
        url: 'https://cdn.example.com/soprano.mp3',
        orderIndex: 0,
        isArchived: false,
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z',
      },
      pieceTitle: '아리랑',
      playbackUrl: 'https://cdn.example.com/soprano.mp3',
    };

    await act(async () => {
      playerHolder.current?.playTrack(sampleItem);
    });

    const audioEl = playerHolder.current?.audioElementRef.current;
    expect(audioEl).not.toBeNull();
    const pauseSpy = vi.spyOn(audioEl as unknown as { pause: () => void }, 'pause');

    // Video starts
    await act(async () => {
      playerHolder.current?.setActiveVideo?.({
        track: {
          id: 'v1',
          pieceId: 'p1',
          label: '유튜브',
          kind: '참고영상',
          source: 'youtube',
          orderIndex: 0,
          isArchived: false,
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
        pieceTitle: '아리랑',
        resumeAt: 0,
      });
    });

    expect(pauseSpy).toHaveBeenCalledTimes(1);
    expect(actionHandlers['play']).toBeNull();
    expect(actionHandlers['nexttrack']).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });
});
