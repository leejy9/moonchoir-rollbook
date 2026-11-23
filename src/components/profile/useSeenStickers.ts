import { useCallback, useMemo, useState } from 'react';
import { PREFERENCE_KEYS, readPreference, writePreference } from '../../services/sheetsStorage';

function isStringArray(val: unknown): val is string[] {
  return Array.isArray(val) && val.every((item) => typeof item === 'string');
}

export function isStickerDataReady(
  activityArrived: boolean,
  isStaff: boolean,
  lastSyncedAt: number
): boolean {
  return lastSyncedAt > 0 && (isStaff || activityArrived);
}

export function computeUnseenStickers(
  earnedIds: string[],
  storedSeen: string[] | null,
  isReady = true
): { unseenIds: Set<string>; nextSeen: string[]; shouldInitialize: boolean } {
  if (storedSeen === null) {
    if (!isReady) {
      // Data not ready yet; defer initialization
      return { unseenIds: new Set<string>(), nextSeen: [], shouldInitialize: false };
    }
    // First time on device & data ready: establish baseline, no new badges
    return { unseenIds: new Set<string>(), nextSeen: earnedIds, shouldInitialize: true };
  }
  const seenSet = new Set(storedSeen);
  const unseen = new Set(earnedIds.filter((id) => !seenSet.has(id)));
  return { unseenIds: unseen, nextSeen: storedSeen, shouldInitialize: false };
}

export function useSeenStickers(earnedIds: string[], isReady = true) {
  const [seenIds, setSeenIds] = useState<string[] | null>(() => {
    try {
      return readPreference<string[] | null>(
        PREFERENCE_KEYS.SEEN_STICKERS,
        isStringArray,
        null
      );
    } catch {
      return null;
    }
  });

  // Delay baseline initialization on fresh devices until data has arrived (R5)
  if (seenIds === null && isReady) {
    try {
      writePreference(PREFERENCE_KEYS.SEEN_STICKERS, earnedIds);
    } catch {
      // ignore
    }
    setSeenIds(earnedIds);
  }

  const unseenIds = useMemo(() => {
    if (seenIds === null) return new Set<string>();
    const seenSet = new Set(seenIds);
    return new Set(earnedIds.filter((id) => !seenSet.has(id)));
  }, [earnedIds, seenIds]);

  const markAllSeen = useCallback(() => {
    try {
      writePreference(PREFERENCE_KEYS.SEEN_STICKERS, earnedIds);
      setSeenIds(earnedIds);
    } catch {
      // ignore
    }
  }, [earnedIds]);

  return {
    unseenIds,
    unseenCount: unseenIds.size,
    markAllSeen,
  };
}
