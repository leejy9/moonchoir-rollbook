import { describe, expect, it } from 'vitest';
import type { AppConfig, PracticeCatalog, ProgramCard, Schedule } from '../types/rollbook';
import {
  buildProgramScopes,
  filterPiecesByScope,
  searchPieces,
} from './practiceScope';

describe('practiceScope utilities (V3-04)', () => {
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
    practiceTrackKinds: ['파트음원', 'MR'],
    performanceCategories: ['연주', '정기연주회'],
  };

  const mockProgramCards: ProgramCard[] = [
    {
      id: 'card_future_1',
      title: '겨울 정기연주회',
      category: '연주/행사',
      isArchived: false,
      createdAt: '2026-01-01',
    },
    {
      id: 'card_future_2',
      title: '크리스마스 버스킹',
      category: '연주/행사',
      isArchived: false,
      createdAt: '2026-01-01',
    },
    {
      id: 'card_past',
      title: '가을 페스티벌',
      category: '연주/행사',
      isArchived: false,
      createdAt: '2026-01-01',
    },
    {
      id: 'card_empty',
      title: '곡이 없는 공연',
      category: '연주/행사',
      isArchived: false,
      createdAt: '2026-01-01',
    },
    {
      id: 'card_archived',
      title: '보관된 공연',
      category: '연주/행사',
      isArchived: true,
      createdAt: '2026-01-01',
    },
    {
      id: 'card_no_date',
      title: '날짜 미정 공연',
      category: '기타',
      isArchived: false,
      createdAt: '2026-01-01',
    },
  ];

  const mockSchedules: Schedule[] = [
    {
      id: 'sch_1',
      programId: 'card_future_1',
      title: '겨울 정기연주회 본공연',
      category: '정기연주회',
      date: '2026-12-24',
      startTime: '19:00',
      endTime: '21:00',
      locationName: '문콰이어 연습실',
    },
    {
      id: 'sch_1_rehearsal',
      programId: 'card_future_1',
      title: '겨울 리허설',
      category: '연습',
      date: '2026-12-25', // later date, but not performance category!
      startTime: '10:00',
      endTime: '12:00',
      locationName: '문콰이어 연습실',
    },
    {
      id: 'sch_2',
      programId: 'card_future_2',
      title: '크리스마스 버스킹',
      category: '연주',
      date: '2026-12-20',
      startTime: '14:00',
      endTime: '16:00',
      locationName: '문콰이어 연습실',
    },
    {
      id: 'sch_past',
      programId: 'card_past',
      title: '가을 페스티벌 본공연',
      category: '연주',
      date: '2026-10-15',
      startTime: '18:00',
      endTime: '20:00',
      locationName: '문콰이어 연습실',
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
      { programId: 'card_future_1', pieceId: 'p_1', orderIndex: 1, isArchived: false },
      { programId: 'card_future_1', pieceId: 'p_2', orderIndex: 0, isArchived: false },
      { programId: 'card_future_2', pieceId: 'p_1', orderIndex: 0, isArchived: false },
      { programId: 'card_past', pieceId: 'p_3', orderIndex: 0, isArchived: false },
      { programId: 'card_no_date', pieceId: 'p_no_date', orderIndex: 0, isArchived: false },
      { programId: 'card_future_1', pieceId: 'p_archived', orderIndex: 2, isArchived: false },
    ],
    performances: [],
    performancePieces: [],
  };

  const todayStr = '2026-11-20';

  it('buildProgramScopes builds structured menu items respecting sorting, date resolution, and zero-piece filters', () => {
    const scopes = buildProgramScopes(mockCatalog, mockProgramCards, mockSchedules, mockConfig, todayStr);

    // 1. First item: 'ALL' (5 active pieces: p_1, p_2, p_3, p_unassigned, p_no_date)
    expect(scopes[0]).toEqual({
      id: 'ALL',
      title: '전체 곡',
      pieceCount: 5,
    });

    // 2. Divider
    expect(scopes[1].isDivider).toBe(true);

    // 3. Upcoming programs sorted ascending by date (card_future_2 on 12-20, card_future_1 on 12-24, card_no_date at end)
    const upcoming = scopes.filter((s) => !s.isDivider && s.id !== 'ALL' && s.id !== 'UNASSIGNED' && !s.isPast);
    expect(upcoming.map((u) => u.id)).toEqual(['card_future_2', 'card_future_1', 'card_no_date']);
    expect(upcoming[0].title).toBe('크리스마스 버스킹');
    expect(upcoming[0].dateStr).toBe('12월 20일');
    expect(upcoming[0].pieceCount).toBe(1);

    expect(upcoming[1].title).toBe('겨울 정기연주회');
    expect(upcoming[1].dateStr).toBe('12월 24일'); // performance category schedule used, not rehearsal on 12-25
    expect(upcoming[1].pieceCount).toBe(2); // p_1 and p_2 (p_archived excluded)

    expect(upcoming[2].title).toBe('날짜 미정 공연');
    expect(upcoming[2].dateStr).toBeUndefined();
    expect(upcoming[2].pieceCount).toBe(1);

    // 4. UNASSIGNED ('공연 미정')
    const unassigned = scopes.find((s) => s.id === 'UNASSIGNED');
    expect(unassigned).toEqual({
      id: 'UNASSIGNED',
      title: '공연 미정',
      pieceCount: 1, // only p_unassigned
    });

    // 5. Past programs (card_past on 10-15)
    const past = scopes.filter((s) => s.isPast);
    expect(past).toHaveLength(1);
    expect(past[0].id).toBe('card_past');
    expect(past[0].title).toBe('가을 페스티벌');
    expect(past[0].dateStr).toBe('10월 15일');
    expect(past[0].pieceCount).toBe(1);

    // 6. Empty card (card_empty) and archived card (card_archived) are excluded
    expect(scopes.find((s) => s.id === 'card_empty')).toBeUndefined();
    expect(scopes.find((s) => s.id === 'card_archived')).toBeUndefined();
  });

  it('filterPiecesByScope correctly filters and orders pieces', () => {
    // 1. ALL scope: sorted by created_at desc
    const all = filterPiecesByScope(mockCatalog.pieces, mockCatalog.programPieces, 'ALL');
    expect(all.map((x) => x.piece.id)).toEqual(['p_no_date', 'p_unassigned', 'p_2', 'p_1', 'p_3']);
    expect(all[0].orderNumber).toBeUndefined();

    // 2. UNASSIGNED scope
    const unassigned = filterPiecesByScope(mockCatalog.pieces, mockCatalog.programPieces, 'UNASSIGNED');
    expect(unassigned.map((x) => x.piece.id)).toEqual(['p_unassigned']);

    // 3. Program scope (card_future_1): sorted by orderIndex asc (p_2 has orderIndex 0, p_1 has orderIndex 1)
    const concert1 = filterPiecesByScope(mockCatalog.pieces, mockCatalog.programPieces, 'card_future_1');
    expect(concert1.map((x) => x.piece.id)).toEqual(['p_2', 'p_1']);
    expect(concert1[0].orderNumber).toBe(1);
    expect(concert1[1].orderNumber).toBe(2);
  });

  it('searchPieces filters pieces by title, composer, arranger, and connected concert name (case & space insensitive)', () => {
    const allItems = filterPiecesByScope(mockCatalog.pieces, mockCatalog.programPieces, 'ALL');

    // Title search
    expect(searchPieces(allItems, mockProgramCards, mockCatalog.programPieces, 'white').map((x) => x.piece.id)).toEqual(['p_1']);
    expect(searchPieces(allItems, mockProgramCards, mockCatalog.programPieces, 'white christmas').map((x) => x.piece.id)).toEqual(['p_1']);

    // Composer search
    expect(searchPieces(allItems, mockProgramCards, mockCatalog.programPieces, 'berlin').map((x) => x.piece.id)).toEqual(['p_1']);

    // Arranger search
    expect(searchPieces(allItems, mockProgramCards, mockCatalog.programPieces, 'rutter').map((x) => x.piece.id)).toEqual(['p_2']);

    // Connected concert title search
    expect(searchPieces(allItems, mockProgramCards, mockCatalog.programPieces, '겨울 정기').map((x) => x.piece.id)).toEqual(['p_2', 'p_1']);

    // Empty query returns all
    expect(searchPieces(allItems, mockProgramCards, mockCatalog.programPieces, '   ')).toHaveLength(5);
  });
});
