import type { ScheduleComment, SeenStateRow } from '../types/rollbook';
import type { EvaluatedSticker } from './praiseStickerDefinitions';
import { parseServerTimeMs } from './serverTime';

export interface MergedSeenState {
  baseline: number;
  baselineStickers: number;
  news: number;
  comments: Map<string, number>;
  stickers: Set<string>;
  votes: Set<string>;
}

function maxTimestamp(prev: number, nextMs: number): number {
  if (Number.isNaN(nextMs)) return prev;
  if (Number.isNaN(prev)) return nextMs;
  return Math.max(prev, nextMs);
}

/**
 * 별칭 id들을 포함한 seen 행들을 (kind, scope)별 가장 늦은 시각으로 합친다.
 */
export function mergeSeenRows(rows: SeenStateRow[]): MergedSeenState {
  let baseline = NaN;
  let baselineStickers = NaN;
  let news = NaN;
  const comments = new Map<string, number>();
  const stickers = new Set<string>();
  const votes = new Set<string>();

  for (const row of rows) {
    const ms = parseServerTimeMs(row.seenAt);
    if (row.kind === 'baseline') {
      if (row.scope === '') {
        baseline = maxTimestamp(baseline, ms);
      } else if (row.scope === 'stickers') {
        baselineStickers = maxTimestamp(baselineStickers, ms);
      }
    } else if (row.kind === 'news') {
      if (row.scope === '') {
        news = maxTimestamp(news, ms);
      }
    } else if (row.kind === 'comments') {
      if (!Number.isNaN(ms)) {
        const prev = comments.get(row.scope) ?? NaN;
        comments.set(row.scope, maxTimestamp(prev, ms));
      }
    } else if (row.kind === 'sticker') {
      if (row.scope) stickers.add(row.scope);
    } else if (row.kind === 'vote') {
      if (row.scope) votes.add(row.scope);
    }
  }

  return {
    baseline,
    baselineStickers,
    news,
    comments,
    stickers,
    votes,
  };
}

/**
 * 홈 카드 점과 상세 "새 댓글" 라벨이 공유하는 단일 판정 함수.
 */
export function isCommentUnread(
  comment: Pick<ScheduleComment, 'scheduleId' | 'receivedAt'>,
  seen: MergedSeenState | null,
  isOwn: boolean
): boolean {
  if (!seen || Number.isNaN(seen.baseline)) return false;
  if (isOwn || !comment.receivedAt) return false;
  const ms = parseServerTimeMs(comment.receivedAt);
  if (Number.isNaN(ms)) return false;
  const scheduleSeen = seen.comments.get(comment.scheduleId);
  const threshold =
    scheduleSeen !== undefined && !Number.isNaN(scheduleSeen)
      ? Math.max(seen.baseline, scheduleSeen)
      : seen.baseline;
  return ms > threshold;
}

/**
 * 안 본 칭찬 스티커 목록을 earnedOn 오름차순(없으면 맨 뒤), 같으면 정의 순서대로 돌려준다.
 */
export function pickUnseenStickers(
  evaluated: EvaluatedSticker[],
  seen: MergedSeenState | null
): EvaluatedSticker[] {
  if (!seen || Number.isNaN(seen.baselineStickers)) return [];
  const indexMap = new Map<string, number>();
  evaluated.forEach((s, idx) => indexMap.set(s.id, idx));

  return evaluated
    .filter((s) => s.earned && !seen.stickers.has(s.id))
    .sort((a, b) => {
      if (a.earnedOn && b.earnedOn && a.earnedOn !== b.earnedOn) {
        return a.earnedOn < b.earnedOn ? -1 : 1;
      }
      if (a.earnedOn && !b.earnedOn) return -1;
      if (!a.earnedOn && b.earnedOn) return 1;
      return (indexMap.get(a.id) ?? 0) - (indexMap.get(b.id) ?? 0);
    });
}
