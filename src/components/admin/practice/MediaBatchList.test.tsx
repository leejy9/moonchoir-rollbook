import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MediaBatchList } from './MediaBatchList';
import type { BatchItem, BatchRejectedItem } from '../../../services/media/uploadBatch';

describe('MediaBatchList Component', () => {
  it('renders "20개까지 올릴 수 있어요" warning when truncated is true', () => {
    const html = renderToString(
      <MediaBatchList
        items={[]}
        rejected={[]}
        truncated={true}
        onUpdateTitle={vi.fn()}
        onRemoveItem={vi.fn()}
        onRemoveRejected={vi.fn()}
      />
    );

    expect(html).toContain('20개까지 올릴 수 있어요');
  });

  it('does not render truncation warning when truncated is false', () => {
    const html = renderToString(
      <MediaBatchList
        items={[]}
        rejected={[]}
        truncated={false}
        onUpdateTitle={vi.fn()}
        onRemoveItem={vi.fn()}
        onRemoveRejected={vi.fn()}
      />
    );

    expect(html).not.toContain('20개까지 올릴 수 있어요');
  });

  it('renders accepted items with titles, file sizes, and 44px remove buttons', () => {
    const items: BatchItem[] = [
      { file: new File(['a'.repeat(1024 * 1024)], 'soprano.m4a', { type: 'audio/mp4' }), title: 'soprano' },
      { file: new File(['b'.repeat(2 * 1024 * 1024)], 'alto.wav', { type: 'audio/wav' }), title: 'alto' },
    ];

    const html = renderToString(
      <MediaBatchList
        items={items}
        rejected={[]}
        truncated={false}
        onUpdateTitle={vi.fn()}
        onRemoveItem={vi.fn()}
        onRemoveRejected={vi.fn()}
      />
    );

    expect(html).toContain('soprano');
    expect(html).toContain('alto');
    expect(html).toContain('1.0 MB');
    expect(html).toContain('2.0 MB');
    expect(html).toContain('min-width:44px');
    expect(html).toContain('min-height:44px');
    expect(html).toContain('aria-label="항목 제거"');

    // Zero emojis check
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(emojiRegex.test(html)).toBe(false);
  });

  it('renders rejected items with "제외" badge and 44px remove buttons', () => {
    const rejected: BatchRejectedItem[] = [
      { file: new File(['c'.repeat(500)], 'bad.exe', { type: 'application/octet-stream' }), reason: 'type' },
    ];

    const html = renderToString(
      <MediaBatchList
        items={[]}
        rejected={rejected}
        truncated={false}
        onUpdateTitle={vi.fn()}
        onRemoveItem={vi.fn()}
        onRemoveRejected={vi.fn()}
      />
    );

    expect(html).toContain('bad.exe');
    expect(html).toContain('제외');
    expect(html).toContain('aria-label="제외 항목 제거"');
    expect(html).toContain('min-width:44px');
    expect(html).toContain('min-height:44px');
  });
});
