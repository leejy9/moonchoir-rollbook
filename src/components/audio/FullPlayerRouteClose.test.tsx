import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { FullPlayer } from './FullPlayer';
import { AudioPlayerContext, type AudioPlayerContextValue, type ActiveVideoState } from './audioPlayerContext';

class MockElement {
  nodeType = 1;
  nodeName: string;
  tagName: string;
  childNodes: MockElement[] = [];
  style: Record<string, unknown> = { setProperty: vi.fn() };
  ownerDocument: unknown;
  textContent = '';
  eventListeners: Record<string, ((e: unknown) => void)[]> = {};
  attributes: Record<string, string> = {};

  constructor(tag = 'DIV', doc?: unknown) {
    this.nodeName = tag;
    this.tagName = tag;
    this.ownerDocument = doc || (globalThis as unknown as { document: unknown })?.document;
  }

  appendChild(child: MockElement) { this.childNodes.push(child); return child; }
  removeChild(child: MockElement) { const idx = this.childNodes.indexOf(child); if (idx !== -1) this.childNodes.splice(idx, 1); return child; }
  insertBefore(child: MockElement) { this.childNodes.push(child); return child; }
  addEventListener(event: string, handler: (e: unknown) => void) {
    if (!this.eventListeners[event]) this.eventListeners[event] = [];
    this.eventListeners[event].push(handler);
  }
  removeEventListener(event: string, handler: (e: unknown) => void) {
    const arr = this.eventListeners[event];
    if (arr) { const idx = arr.indexOf(handler); if (idx !== -1) arr.splice(idx, 1); }
  }
  dispatchEvent(event: { type: string }) { this.eventListeners[event.type]?.forEach((cb) => cb(event)); return true; }
  setAttribute(name: string, val: string) { this.attributes[name] = val; }
  getAttribute(name: string) { return this.attributes[name] ?? null; }
  removeAttribute(name: string) { delete this.attributes[name]; }
  getBoundingClientRect() { return { top: 0, bottom: 844, left: 0, right: 390, width: 390, height: 844 }; }
}

describe('FullPlayer route close (V3-20 R8)', () => {
  let originalWin: unknown;
  let originalDoc: unknown;

  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    originalWin = (globalThis as unknown as { window?: unknown }).window;
    originalDoc = (globalThis as unknown as { document?: unknown }).document;

    const mockDoc: Record<string, unknown> = {
      createElement: (tag: string) => new MockElement(tag.toUpperCase(), mockDoc),
      createElementNS: (_ns: string, tag: string) => new MockElement(tag.toUpperCase(), mockDoc),
      createTextNode: () => new MockElement('#TEXT', mockDoc),
      getElementById: () => null,
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
      HTMLElement: MockElement,
      HTMLIFrameElement: MockElement,
      HTMLMediaElement: MockElement,
      Element: MockElement,
      Node: MockElement,
      addEventListener: () => {},
      removeEventListener: () => {},
      location: { origin: 'http://localhost' },
    };
    mockDoc.defaultView = mockWin;

    (globalThis as unknown as { document: unknown }).document = mockDoc;
    (globalThis as unknown as { window: unknown }).window = mockWin;
  });

  afterEach(() => {
    (globalThis as unknown as { window?: unknown }).window = originalWin;
    (globalThis as unknown as { document?: unknown }).document = originalDoc;
  });

  it('triggers minimize hint on unmount (route close) when activeVideo is present', async () => {
    const triggerMinimizeHint = vi.fn();
    const setActiveVideo = vi.fn();

    const videoState: ActiveVideoState = {
      track: {
        id: 't-yt',
        pieceId: 'p1',
        label: '영상',
        kind: '참고영상',
        source: 'youtube',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        orderIndex: 0,
        isArchived: false,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
      pieceTitle: '아리랑',
      resumeAt: 10,
    };

    const mockContext: Partial<AudioPlayerContextValue> = {
      activeVideo: videoState,
      setActiveVideo,
      triggerMinimizeHint,
      currentTrack: null,
      queue: [],
      currentIndex: 0,
      playbackSpeed: 1.0,
      repeatMode: 'off',
      queueSource: null,
    };

    const rootEl = new MockElement('DIV');
    const root = createRoot(rootEl as unknown as HTMLElement);

    await act(async () => {
      root.render(
        <AudioPlayerContext.Provider value={mockContext as AudioPlayerContextValue}>
          <FullPlayer onClose={vi.fn()} />
        </AudioPlayerContext.Provider>
      );
    });

    // Unmount FullPlayer (simulating route CLOSE via back button)
    await act(async () => {
      root.unmount();
    });

    // R8 requirement: triggerMinimizeHint must be called when unmounted with active video
    expect(triggerMinimizeHint).toHaveBeenCalledTimes(1);
  });
});
