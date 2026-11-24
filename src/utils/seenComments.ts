import type { PreferenceState } from '../services/sheetsStorage';

export interface SeenResolution {
  /** 본 댓글 id. `null`이면 새 댓글 표시를 하지 않는다. */
  seen: ReadonlySet<string> | null;
  /** 저장해야 할 기준값. `null`이면 저장하지 않는다. */
  baselineToWrite: string[] | null;
}

/** 저장 상태와 준비 여부로 "본 댓글"과 저장할 기준값을 정한다 (V3-22 R7). */
export function resolveSeen(
  state: PreferenceState<string[]>,
  isReady: boolean,
  allCommentIds: readonly string[]
): SeenResolution {
  if (state.kind === 'ok') return { seen: new Set(state.value), baselineToWrite: null };
  if (state.kind === 'invalid') return { seen: null, baselineToWrite: null };
  if (!isReady) return { seen: null, baselineToWrite: null };
  return { seen: new Set(allCommentIds), baselineToWrite: [...allCommentIds] };
}

/** 저장값에 없고 내 것이 아닌 댓글 id만 새 댓글이다. `seen`이 없으면 0개. */
export function pickNewCommentIds(
  comments: ReadonlyArray<{ id: string; memberId: string }>,
  seen: ReadonlySet<string> | null,
  isOwn: (memberId: string) => boolean
): string[] {
  if (!seen) return [];
  return comments.filter((c) => !seen.has(c.id) && !isOwn(c.memberId)).map((c) => c.id);
}

/** 저장값에 본 댓글 id를 더한다(중복 없이, 기존 순서 유지). */
export function mergeSeenIds(stored: readonly string[], visibleIds: readonly string[]): string[] {
  const out = [...stored];
  const set = new Set(stored);
  for (const id of visibleIds) {
    if (!set.has(id)) {
      set.add(id);
      out.push(id);
    }
  }
  return out;
}
