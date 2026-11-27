import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackendActionResult, RemoteBackend, RemoteSnapshot } from '../../services/backend/types';
import { resetStorage, sheetsService } from '../../services/sheets';
import type { Member } from '../../types/rollbook';
import { CommentReactions } from './CommentReactions';
import { ScheduleComments } from './ScheduleComments';

class MockElement {
  nodeType = 1;
  nodeName: string;
  tagName: string;
  childNodes: MockElement[] = [];
  parentNode: MockElement | null = null;
  style: Record<string, unknown> = {};
  attributes: Record<string, string> = {};
  ownerDocument: unknown;
  textContent = '';
  className = '';
  disabled = false;
  eventListeners: Record<string, Array<(e: unknown) => void>> = {};

  constructor(tag = 'DIV', doc?: unknown) {
    this.nodeName = tag.toUpperCase();
    this.tagName = tag.toUpperCase();
    this.ownerDocument = doc || (globalThis as unknown as { document: unknown })?.document;
  }

  setAttribute(k: string, v: string) {
    this.attributes[k] = String(v);
  }
  getAttribute(k: string) {
    return this.attributes[k] ?? null;
  }
  removeAttribute(k: string) {
    delete this.attributes[k];
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
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }
  removeChild(child: MockElement) {
    const idx = arrIndex(this.childNodes, child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }
  insertBefore(child: MockElement, ref: MockElement | null) {
    if (!ref) return this.appendChild(child);
    const idx = this.childNodes.indexOf(ref);
    if (idx === -1) return this.appendChild(child);
    child.parentNode = this;
    this.childNodes.splice(idx, 0, child);
    return child;
  }
  contains(node: unknown): boolean {
    if (node === this) return true;
    return this.childNodes.some((c) => c.contains(node));
  }
  click() {
    dispatchMockClick(this);
  }
}

function dispatchMockClick(target: MockElement) {
  let stopped = false;
  const evt = {
    type: 'click',
    target,
    currentTarget: target,
    bubbles: true,
    preventDefault: () => {},
    stopPropagation: () => {
      stopped = true;
    },
  };
  let cur: MockElement | null = target;
  while (cur && !stopped) {
    evt.currentTarget = cur;
    const handlers = cur.eventListeners['click'] ?? [];
    for (const h of handlers) h(evt);
    cur = cur.parentNode;
  }
}

function arrIndex(arr: MockElement[], item: MockElement): number {
  return arr.indexOf(item);
}

class MockTextNode {
  nodeType = 3;
  data: string;
  constructor(data: string) {
    this.data = data;
  }
  set nodeValue(v: string) {
    this.data = v;
  }
  get nodeValue() {
    return this.data;
  }
}

function findButtons(node: MockElement): MockElement[] {
  const out: MockElement[] = [];
  if (node.tagName === 'BUTTON') out.push(node);
  for (const child of node.childNodes) {
    if (child instanceof MockElement) out.push(...findButtons(child));
  }
  return out;
}

function collectText(node: MockElement | MockTextNode): string {
  if (node instanceof MockTextNode) return node.data;
  const childrenText = node.childNodes.map((c) => collectText(c)).join('');
  return childrenText || node.textContent;
}

class StubSupabaseBackend implements RemoteBackend {
  public readonly kind = 'supabase' as const;
  public resolveNext: ((res: BackendActionResult) => void) | null = null;
  async requestSnapshot(): Promise<RemoteSnapshot> {
    return {};
  }
  callAction(): Promise<BackendActionResult> {
    return new Promise((resolve) => {
      this.resolveNext = resolve;
    });
  }
}

const member = (id: string, name: string): Member => ({
  id,
  name,
  part: '알토',
  phoneLast4: '1111',
  role: 'MEMBER',
  status: 'ACTIVE',
  createdAt: '2026-01-01 00:00:00',
  joinedAt: '2026-01-01',
  memberStatus: '정단원',
});

describe('CommentReactions & ScheduleComments @mentions (W3)', () => {
  let prevDoc: unknown;
  let prevWin: unknown;
  let prevEl: unknown;
  let prevHtmlEl: unknown;
  let prevIframeEl: unknown;
  let prevActEnv: unknown;
  let prevBackend: RemoteBackend;

  beforeEach(() => {
    resetStorage();
    prevBackend = sheetsService.getBackend();
    prevDoc = (globalThis as { document?: unknown }).document;
    prevWin = (globalThis as { window?: unknown }).window;
    prevEl = (globalThis as { Element?: unknown }).Element;
    prevHtmlEl = (globalThis as { HTMLElement?: unknown }).HTMLElement;
    prevIframeEl = (globalThis as { HTMLIFrameElement?: unknown }).HTMLIFrameElement;
    prevActEnv = (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: unknown }).IS_REACT_ACT_ENVIRONMENT;

    const doc = {
      createElement: (tag: string) => new MockElement(tag),
      createElementNS: (_ns: string, tag: string) => new MockElement(tag),
      createTextNode: (data: string) => new MockTextNode(data),
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    (globalThis as unknown as { document: unknown }).document = doc;
    (globalThis as unknown as { window: unknown }).window = globalThis;
    (globalThis as unknown as { Element: unknown }).Element = MockElement;
    (globalThis as unknown as { HTMLElement: unknown }).HTMLElement = MockElement;
    (globalThis as unknown as { HTMLIFrameElement: unknown }).HTMLIFrameElement = class {};
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    sheetsService.setBackend(prevBackend);
    (globalThis as unknown as { document?: unknown }).document = prevDoc;
    (globalThis as unknown as { window?: unknown }).window = prevWin;
    (globalThis as unknown as { Element?: unknown }).Element = prevEl;
    (globalThis as unknown as { HTMLElement?: unknown }).HTMLElement = prevHtmlEl;
    (globalThis as unknown as { HTMLIFrameElement?: unknown }).HTMLIFrameElement = prevIframeEl;
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: unknown }).IS_REACT_ACT_ENVIRONMENT = prevActEnv;
    vi.restoreAllMocks();
  });

  it('optimistically adds reaction on pick and reverts with error message on server failure', async () => {
    const backend = new StubSupabaseBackend();
    sheetsService.setBackend(backend);

    const container = new MockElement('DIV');
    const root = createRoot(container as unknown as Element);

    const Wrapper: React.FC = () => {
      const [, setTick] = React.useState(0);
      React.useEffect(() => sheetsService.subscribeSync(() => setTick((t) => t + 1)), []);
      return (
        <CommentReactions
          commentId="c1"
          scheduleId="s1"
          canonicalMemberId="m1"
          reactions={sheetsService.getCommentReactions('c1')}
          onOpenReactors={() => {}}
        />
      );
    };

    await act(async () => {
      root.render(<Wrapper />);
    });

    const addBtn = findButtons(container).find((b) => b.getAttribute('aria-label') === '반응 남기기');
    expect(addBtn).toBeDefined();

    await act(async () => {
      addBtn!.click();
    });

    const thumbsPick = findButtons(container).find((b) => b.getAttribute('aria-label') === '👍 반응');
    expect(thumbsPick).toBeDefined();

    await act(async () => {
      thumbsPick!.click();
    });

    // Optimistic chip appears immediately
    expect(sheetsService.getCommentReactions('c1').get('👍')?.memberAt.has('m1')).toBe(true);
    expect(collectText(container)).toContain('👍1');

    // Simulate server failure -> reverts and shows error
    await act(async () => {
      backend.resolveNext?.({ success: false, message: 'fail' });
    });

    expect(sheetsService.getCommentReactions('c1').get('👍')).toBeUndefined();
    expect(collectText(container)).toContain('반응을 남기지 못했어요. 다시 시도해 주세요.');

    await act(async () => {
      root.unmount();
    });
  });

  it('highlights @mentions in ScheduleComments text', () => {
    const m1 = member('m1', '이하은');
    const m2 = member('m2', '민지');
    sheetsService.seedTestData({
      members: [m1, m2],
      comments: [
        {
          id: 'c1',
          scheduleId: 's1',
          memberId: 'm2',
          memberName: '민지',
          part: '알토',
          action: 'CREATE',
          text: '@이하은 악보 챙겨요',
          timestamp: '2026-11-27 10:00:00',
          mentionMemberIds: ['m1'],
        },
      ],
    });
    const html = renderToString(<ScheduleComments scheduleId="s1" author={m1} />).replace(/<!-- -->/g, '');
    expect(html).toContain('<span class="sc-mention">@이하은</span>');
  });
});
