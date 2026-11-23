import { useEffect } from 'react';
import type { PlayableTrackItem } from '../../utils/audioQueue';

export interface UseMediaSessionProps {
  currentTrack: PlayableTrackItem | null;
  queueLength: number;
  playbackSpeed: number;
  currentTime: number;
  duration: number;
  resume: () => void;
  pause: () => void;
  seekRelative: (offsetSeconds: number) => void;
  seekTo: (timeSeconds: number) => void;
  previousTrack: () => void;
  nextTrack: () => void;
  activeVideo?: unknown;
}

/**
 * Hook to synchronize playback state and controls with the MediaSession API.
 * (MEMBER_UX_V3_SPEC.md §3-3-3, §3-3-5, V25)
 *
 * Rules:
 * - previoustrack and nexttrack are only registered when queueLength >= 2, otherwise cleared (null)
 * - When activeVideo is truthy, all handlers and metadata are cleared
 * - Cleans up on unmount or player close
 */
export function useMediaSession({
  currentTrack,
  queueLength,
  playbackSpeed,
  currentTime,
  duration,
  resume,
  pause,
  seekRelative,
  seekTo,
  previousTrack,
  nextTrack,
  activeVideo,
}: UseMediaSessionProps): void {
  // Metadata & Action Handlers
  useEffect(() => {
    if (
      typeof navigator === 'undefined' ||
      !('mediaSession' in navigator) ||
      !navigator.mediaSession
    ) {
      return;
    }

    const session = navigator.mediaSession;

    if (!currentTrack || Boolean(activeVideo)) {
      try {
        session.metadata = null;
        session.setActionHandler('play', null);
        session.setActionHandler('pause', null);
        session.setActionHandler('seekbackward', null);
        session.setActionHandler('seekforward', null);
        session.setActionHandler('seekto', null);
        session.setActionHandler('previoustrack', null);
        session.setActionHandler('nexttrack', null);
      } catch (err) {
        console.warn('[useMediaSession] clear handlers failed:', err);
      }
      return;
    }

    try {
      if (typeof MediaMetadata !== 'undefined') {
        session.metadata = new MediaMetadata({
          title: currentTrack.pieceTitle,
          artist: '문콰이어',
          album: currentTrack.track.label,
        });
      }

      session.setActionHandler('play', () => {
        resume();
      });
      session.setActionHandler('pause', () => {
        pause();
      });
      session.setActionHandler('seekbackward', (details) => {
        seekRelative(-(details?.seekOffset || 5));
      });
      session.setActionHandler('seekforward', (details) => {
        seekRelative(details?.seekOffset || 5);
      });
      session.setActionHandler('seekto', (details) => {
        if (details?.seekTime !== undefined) {
          seekTo(details.seekTime);
        }
      });

      // previoustrack/nexttrack registered only when queueLength >= 2
      if (queueLength >= 2) {
        session.setActionHandler('previoustrack', () => {
          previousTrack();
        });
        session.setActionHandler('nexttrack', () => {
          nextTrack();
        });
      } else {
        session.setActionHandler('previoustrack', null);
        session.setActionHandler('nexttrack', null);
      }
    } catch (err) {
      console.warn('[useMediaSession] setActionHandler failed:', err);
    }

    return () => {
      try {
        session.metadata = null;
        session.setActionHandler('play', null);
        session.setActionHandler('pause', null);
        session.setActionHandler('seekbackward', null);
        session.setActionHandler('seekforward', null);
        session.setActionHandler('seekto', null);
        session.setActionHandler('previoustrack', null);
        session.setActionHandler('nexttrack', null);
      } catch (err) {
        console.warn('[useMediaSession] cleanup failed:', err);
      }
    };
  }, [
    currentTrack,
    queueLength,
    activeVideo,
    resume,
    pause,
    seekRelative,
    seekTo,
    previousTrack,
    nextTrack,
  ]);

  // Position state synchronization
  useEffect(() => {
    if (
      typeof navigator === 'undefined' ||
      !('mediaSession' in navigator) ||
      !navigator.mediaSession ||
      !('setPositionState' in navigator.mediaSession) ||
      duration <= 0 ||
      Boolean(activeVideo)
    ) {
      return;
    }

    try {
      navigator.mediaSession.setPositionState({
        duration: Math.max(0, duration),
        playbackRate: playbackSpeed,
        position: Math.max(0, Math.min(currentTime, duration)),
      });
    } catch (err) {
      console.warn('[useMediaSession] setPositionState failed:', err);
    }
  }, [currentTime, duration, playbackSpeed, activeVideo]);
}
