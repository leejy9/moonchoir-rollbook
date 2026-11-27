import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { StickerBoardSheet } from './StickerBoardSheet';
import { ProfileStickersPreviewCard } from './ProfileStickersPreviewCard';

class MockElement {
  nodeType: number;
  nodeName: string;
  tagName: string;
  childNodes: MockElement[] = [];
  parentNode: MockElement | null = null;
  ownerDocument: MockDocument;
  style = { setProperty: vi.fn() };
  attributes: Record<string, string> = {};
  eventListeners: Record<string, Array<(event: unknown) => void>> = {};
  textContent = '';
  nodeValue: string | null = null;

  constructor(tag: string, ownerDocument: MockDocument, nodeType = 1) {
    this.nodeName = tag;
    this.tagName = tag;
    this.ownerDocument = ownerDocument;
    this.nodeType = nodeType;
  }

  appendChild(child: MockElement): MockElement {
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  removeChild(child: MockElement): MockElement {
    const index = this.childNodes.indexOf(child);
    if (index >= 0) this.childNodes.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  insertBefore(child: MockElement, before: MockElement | null): MockElement {
    child.parentNode = this;
    const index = before ? this.childNodes.indexOf(before) : -1;
    if (index < 0) this.childNodes.push(child);
    else this.childNodes.splice(index, 0, child);
    return child;
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.eventListeners[type] ??= [];
    this.eventListeners[type].push(listener);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.eventListeners[type] = (this.eventListeners[type] || []).filter((item) => item !== listener);
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  removeAttribute(name: string): void {
    delete this.attributes[name];
  }

  querySelectorAll(): MockElement[] {
    return findNodes(this, (node) => node.tagName === 'BUTTON');
  }

  contains(target: MockElement | null): boolean {
    if (target === this) return true;
    return this.childNodes.some((child) => child.contains(target));
  }

  focus(): void {
    this.ownerDocument.activeElement = this;
  }
}

type MockDocument = {
  activeElement: MockElement | null;
  createElement: (tag: string) => MockElement;
  createElementNS: (namespace: string | null, tag: string) => MockElement;
  createTextNode: (text: string) => MockElement;
  createComment: (text: string) => MockElement;
  addEventListener: (type: string, listener: (event: unknown) => void) => void;
  removeEventListener: (type: string, listener: (event: unknown) => void) => void;
  documentElement: MockElement;
  body: MockElement;
  head: MockElement;
  defaultView?: unknown;
};

function findNodes(root: MockElement, predicate: (node: MockElement) => boolean): MockElement[] {
  const result = predicate(root) ? [root] : [];
  for (const child of root.childNodes) result.push(...findNodes(child, predicate));
  return result;
}

function reactProps(node: MockElement): Record<string, unknown> {
  const key = Object.keys(node).find((candidate) => candidate.startsWith('__reactProps'));
  if (!key) throw new Error('React props not found');
  return (node as unknown as Record<string, Record<string, unknown>>)[key];
}

function findByClass(root: MockElement, className: string): MockElement | null {
  return findNodes(root, (node) => {
    try {
      return reactProps(node).className === className;
    } catch {
      return false;
    }
  })[0] ?? null;
}

function ModalHarness({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ProfileStickersPreviewCard
        stickers={[]}
        isStaff={false}
        unseenCount={0}
        onOpen={(trigger) => {
          trigger.focus();
          setOpen(true);
        }}
      />
      {open && (
        <StickerBoardSheet
          stickers={[]}
          isStaff={false}
          unseenStickerIds={new Set()}
          onClose={() => {
            onClose();
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

describe('StickerBoardSheet focus management', () => {
  let root: Root | null = null;
  let container: MockElement;
  let trigger: MockElement | null = null;
  let mockDocument: MockDocument;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const document: MockDocument = {
      activeElement: null as MockElement | null,
      createElement: (tag: string): MockElement => new MockElement(tag.toUpperCase(), document),
      createElementNS: (_namespace: string | null, tag: string) => new MockElement(tag.toUpperCase(), document),
      createTextNode: (text: string) => {
        const node = new MockElement('#text', document, 3);
        node.nodeValue = text;
        return node;
      },
      createComment: (text: string) => {
        const node = new MockElement('#comment', document, 8);
        node.nodeValue = text;
        return node;
      },
      addEventListener: () => {},
      removeEventListener: () => {},
      documentElement: null as unknown as MockElement,
      body: null as unknown as MockElement,
      head: null as unknown as MockElement,
    };
    document.documentElement = new MockElement('HTML', document);
    document.body = new MockElement('BODY', document);
    document.head = new MockElement('HEAD', document);
    mockDocument = document;

    const window = {
      document,
      Element: MockElement,
      HTMLElement: MockElement,
      HTMLIFrameElement: MockElement,
      Node: MockElement,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    document.defaultView = window;
    vi.stubGlobal('document', document);
    vi.stubGlobal('window', window);

    container = new MockElement('DIV', document);
    trigger = null;
    root = createRoot(container as unknown as Element);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
      root = null;
    }
    vi.unstubAllGlobals();
  });

  it('closes only on the backdrop and restores focus once', async () => {
    const onClose = vi.fn();
    await act(async () => {
      root?.render(<ModalHarness onClose={onClose} />);
    });
    const opener = findByClass(container, 'profile-stickers-card');
    expect(opener).not.toBeNull();
    if (!opener) throw new Error('Sticker preview button was not rendered');
    trigger = opener;
    const open = reactProps(opener).onClick as ((event: { currentTarget: HTMLButtonElement }) => void);
    await act(async () => open({ currentTarget: opener as unknown as HTMLButtonElement }));

    const overlay = findByClass(container, 'sticker-modal-overlay');
    const dialog = findByClass(container, 'sticker-modal-container');
    expect(overlay).not.toBeNull();
    expect(dialog).not.toBeNull();
    if (!overlay || !dialog) throw new Error('Sticker modal was not rendered');
    const onOverlayClick = reactProps(overlay).onClick as ((event: unknown) => void) | undefined;
    expect(onOverlayClick).toBeTypeOf('function');

    await act(async () => onOverlayClick?.({ target: dialog, currentTarget: overlay }));
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => onOverlayClick?.({ target: overlay, currentTarget: overlay }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(mockDocument.activeElement).toBe(trigger);
  });

  it('returns focus after the close button is activated once', async () => {
    const onClose = vi.fn();
    await act(async () => {
      root?.render(<ModalHarness onClose={onClose} />);
    });
    const opener = findByClass(container, 'profile-stickers-card');
    if (!opener) throw new Error('Sticker preview button was not rendered');
    trigger = opener;
    const open = reactProps(opener).onClick as ((event: { currentTarget: HTMLButtonElement }) => void);
    await act(async () => open({ currentTarget: opener as unknown as HTMLButtonElement }));

    const closeButton = findNodes(container, (node) => {
      if (node.tagName !== 'BUTTON') return false;
      try {
        return reactProps(node)['aria-label'] === '닫기';
      } catch {
        return false;
      }
    })[0];
    expect(closeButton).toBeDefined();
    const close = reactProps(closeButton).onClick as (() => void) | undefined;
    await act(async () => close?.());

    expect(onClose).toHaveBeenCalledOnce();
    expect(mockDocument.activeElement).toBe(opener);
  });

  it('focuses inside, traps Tab, and restores focus after Escape closes the modal', async () => {
    const onClose = vi.fn();
    await act(async () => {
      root?.render(<ModalHarness onClose={onClose} />);
    });
    const opener = findByClass(container, 'profile-stickers-card');
    expect(opener).not.toBeNull();
    if (!opener) throw new Error('Sticker preview button was not rendered');
    trigger = opener;
    const open = reactProps(opener).onClick as ((event: { currentTarget: HTMLButtonElement }) => void);
    await act(async () => open({ currentTarget: opener as unknown as HTMLButtonElement }));

    const closeButton = findNodes(container, (node) => {
      if (node.tagName !== 'BUTTON') return false;
      try {
        return reactProps(node)['aria-label'] === '닫기';
      } catch {
        return false;
      }
    })[0];
    expect(closeButton).toBeDefined();
    expect(mockDocument.activeElement).toBe(closeButton);

    const dialog = findByClass(container, 'sticker-modal-container');
    expect(dialog).not.toBeNull();
    if (!dialog) throw new Error('Sticker modal dialog was not rendered');
    const keyDown = reactProps(dialog).onKeyDown as ((event: unknown) => void) | undefined;
    expect(keyDown).toBeTypeOf('function');

    const tabEvent = { key: 'Tab', shiftKey: false, preventDefault: vi.fn() };
    keyDown?.(tabEvent);
    expect(tabEvent.preventDefault).toHaveBeenCalledOnce();
    expect(mockDocument.activeElement).toBe(closeButton);

    opener.focus();
    const shiftTabEvent = { key: 'Tab', shiftKey: true, preventDefault: vi.fn() };
    keyDown?.(shiftTabEvent);
    expect(shiftTabEvent.preventDefault).toHaveBeenCalledOnce();
    expect(mockDocument.activeElement).toBe(closeButton);

    await act(async () => {
      keyDown?.({ key: 'Escape', shiftKey: false, preventDefault: vi.fn() });
    });
    expect(onClose).toHaveBeenCalledOnce();
    expect(mockDocument.activeElement).toBe(trigger);
  });
});
