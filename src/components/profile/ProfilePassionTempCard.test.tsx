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

function getStylePercent(html: string, className: string, property: string): number {
  const match = html.match(new RegExp(`class="${className}" style="${property}:([^%]+)%"`));
  if (!match) throw new Error(`Missing ${property} percentage for ${className}`);
  return Number(match[1]);
}

describe('ProfilePassionTempCard (V3-20 R3, R10)', () => {
  it('변화가 0이면 변화 알약 DOM이 존재하지 않는다', () => {
    const result = createMockResult(0);
    const html = renderToString(<ProfilePassionTempCard result={result} onOpen={vi.fn()} />);

    expect(html).toContain('36.5°C');
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-valuenow="36.5"');
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

  it('aligns the 36.5°C baseline tick and indicator at 31.25%', () => {
    const html = renderToString(
      <ProfilePassionTempCard result={createMockResult(0, 36.5)} onOpen={vi.fn()} />
    );

    expect(getStylePercent(html, 'profile-temp-bar', 'width')).toBeCloseTo(31.25);
    expect(getStylePercent(html, 'profile-temp-tick', 'left')).toBeCloseTo(31.25);
    expect(getStylePercent(html, 'profile-temp-indicator', 'left')).toBeCloseTo(31.25);
    expect(html).toContain('aria-valuemin="34"');
    expect(html).toContain('aria-valuemax="42"');
  });

  it('maps 38.6°C to 57.5% and clamps the display at both scale endpoints', () => {
    const middleHtml = renderToString(
      <ProfilePassionTempCard result={createMockResult(0, 38.6)} onOpen={vi.fn()} />
    );
    expect(getStylePercent(middleHtml, 'profile-temp-bar', 'width')).toBeCloseTo(57.5);
    expect(getStylePercent(middleHtml, 'profile-temp-indicator', 'left')).toBeCloseTo(57.5);

    const lowHtml = renderToString(
      <ProfilePassionTempCard result={createMockResult(0, 34)} onOpen={vi.fn()} />
    );
    expect(getStylePercent(lowHtml, 'profile-temp-bar', 'width')).toBe(0);
    expect(getStylePercent(lowHtml, 'profile-temp-indicator', 'left')).toBe(0);

    const highHtml = renderToString(
      <ProfilePassionTempCard result={createMockResult(0, 42)} onOpen={vi.fn()} />
    );
    expect(getStylePercent(highHtml, 'profile-temp-bar', 'width')).toBe(100);
    expect(getStylePercent(highHtml, 'profile-temp-indicator', 'left')).toBe(100);
  });
});
