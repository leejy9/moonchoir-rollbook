import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { StudioTab } from './StudioTab';
import { sheetsService } from '../services/sheets';
import { AudioPlayerProvider } from './audio/AudioPlayerProvider';
import { PREFERENCE_KEYS, readPreference, writePreference } from '../services/sheetsStorage';
import type { AppConfig, PracticeCatalog, ProgramCard, Schedule } from '../types/rollbook';

describe('StudioTab Component (MEMBER_UX_V3_SPEC §3-1, §3-2)', () => {
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
    performanceCategories: ['연주'],
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

  const mockSchedules: Schedule[] = [
    {
      id: 'sch_1',
      programId: 'prog_1',
      title: '봄 정기연주회 본공연',
      category: '연주',
      date: '2026-05-20',
      startTime: '19:00',
      endTime: '21:00',
      locationName: '문콰이어 연습실',
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
        title: '공연 미정 곡',
        composer: '미상',
        isArchived: false,
        createdAt: '2026-01-02T00:00:00Z',
        updatedAt: '2026-01-02T00:00:00Z',
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
    const store = new Map<string, string>();
    const mockStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    };
    vi.stubGlobal('window', { localStorage: mockStorage });
    vi.stubGlobal('localStorage', mockStorage);
    vi.spyOn(sheetsService, 'getConfig').mockReturnValue(mockConfig);
    vi.spyOn(sheetsService, 'getProgramCards').mockReturnValue(mockProgramCards);
    vi.spyOn(sheetsService, 'getSchedules').mockReturnValue(mockSchedules);
    vi.spyOn(sheetsService, 'getPracticeCatalog').mockReturnValue(mockCatalog);
    vi.spyOn(sheetsService, 'getBackendKind').mockReturnValue('supabase');
  });

  it('renders Studio screen with title "연습실", search bar, scope dropdown, and piece rows', () => {
    const html = renderToString(
      <AudioPlayerProvider>
        <StudioTab />
      </AudioPlayerProvider>
    ).replace(/<!-- -->/g, '');

    // Header title
    expect(html).toContain('연습실');

    // Search bar
    expect(html).toContain('placeholder="곡 이름·작곡가 검색"');

    // Scope dropdown button default to '전체 곡'
    expect(html).toContain('전체 곡');

    // Piece rows
    expect(html).toContain('바람이 불어오는 곳');
    expect(html).toContain('작곡: 김광석');
    expect(html).toContain('편곡: 조우현');

    // Material badges
    expect(html).toContain('악보');
    expect(html).toContain('음원 1');
    expect(html).toContain('영상 1');

    // Unassigned piece also visible in '전체 곡' scope
    expect(html).toContain('공연 미정 곡');
  });

  it('persists selected scope in preference storage (V3-04)', () => {
    writePreference(PREFERENCE_KEYS.STUDIO_SCOPE, 'prog_1');
    expect(readPreference(PREFERENCE_KEYS.STUDIO_SCOPE, (_v): _v is string => true, 'ALL')).toBe('prog_1');
  });

  it('renders "등록된 연습곡이 없습니다." when catalog has 0 pieces', () => {
    vi.spyOn(sheetsService, 'getPracticeCatalog').mockReturnValue({
      pieces: [],
      tracks: [],
      programPieces: [],
    });

    const html = renderToString(
      <AudioPlayerProvider>
        <StudioTab />
      </AudioPlayerProvider>
    ).replace(/<!-- -->/g, '');

    expect(html).toContain('등록된 연습곡이 없습니다.');
  });

  it('has ZERO part filter dropdowns, buttons, or controls (Spec D1, §6-2 #4)', () => {
    const html = renderToString(
      <AudioPlayerProvider>
        <StudioTab />
      </AudioPlayerProvider>
    ).replace(/<!-- -->/g, '');

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
    ).replace(/<!-- -->/g, '');

    const emojiRegex = /\p{Extended_Pictographic}/u;
    expect(emojiRegex.test(html)).toBe(false);
  });

  it('renders "준비 중" notice in GAS backend mode and does not fetch', () => {
    vi.spyOn(sheetsService, 'getBackendKind').mockReturnValue('gas');
    const refreshSpy = vi.spyOn(sheetsService, 'refreshPracticeCatalog');

    const html = renderToString(
      <AudioPlayerProvider>
        <StudioTab />
      </AudioPlayerProvider>
    ).replace(/<!-- -->/g, '');

    expect(html).toContain('연습실 기능은 준비 중입니다');
    expect(refreshSpy).not.toHaveBeenCalled();
  });
});
