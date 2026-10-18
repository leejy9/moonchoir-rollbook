import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ManualOverrideModal } from './ManualOverrideModal';

describe('ManualOverrideModal Component', () => {
  it('returns null when overrideTarget is null', () => {
    const html = renderToString(
      <ManualOverrideModal
        overrideTarget={null}
        overrideReason=""
        setOverrideReason={vi.fn()}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(html).toBe('');
  });

  it('renders modal content when overrideTarget is present', () => {
    const html = renderToString(
      <ManualOverrideModal
        overrideTarget={{ id: 'mem-1', name: '홍길동', part: '테너' }}
        overrideReason="배터리 방전"
        setOverrideReason={vi.fn()}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(html).toContain('홍길동');
    expect(html).toContain('님 출석 인정');
    expect(html).toContain('감사 로그 보존형 수동 보정');
    expect(html).toContain('MANUAL_BY_ADMIN');
    expect(html).toContain('배터리 방전');
  });
});
