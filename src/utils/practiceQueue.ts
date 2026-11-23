import type { PracticeCatalog, PracticeTrack } from '../types/rollbook';
import { filterPlayableAudioTracks, type PlayableTrackItem } from './audioQueue';
import { resolveTrackPlayback } from './practiceMedia';
import { filterPiecesByScope } from './practiceScope';

export type RepeatMode = 'off' | 'all' | 'one';

/**
 * Return the representative audio track for a piece.
 * (MEMBER_UX_V3_SPEC.md §3-3-1, §4-2)
 *
 * Rule:
 * - Unarchived, playable audio track (filterPlayableAudioTracks)
 * - Lowest orderIndex (first in ascending order)
 * - Returns null if no playable audio tracks exist (e.g. video only)
 */
export function getRepresentativeTrack(
  pieceId: string,
  tracks: PracticeTrack[],
  config?: { mediaPublicBaseUrl?: string }
): PracticeTrack | null {
  const pieceTracks = tracks.filter((t) => t.pieceId === pieceId);
  const playableTracks = filterPlayableAudioTracks(pieceTracks, config);
  if (playableTracks.length === 0) return null;

  const sorted = [...playableTracks].sort(
    (a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)
  );
  return sorted[0] || null;
}

/**
 * Build a queue of PlayableTrackItem from all playable audio tracks of a single piece.
 */
export function buildPieceQueue(
  pieceId: string,
  catalog: PracticeCatalog,
  config?: { mediaPublicBaseUrl?: string }
): PlayableTrackItem[] {
  const piece = catalog.pieces.find((p) => p.id === pieceId && !p.isArchived);
  if (!piece) return [];

  const pieceTracks = catalog.tracks.filter((t) => t.pieceId === pieceId);
  const playable = filterPlayableAudioTracks(pieceTracks, config);
  const sorted = [...playable].sort(
    (a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)
  );

  return sorted.map((track) => {
    const playback = resolveTrackPlayback(track, config);
    return {
      track,
      pieceTitle: piece.title,
      playbackUrl: playback.src || '',
    };
  });
}

/**
 * Build a queue of PlayableTrackItem from a performance.
 * Reuses filterPiecesByScope from src/utils/practiceScope.ts for performance piece ordering.
 * (MEMBER_UX_V3_SPEC.md §3-3-1, V25)
 */
export function buildPerformanceQueue(
  performanceId: string,
  catalog: PracticeCatalog,
  config?: { mediaPublicBaseUrl?: string }
): PlayableTrackItem[] {
  const scopedItems = filterPiecesByScope(
    catalog.pieces,
    catalog.performancePieces || [],
    performanceId
  );

  const items: PlayableTrackItem[] = [];

  for (const item of scopedItems) {
    const repTrack = getRepresentativeTrack(item.piece.id, catalog.tracks, config);
    if (!repTrack) continue;

    const playback = resolveTrackPlayback(repTrack, config);
    items.push({
      track: repTrack,
      pieceTitle: item.piece.title,
      playbackUrl: playback.src || '',
    });
  }

  return items;
}

/**
 * Cycle through repeat modes: off -> all -> one -> off
 */
export function cycleRepeat(mode: RepeatMode): RepeatMode {
  if (mode === 'off') return 'all';
  if (mode === 'all') return 'one';
  return 'off';
}

/**
 * Determine track index on track end.
 * - 'one': loop same track
 * - 'all': next track, wraps around to 0
 * - 'off': next track, null if end of queue
 */
export function indexOnTrackEnd(
  index: number,
  length: number,
  mode: RepeatMode
): number | null {
  if (length === 0 || index < 0 || index >= length) return null;
  if (mode === 'one') return index;
  if (mode === 'all') return (index + 1) % length;
  return index + 1 < length ? index + 1 : null;
}

/**
 * Determine track index when clicking "Next".
 * - Next index if available
 * - If at last item: wrap to 0 if 'all', else null (disabled)
 */
export function indexOnNext(
  index: number,
  length: number,
  mode: RepeatMode
): number | null {
  if (length === 0 || index < 0 || index >= length) return null;
  if (index + 1 < length) return index + 1;
  return mode === 'all' ? 0 : null;
}

/**
 * Determine action when clicking "Previous" (3.0s boundary).
 * - currentTime > 3.0s: restart current track
 * - currentTime <= 3.0s: if index > 0 go to index - 1, else restart
 */
export function actionOnPrevious(
  index: number,
  currentTime: number
): { type: 'restart' } | { type: 'go'; index: number } {
  if (currentTime > 3.0) {
    return { type: 'restart' };
  }
  if (index > 0) {
    return { type: 'go', index: index - 1 };
  }
  return { type: 'restart' };
}

/**
 * Find the available playback rate closest to target.
 */
export function nearestRate(rates: number[], target: number): number {
  if (rates.length === 0) return target;
  let closest = rates[0];
  let minDiff = Math.abs(rates[0] - target);

  for (let i = 1; i < rates.length; i++) {
    const diff = Math.abs(rates[i] - target);
    if (diff < minDiff) {
      minDiff = diff;
      closest = rates[i];
    }
  }

  return closest;
}
