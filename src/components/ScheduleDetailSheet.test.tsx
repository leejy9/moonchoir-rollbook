import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { ScheduleDetailSheet } from './ScheduleDetailSheet';
import type { Member, Schedule } from '../types/rollbook';

class MockElement {
  nodeType = 1;
  nodeName: string;
  tagName: string;
  childNodes: any[] = [];
  style: any = {};
  ownerDocument: any;
  textContent = '';

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
  focus() {}
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
  const reactPropsKey = Object.keys(node).find((k) => k.startsWith('__reactProps'));
  if (reactPropsKey && typeof node[reactPropsKey]?.onClick === 'function') {
    node[reactPropsKey].onClick({ preventDefault: () => {}, stopPropagation: () => {} });
  } else if (typeof node.onclick === 'function') {
    node.onclick({ preventDefault: () => {}, stopPropagation: () => {} });
  }
}

describe('ScheduleDetailSheet Component', () => {
  const mockMember: Member = {
    id: 'mem_01',
    name: '김하은',
    part: '소프라노',
    phoneLast4: '1234',
    role: 'MEMBER',
    status: 'ACTIVE',
    createdAt: '2026-01-01',
    joinedAt: '2026-01-01',
  };

  const mockSchedules: Schedule[] = [
    {
      id: 'sch_multi_1',
      title: '파트 연습',
      category: '추가연습',
      date: '2026-11-20',
      startTime: '17:00',
      endTime: '18:30',
      locationName: '문콰이어 제1연습실',
      targetLat: 37.5665,
      targetLon: 126.978,
    },
    {
      id: 'sch_multi_2',
      title: '정기 연습',
      category: '정기연습',
      date: '2026-11-20',
      startTime: '19:30',
      endTime: '21:30',
      locationName: '문콰이어 제1연습실',
      targetLat: 37.5665,
      targetLon: 126.978,
    },
  ];

  it('renders single schedule directly with dialog role and aria attributes', () => {
    const single = [mockSchedules[0]];
    const html = renderToString(
      <ScheduleDetailSheet
        isOpen={true}
        date="2026-11-20"
        schedules={single}
        member={mockMember}
        onClose={() => {}}
      />
    ).replace(/<!-- -->/g, '');

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('파트 연습');
    expect(html).toContain('17:00 ~ 18:30');
    expect(html).toContain('문콰이어 제1연습실');
  });

  it('renders multi-schedule picker list when 2+ schedules exist without scheduleId', () => {
    const html = renderToString(
      <ScheduleDetailSheet
        isOpen={true}
        date="2026-11-20"
        schedules={mockSchedules}
        member={mockMember}
        onClose={() => {}}
      />
    ).replace(/<!-- -->/g, '');

    expect(html).toContain('해당 일자에 2개의 일정이 있습니다');
    expect(html).toContain('파트 연습');
    expect(html).toContain('정기 연습');
  });

  it('renders specific schedule directly when scheduleId is provided', () => {
    const html = renderToString(
      <ScheduleDetailSheet
        isOpen={true}
        date="2026-11-20"
        scheduleId="sch_multi_2"
        schedules={mockSchedules}
        member={mockMember}
        onClose={() => {}}
      />
    ).replace(/<!-- -->/g, '');

    expect(html).toContain('정기 연습');
    expect(html).toContain('19:30 ~ 21:30');
    expect(html).not.toContain('해당 일자에 2개의 일정이 있습니다');
  });

  it('displays "볼 수 없는 일정입니다" when unknown scheduleId is passed', () => {
    const html = renderToString(
      <ScheduleDetailSheet
        isOpen={true}
        date="2026-11-20"
        scheduleId="non_existent_id"
        schedules={mockSchedules}
        member={mockMember}
        onClose={() => {}}
      />
    );

    expect(html).toContain('볼 수 없는 일정입니다');
  });

  it('renders nothing when isOpen is false', () => {
    const html = renderToString(
      <ScheduleDetailSheet
        isOpen={false}
        date="2026-11-20"
        schedules={mockSchedules}
        member={mockMember}
        onClose={() => {}}
      />
    );

    expect(html).toBe('');
  });

  it('has close button with >= 44px min touch target and aria-label', () => {
    const html = renderToString(
      <ScheduleDetailSheet
        isOpen={true}
        date="2026-11-20"
        schedules={mockSchedules}
        member={mockMember}
        onClose={() => {}}
      />
    );

    expect(html).toMatch(/aria-label="닫기"[^>]*style="[^"]*min-width:44px[^"]*min-height:44px/);
  });

  it('preserves single schedule direct render across new array reference rerenders', () => {
    const single = [mockSchedules[0]];
    const html1 = renderToString(
      <ScheduleDetailSheet
        isOpen={true}
        date="2026-11-20"
        schedules={single}
        member={mockMember}
        onClose={() => {}}
      />
    );
    expect(html1).toContain('파트 연습');

    // Rerender with a completely fresh array instance (e.g. from Realtime)
    const newRef = [...single];
    const html2 = renderToString(
      <ScheduleDetailSheet
        isOpen={true}
        date="2026-11-20"
        schedules={newRef}
        member={mockMember}
        onClose={() => {}}
      />
    );
    expect(html2).toContain('파트 연습');
  });

  describe('interactive multi-schedule selection preservation across rerenders (N3)', () => {
    let container: MockElement;
    let root: any;

    beforeEach(() => {
      (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
      (globalThis as any).Element = MockElement;
      (globalThis as any).HTMLElement = MockElement;
      (globalThis as any).HTMLIFrameElement = class extends MockElement {};

      const storageMap = new Map<string, string>();
      vi.stubGlobal('localStorage', {
        getItem: (key: string) => storageMap.get(key) ?? null,
        setItem: (key: string, val: string) => storageMap.set(key, val),
        removeItem: (key: string) => storageMap.delete(key),
        clear: () => storageMap.clear(),
      });

      const mockDoc = {
        nodeType: 9,
        nodeName: '#document',
        documentElement: new MockElement('HTML'),
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

      const mockWin = {
        document: mockDoc,
        Element: MockElement,
        HTMLElement: MockElement,
        HTMLIFrameElement: MockElement,
        matchMedia: vi.fn(() => ({
          matches: false,
          addListener: vi.fn(),
          removeListener: vi.fn(),
        })),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        setTimeout: globalThis.setTimeout.bind(globalThis),
        clearTimeout: globalThis.clearTimeout.bind(globalThis),
      };
      (mockDoc as any).defaultView = mockWin;

      vi.stubGlobal('document', mockDoc);
      vi.stubGlobal('window', mockWin);

      container = new MockElement('DIV');
      root = createRoot(container as any);
    });

    afterEach(() => {
      act(() => {
        root?.unmount();
      });
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it('keeps the user-picked schedule when schedules are re-sent as a new array', async () => {
      // 1. 같은 날짜에 일정 2개를 넘겨 렌더 → 목록이 보임
      await act(async () => {
        root.render(
          <ScheduleDetailSheet
            isOpen={true}
            date="2026-11-20"
            schedules={mockSchedules}
            member={mockMember}
            onClose={() => {}}
          />
        );
      });

      let text = getAllText(container);
      expect(text).toContain('해당 일자에 2개의 일정이 있습니다');
      expect(text).toContain('파트 연습');
      expect(text).toContain('정기 연습');

      // 2. 두 번째 일정 버튼 클릭 → 두 번째 일정 상세가 보임
      const buttons = findNodes(container, (n) => n.tagName === 'BUTTON');
      const secondScheduleBtn = buttons.find((btn) => getAllText(btn).includes('정기 연습'));
      expect(secondScheduleBtn).toBeDefined();

      await act(async () => {
        clickNode(secondScheduleBtn);
      });

      text = getAllText(container);
      expect(text).toContain('정기 연습');
      expect(text).toContain('19:30 ~ 21:30');
      expect(text).not.toContain('해당 일자에 2개의 일정이 있습니다');

      // 3. 같은 내용의 새 배열([...schedules])로 다시 렌더 → 여전히 두 번째 일정 상세가 보임
      const newArrayRef = [...mockSchedules];
      await act(async () => {
        root.render(
          <ScheduleDetailSheet
            isOpen={true}
            date="2026-11-20"
            schedules={newArrayRef}
            member={mockMember}
            onClose={() => {}}
          />
        );
      });

      text = getAllText(container);
      expect(text).toContain('정기 연습');
      expect(text).toContain('19:30 ~ 21:30');
      expect(text).not.toContain('해당 일자에 2개의 일정이 있습니다');
    });

    it('returns to the list when the picked schedule disappears', async () => {
      // 1. 일정 2개로 렌더 후 두 번째 일정 선택
      await act(async () => {
        root.render(
          <ScheduleDetailSheet
            isOpen={true}
            date="2026-11-20"
            schedules={mockSchedules}
            member={mockMember}
            onClose={() => {}}
          />
        );
      });

      const buttons = findNodes(container, (n) => n.tagName === 'BUTTON');
      const secondScheduleBtn = buttons.find((btn) => getAllText(btn).includes('정기 연습'));
      expect(secondScheduleBtn).toBeDefined();

      await act(async () => {
        clickNode(secondScheduleBtn);
      });

      let text = getAllText(container);
      expect(text).toContain('정기 연습');

      // 2. 두 번째를 뺀 배열(일정 1개만 남음)로 다시 렌더 → 남은 1개의 상세가 보임(일정이 1개면 바로 상세라는 기존 규칙)
      const singleRemaining = [mockSchedules[0]];
      await act(async () => {
        root.render(
          <ScheduleDetailSheet
            isOpen={true}
            date="2026-11-20"
            schedules={singleRemaining}
            member={mockMember}
            onClose={() => {}}
          />
        );
      });

      text = getAllText(container);
      expect(text).toContain('파트 연습');
      expect(text).toContain('17:00 ~ 18:30');
      expect(text).not.toContain('정기 연습');
      expect(text).not.toContain('해당 일자에 2개의 일정이 있습니다');
    });
  });
});
