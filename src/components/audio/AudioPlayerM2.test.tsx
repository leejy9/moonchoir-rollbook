import { act, useEffect } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { AudioPlayerProvider } from './AudioPlayerProvider';
import { useAudioPlayer, type AudioPlayerContextValue } from './audioPlayerContext';
import type { PlayableTrackItem } from '../../utils/audioQueue';

class MockElement {
  nodeType = 1;
  nodeName: string;
  tagName: string;
  childNodes: MockElement[] = [];
  style: Record<string, string> = {};
  ownerDocument: unknown;
  textContent = '';
  eventListeners: Record<string, ((e: unknown) => void)[]> = {};

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

  setAttribute() {}
  removeAttribute() {}
  load() {}
  play() {
    return Promise.resolve();
  }
  pause() {}
}

const sampleItem1: PlayableTrackItem = {
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

const sampleItem2: PlayableTrackItem = {
  track: {
    id: 'trk-2',
    pieceId: 'p1',
    label: '알토',
    kind: '가이드',
    source: 'R2',
    url: 'https://cdn.example.com/alto.mp3',
    orderIndex: 1,
    isArchived: false,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  },
  pieceTitle: '아리랑',
  playbackUrl: 'https://cdn.example.com/alto.mp3',
};

describe('AudioPlayerProvider M2 (V3-19)', () => {
  let actionHandlers: Record<string, ((details?: unknown) => void) | null> = {};
  let container: MockElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    actionHandlers = {};

    const mediaSessionMock = {
      metadata: null,
      setActionHandler: vi.fn((action: string, handler: ((details?: unknown) => void) | null) => {
        actionHandlers[action] = handler;
      }),
      setPositionState: vi.fn(),
    };

    const mockWin: Record<string, unknown> = {
      navigator: {
        mediaSession: mediaSessionMock,
      },
      HTMLElement: MockElement,
      Element: MockElement,
      HTMLIFrameElement: MockElement,
    };

    const mockDoc: Record<string, unknown> = {
      nodeType: 9,
      nodeName: '#document',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      activeElement: null,
      visibilityState: 'visible',
      defaultView: mockWin,
    };
    mockDoc.documentElement = new MockElement('HTML', mockDoc);
    (mockDoc.documentElement as unknown as { style: { setProperty: ReturnType<typeof vi.fn>; removeProperty: ReturnType<typeof vi.fn> } }).style = {
      setProperty: vi.fn(),
      removeProperty: vi.fn(),
    };
    mockDoc.body = new MockElement('BODY', mockDoc);
    mockDoc.createElement = (tag: string) => new MockElement(tag.toUpperCase(), mockDoc);
    mockDoc.createElementNS = (_: unknown, tag: string) => new MockElement(tag.toUpperCase(), mockDoc);
    mockDoc.createTextNode = (text: string) => ({ nodeType: 3, nodeValue: text, ownerDocument: mockDoc });
    mockDoc.createComment = () => ({ nodeType: 8, ownerDocument: mockDoc });
    mockWin.document = mockDoc;

    vi.stubGlobal('document', mockDoc);
    vi.stubGlobal('window', mockWin);
    vi.stubGlobal('navigator', mockWin.navigator);

    container = new MockElement('DIV', mockDoc);
    root = createRoot(container as unknown as HTMLElement);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
  });

  it('sets repeatMode to "one" when starting playback from piece source', async () => {
    const playerHolder: { current: AudioPlayerContextValue | null } = { current: null };

    function TestComponent() {
      const player = useAudioPlayer();
      useEffect(() => {
        playerHolder.current = player;
      }, [player]);
      return null;
    }

    await act(async () => {
      root.render(
        <AudioPlayerProvider>
          <TestComponent />
        </AudioPlayerProvider>
      );
    });

    await act(async () => {
      playerHolder.current?.playQueue(
        { kind: 'piece', id: 'p1', title: '아리랑' },
        [sampleItem1, sampleItem2],
        0,
        'one'
      );
    });

    expect(playerHolder.current?.queueSource).toEqual({ kind: 'piece', id: 'p1', title: '아리랑' });
    expect(playerHolder.current?.repeatMode).toBe('one');
    expect(playerHolder.current?.currentIndex).toBe(0);
    expect(playerHolder.current?.currentTrack?.track.id).toBe('trk-1');
  });

  it('sets repeatMode to "off" when starting playback from performance source', async () => {
    const playerHolder: { current: AudioPlayerContextValue | null } = { current: null };

    function TestComponent() {
      const player = useAudioPlayer();
      useEffect(() => {
        playerHolder.current = player;
      }, [player]);
      return null;
    }

    await act(async () => {
      root.render(
        <AudioPlayerProvider>
          <TestComponent />
        </AudioPlayerProvider>
      );
    });

    await act(async () => {
      playerHolder.current?.playQueue(
        { kind: 'performance', id: 'perf-1', title: '정기연주회' },
        [sampleItem1, sampleItem2],
        0,
        'off'
      );
    });

    expect(playerHolder.current?.queueSource).toEqual({ kind: 'performance', id: 'perf-1', title: '정기연주회' });
    expect(playerHolder.current?.repeatMode).toBe('off');
    expect(playerHolder.current?.currentIndex).toBe(0);
  });

  it('handles track ended event for 3 repeat modes', async () => {
    const playerHolder: { current: AudioPlayerContextValue | null } = { current: null };

    function TestComponent() {
      const player = useAudioPlayer();
      useEffect(() => {
        playerHolder.current = player;
      }, [player]);
      return null;
    }

    await act(async () => {
      root.render(
        <AudioPlayerProvider>
          <TestComponent />
        </AudioPlayerProvider>
      );
    });

    const audioElement = playerHolder.current?.audioElementRef?.current as unknown as MockElement;
    expect(audioElement).toBeDefined();

    // 1. Mode 'one': loops same track
    await act(async () => {
      playerHolder.current?.playQueue(
        { kind: 'piece', id: 'p1', title: '아리랑' },
        [sampleItem1, sampleItem2],
        0,
        'one'
      );
    });
    expect(playerHolder.current?.currentIndex).toBe(0);

    await act(async () => {
      audioElement.dispatchEvent({ type: 'ended' });
    });
    expect(playerHolder.current?.currentIndex).toBe(0);

    // 2. Mode 'all': advances and wraps to 0
    await act(async () => {
      playerHolder.current?.playQueue(
        { kind: 'performance', id: 'perf-1', title: '정기연주회' },
        [sampleItem1, sampleItem2],
        1, // last item
        'all'
      );
    });
    expect(playerHolder.current?.currentIndex).toBe(1);

    await act(async () => {
      audioElement.dispatchEvent({ type: 'ended' });
    });
    expect(playerHolder.current?.currentIndex).toBe(0); // wraps around to 0

    // 3. Mode 'off': advances to next, and stops at end
    await act(async () => {
      playerHolder.current?.playQueue(
        { kind: 'performance', id: 'perf-1', title: '정기연주회' },
        [sampleItem1, sampleItem2],
        0,
        'off'
      );
    });
    expect(playerHolder.current?.currentIndex).toBe(0);

    await act(async () => {
      audioElement.dispatchEvent({ type: 'ended' });
    });
    expect(playerHolder.current?.currentIndex).toBe(1);

    await act(async () => {
      audioElement.dispatchEvent({ type: 'ended' });
    });
    // Stops at queue end
    expect(playerHolder.current?.isPlaying).toBe(false);
  });

  it('Media Session: nexttrack is null when queue length is 1, and registered when queue length >= 2', async () => {
    const playerHolder: { current: AudioPlayerContextValue | null } = { current: null };

    function TestComponent() {
      const player = useAudioPlayer();
      useEffect(() => {
        playerHolder.current = player;
      }, [player]);
      return null;
    }

    await act(async () => {
      root.render(
        <AudioPlayerProvider>
          <TestComponent />
        </AudioPlayerProvider>
      );
    });

    // Single item queue
    await act(async () => {
      playerHolder.current?.playQueue(
        { kind: 'piece', id: 'p1', title: '아리랑' },
        [sampleItem1],
        0,
        'one'
      );
    });

    expect(actionHandlers['nexttrack']).toBeNull();
    expect(actionHandlers['previoustrack']).toBeNull();

    // Two items queue
    await act(async () => {
      playerHolder.current?.playQueue(
        { kind: 'piece', id: 'p1', title: '아리랑' },
        [sampleItem1, sampleItem2],
        0,
        'one'
      );
    });

    expect(typeof actionHandlers['nexttrack']).toBe('function');
    expect(typeof actionHandlers['previoustrack']).toBe('function');
  });
});
