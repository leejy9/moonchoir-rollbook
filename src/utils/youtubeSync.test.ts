import { describe, expect, it, vi } from 'vitest';
import { createYoutubeBlurListener, createYoutubeMessageListener } from './youtubeSync';

describe('YouTube Sync Pure Listeners (V3-16, §3-3, §4-A-3)', () => {
  it('ignores messages originating from domains other than https://www.youtube.com', () => {
    const onPause = vi.fn();
    const listener = createYoutubeMessageListener(onPause);

    listener(new MessageEvent('message', {
      origin: 'https://evil.com',
      data: JSON.stringify({ event: 'onStateChange', info: 1 }),
    }));

    listener(new MessageEvent('message', {
      origin: 'https://youtube.com', // Not https://www.youtube.com
      data: JSON.stringify({ event: 'onStateChange', info: 1 }),
    }));

    expect(onPause).not.toHaveBeenCalled();
  });

  it('triggers pause on { event: "onStateChange", info: 1 } message from https://www.youtube.com', () => {
    const onPause = vi.fn();
    const listener = createYoutubeMessageListener(onPause);

    // Stringified JSON
    listener(new MessageEvent('message', {
      origin: 'https://www.youtube.com',
      data: JSON.stringify({ event: 'onStateChange', info: 1 }),
    }));
    expect(onPause).toHaveBeenCalledTimes(1);

    // Object format
    listener(new MessageEvent('message', {
      origin: 'https://www.youtube.com',
      data: { event: 'onStateChange', info: 1 },
    }));
    expect(onPause).toHaveBeenCalledTimes(2);
  });

  it('triggers pause on { event: "infoDelivery", info: { playerState: 1 } } message', () => {
    const onPause = vi.fn();
    const listener = createYoutubeMessageListener(onPause);

    // Stringified JSON
    listener(new MessageEvent('message', {
      origin: 'https://www.youtube.com',
      data: JSON.stringify({ event: 'infoDelivery', info: { playerState: 1 } }),
    }));
    expect(onPause).toHaveBeenCalledTimes(1);

    // Object format
    listener(new MessageEvent('message', {
      origin: 'https://www.youtube.com',
      data: { event: 'infoDelivery', info: { playerState: 1 } },
    }));
    expect(onPause).toHaveBeenCalledTimes(2);
  });

  it('ignores other player states (e.g. 0 paused, 2 buffered, -1 unstarted) without pausing', () => {
    const onPause = vi.fn();
    const listener = createYoutubeMessageListener(onPause);

    listener(new MessageEvent('message', {
      origin: 'https://www.youtube.com',
      data: JSON.stringify({ event: 'onStateChange', info: 2 }), // Paused
    }));

    listener(new MessageEvent('message', {
      origin: 'https://www.youtube.com',
      data: JSON.stringify({ event: 'infoDelivery', info: { playerState: 0 } }), // Ended
    }));

    expect(onPause).not.toHaveBeenCalled();
  });

  it('silently ignores non-JSON message payloads without calling pause or throwing', () => {
    const onPause = vi.fn();
    const listener = createYoutubeMessageListener(onPause);

    listener(new MessageEvent('message', {
      origin: 'https://www.youtube.com',
      data: 'non-json-telemetry-string-from-google',
    }));

    listener(new MessageEvent('message', {
      origin: 'https://www.youtube.com',
      data: 12345,
    }));

    expect(onPause).not.toHaveBeenCalled();
  });

  it('triggers pause on window blur if document.activeElement is one of the YouTube iframes', () => {
    const onPause = vi.fn();
    const mockIframe = { tagName: 'IFRAME' } as HTMLIFrameElement;
    const otherIframe = { tagName: 'IFRAME' } as HTMLIFrameElement;
    const otherButton = { tagName: 'BUTTON' } as any;

    let activeEl: any = null;
    const mockDoc = {
      get activeElement() {
        return activeEl;
      },
    } as any;

    const blurListener = createYoutubeBlurListener(() => [mockIframe], onPause, () => mockDoc);

    // 1) Active element is another element: no pause
    activeEl = otherButton;
    blurListener();
    expect(onPause).not.toHaveBeenCalled();

    // 2) Active element is an unrelated iframe: no pause
    activeEl = otherIframe;
    blurListener();
    expect(onPause).not.toHaveBeenCalled();

    // 3) Active element is the tracked YouTube iframe: pauses!
    activeEl = mockIframe;
    blurListener();
    expect(onPause).toHaveBeenCalledTimes(1);
  });
});
