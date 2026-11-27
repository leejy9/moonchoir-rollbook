import type { CommentReactionEvent, ReactionEmoji } from '../types/rollbook';
import { parseServerTimeMs } from './serverTime';

export const REACTION_EMOJIS = ['👍', '❤️', '👏', '😂', '🙏', '🎵'] as const;

const REACTION_EMOJI_SET = new Set<string>(REACTION_EMOJIS);

export interface EmojiReactionBucket {
  memberAt: Map<string, number>;
}

export type CommentReactionMap = Map<string, Map<ReactionEmoji, EmojiReactionBucket>>;

export function createReactionEventId(): string {
  return `rxn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function isReactionEmoji(val: string): val is ReactionEmoji {
  return REACTION_EMOJI_SET.has(val);
}

/**
 * 반응 원천 이벤트를 배열 순서대로 접어 댓글별·이모지별 현재 켜진 반응과 마지막 ADD 시각(ms)을 계산한다.
 * 병합 회원은 `toCanonical`로 대표 id로 합쳐 한 사람당 1표만 센다.
 */
export function buildCommentReactions(
  events: CommentReactionEvent[],
  toCanonical: (memberId: string) => string = (id) => id
): CommentReactionMap {
  const result: CommentReactionMap = new Map();

  for (const event of events) {
    if (!event.commentId || !event.memberId || !isReactionEmoji(event.emoji)) continue;
    const canonId = toCanonical(event.memberId);

    let byEmoji = result.get(event.commentId);
    if (!byEmoji) {
      if (event.action === 'REMOVE') continue;
      byEmoji = new Map();
      result.set(event.commentId, byEmoji);
    }

    let bucket = byEmoji.get(event.emoji);
    if (event.action === 'ADD') {
      if (!bucket) {
        bucket = { memberAt: new Map() };
        byEmoji.set(event.emoji, bucket);
      }
      bucket.memberAt.set(canonId, parseServerTimeMs(event.receivedAt));
    } else if (event.action === 'REMOVE' && bucket) {
      bucket.memberAt.delete(canonId);
      if (bucket.memberAt.size === 0) {
        byEmoji.delete(event.emoji);
      }
    }
  }

  return result;
}
