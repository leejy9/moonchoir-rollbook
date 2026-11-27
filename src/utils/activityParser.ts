import type { MemberActivity, RsvpEvent, RsvpEventAction } from '../types/rollbook';

export function parseMemberActivity(raw: unknown): MemberActivity {
  if (!raw || typeof raw !== 'object') {
    return {
      rsvpEvents: [],
      listen: {
        totalSeconds: 0,
        firstAt: null,
        daily: [],
        perPiece: [],
      },
    };
  }

  const obj = raw as Record<string, unknown>;

  const rsvpEvents: RsvpEvent[] = Array.isArray(obj.rsvpEvents)
    ? obj.rsvpEvents.map((e: unknown) => {
        const item = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
        return {
          seq: Number(item.seq) || 0,
          scheduleId: String(item.scheduleId || item.schedule_id || ''),
          memberId: String(item.memberId || item.member_id || ''),
          action: (item.action as RsvpEventAction) || 'insert',
          status: String(item.status || ''),
          prevStatus:
            item.prevStatus !== undefined
              ? item.prevStatus
                ? String(item.prevStatus)
                : null
              : item.prev_status
                ? String(item.prev_status)
                : null,
          occurredAt: String(item.occurredAt || item.occurred_at || ''),
        };
      })
    : [];

  const rawListen =
    obj.listen && typeof obj.listen === 'object'
      ? (obj.listen as Record<string, unknown>)
      : {};
  const totalSeconds =
    Number(rawListen.totalSeconds ?? rawListen.total_seconds) || 0;
  const firstAt = rawListen.firstAt
    ? String(rawListen.firstAt)
    : rawListen.first_at
      ? String(rawListen.first_at)
      : null;

  const daily = Array.isArray(rawListen.daily)
    ? rawListen.daily.map((d: unknown) => {
        const item = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>;
        return {
          date: String(item.date || ''),
          seconds: Number(item.seconds) || 0,
        };
      })
    : [];

  const rawPerPiece = rawListen.perPiece ?? rawListen.per_piece;
  const perPiece = Array.isArray(rawPerPiece)
    ? rawPerPiece.map((p: unknown) => {
        const item = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
        return {
          pieceId: String(item.pieceId || item.piece_id || ''),
          seconds: Number(item.seconds) || 0,
          reached60At: item.reached60At
            ? String(item.reached60At)
            : item.reached_60_at
              ? String(item.reached_60_at)
              : null,
        };
      })
    : [];

  return {
    rsvpEvents,
    listen: {
      totalSeconds,
      firstAt,
      daily,
      perPiece,
    },
  };
}
