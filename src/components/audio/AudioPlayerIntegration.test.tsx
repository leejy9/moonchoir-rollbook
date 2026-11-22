import { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { AudioPlayerProvider } from './AudioPlayerProvider';
import { MiniPlayer } from './MiniPlayer';
import { FullPlayer } from './FullPlayer';
import { useHashRoute } from '../../hooks/useHashRoute';
import type { PlayableTrackItem } from '../../utils/audioQueue';
import type { PracticePiece } from '../../types/rollbook';

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

function findNodeByClass(root: MockElement, className: string): MockElement | null {
  if (!root) return null;
  const reactPropsKey = Object.keys(root).find((k) => k.startsWith('__reactProps'));
  if (reactPropsKey) {
    const propsClass = (root as unknown as Record<string, Record<string, unknown>>)[reactPropsKey]?.className;
    if (typeof propsClass === 'string' && propsClass.includes(className)) {
      return root;
    }
  }
  if (Array.isArray(root.childNodes)) {
    for (const child of root.childNodes) {
      const found = findNodeByClass(child, className);
      if (found) return found;
    }
  }
  return null;
}

function clickMockNode(node: MockElement) {
  const reactPropsKey = Object.keys(node).find((k) => k.startsWith('__reactProps'));
  if (reactPropsKey) {
    const onClick = (rootNodeProps: Record<string, unknown>) => {
      if (typeof rootNodeProps?.onClick === 'function') {
        rootNodeProps.onClick({ preventDefault: () => {}, stopPropagation: () => {} });
      }
    };
    onClick((node as unknown as Record<string, Record<string, unknown>>)[reactPropsKey]);
  }
}

describe('Audio Player Mini -> Full Navigation Integration (J8)', () => {
  const sampleTrackItem: PlayableTrackItem = {
    track: {
      id: 'trk_soprano',
      pieceId: 'piece_1',
      label: '소프라노 파트',
      kind: 'guide_soprano',
      source: 'r2',
      storageKey: 'audio/trk_soprano.m4a',
      url: '',
      isArchived: false,
      createdAt: '2026-11-20T00:00:00Z',
      updatedAt: '2026-11-20T00:00:00Z',
    },
    pieceTitle: '아름다운 나라',
    playbackUrl: 'https://media.test.workers.dev/audio/trk_soprano.m4a',
  };

  const samplePiece: PracticePiece = {
    id: 'piece_1',
    title: '아름다운 나라',
    composer: '작곡가',
    isArchived: false,
    createdAt: '2026-11-20T00:00:00Z',
    updatedAt: '2026-11-20T00:00:00Z',
  };

  let historyStack: Array<{ state: unknown; title: string; url: string }>;
  let historyIndex: number;
  let listeners: Record<string, Set<EventListener>>;

  beforeEach(() => {
    vi.clearAllMocks();
    historyStack = [{ state: null, title: '', url: '#/studio' }];
    historyIndex = 0;
    listeners = { hashchange: new Set(), popstate: new Set() };

    const mockLocation = {
      get hash() {
        return historyStack[historyIndex]?.url ?? '';
      },
      set hash(val: string) {
        if (historyStack[historyIndex]) {
          historyStack[historyIndex].url = val;
        }
      },
      pathname: '/',
      search: '',
      href: 'http://localhost/#/studio',
    };

    const mockHistory = {
      get state() {
        return historyStack[historyIndex]?.state ?? null;
      },
      pushState: vi.fn((state: unknown, title: string, url?: string | URL | null) => {
        historyIndex++;
        historyStack = historyStack.slice(0, historyIndex);
        historyStack.push({ state, title, url: String(url ?? '') });
      }),
      replaceState: vi.fn((state: unknown, title: string, url?: string | URL | null) => {
        if (historyStack[historyIndex]) {
          historyStack[historyIndex] = { state, title, url: String(url ?? '') };
        }
      }),
      back: vi.fn(() => {
        if (historyIndex > 0) {
          historyIndex--;
          const event = { type: 'popstate', state: historyStack[historyIndex]?.state } as unknown as Event;
          act(() => {
            listeners.popstate.forEach((cb) => cb(event));
            listeners.hashchange.forEach((cb) => cb(event));
          });
        }
      }),
    };

    const mockWin: Record<string, unknown> = {
      location: mockLocation,
      history: mockHistory,
      addEventListener: vi.fn((event: string, cb: EventListener) => {
        if (!listeners[event]) listeners[event] = new Set();
        listeners[event].add(cb);
      }),
      removeEventListener: vi.fn((event: string, cb: EventListener) => {
        listeners[event]?.delete(cb);
      }),
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
    vi.stubGlobal('location', mockLocation);
    vi.stubGlobal('history', mockHistory);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function TestApp() {
    const { route, navigate } = useHashRoute();
    return (
      <AudioPlayerProvider initialTrack={sampleTrackItem}>
        <div className="test-app-root">
          <MiniPlayer
            onOpenFullPlayer={() => {
              navigate({ type: 'OPEN', overlay: { kind: 'player' } });
            }}
          />
          {route.overlay?.kind === 'player' && (
            <FullPlayer
              piece={samplePiece}
              onClose={() => navigate({ type: 'CLOSE' })}
            />
          )}
        </div>
      </AudioPlayerProvider>
    );
  }

  it('clicking mini bar opens FullPlayer in DOM with backdrop, and back button closes it', async () => {
    const container = new MockElement('DIV');
    const root = createRoot(container as unknown as Element);

    await act(async () => {
      root.render(<TestApp />);
    });

    // 1. Initially MiniPlayer is rendered, FullPlayer is NOT in DOM
    const initialMiniPlayer = findNodeByAriaLabel(container, '오디오 플레이어');
    expect(initialMiniPlayer).not.toBeNull();
    expect(findNodeByAriaLabel(container, '오디오 플레이어 전체 화면')).toBeNull();

    // 2. Click MiniPlayer to open FullPlayer
    await act(async () => {
      if (initialMiniPlayer) {
        clickMockNode(initialMiniPlayer);
      }
    });

    // 3. FullPlayer must now be present in DOM
    const fullPlayer = findNodeByAriaLabel(container, '오디오 플레이어 전체 화면');
    expect(fullPlayer).not.toBeNull();
    // Backdrop class must be present
    expect(findNodeByClass(container, 'full-player-backdrop')).not.toBeNull();

    // 4. Click dismiss button ("플레이어 접기")
    const dismissBtn = findNodeByAriaLabel(container, '플레이어 접기');
    expect(dismissBtn).not.toBeNull();

    await act(async () => {
      if (dismissBtn) {
        clickMockNode(dismissBtn);
      }
    });

    // 5. FullPlayer is closed and no longer in DOM
    expect(findNodeByAriaLabel(container, '오디오 플레이어 전체 화면')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });
});
