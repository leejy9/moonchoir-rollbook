import { describe, expect, it } from 'vitest';
import { activeCardIndex, calendarHighlightDate } from './homeCarousel';

describe('activeCardIndex (V3-22 R3)', () => {
  it('처음', () => expect(activeCardIndex(0, 318, 10, 3, 700)).toBe(0));
  it('한 칸 넘김', () => expect(activeCardIndex(328, 318, 10, 3, 700)).toBe(1));
  it('카드 수가 줄어도 범위 안에 남는다', () => expect(activeCardIndex(990, 318, 10, 2, 300)).toBe(1));
  it('끝까지 스크롤하면 마지막', () => expect(activeCardIndex(600, 318, 10, 3, 600)).toBe(2));
  it('스크롤할 수 없는 넓은 화면은 첫 카드', () => expect(activeCardIndex(0, 318, 10, 3, 0)).toBe(0));
  it('카드 1장', () => expect(activeCardIndex(0, 318, 10, 1, 0)).toBe(0));
  it('카드 없음', () => expect(activeCardIndex(0, 318, 10, 0, 0)).toBe(0));
  it('음수 스크롤(바운스)은 0', () => expect(activeCardIndex(-20, 318, 10, 3, 700)).toBe(0));
});

describe('calendarHighlightDate (V3-22 R3)', () => {
  it('보는 달이면 그 날짜(11월, 카드 B)', () =>
    expect(calendarHighlightDate('2026-11-24', 2026, 10)).toBe('2026-11-24'));
  it('다른 달 카드(12/01)는 강조 없음', () =>
    expect(calendarHighlightDate('2026-12-01', 2026, 10)).toBeUndefined());
  it('연도가 다르면 강조 없음', () =>
    expect(calendarHighlightDate('2025-11-24', 2026, 10)).toBeUndefined());
  it('카드 날짜가 없으면 없음', () => expect(calendarHighlightDate(undefined, 2026, 10)).toBeUndefined());
});
