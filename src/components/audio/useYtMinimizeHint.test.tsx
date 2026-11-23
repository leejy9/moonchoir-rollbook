import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useYtMinimizeHint } from './useYtMinimizeHint';
import { PREFERENCE_KEYS, resetStorage } from '../../services/sheetsStorage';

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
}

describe('useYtMinimizeHint (V3-20 R7)', () => {
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
    vi.useFakeTimers();
  });

  afterEach(() => {
    (globalThis as unknown as { window?: unknown }).window = originalWin;
    (globalThis as unknown as { document?: unknown }).document = originalDoc;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('shows toast when storage is empty on new device, and suppresses after 2 times', async () => {
    const holder: { current: ReturnType<typeof useYtMinimizeHint> | null } = { current: null };

    const TestComp = () => {
      const hook = useYtMinimizeHint();
      useEffect(() => {
        holder.current = hook;
      }, [hook]);
      return null;
    };

    const rootEl = new MockElement('DIV');
    const root = createRoot(rootEl as unknown as HTMLElement);

    await act(async () => {
      root.render(React.createElement(TestComp));
    });

    expect(holder.current).not.toBeNull();

    // 1st trigger: on empty storage, toast MUST show
    await act(async () => {
      holder.current!.triggerHint();
    });
    expect(holder.current!.showHint).toBe(true);
    expect(store.get(PREFERENCE_KEYS.YT_MINIMIZE_HINT_COUNT)).toBe('1');

    // Dismiss by timer
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(holder.current!.showHint).toBe(false);

    // 2nd trigger: toast shows again
    await act(async () => {
      holder.current!.triggerHint();
    });
    expect(holder.current!.showHint).toBe(true);
    expect(store.get(PREFERENCE_KEYS.YT_MINIMIZE_HINT_COUNT)).toBe('2');

    // Dismiss by timer
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(holder.current!.showHint).toBe(false);

    // 3rd trigger: suppressed
    await act(async () => {
      holder.current!.triggerHint();
    });
    expect(holder.current!.showHint).toBe(false);
  });
});
