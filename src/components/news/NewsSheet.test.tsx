import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seenStateStore } from '../../services/seenStateStore';
import type { NewsItem } from '../../types/rollbook';
import { NewsSheet } from './NewsSheet';

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
    const idx = this.childNodes.indexOf(child);
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
    for (const h of cur.eventListeners['click'] ?? []) h(evt);
    cur = cur.parentNode;
  }
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

describe('NewsSheet (W4)', () => {
  let prevDoc: unknown;
  let prevWin: unknown;
  let prevEl: unknown;
  let prevHtmlEl: unknown;
  let prevIframeEl: unknown;
  let prevActEnv: unknown;

  beforeEach(() => {
    prevDoc = (globalThis as { document?: unknown }).document;
    prevWin = (globalThis as { window?: unknown }).window;
    prevEl = (globalThis as { Element?: unknown }).Element;
    prevHtmlEl = (globalThis as { HTMLElement?: unknown }).HTMLElement;
    prevIframeEl = (globalThis as { HTMLIFrameElement?: unknown }).HTMLIFrameElement;
    prevActEnv = (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: unknown }).IS_REACT_ACT_ENVIRONMENT;

    (globalThis as unknown as { document: unknown }).document = {
      createElement: (tag: string) => new MockElement(tag),
      createElementNS: (_ns: string, tag: string) => new MockElement(tag),
      createTextNode: (data: string) => new MockTextNode(data),
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    (globalThis as unknown as { window: unknown }).window = globalThis;
    (globalThis as unknown as { Element: unknown }).Element = MockElement;
    (globalThis as unknown as { HTMLElement: unknown }).HTMLElement = MockElement;
    (globalThis as unknown as { HTMLIFrameElement: unknown }).HTMLIFrameElement = class {};
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    (globalThis as unknown as { document?: unknown }).document = prevDoc;
    (globalThis as unknown as { window?: unknown }).window = prevWin;
    (globalThis as unknown as { Element?: unknown }).Element = prevEl;
    (globalThis as unknown as { HTMLElement?: unknown }).HTMLElement = prevHtmlEl;
    (globalThis as unknown as { HTMLIFrameElement?: unknown }).HTMLIFrameElement = prevIframeEl;
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: unknown }).IS_REACT_ACT_ENVIRONMENT = prevActEnv;
    vi.restoreAllMocks();
  });

  it('renders empty state when unread and read are empty', () => {
    const html = renderToString(
      <NewsSheet
        canonicalId="m1"
        unread={[]}
        read={[]}
        stickers={[]}
        windowDays={14}
        onShowMore={() => {}}
        onSelectItem={() => {}}
        onClose={() => {}}
      />
    ).replace(/<!-- -->/g, '');
    expect(html).toContain('새 소식이 없어요');
  });

  it('freezes unread list on open and calls markSeen with max upTo & vote on close', async () => {
    const markSpy = vi.spyOn(seenStateStore, 'markSeen').mockResolvedValue(true);
    const onClose = vi.fn();

    const item1: NewsItem = {
      key: 'reaction:c1',
      kind: 'reaction',
      at: Date.parse('2026-11-27T02:00:00.000Z'),
      title: '도윤 님이 내 댓글에 👏 반응했어요',
      sub: 'sub',
      target: { type: 'schedule', scheduleId: 's1' },
      scheduleId: 's1',
      emoji: '👏',
    };
    const item2: NewsItem = {
      key: 'unvoted:s2',
      kind: 'unvoted',
      at: Date.parse('2026-11-25T05:00:00.000Z'),
      title: '정기연습 투표를 아직 안 했어요',
      sub: '마감',
      target: { type: 'rsvp', scheduleId: 's2' },
      scheduleId: 's2',
    };
    const laterItem: NewsItem = {
      key: 'mention:c9',
      kind: 'mention',
      at: Date.parse('2026-11-27T05:00:00.000Z'),
      title: '민지 님이 댓글에서 나를 언급했어요',
      sub: 'sub',
      target: { type: 'schedule', scheduleId: 's3' },
      scheduleId: 's3',
    };

    const container = new MockElement('DIV');
    const root = createRoot(container as unknown as Element);

    await act(async () => {
      root.render(
        <NewsSheet
          canonicalId="m1"
          unread={[item1, item2]}
          read={[]}
          stickers={[]}
          windowDays={14}
          onShowMore={() => {}}
          onSelectItem={() => {}}
          onClose={onClose}
        />
      );
    });

    // Arrives while open — should NOT be included in markSeen on close
    await act(async () => {
      root.render(
        <NewsSheet
          canonicalId="m1"
          unread={[laterItem, item1, item2]}
          read={[]}
          stickers={[]}
          windowDays={14}
          onShowMore={() => {}}
          onSelectItem={() => {}}
          onClose={onClose}
        />
      );
    });

    const closeBtn = findButtons(container).find((b) => b.getAttribute('aria-label') === '닫기');
    expect(closeBtn).toBeDefined();

    await act(async () => {
      closeBtn!.click();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(markSpy).toHaveBeenCalledWith('m1', [
      { kind: 'news', scope: '', upTo: '2026-11-27T02:00:00.000Z' },
      { kind: 'vote', scope: 's2' },
    ]);

    await act(async () => {
      root.unmount();
    });
  });
});
