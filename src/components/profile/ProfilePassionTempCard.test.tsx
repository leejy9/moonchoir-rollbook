import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ProfilePassionTempCard } from './ProfilePassionTempCard';
import type { PassionTemperatureResult } from '../../utils/passionTemperature';

const createMockResult = (delta: number, value = 36.5): PassionTemperatureResult => ({
  value,
  weeklyDelta: delta,
  windowSize: 10,
  groups: [],
});

describe('ProfilePassionTempCard (V3-20 R3, R10)', () => {
  it('변화가 0이면 변화 알약 DOM이 존재하지 않는다', () => {
    const result = createMockResult(0);
    const html = renderToString(<ProfilePassionTempCard result={result} onOpen={vi.fn()} />);

    expect(html).toContain('36.5°C');
    expect(html).not.toContain('profile-temp-delta');
    expect(html).not.toContain('0.0');
  });

  it('변화가 양수이면 ▲ 알약을 렌더링한다', () => {
    const result = createMockResult(0.1, 36.6);
    const html = renderToString(<ProfilePassionTempCard result={result} onOpen={vi.fn()} />);

    expect(html).toContain('profile-temp-delta');
    expect(html).toContain('up');
    expect(html).toContain('▲ 0.1');
  });

  it('변화가 음수이면 ▼ 알약을 렌더링한다', () => {
    const result = createMockResult(-0.2, 36.3);
    const html = renderToString(<ProfilePassionTempCard result={result} onOpen={vi.fn()} />);

    expect(html).toContain('profile-temp-delta');
    expect(html).toContain('down');
    expect(html).toContain('▼ 0.2');
  });
});
