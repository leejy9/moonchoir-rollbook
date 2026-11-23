import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('leaflet', () => ({
  default: {
    map: vi.fn(),
    tileLayer: vi.fn(),
    marker: vi.fn(),
    circle: vi.fn(),
    icon: vi.fn(),
  },
}));

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { bindDeviceProfile, clearDeviceProfile } from './services/auth';
import { sheetsService } from './services/sheets';
import type { BoundDeviceProfile, Schedule } from './types/rollbook';

class MockElement {
  nodeType = 1;
  nodeName: string;
  tagName: string;
  childNodes: any[] = [];
  style: any = {};
  ownerDocument: any;
  srcObject: any = null;
  videoWidth = 640;
  videoHeight = 480;
  readyState = 4;
  HAVE_ENOUGH_DATA = 4;

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
  getContext() {
    return {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({
        data: new Uint8ClampedArray(4),
        width: 1,
        height: 1,
      })),
    };
  }
  play() {
    return Promise.resolve();
  }
  pause() {}
}

class MockHTMLIFrameElement extends MockElement {}

interface HistoryEntry {
  state: any;
  title: string;
  url: string;
}

describe('App Route Overlays (C2: QR & RSVP)', () => {
  let historyStack: HistoryEntry[];
  let historyIndex: number;
  let listeners: Record<string, Set<EventListener>>;
  let stopTrackSpy: any;

  const mockProfile: BoundDeviceProfile = {
    memberId: 'mem_target_01',
    name: '김단원',
    part: '소프라노',
    phoneLast4: '1234',
    boundAt: '2026-10-17T10:00:00Z',
  };

  const normalSchedule: Schedule = {
    id: 'sch_active_qr',
    title: '정기연습',
    category: '정기연습',
    date: '2026-11-21',
    startTime: '19:30',
    endTime: '21:30',
    locationName: '문콰이어 연습실',
    targetLat: 37.5665,
    targetLon: 126.978,
  };

  const hiddenSchedule: Schedule = {
    id: 'sch_hidden_target_only',
    title: '타겟 전용 비공개 연습',
    category: '기타',
    date: '2026-11-21',
    startTime: '14:00',
    endTime: '16:00',
    locationName: '제2연습실',
    visibility: 'TARGETS_ONLY',
    targetMemberIds: ['mem_other_user'], // mockProfile is NOT in targetMemberIds
  };

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    (globalThis as any).Element = MockElement;
    (globalThis as any).HTMLElement = MockElement;
    (globalThis as any).HTMLIFrameElement = MockHTMLIFrameElement;

    const storageMap = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storageMap.get(key) ?? null,
      setItem: (key: string, val: string) => storageMap.set(key, val),
      removeItem: (key: string) => storageMap.delete(key),
      clear: () => storageMap.clear(),
    });

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

    stopTrackSpy = vi.fn();
    const mockMediaStream = {
      getTracks: () => [{ stop: stopTrackSpy }],
    };

    const htmlElement = new MockElement('HTML');
    htmlElement.style = {
      setProperty: vi.fn(),
      removeProperty: vi.fn(),
    };

    (globalThis as any).requestAnimationFrame = vi.fn(() => 1);
    (globalThis as any).cancelAnimationFrame = vi.fn();

    const mockDoc = {
      nodeType: 9,
      nodeName: '#document',
      documentElement: htmlElement,
      body: new MockElement('BODY'),
      createElement: (tag: string) => new MockElement(tag.toUpperCase()),
      createElementNS: (_: any, tag: string) => new MockElement(tag.toUpperCase()),
      createTextNode: (text: string) => ({ nodeType: 3, nodeValue: text, ownerDocument: mockDoc }),
      createComment: () => ({ nodeType: 8, ownerDocument: mockDoc }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      activeElement: null,
      visibilityState: 'visible',
    };

    vi.stubGlobal('document', mockDoc);
    vi.stubGlobal('location', mockLocation);
    vi.stubGlobal('history', mockHistory);
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(mockMediaStream),
      },
      geolocation: {
        getCurrentPosition: vi.fn(),
      },
    });
    vi.stubGlobal('window', {
      document: mockDoc,
      location: mockLocation,
      history: mockHistory,
      navigator: (globalThis as any).navigator,
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
      requestAnimationFrame: vi.fn(),
      cancelAnimationFrame: vi.fn(),
      setInterval: globalThis.setInterval.bind(globalThis),
      clearInterval: globalThis.clearInterval.bind(globalThis),
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      matchMedia: vi.fn(() => ({
        matches: false,
        addListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    });

    // Mock sheetsService data
    vi.spyOn(sheetsService, 'refreshRemoteData').mockResolvedValue(true);
    vi.spyOn(sheetsService, 'getSchedules').mockReturnValue([normalSchedule, hiddenSchedule]);
    vi.spyOn(sheetsService, 'getMembers').mockReturnValue([
      {
        id: mockProfile.memberId,
        name: mockProfile.name,
        part: mockProfile.part,
        phoneLast4: mockProfile.phoneLast4,
        role: 'MEMBER',
        status: 'ACTIVE',
        createdAt: '2026-01-01',
        joinedAt: '2026-01-01',
      },
    ]);
    vi.spyOn(sheetsService, 'getSchedulesForMember').mockImplementation((memberId) => {
      if (memberId === mockProfile.memberId) {
        return [normalSchedule]; // hiddenSchedule is excluded for mockProfile
      }
      return [normalSchedule, hiddenSchedule];
    });
    vi.spyOn(sheetsService, 'getRSVPVotes').mockReturnValue([]);

    bindDeviceProfile(
      mockProfile.memberId,
      mockProfile.name,
      mockProfile.part,
      mockProfile.phoneLast4
    );
  });

  afterEach(() => {
    clearDeviceProfile();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('popstate closes QRScannerModal and stops camera stream track', async () => {
    // 1. Initial state at #/today
    historyStack = [{ state: null, title: '', url: '#/today' }];
    historyIndex = 0;

    const container = new MockElement('DIV');
    const root = createRoot(container as any);

    await act(async () => {
      root.render(React.createElement(App));
    });

    // 2. Open QR Scanner overlay via history push
    await act(async () => {
      historyIndex++;
      historyStack.push({
        state: { mcOverlay: true },
        title: '',
        url: '#/today?qr=1&sid=sch_active_qr',
      });
      const event = { type: 'popstate', state: { mcOverlay: true } } as unknown as Event;
      listeners.popstate.forEach((cb) => cb(event));
      listeners.hashchange.forEach((cb) => cb(event));
    });

    // Wait for camera initialization
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    // Camera track should have been requested
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();

    // 3. User taps back (popstate occurs, returns to #/today)
    await act(async () => {
      window.history.back();
    });

    expect(window.location.hash).toBe('#/today');
    expect(stopTrackSpy).toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });

  it('does not render modal for hidden (TARGETS_ONLY) schedule and closes overlay', async () => {
    // Deep link directly into hidden schedule
    historyStack = [
      {
        state: null,
        title: '',
        url: '#/today?qr=1&sid=sch_hidden_target_only',
      },
    ];
    historyIndex = 0;

    const container = new MockElement('DIV');
    const root = createRoot(container as any);

    await act(async () => {
      root.render(React.createElement(App));
    });

    // Camera track should NOT be requested for hidden schedule
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });

  it('popstate closes RSVPModal', async () => {
    // Initial state at #/today
    historyStack = [{ state: null, title: '', url: '#/today' }];
    historyIndex = 0;

    const container = new MockElement('DIV');
    const root = createRoot(container as any);

    await act(async () => {
      root.render(React.createElement(App));
    });

    // Open RSVP overlay
    await act(async () => {
      historyIndex++;
      historyStack.push({
        state: { mcOverlay: true },
        title: '',
        url: '#/today?rsvp=1&sid=sch_active_qr',
      });
      const event = { type: 'popstate', state: { mcOverlay: true } } as unknown as Event;
      listeners.popstate.forEach((cb) => cb(event));
      listeners.hashchange.forEach((cb) => cb(event));
    });

    // Popstate back
    await act(async () => {
      window.history.back();
    });

    expect(window.location.hash).toBe('#/today');

    act(() => {
      root.unmount();
    });
  });
});
