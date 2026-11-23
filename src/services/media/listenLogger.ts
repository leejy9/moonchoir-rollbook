import type { PlayableTrackItem } from '../../utils/audioQueue';
import type { ListenSessionPayload } from '../../types/rollbook';
import { getBoundDeviceProfile } from '../auth';
import { sheetsService } from '../sheets';

export interface ListenLoggerDeps {
  getMemberId?: () => string | null;
  onSendSession?: (payload: ListenSessionPayload) => Promise<boolean>;
  now?: () => number;
}

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Audio playback listen logging engine (MEMBER_UX_V3_SPEC.md §7-2, §7-4).
 * - Accumulates actual playback seconds during timeupdate
 * - Jumps > 2s are treated as seeks and ignored
 * - Flushes every 60s, pause, ended, track change, visibilitychange: hidden
 * - Discards or holds chunks < 30s
 * - Silent catch with console.warn on network failure
 */
export class ListenLogger {
  private getMemberId: () => string | null;
  private onSendSession: (payload: ListenSessionPayload) => Promise<boolean>;
  private now: () => number;

  private currentTrack: PlayableTrackItem | null = null;
  private isPlaying = false;
  private lastAudioTime: number | null = null;
  private lastWallClock: number | null = null;
  private accumulatedSeconds = 0;
  private sessionStartedAt: string = new Date().toISOString();
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(deps?: ListenLoggerDeps) {
    this.getMemberId =
      deps?.getMemberId ??
      (() => {
        const profile = getBoundDeviceProfile();
        return profile?.memberId ?? null;
      });
    this.onSendSession =
      deps?.onSendSession ??
      (async (payload) => {
        return sheetsService.logListenSession(payload);
      });
    this.now = deps?.now ?? (() => Date.now());

    if (typeof window !== 'undefined') {
      this.intervalId = setInterval(() => {
        if (this.isPlaying && this.accumulatedSeconds >= 60) {
          void this.flush();
        }
      }, 5000);
    }
  }

  public onTrackChange(track: PlayableTrackItem | null): void {
    if (this.currentTrack && this.currentTrack.track.id !== track?.track.id) {
      void this.flush();
      this.accumulatedSeconds = 0;
    }
    this.currentTrack = track;
    this.lastAudioTime = null;
    this.lastWallClock = null;
    this.sessionStartedAt = new Date(this.now()).toISOString();
  }

  public onPlay(): void {
    this.isPlaying = true;
    this.lastWallClock = this.now();
  }

  public onPause(): void {
    this.isPlaying = false;
    this.lastAudioTime = null;
    this.lastWallClock = null;
    void this.flush();
  }

  public onEnded(): void {
    this.isPlaying = false;
    this.lastAudioTime = null;
    this.lastWallClock = null;
    void this.flush();
  }

  public onVisibilityChange(hidden: boolean): void {
    if (hidden && this.isPlaying) {
      void this.flush();
    }
  }

  public onTimeUpdate(currentTime: number): void {
    if (!this.isPlaying || !this.currentTrack) {
      this.lastAudioTime = currentTime;
      this.lastWallClock = this.now();
      return;
    }

    const now = this.now();
    if (this.lastAudioTime !== null && this.lastWallClock !== null) {
      const audioDelta = currentTime - this.lastAudioTime;
      const wallDelta = (now - this.lastWallClock) / 1000;

      // Seeks (> 2s jump or backward seek) are skipped
      if (audioDelta >= 0 && audioDelta <= 2 && wallDelta > 0 && wallDelta <= 2) {
        this.accumulatedSeconds += wallDelta;
      }
    }

    this.lastAudioTime = currentTime;
    this.lastWallClock = now;

    if (this.accumulatedSeconds >= 60) {
      void this.flush();
    }
  }

  public async flush(): Promise<void> {
    const seconds = Math.floor(this.accumulatedSeconds);
    if (seconds < 30 || !this.currentTrack) {
      return;
    }

    const memberId = this.getMemberId();
    if (!memberId) {
      // Unauthenticated / no member bound; do not send
      return;
    }

    const sendSeconds = Math.min(120, seconds);
    this.accumulatedSeconds -= sendSeconds;

    const payload: ListenSessionPayload = {
      chunkId: generateUUID(),
      memberId,
      pieceId: this.currentTrack.track.pieceId,
      trackId: this.currentTrack.track.id,
      startedAt: this.sessionStartedAt,
      listenedSeconds: sendSeconds,
    };
    this.sessionStartedAt = new Date(this.now()).toISOString();

    try {
      await this.onSendSession(payload);
    } catch (err) {
      console.warn('[ListenLogger] Failed to log listen session:', err);
    }
  }

  public destroy(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isPlaying = false;
    this.currentTrack = null;
  }
}
