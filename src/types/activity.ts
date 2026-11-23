/**
 * Member Activity & Listen Session Models (MEMBER_UX_V3_SPEC.md §7-1, §7-2, §7-5)
 */

export type RsvpEventAction = 'insert' | 'update' | 'delete' | 'backfill';

export interface RsvpEvent {
  seq: number;
  scheduleId: string;
  memberId: string;
  action: RsvpEventAction;
  status: string;
  prevStatus?: string | null;
  occurredAt: string;
}

export interface ListenDailyEntry {
  date: string; // YYYY-MM-DD (KST)
  seconds: number;
}

export interface ListenPerPieceEntry {
  pieceId: string;
  seconds: number;
  reached60At?: string | null;
}

export interface MemberListenActivity {
  totalSeconds: number;
  firstAt?: string | null;
  daily: ListenDailyEntry[];
  perPiece: ListenPerPieceEntry[];
}

export interface MemberActivity {
  rsvpEvents: RsvpEvent[];
  listen: MemberListenActivity;
}

export interface ListenSessionPayload {
  chunkId: string;
  memberId: string;
  pieceId: string;
  trackId: string;
  startedAt: string;
  listenedSeconds: number;
}
