import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useHashRoute } from './useHashRoute';
import { parseRoute, type Route } from '../utils/route';

type MemberRoute = Extract<Route, { area: 'member' }>;

class MockElement {
  nodeType = 1;
  nodeName: string;
  tagName: string;
  childNodes: any[] = [];
  style: any = {};
  ownerDocument: any;

  constructor(tag = 'DIV') {
    this.nodeName = tag;
    this.tagName = tag;
    this.ownerDocument = (globalThis as any).document;
  }

  appendChild(child: any) {
    this.childNodes.push(child);
    return child;
  }

  removeChild(child: any) {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) this.childNodes.splice(idx, 1);
    return child;
  }

  insertBefore(child: any) {
    this.childNodes.push(child);
    return child;
  }

  addEventListener() {}
  removeEventListener() {}
  setAttribute() {}
  removeAttribute() {}
}

class MockHTMLIFrameElement extends MockElement {}

interface HistoryEntry {
  state: any;
  title: string;
  url: string;
}

describe('useHashRoute & History Management (C8)', () => {
  let historyStack: HistoryEntry[];
  let historyIndex: number;
  let listeners: Record<string, Set<EventListener>>;
  let pushStateSpy: any;
  let replaceStateSpy: any;
  let backSpy: any;

  function renderHook<T>(
    hook: () => T,
    options?: { wrapper?: React.ComponentType<{ children: React.ReactNode }> }
  ): { result: { current: T }; unmount: () => void } {
    const result = { current: undefined as unknown as T };
    const container = new MockElement('DIV');
    const root = createRoot(container as any);

    function TestComponent() {
      result.current = hook();
      return null;
    }

    const element = options?.wrapper
      ? React.createElement(options.wrapper, null, React.createElement(TestComponent))
      : React.createElement(TestComponent);

    act(() => {
      root.render(element);
    });

    return {
      result,
      unmount: () => {
        act(() => {
          root.unmount();
        });
      },
    };
  }

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    (globalThis as any).Element = MockElement;
    (globalThis as any).HTMLElement = MockElement;
    (globalThis as any).HTMLIFrameElement = MockHTMLIFrameElement;

    historyStack = [{ state: null, title: '', url: '#/today' }];
    historyIndex = 0;
    listeners = {
      hashchange: new Set(),
      popstate: new Set(),
    };

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
      href: 'http://localhost/#/today',
    };

    const mockHistory = {
      get state() {
        return historyStack[historyIndex]?.state ?? null;
      },
      pushState: vi.fn((state: any, title: string, url?: string | URL | null) => {
        const urlStr = String(url ?? '');
        historyIndex++;
        historyStack = historyStack.slice(0, historyIndex);
        historyStack.push({ state, title, url: urlStr });
      }),
      replaceState: vi.fn((state: any, title: string, url?: string | URL | null) => {
        const urlStr = String(url ?? '');
        if (historyStack[historyIndex]) {
          historyStack[historyIndex] = { state, title, url: urlStr };
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

    pushStateSpy = mockHistory.pushState;
    replaceStateSpy = mockHistory.replaceState;
    backSpy = mockHistory.back;

    const mockDoc = {
      nodeType: 9,
      nodeName: '#document',
      createElement: (tag: string) => new MockElement(tag.toUpperCase()),
      createElementNS: (_: any, tag: string) => new MockElement(tag.toUpperCase()),
      createTextNode: (text: string) => ({ nodeType: 3, nodeValue: text, ownerDocument: mockDoc }),
      createComment: () => ({ nodeType: 8, ownerDocument: mockDoc }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      activeElement: null,
    };

    vi.stubGlobal('document', mockDoc);
    vi.stubGlobal('location', mockLocation);
    vi.stubGlobal('history', mockHistory);
    vi.stubGlobal('window', {
      document: mockDoc,
      location: mockLocation,
      history: mockHistory,
      addEventListener: vi.fn((event: string, cb: EventListener) => {
        if (!listeners[event]) listeners[event] = new Set();
        listeners[event].add(cb);
      }),
      removeEventListener: vi.fn((event: string, cb: EventListener) => {
        listeners[event]?.delete(cb);
      }),
      dispatchEvent: vi.fn((event: Event) => {
        listeners[event.type]?.forEach((cb) => cb(event));
        return true;
      }),
      HTMLIFrameElement: MockHTMLIFrameElement,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('parses empty or root hash as today tab', () => {
    expect(parseRoute('')).toEqual({ area: 'member', tab: 'today' });
    expect(parseRoute('#/')).toEqual({ area: 'member', tab: 'today' });
    expect(parseRoute('#/today')).toEqual({ area: 'member', tab: 'today' });
  });

  it('parses calendar tab with month parameter', () => {
    expect(parseRoute('#/calendar?m=2026-11')).toEqual({
      area: 'member',
      tab: 'calendar',
      month: '2026-11',
    });
  });

  it('parses admin area routes', () => {
    expect(parseRoute('#/admin')).toEqual({ area: 'admin' });
    expect(parseRoute('#/super')).toEqual({ area: 'superAdmin' });
  });

  it('OPEN -> CLOSE calls pushState once and back once (StrictMode check)', () => {
    const { result, unmount } = renderHook(() => useHashRoute(), {
      wrapper: React.StrictMode,
    });

    expect(result.current.route).toEqual({ area: 'member', tab: 'today' });

    // OPEN overlay
    act(() => {
      result.current.navigate({
        type: 'OPEN',
        overlay: { kind: 'scheduleSheet', date: '2026-11-20', scheduleId: 'sch-1' },
      });
    });

    expect(pushStateSpy).toHaveBeenCalledTimes(1);
    expect(pushStateSpy).toHaveBeenCalledWith(
      { mcOverlay: true },
      '',
      '#/calendar?d=2026-11-20&sheet=1&sid=sch-1'
    );
    expect(window.history.state).toEqual({ mcOverlay: true });

    // CLOSE overlay
    act(() => {
      result.current.navigate({ type: 'CLOSE' });
    });

    expect(backSpy).toHaveBeenCalledTimes(1);
    expect(pushStateSpy).toHaveBeenCalledTimes(1); // Still 1, not duplicate from StrictMode
    expect(replaceStateSpy).not.toHaveBeenCalled();

    unmount();
  });

  it('deep-link without history.state on CLOSE calls replaceState, not back', () => {
    // Simulate deep link where history.state is null
    historyStack = [
      {
        state: null,
        title: '',
        url: '#/calendar?d=2026-11-20&sheet=1&sid=sch-1',
      },
    ];
    historyIndex = 0;

    const { result, unmount } = renderHook(() => useHashRoute());

    expect(result.current.route).toEqual({
      area: 'member',
      tab: 'calendar',
      overlay: { kind: 'scheduleSheet', date: '2026-11-20', scheduleId: 'sch-1' },
    });

    act(() => {
      result.current.navigate({ type: 'CLOSE' });
    });

    expect(backSpy).not.toHaveBeenCalled();
    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '#/calendar');
    expect(result.current.route).toEqual({
      area: 'member',
      tab: 'calendar',
    });

    unmount();
  });

  it('navigates sequence: today -> calendar(push) -> sheet OPEN(push) -> CLOSE(back) -> calendar -> back -> today', () => {
    const { result, unmount } = renderHook(() => useHashRoute());

    expect(result.current.route).toEqual({ area: 'member', tab: 'today' });

    // 1. Move to calendar (push)
    act(() => {
      result.current.navigate({ type: 'TAB', tab: 'calendar' });
    });
    expect(pushStateSpy).toHaveBeenCalledWith(null, '', '#/calendar');
    expect(result.current.route.area).toBe('member');
    expect((result.current.route as MemberRoute).tab).toBe('calendar');

    // 2. Open sheet (push with mcOverlay)
    act(() => {
      result.current.navigate({
        type: 'OPEN',
        overlay: { kind: 'scheduleSheet', date: '2026-11-20', scheduleId: 'sch-1' },
      });
    });
    expect(pushStateSpy).toHaveBeenCalledWith(
      { mcOverlay: true },
      '',
      '#/calendar?d=2026-11-20&sheet=1&sid=sch-1'
    );
    expect((result.current.route as MemberRoute).overlay).toEqual({
      kind: 'scheduleSheet',
      date: '2026-11-20',
      scheduleId: 'sch-1',
    });

    // 3. Close sheet (back called, popstate restores calendar)
    act(() => {
      result.current.navigate({ type: 'CLOSE' });
    });
    expect(backSpy).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe('#/calendar');
    expect(result.current.route.area).toBe('member');
    expect((result.current.route as MemberRoute).tab).toBe('calendar');
    expect((result.current.route as MemberRoute).overlay).toBeUndefined();

    // 4. Browser back returns to today
    act(() => {
      window.history.back();
    });
    expect(window.location.hash).toBe('#/today');
    expect(result.current.route.area).toBe('member');
    expect((result.current.route as MemberRoute).tab).toBe('today');

    unmount();
  });
});
