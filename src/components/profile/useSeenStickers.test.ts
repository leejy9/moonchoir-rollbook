import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useSeenStickers, computeUnseenStickers } from './useSeenStickers';
import { PREFERENCE_KEYS, readPreference, resetStorage } from '../../services/sheetsStorage';

class MockElement {
  nodeType = 1;
  nodeName: string;
  tagName: string;
  childNodes: MockElement[] = [];
  style: Record<string, unknown> = {};
  ownerDocument: unknown;
  textContent = '';
  eventListeners: Record<string, ((e: unknown) => void)[]> = {};

  constructor(tag = 'DIV', doc?: unknown) {
    this.nodeName = tag;
    this.tagName = tag;
    this.ownerDocument = doc || (globalThis as unknown as { document: unknown })?.document;
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
}

describe('useSeenStickers (V3-20 R5)', () => {
  let originalWin: unknown;
  let originalDoc: unknown;
  let store: Map<string, string>;

  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    originalWin = (globalThis as unknown as { window?: unknown }).window;
    originalDoc = (globalThis as unknown as { document?: unknown }).document;

    store = new Map<string, string>();
    const mockStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    };

    const mockDoc: Record<string, unknown> = {
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
      localStorage: mockStorage,
      HTMLElement: MockElement,
      HTMLIFrameElement: MockElement,
      HTMLMediaElement: MockElement,
      Element: MockElement,
      Node: MockElement,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    mockDoc.defaultView = mockWin;

    (globalThis as unknown as { document: unknown }).document = mockDoc;
    (globalThis as unknown as { window: unknown }).window = mockWin;
    vi.stubGlobal('localStorage', mockStorage);
    resetStorage();
  });

  afterEach(() => {
    (globalThis as unknown as { window?: unknown }).window = originalWin;
    (globalThis as unknown as { document?: unknown }).document = originalDoc;
    vi.unstubAllGlobals();
  });

  it('computeUnseenStickers does not initialize baseline when isReady is false', () => {
    const res = computeUnseenStickers([], null, false);
    expect(res.shouldInitialize).toBe(false);
    expect(res.unseenIds.size).toBe(0);
  });

  it('빈 저장소에서 데이터가 늦게 도착할 때 모든 스티커가 신규로 뜨지 않는다 (R5 버그 검증)', async () => {
    const holder: { current: ReturnType<typeof useSeenStickers> | null } = { current: null };

    const TestComp = ({ earned, isReady }: { earned: string[]; isReady: boolean }) => {
      const hook = useSeenStickers(earned, isReady);
      useEffect(() => {
        holder.current = hook;
      }, [hook]);
      return null;
    };

    const rootEl = new MockElement('DIV');
    const root = createRoot(rootEl as unknown as HTMLElement);

    // Initial render: empty data, isReady = false
    await act(async () => {
      root.render(React.createElement(TestComp, { earned: [], isReady: false }));
    });

    expect(holder.current?.unseenCount).toBe(0);
    // Storage must NOT have been initialized with empty array yet!
    expect(store.get(PREFERENCE_KEYS.SEEN_STICKERS)).toBeUndefined();

    // Data arrives later: 12 earned stickers, isReady = true
    const mockEarned = Array.from({ length: 12 }, (_, i) => `sticker_${i + 1}`);
    await act(async () => {
      root.render(React.createElement(TestComp, { earned: mockEarned, isReady: true }));
    });

    // On fresh device with first arrival, unseenCount MUST be 0 (established baseline)
    expect(holder.current?.unseenCount).toBe(0);

    // Stored stickers must now equal earned stickers
    const stored = readPreference<string[]>(PREFERENCE_KEYS.SEEN_STICKERS, (x): x is string[] => Array.isArray(x), []);
    expect(stored).toEqual(mockEarned);
  });
});
