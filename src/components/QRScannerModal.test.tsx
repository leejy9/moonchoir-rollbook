import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QRScannerModal } from './QRScannerModal';
import { sheetsService } from '../services/sheets';
import type { BoundDeviceProfile, Schedule } from '../types/rollbook';

class MockElement {
  nodeType = 1;
  nodeName: string;
  tagName: string;
  childNodes: any[] = [];
  style: any = {};
  ownerDocument: any;
  textContent = '';
  className = '';

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
  setAttribute(name: string, val: any) {
    (this as any)[name] = val;
  }
  removeAttribute() {}
  focus() {}
  getContext() {
    return {
      drawImage: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
    };
  }
  querySelectorAll() {
    return [];
  }
}

function findNodes(root: any, predicate: (node: any) => boolean): any[] {
  const result: any[] = [];
  if (!root) return result;
  if (predicate(root)) result.push(root);
  if (root.childNodes) {
    for (const child of root.childNodes) {
      result.push(...findNodes(child, predicate));
    }
  }
  return result;
}

function getAllText(node: any): string {
  if (!node) return '';
  let str = '';
  if (node.textContent) str += node.textContent;
  if (node.nodeType === 3 && node.nodeValue) str += node.nodeValue;
  if (node.childNodes) {
    for (const c of node.childNodes) {
      str += getAllText(c);
    }
  }
  return str;
}

function clickNode(node: any) {
  if (!node || node.disabled) return;
  const reactPropsKey = Object.keys(node).find((k) => k.startsWith('__reactProps'));
  if (reactPropsKey && typeof node[reactPropsKey]?.onClick === 'function') {
    node[reactPropsKey].onClick({ preventDefault: () => {}, stopPropagation: () => {} });
  } else if (typeof node.onclick === 'function') {
    node.onclick({ preventDefault: () => {}, stopPropagation: () => {} });
  }
}

describe('QRScannerModal Integration Tests (V3-23 §5 Y2 연결 테스트 4개)', () => {
  let container: MockElement;
  let root: Root;

  const mockSchedule: Schedule = {
    id: 'sch_mock_01',
    title: '정기 연습',
    category: '정기연습',
    date: '2026-11-24',
    startTime: '19:30',
    endTime: '21:30',
    locationName: '제1연습실',
  };

  const mockProfile: BoundDeviceProfile = {
    memberId: 'mem_01',
    name: '김하은',
    part: '소프라노',
    phoneLast4: '1234',
    boundAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    (globalThis as any).Element = MockElement;
    (globalThis as any).HTMLElement = MockElement;
    (globalThis as any).HTMLVideoElement = MockElement;
    (globalThis as any).HTMLIFrameElement = class extends MockElement {};

    const mockDoc: any = {
      nodeType: 9,
      nodeName: '#document',
      documentElement: new MockElement('HTML'),
      body: new MockElement('BODY'),
      createElement: (tag: string) => new MockElement(tag.toUpperCase()),
      createElementNS: (_: any, tag: string) => new MockElement(tag.toUpperCase()),
      createTextNode: (txt: string) => {
        const el = new MockElement('#text');
        el.nodeType = 3;
        el.textContent = txt;
        (el as any).nodeValue = txt;
        el.ownerDocument = mockDoc;
        return el;
      },
      createComment: () => ({ nodeType: 8, ownerDocument: mockDoc }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      activeElement: null,
      visibilityState: 'visible',
    };

    const mockWin: any = {
      document: mockDoc,
      Element: MockElement,
      HTMLElement: MockElement,
      HTMLVideoElement: MockElement,
      HTMLIFrameElement: MockElement,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      navigator: {
        userAgent: 'test-agent',
        mediaDevices: undefined,
      },
      location: { href: 'http://localhost/' },
    };
    mockDoc.defaultView = mockWin;

    vi.stubGlobal('document', mockDoc);
    vi.stubGlobal('window', mockWin);

    container = new MockElement('DIV');
    root = createRoot(container as any);

    vi.spyOn(sheetsService, 'getMembers').mockReturnValue([
      {
        id: 'mem_01',
        name: '김하은',
        part: '소프라노',
        phoneLast4: '1234',
        role: 'MEMBER',
        status: 'ACTIVE',
        createdAt: '2026-01-01',
        joinedAt: '2026-01-01',
      },
    ]);
    vi.spyOn(sheetsService, 'resolveScheduleLocation').mockReturnValue({
      targetLat: 37.5,
      targetLon: 127.0,
      radiusMeters: 100,
      locationName: '제1연습실',
    });
    vi.spyOn(sheetsService, 'isEmergencyGpsBypassed').mockReturnValue(false);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('1. 처리 중 닫기 -> onClose 안 불림', async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    // addCheckInLog hangs to keep isProcessing = true
    vi.spyOn(sheetsService, 'verifyOnSitePin').mockResolvedValue(undefined);
    vi.spyOn(sheetsService, 'addCheckInLog').mockImplementation(
      () => new Promise(() => {})
    );

    vi.stubGlobal('navigator', {
      userAgent: 'test',
      geolocation: {
        getCurrentPosition: (success: (pos: any) => void) => {
          success({
            coords: { latitude: 37.5, longitude: 127.0, accuracy: 20 },
          });
        },
      },
    });

    await act(async () => {
      root.render(
        <QRScannerModal
          schedule={mockSchedule}
          profile={mockProfile}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      );
    });

    // Switch to PIN tab
    const pinTabBtn = findNodes(
      container,
      (n) => n.tagName === 'BUTTON' && getAllText(n).includes('현장 PIN')
    )[0];
    await act(async () => {
      clickNode(pinTabBtn);
    });

    // Enter 1, 2, 3, 4
    for (const digit of ['1', '2', '3', '4']) {
      const btn = findNodes(
        container,
        (n) => n.tagName === 'BUTTON' && getAllText(n) === digit
      )[0];
      await act(async () => {
        clickNode(btn);
      });
    }

    // Submit PIN
    const submitBtn = findNodes(
      container,
      (n) => n.tagName === 'BUTTON' && getAllText(n).includes('출석하기')
    )[0];
    await act(async () => {
      clickNode(submitBtn);
    });

    // Close button should be disabled / noop during isProcessing
    const closeBtn = findNodes(
      container,
      (n) => n.tagName === 'BUTTON' && n['aria-label'] === '닫기'
    )[0];
    await act(async () => {
      clickNode(closeBtn);
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('2. PIN 출석 저장 중 "현장 출석 PIN 번호가 일치하지 않습니다." -> PIN 탭 WRONG, 실패 화면 아님', async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    vi.spyOn(sheetsService, 'verifyOnSitePin').mockResolvedValue(undefined);
    vi.spyOn(sheetsService, 'addCheckInLog').mockRejectedValue(
      new Error('현장 출석 PIN 번호가 일치하지 않습니다.')
    );

    vi.stubGlobal('navigator', {
      userAgent: 'test',
      geolocation: {
        getCurrentPosition: (success: (pos: any) => void) => {
          success({
            coords: { latitude: 37.5, longitude: 127.0, accuracy: 20 },
          });
        },
      },
    });

    await act(async () => {
      root.render(
        <QRScannerModal
          schedule={mockSchedule}
          profile={mockProfile}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      );
    });

    // Switch to PIN tab
    const pinTabBtn = findNodes(
      container,
      (n) => n.tagName === 'BUTTON' && getAllText(n).includes('현장 PIN')
    )[0];
    await act(async () => {
      clickNode(pinTabBtn);
    });

    // Enter 1, 2, 3, 4
    for (const digit of ['1', '2', '3', '4']) {
      const btn = findNodes(
        container,
        (n) => n.tagName === 'BUTTON' && getAllText(n) === digit
      )[0];
      await act(async () => {
        clickNode(btn);
      });
    }

    // Click submit
    const submitBtn = findNodes(
      container,
      (n) => n.tagName === 'BUTTON' && getAllText(n).includes('출석하기')
    )[0];
    await act(async () => {
      clickNode(submitBtn);
    });

    // Should NOT be failure screen (no ci-result)
    const resultScreens = findNodes(container, (n) => n.className?.includes('ci-result'));
    expect(resultScreens.length).toBe(0);

    // Should display WRONG alert in PIN tab
    const allText = getAllText(container);
    expect(allText).toContain('PIN이 맞지 않아요. 현장 안내의 번호를 다시 확인해 주세요.');
    expect(allText).toContain('다시 입력해 출석하기');
  });

  it('3. 완료 화면 닫기 -> onSuccess 불림', async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    vi.spyOn(sheetsService, 'verifyOnSitePin').mockResolvedValue(undefined);
    vi.spyOn(sheetsService, 'addCheckInLog').mockImplementation(async (log) => log);

    vi.stubGlobal('navigator', {
      userAgent: 'test',
      geolocation: {
        getCurrentPosition: (success: (pos: any) => void) => {
          success({
            coords: { latitude: 37.5, longitude: 127.0, accuracy: 20 },
          });
        },
      },
    });

    await act(async () => {
      root.render(
        <QRScannerModal
          schedule={mockSchedule}
          profile={mockProfile}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      );
    });

    // Switch to PIN tab
    const pinTabBtn = findNodes(
      container,
      (n) => n.tagName === 'BUTTON' && getAllText(n).includes('현장 PIN')
    )[0];
    await act(async () => {
      clickNode(pinTabBtn);
    });

    // Enter 1, 2, 3, 4
    for (const digit of ['1', '2', '3', '4']) {
      const btn = findNodes(
        container,
        (n) => n.tagName === 'BUTTON' && getAllText(n) === digit
      )[0];
      await act(async () => {
        clickNode(btn);
      });
    }

    // Click submit
    const submitBtn = findNodes(
      container,
      (n) => n.tagName === 'BUTTON' && getAllText(n).includes('출석하기')
    )[0];
    await act(async () => {
      clickNode(submitBtn);
    });

    // Completion screen shows "출석했어요"
    expect(getAllText(container)).toContain('출석했어요');

    // Click "확인" button
    const confirmBtn = findNodes(
      container,
      (n) => n.tagName === 'BUTTON' && getAllText(n) === '확인'
    )[0];
    await act(async () => {
      clickNode(confirmBtn);
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess.mock.calls[0][0].scheduleId).toBe('sch_mock_01');
  });

  it('4. 반경 밖 -> 실패 화면 -> 다시 확인하기 -> 위치 줄 "출석할 때 위치를 확인해요", pinError 없음', async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    vi.spyOn(sheetsService, 'verifyOnSitePin').mockResolvedValue(undefined);

    // Location coordinates far outside (distance > 10km)
    vi.stubGlobal('navigator', {
      userAgent: 'test',
      geolocation: {
        getCurrentPosition: (success: (pos: any) => void) => {
          success({
            coords: { latitude: 37.6, longitude: 127.0, accuracy: 20 },
          });
        },
      },
    });

    await act(async () => {
      root.render(
        <QRScannerModal
          schedule={mockSchedule}
          profile={mockProfile}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      );
    });

    // Switch to PIN tab
    const pinTabBtn = findNodes(
      container,
      (n) => n.tagName === 'BUTTON' && getAllText(n).includes('현장 PIN')
    )[0];
    await act(async () => {
      clickNode(pinTabBtn);
    });

    // Enter 1, 2, 3, 4
    for (const digit of ['1', '2', '3', '4']) {
      const btn = findNodes(
        container,
        (n) => n.tagName === 'BUTTON' && getAllText(n) === digit
      )[0];
      await act(async () => {
        clickNode(btn);
      });
    }

    // Submit PIN
    const submitBtn = findNodes(
      container,
      (n) => n.tagName === 'BUTTON' && getAllText(n).includes('출석하기')
    )[0];
    await act(async () => {
      clickNode(submitBtn);
    });

    // Shows OUT_OF_RANGE failure screen
    expect(getAllText(container)).toContain('연습실 밖에서는 출석할 수 없어요');

    // Click "다시 확인하기"
    const retryBtn = findNodes(
      container,
      (n) => n.tagName === 'BUTTON' && getAllText(n).includes('다시 확인하기')
    )[0];
    await act(async () => {
      clickNode(retryBtn);
    });

    // Returns to PIN tab with idle location status line and no pinError
    const allText = getAllText(container);
    expect(allText).toContain('출석할 때 위치를 확인해요');
    expect(allText).not.toContain('연습실 반경');
    expect(allText).not.toContain('PIN이 맞지 않아요');
  });
});
