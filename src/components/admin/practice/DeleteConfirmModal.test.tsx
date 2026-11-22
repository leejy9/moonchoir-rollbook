import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { DeleteConfirmModal } from './DeleteConfirmModal';

describe('DeleteConfirmModal (J4)', () => {
  it('renders title, danger description, and buttons with correct styling', () => {
    const html = renderToString(
      <DeleteConfirmModal
        title="아리랑"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(html).toContain('아리랑');
    expect(html).toContain('을(를) 삭제할까요?');
    expect(html).toContain('파일도 함께 지워지고 되돌릴 수 없어요.');
    expect(html).toContain('취소');
    expect(html).toContain('삭제');
    expect(html).toContain('var(--status-danger)');
  });

  it('renders rejection error message when provided', () => {
    const html = renderToString(
      <DeleteConfirmModal
        title="아리랑"
        errorMessage="재생 기록이 있어 삭제할 수 없어요. 보관해 주세요."
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(html).toContain('재생 기록이 있어 삭제할 수 없어요. 보관해 주세요.');
  });

  it('contains zero emojis in UI strings', () => {
    const html = renderToString(
      <DeleteConfirmModal
        title="테스트 곡"
        errorMessage="재생 기록이 있어 삭제할 수 없어요. 보관해 주세요."
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const emojiRegex = /\p{Extended_Pictographic}/u;
    expect(emojiRegex.test(html)).toBe(false);
  });
});
