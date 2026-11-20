import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { StudioTab } from './StudioTab';
import { sheetsService } from '../services/sheets';
import { AudioPlayerProvider } from './audio/AudioPlayerProvider';
import type { AppConfig, PracticeCatalog, ProgramCard } from '../types/rollbook';

describe('StudioTab Component (MEMBER_UX_AUDIO_SPEC §3-5)', () => {
  const mockConfig: AppConfig = {
    choirName: '문콰이어',
    rehearsalDay: '일요일',
    startTime: '18:00',
    defaultLat: 37.5,
    defaultLon: 127.0,
    defaultRadius: 100,
    sheetsWebAppUrl: 'https://script.google.com/macros/s/test/exec',
    lateGraceMinutes: 10,
    adminPin: '1234',
    mediaPublicBaseUrl: 'https://media.moonchoir.workers.dev',
    practiceTrackKinds: ['파트음원', 'MR', '참고영상'],
  };

  const mockProgramCards: ProgramCard[] = [
    {
      id: 'prog_1',
      title: '2026 봄 정기연주회',
      category: '정기연습',
      description: '봄 시즌 프로그램',
      defaultStartTime: '18:00',
      defaultEndTime: '21:00',
      targetAudienceType: 'ALL',
      isArchived: false,
      createdAt: '2026-01-01T00:00:00Z',
    },
  ];

  const mockCatalog: PracticeCatalog = {
    pieces: [
      {
        id: 'piece_1',
        title: '바람이 불어오는 곳',
        composer: '김광석',
        arranger: '조우현',
        scoreUrl: 'https://drive.google.com/file/d/score123/view',
        notes: '반음 내림 주의',
        isArchived: false,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'piece_unlinked',
        title: '어떤 시즌에도 없는 미연결 곡',
        composer: '미상',
        isArchived: false,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ],
    tracks: [
      {
        id: 'trk_audio',
        pieceId: 'piece_1',
        label: '소프라노 가이드',
        kind: 'guide_soprano',
        source: 'r2',
        storageKey: '2026-spring/soprano.m4a',
        orderIndex: 0,
        isArchived: false,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'trk_ext',
        pieceId: 'piece_1',
        label: '유튜브 참고 영상',
        kind: 'reference',
        source: 'youtube',
        url: 'https://youtube.com/watch?v=sample123',
        orderIndex: 1,
        isArchived: false,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ],
    programPieces: [
      {
        programId: 'prog_1',
        pieceId: 'piece_1',
        orderIndex: 0,
        isArchived: false,
      },
    ],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(sheetsService, 'getConfig').mockReturnValue(mockConfig);
    vi.spyOn(sheetsService, 'getProgramCards').mockReturnValue(mockProgramCards);
    vi.spyOn(sheetsService, 'getPracticeCatalog').mockReturnValue(mockCatalog);
    vi.spyOn(sheetsService, 'getBackendKind').mockReturnValue('supabase');
  });

  it('renders season sections, pieces, tracks, and score link in new window', () => {
    const html = renderToString(
      <AudioPlayerProvider>
        <StudioTab />
      </AudioPlayerProvider>
    );

    // Season header
    expect(html).toContain('2026 봄 정기연주회');
    expect(html).toContain('봄 시즌 프로그램');

    // Piece title & details
    expect(html).toContain('바람이 불어오는 곳');
    expect(html).toContain('작곡: 김광석');
    expect(html).toContain('편곡: 조우현');
    expect(html).toContain('반음 내림 주의');

    // Score link (target="_blank", rel="noopener noreferrer")
    expect(html).toContain('href="https://drive.google.com/file/d/score123/view"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('악보 보기');

    // Tracks: Audio track has "재생" button, External track has "외부에서 열기" link
    expect(html).toContain('소프라노 가이드');
    expect(html).toContain('재생');
    expect(html).toContain('유튜브 참고 영상');
    expect(html).toContain('외부에서 열기');
    expect(html).toContain('href="https://youtube.com/watch?v=sample123"');
  });

  it('hides pieces that are not linked to any active season card (Spec §3-5)', () => {
    const html = renderToString(
      <AudioPlayerProvider>
        <StudioTab />
      </AudioPlayerProvider>
    );

    expect(html).not.toContain('어떤 시즌에도 없는 미연결 곡');
  });

  it('has ZERO part filter dropdowns, buttons, or controls (Spec D1, §6-2 #4)', () => {
    const html = renderToString(
      <AudioPlayerProvider>
        <StudioTab />
      </AudioPlayerProvider>
    );

    // Spec constraint: No part filter
    expect(html).not.toContain('파트 필터');
    expect(html).not.toContain('전체 파트');
    expect(html).not.toContain('파트 선택');
  });

  it('contains ZERO emojis across the studio interface', () => {
    const html = renderToString(
      <AudioPlayerProvider>
        <StudioTab />
      </AudioPlayerProvider>
    );

    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(emojiRegex.test(html)).toBe(false);
  });

  it('renders "준비 중" notice in GAS backend mode and does not fetch (Spec §3-5)', () => {
    vi.spyOn(sheetsService, 'getBackendKind').mockReturnValue('gas');
    const refreshSpy = vi.spyOn(sheetsService, 'refreshPracticeCatalog');

    const html = renderToString(
      <AudioPlayerProvider>
        <StudioTab />
      </AudioPlayerProvider>
    );

    expect(html).toContain('연습실 기능은 준비 중입니다');
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it('guarantees touch targets of at least 44px on all action buttons and links', () => {
    const html = renderToString(
      <AudioPlayerProvider>
        <StudioTab />
      </AudioPlayerProvider>
    );

    expect(html).toContain('min-height:44px');
    expect(html).toContain('min-width:44px');
  });

  describe('iOS Standalone App Notice Banner (Spec §3-4, P2b-04)', () => {
    it('renders notice banner with Safari link when running in iOS standalone mode', () => {
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'
      );
      Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });

      const html = renderToString(
        <AudioPlayerProvider>
          <StudioTab />
        </AudioPlayerProvider>
      );

      expect(html).toContain('음원은 Safari에서 들으면 화면이 꺼져도 끊기지 않아요');
      expect(html).toContain('Safari로 열기');
    });

    it('does NOT render notice banner on Android or Desktop browsers', () => {
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
        'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36'
      );
      Object.defineProperty(navigator, 'standalone', { value: false, configurable: true });

      const html = renderToString(
        <AudioPlayerProvider>
          <StudioTab />
        </AudioPlayerProvider>
      );

      expect(html).not.toContain('음원은 Safari에서 들으면 화면이 꺼져도 끊기지 않아요');
    });
  });
});
