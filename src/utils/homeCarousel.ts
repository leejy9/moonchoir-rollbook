/**
 * 카드 줄에서 지금 보이는 카드의 순번 (V3-22 R3).
 * 끝까지 스크롤했으면 마지막 카드로 본다. 스크롤할 수 없는 줄(maxScroll <= 0)은 첫 카드다.
 */
export function activeCardIndex(
  scrollLeft: number,
  cardWidth: number,
  gap: number,
  count: number,
  maxScroll: number
): number {
  if (count <= 0) return 0;
  const last = count - 1;
  if (maxScroll > 0 && scrollLeft >= maxScroll - 1) return last;
  const step = cardWidth + gap;
  if (step <= 0) return 0;
  return Math.min(last, Math.max(0, Math.round(scrollLeft / step)));
}

/** 카드 날짜가 지금 보는 달이면 그 날짜, 아니면 `undefined` (V3-22 R3). */
export function calendarHighlightDate(
  activeCardDate: string | undefined,
  year: number,
  monthIndex: number
): string | undefined {
  if (!activeCardDate) return undefined;
  const prefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}-`;
  return activeCardDate.startsWith(prefix) ? activeCardDate : undefined;
}
