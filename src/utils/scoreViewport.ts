export interface PageViewportInfo {
  pageNumber: number;
  top: number;
}

export interface ContainerViewportInfo {
  top: number;
  height: number;
}

/**
 * 컨테이너 상단 절반(container.top ~ container.top + container.height / 2) 안에
 * 윗변(top)이 들어온 마지막 쪽을 현재 쪽으로 판정한다 (J5).
 */
export function computeCurrentPage(
  pages: readonly PageViewportInfo[],
  container: ContainerViewportInfo
): number {
  if (pages.length === 0) return 1;

  const threshold = container.top + container.height / 2;
  const sorted = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);

  const matched = sorted.filter((p) => p.top <= threshold);
  if (matched.length === 0) {
    return sorted[0].pageNumber;
  }

  return matched[matched.length - 1].pageNumber;
}
