import { describe, expect, it } from 'vitest';
import type { Performance, PracticeCatalog, ProgramCard } from '../types/rollbook';
import {
  buildPerformanceScopes,
  filterPiecesByScope,
  searchPieces,
} from './practiceScope';

describe('practiceScope utilities (V3-04 / V3-15)', () => {
  const mockProgramCards: ProgramCard[] = [
    {
      id: 'card_future_1',
      title: '시즌 카드 1',
      category: '연주/행사',
      isArchived: false,
      createdAt: '2026-01-01',
    },
    {
      id: 'card_future_2',
      title: '시즌 카드 2',
      category: '연주/행사',
      isArchived: false,
      createdAt: '2026-01-01',
    },
  ];

  const mockPerformances: Performance[] = [
    {
      id: 'perf_future_1',
      title: '겨울 정기연주회',
      performanceDate: '2026-12-24',
      venue: '콘서트홀',
      isArchived: false,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
    {
      id: 'perf_future_2',
      title: '크리스마스 버스킹',
      performanceDate: '2026-12-20',
      venue: '야외광장',
      isArchived: false,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
    {
      id: 'perf_past',
      title: '가을 페스티벌',
      performanceDate: '2026-10-15',
      venue: '소극장',
      isArchived: false,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
    {
      id: 'perf_empty',
      title: '곡이 없는 공연',
      performanceDate: '2026-12-30',
      venue: '연습실',
      isArchived: false,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
    {
      id: 'perf_archived',
      title: '보관된 공연',
      performanceDate: '2026-12-31',
      venue: '연습실',
      isArchived: true,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
    {
      id: 'perf_no_date',
      title: '날짜 미정 공연',
      performanceDate: '',
      venue: '미정',
      isArchived: false,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
  ];

  const mockCatalog: PracticeCatalog = {
    pieces: [
      {
        id: 'p_1',
        title: 'White Christmas',
        composer: 'Irving Berlin',
        isArchived: false,
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z',
      },
      {
        id: 'p_2',
        title: 'O Holy Night',
        composer: 'Adolphe Adam',
        arranger: 'John Rutter',
        isArchived: false,
        createdAt: '2026-11-02T00:00:00Z',
        updatedAt: '2026-11-02T00:00:00Z',
      },
      {
        id: 'p_3',
        title: 'Autumn Leaves',
        composer: 'Joseph Kosma',
        isArchived: false,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      },
      {
        id: 'p_unassigned',
        title: '아리랑',
        composer: '민요',
        isArchived: false,
        createdAt: '2026-11-03T00:00:00Z',
        updatedAt: '2026-11-03T00:00:00Z',
      },
      {
        id: 'p_no_date',
        title: '신곡 연습',
        composer: '미상',
        isArchived: false,
        createdAt: '2026-11-04T00:00:00Z',
        updatedAt: '2026-11-04T00:00:00Z',
      },
      {
        id: 'p_archived',
        title: '보관된 곡',
        composer: '미상',
        isArchived: true,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      },
    ],
    tracks: [],
    programPieces: [
      { programId: 'card_future_1', pieceId: 'p_1', orderIndex: 0, isArchived: false },
    ],
    performances: mockPerformances,
    performancePieces: [
      { performanceId: 'perf_future_1', pieceId: 'p_1', orderIndex: 1, isArchived: false },
      { performanceId: 'perf_future_1', pieceId: 'p_2', orderIndex: 0, isArchived: false },
      { performanceId: 'perf_future_2', pieceId: 'p_1', orderIndex: 0, isArchived: false },
      { performanceId: 'perf_past', pieceId: 'p_3', orderIndex: 0, isArchived: false },
      { performanceId: 'perf_no_date', pieceId: 'p_no_date', orderIndex: 0, isArchived: false },
      { performanceId: 'perf_future_1', pieceId: 'p_archived', orderIndex: 2, isArchived: false },
    ],
  };

  const todayStr = '2026-11-20';

  it('buildPerformanceScopes builds structured menu items from performances only (V18)', () => {
    const scopes = buildPerformanceScopes(mockCatalog, todayStr);

    // 1. First item: 'ALL' (5 active pieces: p_1, p_2, p_3, p_unassigned, p_no_date)
    expect(scopes[0]).toEqual({
      id: 'ALL',
      title: '전체 곡',
      pieceCount: 5,
    });

    // 2. Divider
    expect(scopes[1].isDivider).toBe(true);

    // 3. Upcoming performances sorted ascending by date (perf_future_2 on 12-20, perf_future_1 on 12-24, perf_no_date at end)
    const upcoming = scopes.filter((s) => !s.isDivider && s.id !== 'ALL' && s.id !== 'UNASSIGNED' && !s.isPast);
    expect(upcoming.map((u) => u.id)).toEqual(['perf_future_2', 'perf_future_1', 'perf_no_date']);
    expect(upcoming[0].title).toBe('크리스마스 버스킹');
    expect(upcoming[0].dateStr).toBe('12월 20일');
    expect(upcoming[0].pieceCount).toBe(1);

    expect(upcoming[1].title).toBe('겨울 정기연주회');
    expect(upcoming[1].dateStr).toBe('12월 24일');
    expect(upcoming[1].pieceCount).toBe(2); // p_1 and p_2 (p_archived excluded)

    expect(upcoming[2].title).toBe('날짜 미정 공연');
    expect(upcoming[2].dateStr).toBeUndefined();
    expect(upcoming[2].pieceCount).toBe(1);

    // 4. UNASSIGNED ('공연 미정')
    const unassigned = scopes.find((s) => s.id === 'UNASSIGNED');
    expect(unassigned).toEqual({
      id: 'UNASSIGNED',
      title: '공연 미정',
      pieceCount: 1, // only p_unassigned has 0 unarchived performance links
    });

    // 5. Past performances (perf_past on 10-15)
    const past = scopes.filter((s) => s.isPast);
    expect(past).toHaveLength(1);
    expect(past[0].id).toBe('perf_past');
    expect(past[0].title).toBe('가을 페스티벌');
    expect(past[0].dateStr).toBe('10월 15일');
    expect(past[0].pieceCount).toBe(1);

    // 6. Empty performance (perf_empty) and archived performance (perf_archived) are excluded
    expect(scopes.find((s) => s.id === 'perf_empty')).toBeUndefined();
    expect(scopes.find((s) => s.id === 'perf_archived')).toBeUndefined();
  });

  it('guarantees program cards (season cards) do NOT appear in performance scopes (V18)', () => {
    const scopes = buildPerformanceScopes(mockCatalog, todayStr);
    for (const card of mockProgramCards) {
      expect(scopes.find((s) => s.id === card.id)).toBeUndefined();
    }
  });

  it('falls back to "ALL" when an old program card ID is saved in STUDIO_SCOPE', () => {
    const scopes = buildPerformanceScopes(mockCatalog, todayStr);
    const legacyScopeId: string = 'card_future_1'; // old program card id

    const effectiveScopeId =
      legacyScopeId === 'ALL' || legacyScopeId === 'UNASSIGNED' || scopes.some((s) => s.id === legacyScopeId)
        ? legacyScopeId
        : 'ALL';

    expect(effectiveScopeId).toBe('ALL');
  });

  it('filterPiecesByScope correctly filters and orders pieces', () => {
    // 1. ALL scope: sorted by created_at desc
    const all = filterPiecesByScope(mockCatalog.pieces, mockCatalog.performancePieces, 'ALL');
    expect(all.map((x) => x.piece.id)).toEqual(['p_no_date', 'p_unassigned', 'p_2', 'p_1', 'p_3']);
    expect(all[0].orderNumber).toBeUndefined();

    // 2. UNASSIGNED scope
    const unassigned = filterPiecesByScope(mockCatalog.pieces, mockCatalog.performancePieces, 'UNASSIGNED');
    expect(unassigned.map((x) => x.piece.id)).toEqual(['p_unassigned']);

    // 3. Performance scope (perf_future_1): sorted by orderIndex asc (p_2 has orderIndex 0, p_1 has orderIndex 1)
    const concert1 = filterPiecesByScope(mockCatalog.pieces, mockCatalog.performancePieces, 'perf_future_1');
    expect(concert1.map((x) => x.piece.id)).toEqual(['p_2', 'p_1']);
    expect(concert1[0].orderNumber).toBe(1);
    expect(concert1[1].orderNumber).toBe(2);
  });

  it('searchPieces filters pieces by title, composer, arranger, and connected performance title (case & space insensitive)', () => {
    const allItems = filterPiecesByScope(mockCatalog.pieces, mockCatalog.performancePieces, 'ALL');

    // Title search
    expect(searchPieces(allItems, mockCatalog.performances, mockCatalog.performancePieces, 'white').map((x) => x.piece.id)).toEqual(['p_1']);
    expect(searchPieces(allItems, mockCatalog.performances, mockCatalog.performancePieces, 'white christmas').map((x) => x.piece.id)).toEqual(['p_1']);

    // Composer search
    expect(searchPieces(allItems, mockCatalog.performances, mockCatalog.performancePieces, 'berlin').map((x) => x.piece.id)).toEqual(['p_1']);

    // Arranger search
    expect(searchPieces(allItems, mockCatalog.performances, mockCatalog.performancePieces, 'rutter').map((x) => x.piece.id)).toEqual(['p_2']);

    // Connected performance title search
    expect(searchPieces(allItems, mockCatalog.performances, mockCatalog.performancePieces, '겨울 정기').map((x) => x.piece.id)).toEqual(['p_2', 'p_1']);

    // Empty query returns all
    expect(searchPieces(allItems, mockCatalog.performances, mockCatalog.performancePieces, '   ')).toHaveLength(5);
  });
});
