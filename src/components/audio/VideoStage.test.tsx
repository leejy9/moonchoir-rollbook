import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ActiveVideoState } from './audioPlayerContext';
import { VideoStage } from './VideoStage';

const mockPlayers = vi.hoisted(() => {
  const state = {
    attempts: [] as Array<{ videoId: string; events: { onError: (event?: unknown) => void } }>,
    pendingLoads: [] as Array<() => void>,
    deferLoads: false,
  };
  class MockPlayer {
    constructor(
      _target: unknown,
      options: { videoId: string; events: { onError: (event?: unknown) => void } }
    ) {
      state.attempts.push(options);
    }
  }
  return { ...state, MockPlayer };
});

vi.mock('../../services/media/youtubeIframeApi', () => ({
  loadYoutubeIframeApi: vi.fn(() => {
    const api = { Player: mockPlayers.MockPlayer };
    if (!mockPlayers.deferLoads) return Promise.resolve(api);
    return new Promise((resolve) => {
      mockPlayers.pendingLoads.push(() => resolve(api));
    });
  }),
}));

class MockElement {
  nodeType: number;
  nodeName: string;
  tagName: string;
  childNodes: MockElement[] = [];
  parentNode: MockElement | null = null;
  style = { setProperty: vi.fn() };
  ownerDocument: MockDocument;
  attributes: Record<string, string> = {};
  eventListeners: Record<string, Array<(event: unknown) => void>> = {};
  textContent = '';
  nodeValue: string | null = null;
  private html = '';

  constructor(tag: string, ownerDocument: MockDocument, nodeType = 1) {
    this.nodeName = tag;
    this.tagName = tag;
    this.ownerDocument = ownerDocument;
    this.nodeType = nodeType;
  }

  get innerHTML(): string {
    return this.html;
  }

  set innerHTML(value: string) {
    this.html = value;
    this.childNodes = [];
  }

  get firstChild(): MockElement | null {
    return this.childNodes[0] ?? null;
  }

  appendChild(child: MockElement): MockElement {
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  removeChild(child: MockElement): MockElement {
    const index = this.childNodes.indexOf(child);
    if (index >= 0) this.childNodes.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  insertBefore(child: MockElement, before: MockElement | null): MockElement {
    child.parentNode = this;
    const index = before ? this.childNodes.indexOf(before) : -1;
    if (index < 0) this.childNodes.push(child);
    else this.childNodes.splice(index, 0, child);
    return child;
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.eventListeners[type] ??= [];
    this.eventListeners[type].push(listener);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.eventListeners[type] = (this.eventListeners[type] || []).filter((item) => item !== listener);
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  removeAttribute(name: string): void {
    delete this.attributes[name];
  }

  querySelector(): null {
    return null;
  }

  querySelectorAll(): MockElement[] {
    return [];
  }

  focus(): void {
    this.ownerDocument.activeElement = this;
  }
}

type MockDocument = {
  activeElement: MockElement | null;
  createElement: (tag: string) => MockElement;
  createElementNS: (namespace: string | null, tag: string) => MockElement;
  createTextNode: (text: string) => MockElement;
  createComment: (text: string) => MockElement;
  addEventListener: (type: string, listener: (event: unknown) => void) => void;
  removeEventListener: (type: string, listener: (event: unknown) => void) => void;
  documentElement: MockElement;
  body: MockElement;
  head: MockElement;
  defaultView?: unknown;
};

function makeVideo(videoId: string): ActiveVideoState {
  return {
    track: {
      id: `track-${videoId}`,
      pieceId: 'piece-1',
      label: '참고 영상',
      kind: '참고영상',
      source: 'youtube',
      url: `https://www.youtube.com/watch?v=${videoId}`,
      orderIndex: 0,
      isArchived: false,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
    pieceTitle: '곡',
    resumeAt: 0,
  };
}

function findByClass(root: MockElement, className: string): MockElement | null {
  const propsKey = Object.keys(root).find((key) => key.startsWith('__reactProps'));
  if (propsKey) {
    const props = (root as unknown as Record<string, { className?: string }>)[propsKey];
    if (props.className?.split(' ').includes(className)) return root;
  }
  for (const child of root.childNodes) {
    const found = findByClass(child, className);
    if (found) return found;
  }
  return null;
}

describe('VideoStage', () => {
  let originalWindow: unknown;
  let originalDocument: unknown;
  let root: Root | null = null;
  let container: MockElement;

  beforeEach(() => {
    mockPlayers.attempts.length = 0;
    mockPlayers.pendingLoads.length = 0;
    mockPlayers.deferLoads = false;
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    originalWindow = (globalThis as unknown as { window?: unknown }).window;
    originalDocument = (globalThis as unknown as { document?: unknown }).document;

    const document: MockDocument = {
      activeElement: null as MockElement | null,
      createElement: (tag: string): MockElement => new MockElement(tag.toUpperCase(), document),
      createElementNS: (_namespace: string | null, tag: string) => new MockElement(tag.toUpperCase(), document),
      createTextNode: (text: string) => {
        const node = new MockElement('#text', document, 3);
        node.nodeValue = text;
        return node;
      },
      createComment: (text: string) => {
        const node = new MockElement('#comment', document, 8);
        node.nodeValue = text;
        return node;
      },
      addEventListener: () => {},
      removeEventListener: () => {},
      documentElement: null as unknown as MockElement,
      body: null as unknown as MockElement,
      head: null as unknown as MockElement,
    };
    document.documentElement = new MockElement('HTML', document);
    document.body = new MockElement('BODY', document);
    document.head = new MockElement('HEAD', document);

    const window = {
      document,
      Element: MockElement,
      HTMLElement: MockElement,
      HTMLIFrameElement: MockElement,
      Node: MockElement,
      addEventListener: () => {},
      removeEventListener: () => {},
      location: { origin: 'http://localhost' },
    };
    document.defaultView = window;
    vi.stubGlobal('document', document);
    vi.stubGlobal('window', window);

    container = new MockElement('DIV', document);
    root = createRoot(container as unknown as Element);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
      root = null;
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    (globalThis as unknown as { window?: unknown }).window = originalWindow;
    (globalThis as unknown as { document?: unknown }).document = originalDocument;
  });

  it('loads a new video after the previous video failed', async () => {
    await act(async () => {
      root?.render(<VideoStage activeVideo={makeVideo('dQw4w9WgXcQ')} playbackSpeed={1} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockPlayers.attempts.map(({ videoId }) => videoId)).toEqual(['dQw4w9WgXcQ']);

    await act(async () => {
      mockPlayers.attempts[0].events.onError();
    });
    expect(findByClass(container, 'fallback')).not.toBeNull();

    await act(async () => {
      root?.render(<VideoStage activeVideo={makeVideo('M7lc1UVf-VE')} playbackSpeed={1} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockPlayers.attempts.map(({ videoId }) => videoId)).toEqual(['dQw4w9WgXcQ', 'M7lc1UVf-VE']);
    expect(findByClass(container, 'fallback')).toBeNull();

    await act(async () => mockPlayers.attempts[0].events.onError());
    expect(findByClass(container, 'fallback')).toBeNull();
  });

  it('ignores a late API load for the previous video after selection changes', async () => {
    mockPlayers.deferLoads = true;

    await act(async () => {
      root?.render(<VideoStage activeVideo={makeVideo('dQw4w9WgXcQ')} playbackSpeed={1} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockPlayers.pendingLoads).toHaveLength(1);

    await act(async () => {
      root?.render(<VideoStage activeVideo={makeVideo('M7lc1UVf-VE')} playbackSpeed={1} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockPlayers.pendingLoads).toHaveLength(2);

    await act(async () => mockPlayers.pendingLoads[0]());
    expect(mockPlayers.attempts.map(({ videoId }) => videoId)).toEqual([]);

    await act(async () => mockPlayers.pendingLoads[1]());
    expect(mockPlayers.attempts.map(({ videoId }) => videoId)).toEqual(['M7lc1UVf-VE']);
  });
});
