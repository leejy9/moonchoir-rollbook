import { describe, expect, it } from 'vitest';
import {
  parsePracticeCatalog,
  parseRemoteCommentEvents,
  parseRemoteMembers,
  parseRemoteSchedules,
} from './sheetsParser';

const baseSchedule = {
    title: '경찰의날 녹음',
    date: '2026-10-20',
    startTime: '19:00',
    endTime: '21:00',
    locationName: '연습실',
    category: '녹음',
};

describe('parseRemoteSchedules', () => {
  it('normalizes string and boolean archive values from Sheets', () => {
    const sheetRows = JSON.parse(
      JSON.stringify([
        { ...baseSchedule, id: 'active', isArchived: 'FALSE' },
        { ...baseSchedule, id: 'archived', isArchived: 'TRUE' },
        { ...baseSchedule, id: 'boolean-active', isArchived: false },
        { ...baseSchedule, id: 'boolean-archived', isArchived: true },
      ])
    );
    const parsed = parseRemoteSchedules(sheetRows);

    expect(parsed.map((schedule) => schedule.isArchived)).toEqual([false, true, false, true]);
  });

  describe('parseRemoteMembers', () => {
    it('restores leading zeroes when Sheets returns a numeric phoneLast4 value', () => {
      const sheetRows = JSON.parse(JSON.stringify([
        {
          id: 'mem_phone_zero',
          name: '전화번호 테스트',
          part: '알토',
          role: 'MEMBER',
          status: 'ACTIVE',
          createdAt: '2026-10-21T00:00:00Z',
          phoneLast4: 357,
          phone: '010-1234-0357',
        },
      ]));

      const [member] = parseRemoteMembers(sheetRows);

      expect(member.phoneLast4).toBe('0357');
    });
  });

  it('parses the rehearsal PARTS list from the Google Sheets CSV value', () => {
    const sheetRows = JSON.parse(
      JSON.stringify([
        {
          ...baseSchedule,
          id: 'sch_20261022_prm7',
          date: '2026-10-22',
          targetAudienceType: 'PARTS',
          targetParts: '소프라노,알토,테너,베이스',
        },
      ])
    );
    const [schedule] = parseRemoteSchedules(sheetRows);

    expect(schedule.targetParts).toEqual(['소프라노', '알토', '테너', '베이스']);
  });
});

describe('parseRemoteSchedules - visibility', () => {
  const row = (visibility: unknown) =>
    ({
      id: 's1',
      title: '연습',
      date: '2026-10-30',
      startTime: '19:30',
      endTime: '21:30',
      locationName: '연습실',
      category: '정기연습',
      visibility,
    }) as unknown as Parameters<typeof parseRemoteSchedules>[0][number];

  it('열이 없던 과거 행과 빈 값은 전체 공개(ALL)로 읽는다', () => {
    const [legacy] = parseRemoteSchedules([{ ...row(undefined) }]);
    const [blank] = parseRemoteSchedules([row('')]);
    expect(legacy.visibility).toBe('ALL');
    expect(blank.visibility).toBe('ALL');
  });

  it('TARGETS_ONLY는 대소문자와 공백에 상관없이 인식한다', () => {
    const [parsed] = parseRemoteSchedules([row(' targets_only ')]);
    expect(parsed.visibility).toBe('TARGETS_ONLY');
  });

  it('알 수 없는 값은 일정을 숨기지 않고 전체 공개로 읽는다', () => {
    const [parsed] = parseRemoteSchedules([row('SECRET')]);
    expect(parsed.visibility).toBe('ALL');
  });
});

describe('parseRemoteCommentEvents', () => {
  const row = (overrides: Record<string, unknown>) => ({
    id: 'c1',
    scheduleId: 's1',
    memberId: 'm1',
    memberName: '김하은',
    part: '소프라노',
    action: 'CREATE',
    text: '안녕',
    timestamp: '2026-10-29 18:00:00',
    deviceId: 'dev_a',
    ...overrides,
  });

  it('행을 이벤트로 정리한다', () => {
    const [event] = parseRemoteCommentEvents([row({})]);
    expect(event).toMatchObject({ id: 'c1', scheduleId: 's1', memberId: 'm1', action: 'CREATE', text: '안녕', deviceId: 'dev_a' });
  });

  it('필드가 빠진 행은 기본값으로 읽고 targetId·deviceId는 비워 둔다', () => {
    const [event] = parseRemoteCommentEvents([row({ memberName: '', part: '', targetId: '', deviceId: undefined })]);
    expect(event.memberName).toBe('단원');
    expect(event.part).toBe('소프라노');
    expect(event.targetId).toBeUndefined();
    expect(event.deviceId).toBeUndefined();
  });

  it('행동은 대소문자와 공백에 상관없이 읽고 알 수 없는 행동과 필수값 없는 행은 건너뛴다', () => {
    const events = parseRemoteCommentEvents([
      row({ id: 'c1', action: ' edit ', targetId: 'c0' }),
      row({ id: 'c2', action: 'HIDE' }),
      row({ id: '' }),
      row({ id: 'c4', scheduleId: '' }),
      row({ id: 'c5', memberId: '' }),
      null,
      'text',
    ]);
    expect(events.map((e) => e.id)).toEqual(['c1']);
    expect(events[0].action).toBe('EDIT');
  });
});

describe('parsePracticeCatalog', () => {
  it('returns an empty catalog when given invalid or empty input', () => {
    expect(parsePracticeCatalog(null)).toEqual({ pieces: [], tracks: [], programPieces: [] });
    expect(parsePracticeCatalog(undefined)).toEqual({ pieces: [], tracks: [], programPieces: [] });
    expect(parsePracticeCatalog('invalid')).toEqual({ pieces: [], tracks: [], programPieces: [] });
    expect(parsePracticeCatalog({})).toEqual({ pieces: [], tracks: [], programPieces: [] });
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
          storageKey: 'audio/arirang.mp3',
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
    };

    const parsed = parsePracticeCatalog(raw);
    expect(parsed.pieces).toHaveLength(1);
    expect(parsed.pieces[0].title).toBe('아리랑');
    expect(parsed.pieces[0].scoreUrl).toBe('https://example.com/score.pdf');
    expect(parsed.tracks).toHaveLength(1);
    expect(parsed.tracks[0].kind).toBe('MR');
    expect(parsed.tracks[0].source).toBe('r2');
    expect(parsed.programPieces[0].programId).toBe('card1');
  });

  it('parses snake_case DB format and converts archived_at to isArchived', () => {
    const raw = {
      data: {
        pieces: [
          {
            id: 'p2',
            title: '도라지 타령',
            score_url: 'https://example.com/doraji.pdf',
            archived_at: '2026-11-20T10:00:00Z',
            created_at: '2026-11-20T00:00:00Z',
            updated_at: '2026-11-20T10:00:00Z',
          },
        ],
        tracks: [
          {
            id: 't2',
            piece_id: 'p2',
            label: '소프라노 가이드',
            kind: '가이드',
            source_type: 'drive',
            url: 'https://drive.google.com/file/d/xyz/view',
            duration_seconds: 180,
            order_index: 1,
            created_at: '2026-11-20T00:00:00Z',
            updated_at: '2026-11-20T00:00:00Z',
          },
        ],
        program_pieces: [
          {
            program_id: 'card2',
            piece_id: 'p2',
            order_index: 1,
            archived_at: null,
          },
        ],
      },
    };

    const parsed = parsePracticeCatalog(raw);
    expect(parsed.pieces[0].isArchived).toBe(true);
    expect(parsed.pieces[0].scoreUrl).toBe('https://example.com/doraji.pdf');
    expect(parsed.tracks[0].durationSeconds).toBe(180);
    expect(parsed.tracks[0].source).toBe('drive');
    expect(parsed.programPieces[0].programId).toBe('card2');
    expect(parsed.programPieces[0].isArchived).toBe(false);
  });

  it('parses camelCase-only RPC payload (C15 payload optimization)', () => {
    const rawRpc = {
      success: true,
      data: {
        pieces: [
          {
            id: 'piece_clean',
            title: '순수 카멜케이스 곡',
            composer: '작곡가',
            arranger: '편곡자',
            scoreUrl: 'https://example.com/clean.pdf',
            notes: '악보 메모',
            isArchived: false,
            archivedAt: null,
            createdAt: '2026-11-21T00:00:00Z',
            updatedAt: '2026-11-21T00:00:00Z',
          },
        ],
        tracks: [
          {
            id: 'track_clean',
            pieceId: 'piece_clean',
            label: '소프라노',
            kind: '가이드',
            source: 'r2',
            url: 'https://media.moonchoir.workers.dev/audio/soprano.m4a',
            storageKey: 'audio/soprano.m4a',
            mimeType: 'audio/mp4',
            durationSeconds: 215,
            orderIndex: 0,
            isArchived: false,
            archivedAt: null,
            createdAt: '2026-11-21T00:00:00Z',
            updatedAt: '2026-11-21T00:00:00Z',
          },
        ],
        programPieces: [
          {
            programId: 'card_season_1',
            pieceId: 'piece_clean',
            orderIndex: 0,
            isArchived: false,
            archivedAt: null,
            createdAt: '2026-11-21T00:00:00Z',
          },
        ],
      },
    };

    const parsed = parsePracticeCatalog(rawRpc);
    expect(parsed.pieces).toHaveLength(1);
    expect(parsed.pieces[0].id).toBe('piece_clean');
    expect(parsed.pieces[0].title).toBe('순수 카멜케이스 곡');
    expect(parsed.pieces[0].scoreUrl).toBe('https://example.com/clean.pdf');

    expect(parsed.tracks).toHaveLength(1);
    expect(parsed.tracks[0].id).toBe('track_clean');
    expect(parsed.tracks[0].durationSeconds).toBe(215);
    expect(parsed.tracks[0].storageKey).toBe('audio/soprano.m4a');
    expect(parsed.tracks[0].source).toBe('r2');

    expect(parsed.programPieces).toHaveLength(1);
    expect(parsed.programPieces[0].programId).toBe('card_season_1');
    expect(parsed.programPieces[0].pieceId).toBe('piece_clean');
  });

  it('preserves rows without id by assigning orphan IDs and preserves custom kinds and sources', () => {
    const raw = {
      pieces: [{ title: '이름 없는 곡' }],
      tracks: [{ pieceId: 'p1', label: '특수 트랙', kind: '베이스 특훈', source: 'vimeo' }],
      programPieces: [{ programId: 'card1', pieceId: 'p1' }],
    };

    const parsed = parsePracticeCatalog(raw);
    expect(parsed.pieces[0].id).toBe('orphan_piece_0');
    expect(parsed.pieces[0].title).toBe('이름 없는 곡');
    expect(parsed.tracks[0].id).toBe('orphan_track_0');
    expect(parsed.tracks[0].kind).toBe('베이스 특훈');
    expect(parsed.tracks[0].source).toBe('vimeo');
  });

  it('parses scoreStorageKey, scoreSizeBytes and sizeBytes with backward compatibility fallback', () => {
    const rawWithNewFields = {
      pieces: [
        {
          id: 'p_v3',
          title: '새로운 곡',
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

