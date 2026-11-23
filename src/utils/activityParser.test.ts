import { describe, expect, it } from 'vitest';
import { parseMemberActivity } from './activityParser';

describe('parseMemberActivity', () => {
  it('returns safe fallback values when given null, undefined, or empty object', () => {
    expect(parseMemberActivity(null)).toEqual({
      rsvpEvents: [],
      listen: {
        totalSeconds: 0,
        firstAt: null,
        daily: [],
        perPiece: [],
      },
    });

    expect(parseMemberActivity(undefined)).toEqual({
      rsvpEvents: [],
      listen: {
        totalSeconds: 0,
        firstAt: null,
        daily: [],
        perPiece: [],
      },
    });

    expect(parseMemberActivity({})).toEqual({
      rsvpEvents: [],
      listen: {
        totalSeconds: 0,
        firstAt: null,
        daily: [],
        perPiece: [],
      },
    });
  });

  it('correctly parses camelCase responses', () => {
    const raw = {
      rsvpEvents: [
        {
          seq: 1,
          scheduleId: 's1',
          memberId: 'm1',
          action: 'insert',
          status: 'ATTEND',
          prevStatus: null,
          occurredAt: '2026-11-23T10:00:00+09:00',
        },
      ],
      listen: {
        totalSeconds: 120,
        firstAt: '2026-11-20T10:00:00+09:00',
        daily: [{ date: '2026-11-20', seconds: 120 }],
        perPiece: [
          { pieceId: 'p1', seconds: 120, reached60At: '2026-11-20T10:01:00+09:00' },
        ],
      },
    };

    const parsed = parseMemberActivity(raw);
    expect(parsed.rsvpEvents).toHaveLength(1);
    expect(parsed.rsvpEvents[0].scheduleId).toBe('s1');
    expect(parsed.rsvpEvents[0].action).toBe('insert');
    expect(parsed.listen.totalSeconds).toBe(120);
    expect(parsed.listen.firstAt).toBe('2026-11-20T10:00:00+09:00');
    expect(parsed.listen.daily[0].date).toBe('2026-11-20');
    expect(parsed.listen.perPiece[0].pieceId).toBe('p1');
    expect(parsed.listen.perPiece[0].reached60At).toBe('2026-11-20T10:01:00+09:00');
  });

  it('correctly parses snake_case database responses', () => {
    const raw = {
      rsvpEvents: [
        {
          seq: 2,
          schedule_id: 's2',
          member_id: 'm1',
          action: 'update',
          status: 'ABSENT',
          prev_status: 'ATTEND',
          occurred_at: '2026-11-23T11:00:00+09:00',
        },
      ],
      listen: {
        total_seconds: 60,
        first_at: '2026-11-21T10:00:00+09:00',
        daily: [{ date: '2026-11-21', seconds: 60 }],
        per_piece: [
          { piece_id: 'p2', seconds: 60, reached_60_at: '2026-11-21T10:01:00+09:00' },
        ],
      },
    };

    const parsed = parseMemberActivity(raw);
    expect(parsed.rsvpEvents[0].scheduleId).toBe('s2');
    expect(parsed.rsvpEvents[0].prevStatus).toBe('ATTEND');
    expect(parsed.listen.totalSeconds).toBe(60);
    expect(parsed.listen.perPiece[0].pieceId).toBe('p2');
    expect(parsed.listen.perPiece[0].reached60At).toBe('2026-11-21T10:01:00+09:00');
  });
});
