import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readAudioDuration } from './audioMetadata';

describe('readAudioDuration (F8)', () => {
  let originalAudio: any;
  let originalCreateObjectURL: any;
  let originalRevokeObjectURL: any;
  let revokeSpy: any;

  beforeEach(() => {
    vi.useFakeTimers();
    revokeSpy = vi.fn();
    originalCreateObjectURL = (URL as any).createObjectURL;
    originalRevokeObjectURL = (URL as any).revokeObjectURL;
    (URL as any).createObjectURL = vi.fn(() => 'blob:mock-audio-url');
    (URL as any).revokeObjectURL = revokeSpy;
    originalAudio = globalThis.Audio;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    (URL as any).createObjectURL = originalCreateObjectURL;
    (URL as any).revokeObjectURL = originalRevokeObjectURL;
    globalThis.Audio = originalAudio;
  });

  it('reads valid duration from loadedmetadata and revokes object URL', async () => {
    class FakeAudio {
      src = '';
      duration = 184.4;
      private listeners: Record<string, () => void> = {};

      addEventListener(event: string, handler: () => void) {
        this.listeners[event] = handler;
        if (event === 'loadedmetadata') {
          setTimeout(() => handler(), 10);
        }
      }

      removeEventListener(event: string) {
        delete this.listeners[event];
      }
    }
    globalThis.Audio = FakeAudio as any;

    const file = new File(['mock content'], 'test.m4a', { type: 'audio/mp4' });
    const durationPromise = readAudioDuration(file);

    await vi.advanceTimersByTimeAsync(20);
    const duration = await durationPromise;

    expect(duration).toBe(184);
    expect(revokeSpy).toHaveBeenCalledWith('blob:mock-audio-url');
  });

  it('returns undefined if metadata loading times out after 5000ms', async () => {
    class HangingAudio {
      src = '';
      duration = 0;
      addEventListener() {
        // never fires loadedmetadata
      }
      removeEventListener() {}
    }
    globalThis.Audio = HangingAudio as any;

    const file = new File(['mock content'], 'test.m4a', { type: 'audio/mp4' });
    const durationPromise = readAudioDuration(file);

    // Advance 4999ms -> still pending
    await vi.advanceTimersByTimeAsync(4999);
    // Advance past 5000ms
    await vi.advanceTimersByTimeAsync(10);
    const duration = await durationPromise;

    expect(duration).toBeUndefined();
    expect(revokeSpy).toHaveBeenCalledWith('blob:mock-audio-url');
  });

  it('returns undefined when duration is Infinity or NaN', async () => {
    class InfinityAudio {
      src = '';
      duration = Infinity;
      addEventListener(event: string, handler: () => void) {
        if (event === 'loadedmetadata') {
          setTimeout(() => handler(), 10);
        }
      }
      removeEventListener() {}
    }
    globalThis.Audio = InfinityAudio as any;

    const file = new File(['mock content'], 'test.m4a', { type: 'audio/mp4' });
    const durationPromise = readAudioDuration(file);

    await vi.advanceTimersByTimeAsync(20);
    const duration = await durationPromise;

    expect(duration).toBeUndefined();
    expect(revokeSpy).toHaveBeenCalledWith('blob:mock-audio-url');
  });
});
