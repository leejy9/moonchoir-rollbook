import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { PieceDetail } from './PieceDetail';
import type { AppConfig, PracticePiece, PracticeTrack } from '../../types/rollbook';

describe('PieceDetail Component (G3: Embedded YouTube)', () => {
  const dummyConfig: AppConfig = {
    choirName: '문콰이어',
    rehearsalDay: '일요일',
    startTime: '18:00',
    defaultLat: 37.5,
    defaultLon: 127.0,
    defaultRadius: 100,
    sheetsWebAppUrl: 'https://script.google.com/macros/s/test/exec',
    lateGraceMinutes: 10,
    adminPin: '1234',
    mediaPublicBaseUrl: 'https://media.moonchoir.org',
  };

  const dummyPiece: PracticePiece = {
    id: 'p1',
    title: '아리랑',
    composer: '민요',
    isArchived: false,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const videoTrackWithId: PracticeTrack = {
    id: 't_yt_1',
    pieceId: 'p1',
    label: '국립합창단 연주영상',
    kind: '참고영상',
    source: 'youtube',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    orderIndex: 0,
    isArchived: false,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const videoTrackInvalidUrl: PracticeTrack = {
    id: 't_yt_2',
    pieceId: 'p1',
    label: '기타 링크',
    kind: '참고영상',
    source: 'youtube',
    url: 'https://invalid-host.com/watch',
    orderIndex: 1,
    isArchived: false,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  it('renders embedded iframe with strict referrerpolicy, allow attributes, and lazy loading', () => {
    const html = renderToString(
      <PieceDetail
        piece={dummyPiece}
        tracks={[videoTrackWithId]}
        config={dummyConfig}
        onBack={vi.fn()}
      />
    );

    expect(html).toContain('<iframe');
    expect(html).toContain('src="https://www.youtube.com/embed/dQw4w9WgXcQ?playsinline=1&amp;rel=0&amp;enablejsapi=1&amp;origin="');
    expect(html).toContain('referrerPolicy="strict-origin-when-cross-origin"');
    expect(html).toContain('allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"');
    expect(html).toContain('allowFullScreen=""');
    expect(html).toContain('loading="lazy"');
  });

  it('renders link button with aria-label, svg icon, and NO visible text', () => {
    const html = renderToString(
      <PieceDetail
        piece={dummyPiece}
        tracks={[videoTrackWithId]}
        config={dummyConfig}
        onBack={vi.fn()}
      />
    );

    expect(html).toContain('aria-label="유튜브 앱으로 열기"');
    expect(html).not.toContain('>YouTube<');
  });

  it('does NOT render iframe when video id cannot be extracted', () => {
    const html = renderToString(
      <PieceDetail
        piece={dummyPiece}
        tracks={[videoTrackInvalidUrl]}
        config={dummyConfig}
        onBack={vi.fn()}
      />
    );

    expect(html).not.toContain('<iframe');
    expect(html).toContain('기타 링크');
  });

  it('renders connected performance title on subtitle line', () => {
    const html = renderToString(
      <PieceDetail
        piece={dummyPiece}
        tracks={[]}
        performances={[
          {
            id: 'perf_1',
            title: '봄 정기연주회',
            performanceDate: '2026-05-01',
            venue: '',
            isArchived: false,
            createdAt: '',
            updatedAt: '',
          },
        ]}
        connectedPerformanceIds={['perf_1']}
        config={dummyConfig}
        onBack={vi.fn()}
      />
    );

    expect(html).toContain('봄 정기연주회');
  });
});
