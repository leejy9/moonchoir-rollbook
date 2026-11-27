import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { useLongPress } from './useLongPress';

describe('useLongPress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('triggers onLongPress when held for thresholdMs (3000ms)', () => {
    const onLongPress = vi.fn();
    const onClick = vi.fn();
    let handlers: ReturnType<typeof useLongPress> | undefined;

    function TestComponent() {
      // oxlint-disable-next-line react/globals
      handlers = useLongPress({ thresholdMs: 3000, onLongPress, onClick });
      return React.createElement('div', handlers);
    }

    renderToString(React.createElement(TestComponent));
    expect(handlers).toBeDefined();

    handlers!.onMouseDown({} as React.MouseEvent);
    expect(onLongPress).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2999);
    expect(onLongPress).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('cancels timer if mouseUp occurs before threshold', () => {
    const onLongPress = vi.fn();
    const onClick = vi.fn();
    let handlers: ReturnType<typeof useLongPress> | undefined;

    function TestComponent() {
      // oxlint-disable-next-line react/globals
      handlers = useLongPress({ thresholdMs: 3000, onLongPress, onClick });
      return React.createElement('div', handlers);
    }

    renderToString(React.createElement(TestComponent));
    handlers!.onMouseDown({} as React.MouseEvent);

    vi.advanceTimersByTime(1500);
    handlers!.onMouseUp();

    vi.advanceTimersByTime(2000);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('suppresses normal onClick if long press was triggered', () => {
    const onLongPress = vi.fn();
    const onClick = vi.fn();
    let handlers: ReturnType<typeof useLongPress> | undefined;

    function TestComponent() {
      // oxlint-disable-next-line react/globals
      handlers = useLongPress({ thresholdMs: 3000, onLongPress, onClick });
      return React.createElement('div', handlers);
    }

    renderToString(React.createElement(TestComponent));
    handlers!.onMouseDown({} as React.MouseEvent);
    vi.advanceTimersByTime(3000);
    expect(onLongPress).toHaveBeenCalledTimes(1);

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    handlers!.onClick({
      preventDefault,
      stopPropagation,
    } as unknown as React.MouseEvent);

    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('prevents default context menu to avoid mobile image download popups', () => {
    let handlers: ReturnType<typeof useLongPress> | undefined;

    function TestComponent() {
      // oxlint-disable-next-line react/globals
      handlers = useLongPress({ onLongPress: vi.fn() });
      return React.createElement('div', handlers);
    }

    renderToString(React.createElement(TestComponent));
    expect(handlers?.onContextMenu).toBeDefined();

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    handlers!.onContextMenu({
      preventDefault,
      stopPropagation,
    } as unknown as React.MouseEvent);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
  });
});
