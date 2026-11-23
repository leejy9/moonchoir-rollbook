import { useCallback, useMemo, useState } from 'react';
import { PREFERENCE_KEYS, readPreference, writePreference } from '../../services/sheetsStorage';

function isStringArray(val: unknown): val is string[] {
  return Array.isArray(val) && val.every((item) => typeof item === 'string');
}

export function computeUnseenStickers(
  earnedIds: string[],
  storedSeen: string[] | null
): { unseenIds: Set<string>; nextSeen: string[]; shouldInitialize: boolean } {
  if (storedSeen === null) {
    // First time on device: establish baseline, no new badges
    return { unseenIds: new Set<string>(), nextSeen: earnedIds, shouldInitialize: true };
  }
  const seenSet = new Set(storedSeen);
  const unseen = new Set(earnedIds.filter((id) => !seenSet.has(id)));
  return { unseenIds: unseen, nextSeen: storedSeen, shouldInitialize: false };
}

export function useSeenStickers(earnedIds: string[]) {
  const [seenIds, setSeenIds] = useState<string[] | null>(() => {
    try {
      const stored = readPreference<string[] | null>(
        PREFERENCE_KEYS.SEEN_STICKERS,
        isStringArray,
        null
      );
      const computed = computeUnseenStickers(earnedIds, stored);
      if (computed.shouldInitialize) {
        writePreference(PREFERENCE_KEYS.SEEN_STICKERS, computed.nextSeen);
      }
      return computed.nextSeen;
    } catch {
      return earnedIds;
    }
  });

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
