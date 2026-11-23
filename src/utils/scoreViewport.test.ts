import { describe, expect, it } from 'vitest';
import { computeCurrentPage, type PageViewportInfo, type ContainerViewportInfo } from './scoreViewport';

describe('scoreViewport (J5)', () => {
  const container: ContainerViewportInfo = {
    top: 100,
    height: 600,
  }; // Upper half threshold is 100 + 300 = 400

  it('맨 위 경계: 첫 쪽만 상단 절반에 들어왔을 때 1쪽을 반환한다', () => {
    const pages: PageViewportInfo[] = [
      { pageNumber: 1, top: 100 },
      { pageNumber: 2, top: 1000 },
      { pageNumber: 3, top: 1900 },
    ];

    expect(computeCurrentPage(pages, container)).toBe(1);
  });

  it('두 쪽 경계: 2쪽의 윗변이 상단 절반 경계(400)에 도달하기 전에는 1쪽이다', () => {
    const pages: PageViewportInfo[] = [
      { pageNumber: 1, top: -500 },
      { pageNumber: 2, top: 401 },
      { pageNumber: 3, top: 1300 },
    ];

    expect(computeCurrentPage(pages, container)).toBe(1);
  });

  it('두 쪽 경계: 2쪽의 윗변이 상단 절반 경계(400) 이하로 들어온 순간 2쪽으로 전환된다', () => {
    const pagesAtBoundary: PageViewportInfo[] = [
      { pageNumber: 1, top: -501 },
      { pageNumber: 2, top: 400 },
      { pageNumber: 3, top: 1300 },
    ];
    expect(computeCurrentPage(pagesAtBoundary, container)).toBe(2);

    const pagesPastBoundary: PageViewportInfo[] = [
      { pageNumber: 1, top: -600 },
      { pageNumber: 2, top: 350 },
      { pageNumber: 3, top: 1250 },
    ];
    expect(computeCurrentPage(pagesPastBoundary, container)).toBe(2);
  });

  it('맨 아래 경계: 마지막 쪽(3쪽)의 윗변이 상단 절반에 들어왔을 때 마지막 쪽을 반환한다', () => {
    const pages: PageViewportInfo[] = [
      { pageNumber: 1, top: -1500 },
      { pageNumber: 2, top: -600 },
      { pageNumber: 3, top: 250 },
    ];

    expect(computeCurrentPage(pages, container)).toBe(3);
  });

  it('예외 처리: 목록이 비었거나 모든 쪽이 뷰포트 아래에 있을 때 안전한 기본값 반환', () => {
    expect(computeCurrentPage([], container)).toBe(1);

    const pagesFarBelow: PageViewportInfo[] = [
      { pageNumber: 1, top: 500 },
      { pageNumber: 2, top: 1400 },
    ];
    expect(computeCurrentPage(pagesFarBelow, container)).toBe(1);
  });
});
