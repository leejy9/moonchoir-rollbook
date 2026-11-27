import { describe, expect, it } from 'vitest';
import { parsePracticeCatalog } from './practiceCatalogParser';

describe('parsePracticeCatalog', () => {
  it('returns an empty catalog when given invalid or empty input', () => {
    const empty = { pieces: [], tracks: [], programPieces: [], performances: [], performancePieces: [] };
    expect(parsePracticeCatalog(null)).toEqual(empty);
    expect(parsePracticeCatalog(undefined)).toEqual(empty);
    expect(parsePracticeCatalog('invalid')).toEqual(empty);
    expect(parsePracticeCatalog({})).toEqual(empty);
  });

  it('parses camelCase catalog input with defaults', () => {
    const raw = {
      pieces: [
        {
          id: 'p1',
          title: '아리랑',
          composer: '민요',
          scoreUrl: 'https://example.com/score.pdf',
          isArchived: false,
          createdAt: '2026-11-20T00:00:00Z',
          updatedAt: '2026-11-20T00:00:00Z',
        },
      ],
      tracks: [
        {
          id: 't1',
          pieceId: 'p1',
          label: '전체 합창 MR',
          kind: 'MR',
          source: 'r2',
          url: 'https://example.com/mr.mp3',
          durationSeconds: 180,
          orderIndex: 0,
          isArchived: false,
          createdAt: '2026-11-20T00:00:00Z',
          updatedAt: '2026-11-20T00:00:00Z',
        },
      ],
      programPieces: [
        {
          programId: 'card1',
          pieceId: 'p1',
          orderIndex: 0,
          isArchived: false,
        },
      ],
      performances: [
        {
          id: 'perf1',
          title: '정기연주회',
          performanceDate: '2026-12-14',
          venue: '아트센터',
          isArchived: false,
        },
      ],
      performancePieces: [
        {
          performanceId: 'perf1',
          pieceId: 'p1',
          orderIndex: 0,
          isArchived: false,
        },
      ],
    };

    const parsed = parsePracticeCatalog(raw);
    expect(parsed.pieces).toHaveLength(1);
    expect(parsed.pieces[0].id).toBe('p1');
    expect(parsed.tracks).toHaveLength(1);
    expect(parsed.tracks[0].kind).toBe('MR');
    expect(parsed.programPieces).toHaveLength(1);
    expect(parsed.programPieces[0].programId).toBe('card1');
    expect(parsed.performances).toHaveLength(1);
    expect(parsed.performances[0].id).toBe('perf1');
    expect(parsed.performances[0].title).toBe('정기연주회');
    expect(parsed.performances[0].performanceDate).toBe('2026-12-14');
    expect(parsed.performancePieces).toHaveLength(1);
    expect(parsed.performancePieces[0].performanceId).toBe('perf1');
    expect(parsed.performancePieces[0].pieceId).toBe('p1');
  });

  it('parses snake_case payload from Supabase RPC response', () => {
    const raw = {
      data: {
        pieces: [
          {
            id: 'p2',
            title: '도라지 타령',
            score_url: 'https://example.com/score2.pdf',
            archived_at: '2026-11-21T00:00:00Z',
            created_at: '2026-11-20T00:00:00Z',
            updated_at: '2026-11-21T00:00:00Z',
          },
        ],
        tracks: [
          {
            id: 't2',
            piece_id: 'p2',
            label: '소프라노 연습 음원',
            kind: '가이드',
            source_type: 'drive',
            duration_seconds: 125,
            order_index: 1,
            is_archived: true,
            created_at: '2026-11-20T00:00:00Z',
            updated_at: '2026-11-21T00:00:00Z',
          },
        ],
        program_pieces: [
          {
            program_id: 'card2',
            piece_id: 'p2',
            order_index: 3,
            archived_at: null,
          },
        ],
        performances: [
          {
            id: 'perf2',
            title: '창립기념 연주회',
            performance_date: '2026-12-25',
            venue: '음악당',
            archived_at: null,
            created_at: '2026-11-20T00:00:00Z',
          },
        ],
        performance_pieces: [
          {
            performance_id: 'perf2',
            piece_id: 'p2',
            order_index: 0,
            archived_at: null,
          },
        ],
      },
    };

    const parsed = parsePracticeCatalog(raw);
    expect(parsed.pieces[0].id).toBe('p2');
    expect(parsed.pieces[0].scoreUrl).toBe('https://example.com/score2.pdf');
    expect(parsed.pieces[0].isArchived).toBe(true);

    expect(parsed.tracks[0].id).toBe('t2');
    expect(parsed.tracks[0].pieceId).toBe('p2');
    expect(parsed.tracks[0].source).toBe('drive');
    expect(parsed.tracks[0].durationSeconds).toBe(125);
    expect(parsed.tracks[0].isArchived).toBe(true);

    expect(parsed.programPieces[0].programId).toBe('card2');
    expect(parsed.programPieces[0].isArchived).toBe(false);

    expect(parsed.performances[0].id).toBe('perf2');
    expect(parsed.performances[0].performanceDate).toBe('2026-12-25');
    expect(parsed.performancePieces[0].performanceId).toBe('perf2');
  });

  it('safely parses old catalog responses missing performances/performancePieces as empty arrays', () => {
    const oldCatalog = {
      pieces: [{ id: 'p1', title: '옛날 곡' }],
      tracks: [{ id: 't1', pieceId: 'p1', label: '트랙' }],
      programPieces: [{ programId: 'card1', pieceId: 'p1', orderIndex: 0, isArchived: false }],
    };

    const parsed = parsePracticeCatalog(oldCatalog);
    expect(parsed.pieces).toHaveLength(1);
    expect(parsed.tracks).toHaveLength(1);
    expect(parsed.programPieces).toHaveLength(1);
    expect(parsed.performances).toEqual([]);
    expect(parsed.performancePieces).toEqual([]);
  });

  it('preserves rows without id by assigning orphan IDs and preserves custom kinds and sources', () => {
    const raw = {
      pieces: [{ title: '이름 없는 곡' }],
      tracks: [{ pieceId: 'p1', label: '특수 트랙', kind: '베이스 특훈', source: 'vimeo' }],
      programPieces: [{ programId: 'card1', pieceId: 'p1' }],
      performances: [{ title: '이름 없는 공연' }],
      performancePieces: [{ performanceId: 'perf1', pieceId: 'p1' }],
    };

    const parsed = parsePracticeCatalog(raw);
    expect(parsed.pieces[0].id).toBe('orphan_piece_0');
    expect(parsed.pieces[0].title).toBe('이름 없는 곡');
    expect(parsed.tracks[0].id).toBe('orphan_track_0');
    expect(parsed.tracks[0].kind).toBe('베이스 특훈');
    expect(parsed.tracks[0].source).toBe('vimeo');
    expect(parsed.performances[0].id).toBe('perf_0');
    expect(parsed.performances[0].title).toBe('이름 없는 공연');
    expect(parsed.performancePieces[0].performanceId).toBe('perf1');
  });

  it('parses scoreStorageKey, scoreSizeBytes and sizeBytes with backward compatibility fallback', () => {
    const rawWithNewFields = {
      pieces: [
        {
          id: 'p_v3',
          title: 'v3 곡',
          scoreStorageKey: '2026/score/abcd1234efgh5678.pdf',
          scoreSizeBytes: 1048576,
        },
        {
          id: 'p_v3_snake',
          title: '스네이크 곡',
          score_storage_key: '2026/score/snake1234efgh5678.pdf',
          score_size_bytes: 2097152,
        },
        {
          id: 'p_v3_legacy',
          title: '옛날 곡',
        },
      ],
      tracks: [
        {
          id: 't_v3',
          pieceId: 'p_v3',
          label: '트랙',
          sizeBytes: 5242880,
        },
        {
          id: 't_v3_snake',
          pieceId: 'p_v3',
          label: '스네이크 트랙',
          size_bytes: 4194304,
        },
        {
          id: 't_v3_legacy',
          pieceId: 'p_v3',
          label: '옛날 트랙',
        },
      ],
    };

    const parsed = parsePracticeCatalog(rawWithNewFields);
    expect(parsed.pieces[0].scoreStorageKey).toBe('2026/score/abcd1234efgh5678.pdf');
    expect(parsed.pieces[0].scoreSizeBytes).toBe(1048576);
    expect(parsed.pieces[1].scoreStorageKey).toBe('2026/score/snake1234efgh5678.pdf');
    expect(parsed.pieces[1].scoreSizeBytes).toBe(2097152);
    expect(parsed.pieces[2].scoreStorageKey).toBeUndefined();
    expect(parsed.pieces[2].scoreSizeBytes).toBeUndefined();

    expect(parsed.tracks[0].sizeBytes).toBe(5242880);
    expect(parsed.tracks[1].sizeBytes).toBe(4194304);
    expect(parsed.tracks[2].sizeBytes).toBeUndefined();
  });
});
