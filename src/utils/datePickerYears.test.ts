import { describe, expect, it } from 'vitest';
import { buildYearOptions } from './datePickerYears';

describe('buildYearOptions', () => {
  it('올해 기준 30년 전부터 2년 뒤까지, 최근 연도가 먼저 온다', () => {
    const years = buildYearOptions(2026, 2026);
    expect(years[0]).toBe(2028);
    expect(years[years.length - 1]).toBe(1996);
    expect(years).toHaveLength(33);
  });

  it('보고 있는 연도가 범위 밖이면 그 연도까지 넣는다', () => {
    expect(buildYearOptions(2026, 1990).at(-1)).toBe(1990);
    expect(buildYearOptions(2026, 2031)[0]).toBe(2031);
  });
});
