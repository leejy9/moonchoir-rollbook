import { describe, expect, it } from 'vitest';
import { buildYearOptions, parseDateInput } from './datePickerYears';

describe('buildYearOptions', () => {
  it('올해 기준 30년 전부터 2년 뒤까지, 오래된 순', () => {
    const years = buildYearOptions(2026, 2026);
    expect(years[0]).toBe(1996);
    expect(years.at(-1)).toBe(2028);
    expect(years).toHaveLength(33);
  });

  it('보고 있는 연도가 범위 밖이면 그 연도까지 넣는다', () => {
    expect(buildYearOptions(2026, 1990)[0]).toBe(1990);
    expect(buildYearOptions(2026, 2031).at(-1)).toBe(2031);
  });
});

describe('parseDateInput', () => {
  it.each([
    ['2024-03-14', '2024-03-14'],
    ['2024.3.14', '2024-03-14'],
    ['2024. 3. 14.', '2024-03-14'],
    ['2024/03/14', '2024-03-14'],
    ['20240314', '2024-03-14'],
    [' 2024-3-4 ', '2024-03-04'],
    ['2024-02-29', '2024-02-29'],
  ])('%s → %s', (input, expected) => {
    expect(parseDateInput(input)).toBe(expected);
  });

  it.each(['2023-02-29', '2024-13-01', '2024-00-10', '2024-04-31', '24-03-14', '', '어제'])(
    '%s → null',
    (input) => {
      expect(parseDateInput(input)).toBeNull();
    }
  );
});
