import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { MiniPlayer } from './MiniPlayer';
import { AudioPlayerContext, AudioPositionContext, type AudioPlayerContextValue } from './audioPlayerContext';
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
    return true;
  }

  setAttribute() {}
  removeAttribute() {}
  focus() {}
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 400, height: 600, right: 400, bottom: 600, x: 0, y: 0, toJSON: () => ({}) };
  }
}

class MockHTMLIFrameElement extends MockElement {}

function findNodeByAriaLabel(root: MockElement, label: string): MockElement | null {
  if (!root) return null;
  const reactPropsKey = Object.keys(root).find((k) => k.startsWith('__reactProps'));
  if (reactPropsKey && (root as unknown as Record<string, Record<string, unknown>>)[reactPropsKey]?.['aria-label'] === label) {
    return root;
  }
  if (Array.isArray(root.childNodes)) {
    for (const child of root.childNodes) {
      const found = findNodeByAriaLabel(child, label);
      if (found) return found;
    }
  }
  return null;
}

function clickMockNode(node: MockElement): boolean {
  const reactPropsKey = Object.keys(node).find((k) => k.startsWith('__reactProps'));
  if (reactPropsKey) {
    const rootNodeProps = (node as unknown as Record<string, Record<string, unknown>>)[reactPropsKey];
    if (typeof rootNodeProps?.onClick === 'function') {
      let propagationStopped = false;
      const fakeEvent = {
        preventDefault: () => {},
        stopPropagation: () => {
          propagationStopped = true;
        },
      };
      (rootNodeProps.onClick as (e: unknown) => void)(fakeEvent);
      return propagationStopped;
    }
  }
  return false;
}

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
    queueSource: null,
    isBlocked: false,
    playbackSpeed: 1.0,
    repeatMode: 'off',
    playTrack: vi.fn(),
    playQueue: vi.fn(),
    playQueueIndex: vi.fn(),
    togglePlay: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    seekTo: vi.fn(),
    seekRelative: vi.fn(),
    setSpeed: vi.fn(),
    cycleSpeed: vi.fn(),
    cycleRepeat: vi.fn(),
    previousTrack: vi.fn(),
    nextTrack: vi.fn(),
    closePlayer: vi.fn(),
    audioElementRef: { current: null },
    ...overrides,
  });

  it('renders track label, piece title, and enabled next button when not the last track', () => {
    const ctx = createMockContext({
      currentTrack: sampleTrack1,
      queue: [sampleTrack1, sampleTrack2],
      currentIndex: 0,
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
    expect(html).toContain('aria-label="다음 트랙"');
    expect(html).not.toContain('disabled=""');
  });

  it('disables "다음" button when current track is the last track in the queue', () => {
    const ctx = createMockContext({
      currentTrack: sampleTrack2,
      queue: [sampleTrack1, sampleTrack2],
      currentIndex: 1,
    });

    const html = renderToString(
      <AudioPlayerContext.Provider value={ctx}>
        <AudioPositionContext.Provider value={{ currentTime: 50, duration: 120 }}>
          <MiniPlayer />
        </AudioPositionContext.Provider>
      </AudioPlayerContext.Provider>
    );

    expect(html).toContain('알토 파트');
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

  it('renders close button with aria-label="플레이어 닫기" (J9)', () => {
    const closePlayerMock = vi.fn();
    const onOpenFullPlayerMock = vi.fn();
    const ctx = createMockContext({
      currentTrack: sampleTrack1,
      closePlayer: closePlayerMock,
    });

    const html = renderToString(
      <AudioPlayerContext.Provider value={ctx}>
        <AudioPositionContext.Provider value={{ currentTime: 10, duration: 60 }}>
          <MiniPlayer onOpenFullPlayer={onOpenFullPlayerMock} />
        </AudioPositionContext.Provider>
      </AudioPlayerContext.Provider>
    );

    expect(html).toContain('aria-label="플레이어 닫기"');
  });

  it('calls closePlayer 1 time and onOpenFullPlayer 0 times when × button is clicked (J9)', async () => {
    const closePlayerMock = vi.fn();
    const onOpenFullPlayerMock = vi.fn();
    const ctx = createMockContext({
      currentTrack: sampleTrack1,
      closePlayer: closePlayerMock,
    });

    const mockWin: Record<string, unknown> = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      HTMLIFrameElement: MockHTMLIFrameElement,
      HTMLElement: MockElement,
      Element: MockElement,
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
    mockDoc.body = new MockElement('BODY', mockDoc);
    mockDoc.createElement = (tag: string) => new MockElement(tag.toUpperCase(), mockDoc);
    mockDoc.createElementNS = (_: unknown, tag: string) => new MockElement(tag.toUpperCase(), mockDoc);
    mockDoc.createTextNode = (text: string) => ({ nodeType: 3, nodeValue: text, ownerDocument: mockDoc });
    mockDoc.createComment = () => ({ nodeType: 8, ownerDocument: mockDoc });
    mockWin.document = mockDoc;

    vi.stubGlobal('document', mockDoc);
    vi.stubGlobal('window', mockWin);

    const container = new MockElement('DIV', mockDoc);
    const root = createRoot(container as unknown as Element);

    await act(async () => {
      root.render(
        <AudioPlayerContext.Provider value={ctx}>
          <AudioPositionContext.Provider value={{ currentTime: 10, duration: 60 }}>
            <MiniPlayer onOpenFullPlayer={onOpenFullPlayerMock} />
          </AudioPositionContext.Provider>
        </AudioPlayerContext.Provider>
      );
    });

    const closeBtn = findNodeByAriaLabel(container, '플레이어 닫기');
    expect(closeBtn).not.toBeNull();

    if (closeBtn) {
      const stopped = clickMockNode(closeBtn);
      expect(stopped).toBe(true);
    }

    expect(closePlayerMock).toHaveBeenCalledTimes(1);
    expect(onOpenFullPlayerMock).toHaveBeenCalledTimes(0);

    await act(async () => {
      root.unmount();
    });

    vi.unstubAllGlobals();
  });
});
