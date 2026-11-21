import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useMasterEntryGesture, type MasterEntryGestureResult } from './useMasterEntryGesture';

class MockElement {
  nodeType = 1;
  nodeName = 'DIV';
  tagName = 'DIV';
  childNodes: any[] = [];
  style: any = {};
  ownerDocument: any;

  constructor() {
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

  addEventListener() {}
  removeEventListener() {}
  setAttribute() {}
  getAttribute() { return null; }
  contains() { return false; }
}

describe('useMasterEntryGesture', () => {
  let root: any;
  let container: MockElement;
  let currentResult: MasterEntryGestureResult;

  function TestComponent() {
    // oxlint-disable-next-line react/globals
    currentResult = useMasterEntryGesture();
    return React.createElement('div', { ref: currentResult.easterEggRef });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    (globalThis as any).Element = MockElement;
    (globalThis as any).HTMLElement = MockElement;
    (globalThis as any).HTMLIFrameElement = class extends MockElement {};
    (globalThis as any).window = globalThis;
    (globalThis as any).document = {
      createElement: () => new MockElement(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('navigator', {
      vibrate: vi.fn(),
    });

    container = new MockElement();
    root = createRoot(container as any);
    act(() => {
      root.render(React.createElement(TestComponent));
    });
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('triggers easter egg on 600ms long press', () => {
    expect(currentResult.showEasterEgg).toBe(false);

    act(() => {
      currentResult.logoHandlers.onTouchStart({
        touches: [{ clientX: 100, clientY: 100 } as React.Touch],
      } as unknown as React.TouchEvent);
    });

    expect(currentResult.showEasterEgg).toBe(false);

    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(currentResult.showEasterEgg).toBe(true);
  });

  it('cancels long press on touchEnd before 600ms', () => {
    act(() => {
      currentResult.logoHandlers.onTouchStart({
        touches: [{ clientX: 100, clientY: 100 } as React.Touch],
      } as unknown as React.TouchEvent);
    });

    act(() => {
      vi.advanceTimersByTime(300);
      currentResult.logoHandlers.onTouchEnd();
      vi.advanceTimersByTime(400);
    });

    expect(currentResult.showEasterEgg).toBe(false);
  });

  it('cancels long press when touch moves by more than 10px (scroll gesture)', () => {
    act(() => {
      currentResult.logoHandlers.onTouchStart({
        touches: [{ clientX: 100, clientY: 100 } as React.Touch],
      } as unknown as React.TouchEvent);
    });

    // Moved by 15px vertically (100 -> 115)
    act(() => {
      currentResult.logoHandlers.onTouchMove({
        touches: [{ clientX: 100, clientY: 115 } as React.Touch],
      } as unknown as React.TouchEvent);
      vi.advanceTimersByTime(700);
    });

    expect(currentResult.showEasterEgg).toBe(false);
  });

  it('does not cancel long press when touch moves within 10px threshold (finger jitter)', () => {
    act(() => {
      currentResult.logoHandlers.onTouchStart({
        touches: [{ clientX: 100, clientY: 100 } as React.Touch],
      } as unknown as React.TouchEvent);
    });

    // Moved by only 3px (distSq = 9 < 100)
    act(() => {
      currentResult.logoHandlers.onTouchMove({
        touches: [{ clientX: 102, clientY: 102 } as React.Touch],
      } as unknown as React.TouchEvent);
      vi.advanceTimersByTime(600);
    });

    expect(currentResult.showEasterEgg).toBe(true);
  });

  it('cancels long press on touchCancel', () => {
    act(() => {
      currentResult.logoHandlers.onTouchStart({
        touches: [{ clientX: 100, clientY: 100 } as React.Touch],
      } as unknown as React.TouchEvent);
    });

    act(() => {
      vi.advanceTimersByTime(200);
      currentResult.logoHandlers.onTouchCancel();
      vi.advanceTimersByTime(600);
    });

    expect(currentResult.showEasterEgg).toBe(false);
  });

  it('triggers immediately on contextMenu event (PC right-click)', () => {
    const mockPreventDefault = vi.fn();
    const mockStopPropagation = vi.fn();

    act(() => {
      currentResult.logoHandlers.onContextMenu({
        preventDefault: mockPreventDefault,
        stopPropagation: mockStopPropagation,
      } as unknown as React.MouseEvent);
    });

    expect(mockPreventDefault).toHaveBeenCalled();
    expect(mockStopPropagation).toHaveBeenCalled();
    expect(currentResult.showEasterEgg).toBe(true);
  });
});
