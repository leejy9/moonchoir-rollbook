import { act, useEffect } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { StudioTab } from './StudioTab';
import { sheetsService } from '../services/sheets';
import { AudioPlayerProvider } from './audio/AudioPlayerProvider';
import { useAudioPlayer } from './audio/audioPlayerContext';
import { PREFERENCE_KEYS, writePreference } from '../services/sheetsStorage';
import type { AppConfig, PracticeCatalog, ProgramCard, Schedule } from '../types/rollbook';
import type { AudioPlayerContextValue } from './audio/audioPlayerContext';

class MockElement {
  nodeType = 1;
  nodeName: string;
  tagName: string;
  childNodes: MockElement[] = [];
  style: Record<string, unknown> & { setProperty: (k: string, v: string) => void } = {
    setProperty: (k: string, v: string) => {
      this.style[k] = v;
    },
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
    const reactPropsKey = Object.keys(this).find((k) => k.startsWith('__reactProps'));
    if (reactPropsKey) {
      const handlerName = 'on' + event.type.charAt(0).toUpperCase() + event.type.slice(1);
      const props = (this as unknown as Record<string, Record<string, unknown>>)[reactPropsKey];
      if (typeof props?.[handlerName] === 'function') {
        (props[handlerName] as (e: unknown) => void)(event);
      }
    }
    return true;
  }

  setAttribute(name: string, val: string) {
    this.attributes[name] = val;
  }

  getAttribute(name: string): string | null {
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

function findElementByAriaLabel(root: MockElement, label: string): MockElement | null {
  if (root.getAttribute('aria-label') === label) return root;
  for (const child of root.childNodes) {
    const found = findElementByAriaLabel(child, label);
    if (found) return found;
  }
  return null;
}

describe('StudioTab M4 - Play All Click Integration', () => {
  const mockConfig: AppConfig = {
    choirName: '문콰이어',
    rehearsalDay: '일요일',
    startTime: '18:00',
    defaultLat: 37.5,
    defaultLon: 127.0,
    defaultRadius: 100,
    sheetsWebAppUrl: 'https://script.google.com/macros/s/test/exec',
    lateGraceMinutes: 10,
    adminPin: '1234',
    mediaPublicBaseUrl: 'https://media.moonchoir.workers.dev',
    practiceTrackKinds: ['파트음원', 'MR', '참고영상'],
    performanceCategories: ['연주'],
  };

  const mockProgramCards: ProgramCard[] = [];
  const mockSchedules: Schedule[] = [];

  const mockCatalog: PracticeCatalog = {
    pieces: [
      {
        id: 'p1',
        title: '첫 번째 곡',
        composer: '작곡가1',
        isArchived: false,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
      {
        id: 'p2',
        title: '두 번째 곡',
        composer: '작곡가2',
        isArchived: false,
        createdAt: '2026-01-02',
        updatedAt: '2026-01-02',
      },
      {
        id: 'p3_video_only',
        title: '영상만 있는 곡',
        composer: '작곡가3',
        isArchived: false,
        createdAt: '2026-01-03',
        updatedAt: '2026-01-03',
      },
    ],
    tracks: [
      {
        id: 't1_sop',
        pieceId: 'p1',
        label: '소프라노',
        kind: '가이드',
        source: 'r2',
        storageKey: 'audio/p1_sop.mp3',
        orderIndex: 0,
        isArchived: false,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
      {
        id: 't2_alto',
        pieceId: 'p2',
        label: '알토',
        kind: '가이드',
        source: 'r2',
        storageKey: 'audio/p2_alto.mp3',
        orderIndex: 0,
        isArchived: false,
        createdAt: '2026-01-02',
        updatedAt: '2026-01-02',
      },
      {
        id: 't3_yt',
        pieceId: 'p3_video_only',
        label: '유튜브',
        kind: '참고영상',
        source: 'youtube',
        url: 'https://youtube.com/watch?v=123',
        orderIndex: 0,
        isArchived: false,
        createdAt: '2026-01-03',
        updatedAt: '2026-01-03',
      },
    ],
    programPieces: [],
    performances: [
      {
        id: 'perf_x',
        title: '2026 가을 정기연주회',
        performanceDate: '2026-10-31',
        venue: '콘서트홀',
        isArchived: false,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ],
    performancePieces: [
      { performanceId: 'perf_x', pieceId: 'p2', orderIndex: 0, isArchived: false },
      { performanceId: 'perf_x', pieceId: 'p3_video_only', orderIndex: 1, isArchived: false },
      { performanceId: 'perf_x', pieceId: 'p1', orderIndex: 2, isArchived: false },
    ],
  };

  let rootContainer: MockElement;
  let originalDoc: unknown;
  let originalWin: unknown;

  beforeEach(() => {
    vi.restoreAllMocks();
    const store = new Map<string, string>();
    const mockStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    };
    vi.stubGlobal('localStorage', mockStorage);

    originalDoc = (globalThis as unknown as { document: unknown }).document;
    originalWin = (globalThis as unknown as { window: unknown }).window;

    const mockDoc = {
      createElement: (tag: string) => new MockElement(tag.toUpperCase(), mockDoc),
      createElementNS: (_ns: string, tag: string) => new MockElement(tag.toUpperCase(), mockDoc),
      createTextNode: () => new MockElement('#TEXT', mockDoc),
      documentElement: new MockElement('HTML'),
      body: new MockElement('BODY'),
      head: new MockElement('HEAD'),
      activeElement: null,
      visibilityState: 'visible',
      addEventListener: () => {},
      removeEventListener: () => {},
    };

    const mockWin = {
      document: mockDoc,
      localStorage: mockStorage,
      addEventListener: () => {},
      removeEventListener: () => {},
      HTMLIFrameElement: MockElement,
      HTMLMediaElement: MockElement,
      navigator: { mediaSession: null },
    };

    (globalThis as unknown as { document: unknown }).document = mockDoc;
    (globalThis as unknown as { window: unknown }).window = mockWin;
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    rootContainer = new MockElement('DIV', mockDoc);

    vi.spyOn(sheetsService, 'getConfig').mockReturnValue(mockConfig);
    vi.spyOn(sheetsService, 'getProgramCards').mockReturnValue(mockProgramCards);
    vi.spyOn(sheetsService, 'getSchedules').mockReturnValue(mockSchedules);
    vi.spyOn(sheetsService, 'getPracticeCatalog').mockReturnValue(mockCatalog);
    vi.spyOn(sheetsService, 'getBackendKind').mockReturnValue('supabase');
  });

  afterEach(() => {
    (globalThis as unknown as { document: unknown }).document = originalDoc;
    (globalThis as unknown as { window: unknown }).window = originalWin;
  });

  it('clicking "전체 재생" plays queue with representative tracks in performance order, repeatMode="off", and opens full player', async () => {
    writePreference(PREFERENCE_KEYS.STUDIO_SCOPE, 'perf_x');
    const onOpenFullPlayerSpy = vi.fn();

    const playerRef: { current: AudioPlayerContextValue | null } = { current: null };

    const PlayerConsumer: React.FC = () => {
      const player = useAudioPlayer();
      useEffect(() => {
        playerRef.current = player;
      }, [player]);
      return null;
    };

    const root = createRoot(rootContainer as unknown as HTMLElement);

    await act(async () => {
      root.render(
        <AudioPlayerProvider>
          <PlayerConsumer />
          <StudioTab onOpenFullPlayer={onOpenFullPlayerSpy} />
        </AudioPlayerProvider>
      );
    });

    const playAllBtn = findElementByAriaLabel(rootContainer, '전체 재생');
    expect(playAllBtn).not.toBeNull();

    await act(async () => {
      playAllBtn?.dispatchEvent({ type: 'click' });
    });

    expect(onOpenFullPlayerSpy).toHaveBeenCalledTimes(1);

    const player = playerRef.current;
    expect(player).not.toBeNull();
    // Source should be performance
    expect(player?.queueSource).toEqual({
      kind: 'performance',
      id: 'perf_x',
      title: '2026 가을 정기연주회',
    });
    // Repeat mode should be 'off' (Spec §3-3-1, 수용 기준 36)
    expect(player?.repeatMode).toBe('off');

    // Queue should have 2 items (p2 then p1; p3 is excluded because it's video only)
    expect(player?.queue.length).toBe(2);
    expect(player?.queue[0].track.id).toBe('t2_alto');
    expect(player?.queue[0].pieceTitle).toBe('두 번째 곡');
    expect(player?.queue[1].track.id).toBe('t1_sop');
    expect(player?.queue[1].pieceTitle).toBe('첫 번째 곡');

    // Currently playing track index should be 0 (first piece)
    expect(player?.currentIndex).toBe(0);
    expect(player?.currentTrack?.track.id).toBe('t2_alto');

    await act(async () => {
      root.unmount();
    });
  });
});
