import { useEffect, useRef } from 'react';
import { seenStateStore, useSeenState } from '../../services/seenStateStore';
import { sheetsService } from '../../services/sheets';
import type { Member, NewsItem, RSVPVote, Schedule } from '../../types/rollbook';
import { buildNewsItems } from '../../utils/news';
import type { EvaluatedSticker } from '../../utils/praiseStickerDefinitions';

export interface UseNewsItemsInput {
  enabled: boolean;
  canonicalId: string;
  aliasIds: string[];
  currentMember: Member;
  members: Member[];
  schedules: Schedule[];
  rsvpVotes: RSVPVote[];
  evaluatedStickers: EvaluatedSticker[];
  isStickerDataReady: boolean;
  lastSyncedAt: number;
  nowMs: number;
  windowDays: number;
  onFirstRunSummary?: (earnedStickers: EvaluatedSticker[]) => void;
}

export interface UseNewsItemsResult {
  unread: NewsItem[];
  read: NewsItem[];
  isReady: boolean;
}

export function useNewsItems(input: UseNewsItemsInput): UseNewsItemsResult {
  const {
    enabled,
    canonicalId,
    aliasIds,
    currentMember,
    members,
    schedules,
    rsvpVotes,
    evaluatedStickers,
    isStickerDataReady,
    lastSyncedAt,
    nowMs,
    windowDays,
    onFirstRunSummary,
  } = input;

  const seenState = useSeenState();
  const aliasKey = aliasIds.join(',');
  const baselineInitRef = useRef<string | null>(null);
  const stickerBaselineInitRef = useRef<string | null>(null);

  // 1. Sync seen state for active member when lastSyncedAt changes
  useEffect(() => {
    if (!enabled || !canonicalId || lastSyncedAt <= 0) return;
    const ids = aliasKey ? aliasKey.split(',') : [canonicalId];
    void seenStateStore.syncForMember(canonicalId, ids, lastSyncedAt);
  }, [enabled, canonicalId, aliasKey, lastSyncedAt]);

  // 2. First-run baseline('') & baseline('stickers') initialization (R5)
  useEffect(() => {
    if (!enabled || !canonicalId || seenState.status !== 'ready' || !seenState.seen) return;
    if (lastSyncedAt > 0 && Number.isNaN(seenState.seen.baseline)) {
      if (baselineInitRef.current !== canonicalId) {
        baselineInitRef.current = canonicalId;
        void seenStateStore.markSeen(canonicalId, [
          { kind: 'baseline', scope: '' },
          { kind: 'news', scope: '' },
        ]);
      }
    }
  }, [enabled, canonicalId, seenState.status, seenState.seen, lastSyncedAt]);

  useEffect(() => {
    if (!enabled || !canonicalId || seenState.status !== 'ready' || !seenState.seen) return;
    if (isStickerDataReady && Number.isNaN(seenState.seen.baselineStickers)) {
      if (stickerBaselineInitRef.current !== canonicalId) {
        stickerBaselineInitRef.current = canonicalId;
        const earned = evaluatedStickers.filter((s) => s.earned);
        void seenStateStore.markSeen(canonicalId, [
          { kind: 'baseline', scope: 'stickers' },
          ...earned.map((s) => ({ kind: 'sticker' as const, scope: s.id })),
        ]);
        if (earned.length > 0) {
          onFirstRunSummary?.(earned);
        }
      }
    }
  }, [
    enabled,
    canonicalId,
    seenState.status,
    seenState.seen,
    isStickerDataReady,
    evaluatedStickers,
    onFirstRunSummary,
  ]);

  if (!enabled || seenState.status !== 'ready' || !seenState.seen) {
    return { unread: [], read: [], isReady: false };
  }

  const { unread, read } = buildNewsItems({
    currentMember,
    aliasIds: new Set(aliasIds),
    canonicalId,
    members,
    schedules,
    getComments: (scheduleId) => sheetsService.getComments(scheduleId),
    reactions: sheetsService.getReactionsMap(),
    rsvpVotes,
    evaluatedStickers,
    seen: seenState.seen,
    nowMs,
    windowDays,
  });

  return { unread, read, isReady: true };
}
