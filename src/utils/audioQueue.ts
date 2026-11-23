import type { PracticeTrack } from '../types/rollbook';
import { resolveTrackPlayback } from './practiceMedia';

export interface PlayableTrackItem {
  track: PracticeTrack;
  pieceTitle: string;
  playbackUrl: string;
}

export type PlaybackSpeed = 0.8 | 1.0 | 1.2;

export const PLAYBACK_SPEEDS: PlaybackSpeed[] = [0.8, 1.0, 1.2];

/**
 * Filter tracks to only include playable in-app audio tracks (mode === 'audio').
 * Excludes YouTube, Google Drive, invalid/non-https URLs, etc.
 * (MEMBER_UX_AUDIO_SPEC.md §3-3, §3-4)
 */
export function filterPlayableAudioTracks(
  tracks: PracticeTrack[],
  config?: { mediaPublicBaseUrl?: string }
): PracticeTrack[] {
  return tracks.filter((track) => {
    if (track.isArchived) return false;
    const playback = resolveTrackPlayback(track, config);
    return playback.mode === 'audio';
  });
}

/**
 * Build a queue of PlayableTrackItem from tracks and piece info.
 * Excludes non-audio or archived tracks.
 */
export function buildAudioQueue(
  tracks: PracticeTrack[],
  pieceMap: Map<string, string>,
  config?: { mediaPublicBaseUrl?: string }
): PlayableTrackItem[] {
  const playable = filterPlayableAudioTracks(tracks, config);
  return playable.map((track) => {
    const playback = resolveTrackPlayback(track, config);
    return {
      track,
      pieceTitle: pieceMap.get(track.pieceId) || '연습곡',
      playbackUrl: playback.src || '',
    };
  });
}

/**
 * Cycle through available playback speeds (0.8 -> 1.0 -> 1.2 -> 0.8).
 */
export function getNextPlaybackSpeed(currentSpeed: PlaybackSpeed): PlaybackSpeed {
  const currentIndex = PLAYBACK_SPEEDS.indexOf(currentSpeed);
  if (currentIndex === -1 || currentIndex === PLAYBACK_SPEEDS.length - 1) {
    return PLAYBACK_SPEEDS[0];
  }
  return PLAYBACK_SPEEDS[currentIndex + 1];
}

/**
 * Snap playback speed to 1.0 if within ±0.03 range, clamped between 0.5 and 2.0 (MEMBER_UX_V3_SPEC §3-3).
 */
export function snapPlaybackSpeed(speed: number): number {
  const rounded = Math.round(speed * 100) / 100;
  const clamped = Math.max(0.5, Math.min(2.0, rounded));
  if (Math.abs(clamped - 1.0) <= 0.0301) {
    return 1.0;
  }
  return clamped;
}

/**
 * Calculate seeked time clamped between 0 and duration.
 */
export function clampSeekTime(currentTime: number, offsetSeconds: number, duration: number): number {
  const target = currentTime + offsetSeconds;
  if (Number.isNaN(duration) || duration <= 0) {
    return Math.max(0, target);
  }
  return Math.max(0, Math.min(duration, target));
}
