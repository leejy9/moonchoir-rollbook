import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { supabaseRealtime } from './supabaseRealtime';

describe('SupabaseRealtimeService', () => {
  beforeEach(() => {
    supabaseRealtime.disconnect();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes and disconnects cleanly without throw', () => {
    expect(() => {
      supabaseRealtime.init();
      supabaseRealtime.disconnect();
    }).not.toThrow();
  });

  it('safely handles environments where window and document are mocked', () => {
    const listeners: Record<string, () => void> = {};
    const mockWindow = {
      addEventListener: vi.fn((event: string, handler: () => void) => {
        listeners[event] = handler;
      }),
    };
    const mockDocument = {
      addEventListener: vi.fn((event: string, handler: () => void) => {
        listeners[event] = handler;
      }),
      visibilityState: 'visible',
    };

    vi.stubGlobal('window', mockWindow);
    vi.stubGlobal('document', mockDocument);

    expect(() => {
      supabaseRealtime.init();
      listeners['visibilitychange']?.();
      listeners['online']?.();
      supabaseRealtime.disconnect();
    }).not.toThrow();

    vi.unstubAllGlobals();
  });
});
