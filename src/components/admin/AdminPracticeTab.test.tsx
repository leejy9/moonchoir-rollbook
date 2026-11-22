import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { AdminPracticeTab } from './AdminPracticeTab';
import { sheetsService } from '../../services/sheets';
import { uploadQueue } from '../../services/media/uploadQueue';
import type { AppConfig, PracticeCatalog, ProgramCard } from '../../types/rollbook';
import { resolveTrackPlayback } from '../../utils/practiceMedia';

describe('AdminPracticeTab Component', () => {
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
    practiceTrackKinds: ['가이드', '파트음원', 'MR', '참고영상'],
  };

  const dummyProgramCards: ProgramCard[] = [
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
    {
      id: 'prog_2',
      title: '2026 가을 정기연주회',
      category: '정기연습',
      description: '가을 시즌 프로그램',
      defaultStartTime: '18:00',
      defaultEndTime: '21:00',
      targetAudienceType: 'ALL',
      isArchived: false,
      createdAt: '2026-06-01T00:00:00Z',
    },
  ];

  const dummyCatalog: PracticeCatalog = {
    pieces: [
      {
        id: 'piece_1',
        title: '아리랑',
        composer: '민요',
        scoreUrl: 'https://drive.google.com/sheet1.pdf',
        notes: '전체 연습용',
        isArchived: false,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'piece_2',
        title: '보관된 곡',
        composer: '작곡가미상',
        isArchived: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ],
    tracks: [
      {
        id: 'track_1',
        pieceId: 'piece_1',
        label: '소프라노 가이드',
        kind: '파트음원',
        source: 'r2',
        storageKey: 'audio/spring/arirang_sop.m4a',
        orderIndex: 0,
        isArchived: false,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'track_2',
        pieceId: 'piece_1',
        label: '유튜브 참고 영상',
        kind: '참고영상',
        source: 'youtube',
        url: 'https://www.youtube.com/watch?v=sample123',
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
    performances: [],
    performancePieces: [],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(sheetsService, 'getPracticeCatalog').mockReturnValue(dummyCatalog);
    vi.spyOn(sheetsService, 'refreshPracticeCatalog').mockResolvedValue(dummyCatalog);
  });

  it('renders pieces, tracks, and program assignment without crashing', () => {
    const html = renderToString(
      <AdminPracticeTab
        config={dummyConfig}
        programCards={dummyProgramCards}
        onDataChanged={vi.fn()}
      />
    );

    expect(html).toContain('곡 및 트랙 관리');
    expect(html).toContain('공연');
    expect(html).toContain('아리랑');
    expect(html).toContain('새 연습곡 등록');
  });

  it('contains EXACTLY ZERO delete buttons in the DOM (spec requirement: no delete buttons)', () => {
    const html = renderToString(
      <AdminPracticeTab
        config={dummyConfig}
        programCards={dummyProgramCards}
        onDataChanged={vi.fn()}
      />
    );

    // Verify there are no delete buttons or delete actions
    expect(html).not.toMatch(/삭제|Delete/i);
    expect(html).not.toContain('btn-delete');
  });

  it('contains ZERO emojis in UI text (agent constitution & spec requirement)', () => {
    const html = renderToString(
      <AdminPracticeTab
        config={dummyConfig}
        programCards={dummyProgramCards}
        onDataChanged={vi.fn()}
      />
    );

    // Regular expression matching emojis and unicode pictographs
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(emojiRegex.test(html)).toBe(false);
  });

  it('renders external links with target="_blank" and rel="noopener noreferrer"', () => {
    const html = renderToString(
      <AdminPracticeTab
        config={dummyConfig}
        programCards={dummyProgramCards}
        onDataChanged={vi.fn()}
      />
    );

    // Sheet music link should open securely in a new window
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('https://drive.google.com/sheet1.pdf');
  });

  it('evaluates resolveTrackPlayback with live preview modes', () => {
    // 1. R2 track mode audio
    const r2Playback = resolveTrackPlayback(dummyCatalog.tracks[0], dummyConfig);
    expect(r2Playback.mode).toBe('audio');
    expect(r2Playback.src).toBe('https://media.moonchoir.org/audio/spring/arirang_sop.m4a');

    // 2. YouTube external_link
    const ytPlayback = resolveTrackPlayback(dummyCatalog.tracks[1], dummyConfig);
    expect(ytPlayback.mode).toBe('external_link');

    // 3. Insecure http:// -> unavailable
    const insecurePlayback = resolveTrackPlayback(
      {
        ...dummyCatalog.tracks[1],
        url: 'http://example.com/audio.mp3',
      },
      dummyConfig
    );
    expect(insecurePlayback.mode).toBe('unavailable');
    expect(insecurePlayback.reason).toContain('https');
  });

  it('renders failed count chip in header when failed uploads exist', () => {
    vi.spyOn(uploadQueue, 'getSnapshot').mockReturnValue({
      activeJob: null,
      queuedJobs: [],
      completedJobs: [],
      failedJobs: [{ id: 'f1', status: 'failed' } as any],
      haltedJobs: [],
      activeCount: 0,
      failedCount: 1,
    });

    const html = renderToString(
      <AdminPracticeTab
        config={dummyConfig}
        programCards={dummyProgramCards}
        onDataChanged={vi.fn()}
      />
    );

    expect(html.replace(/<!-- -->/g, '')).toContain('실패 1');
  });

  it('triggers reloadCatalog once with debounce when a job in uploadQueue transitions to done (J1)', async () => {
    vi.useFakeTimers();
    const reloadMock = vi.fn();

    const { setupUploadCatalogSync } = await import('../../utils/uploadCatalogSync');
    let listener: (() => void) | null = null;
    let completedList: any[] = [];

    const fakeQueue = {
      getSnapshot: () => ({ completedJobs: completedList }),
      subscribe: (l: () => void) => {
        listener = l;
        return () => {
          listener = null;
        };
      },
    } as any;

    const cleanup = setupUploadCatalogSync(fakeQueue, reloadMock, 300);

    // Job 1 done
    completedList = [{ id: 'job_1', status: 'done' }];
    if (listener) (listener as () => void)();

    // Job 2 done within 100ms
    vi.advanceTimersByTime(100);
    completedList = [{ id: 'job_1', status: 'done' }, { id: 'job_2', status: 'done' }];
    if (listener) (listener as () => void)();

    expect(reloadMock).not.toHaveBeenCalled();

    // Advance 300ms after second job
    vi.advanceTimersByTime(300);
    expect(reloadMock).toHaveBeenCalledTimes(1);

    cleanup();
    vi.useRealTimers();
  });
});
