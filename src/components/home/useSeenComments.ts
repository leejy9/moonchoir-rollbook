import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { sheetsService } from '../../services/sheets';
import {
  PREFERENCE_KEYS,
  readPreferenceState,
  writePreference,
  type PreferenceState,
} from '../../services/sheetsStorage';
import type { Schedule } from '../../types/rollbook';
import { mergeSeenIds, pickNewCommentIds, resolveSeen } from '../../utils/seenComments';

function isStringArray(val: unknown): val is string[] {
  return Array.isArray(val) && val.every((item) => typeof item === 'string');
}

export function readSeenCommentsState(): PreferenceState<string[]> {
  return readPreferenceState<string[]>(PREFERENCE_KEYS.SEEN_COMMENTS, isStringArray);
}

// 모듈 단위 구독: 상세를 닫은 뒤 홈 카드가 바로 바뀌게 한다.
const listeners = new Set<() => void>();
let version = 0;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  version += 1;
  listeners.forEach((l) => l());
}

/**
 * 보인 댓글 id를 저장값에 더한다. 저장 상태가 ok일 때만 쓴다.
 * missing·invalid면 아무것도 쓰지 않는다(일부 목록이 기준값을 대신하면 안 된다).
 */
export function recordSeenComments(visibleIds: readonly string[]): void {
  if (visibleIds.length === 0) return;
  const state = readSeenCommentsState();
  if (state.kind !== 'ok') return;
  const merged = mergeSeenIds(state.value, visibleIds);
  if (merged.length === state.value.length) return;
  writePreference(PREFERENCE_KEYS.SEEN_COMMENTS, merged);
  notify();
}

export interface SeenCommentsView {
  /** 일정별 새 댓글 여부 */
  hasNewComment: (scheduleId: string) => boolean;
}

/**
 * 홈 카드용 새 댓글 계산. 기기 저장값만 쓴다(서버에 올리지 않는다).
 * @param isReady 원격 동기화가 한 번이라도 끝났는지(`lastSyncedAt > 0`)
 */
export function useSeenComments(
  memberId: string,
  schedules: readonly Schedule[],
  isReady: boolean,
  refreshKey?: number
): SeenCommentsView {
  const storeVersion = useSyncExternalStore(
    subscribe,
    () => version,
    () => version
  );

  const commentsBySchedule = useMemo(() => {
    void refreshKey;
    return schedules.map((s) => ({ scheduleId: s.id, comments: sheetsService.getComments(s.id) }));
  }, [schedules, refreshKey]);

  const resolution = useMemo(() => {
    void storeVersion;
    const allIds = commentsBySchedule.flatMap((e) => e.comments.map((c) => c.id));
    return resolveSeen(readSeenCommentsState(), isReady, allIds);
  }, [commentsBySchedule, isReady, storeVersion]);

  const { baselineToWrite } = resolution;
  useEffect(() => {
    if (!baselineToWrite) return;
    writePreference(PREFERENCE_KEYS.SEEN_COMMENTS, baselineToWrite);
    notify();
  }, [baselineToWrite]);

  const newByScheduleId = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const entry of commentsBySchedule) {
      const ids = pickNewCommentIds(entry.comments, resolution.seen, (authorId) =>
        sheetsService.isOwnComment({ memberId: authorId }, memberId)
      );
      if (ids.length > 0) map.set(entry.scheduleId, true);
    }
    return map;
  }, [commentsBySchedule, resolution.seen, memberId]);

  return { hasNewComment: (scheduleId) => newByScheduleId.get(scheduleId) === true };
}
