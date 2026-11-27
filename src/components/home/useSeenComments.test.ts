import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackendActionResult, RemoteBackend, RemoteSnapshot } from '../../services/backend/types';
import { seenStateStore } from '../../services/seenStateStore';
import { resetStorage, sheetsService } from '../../services/sheets';
import { PREFERENCE_KEYS, readPreference } from '../../services/sheetsStorage';

class StubSeenBackend implements RemoteBackend {
  public readonly kind = 'supabase' as const;
  public calls: Array<{ action: string; payload: unknown }> = [];
  public failMarkSeen = false;
  public rows: Array<{ memberId: string; kind: string; scope: string; seenAt: string }> = [
    { memberId: 'm1', kind: 'baseline', scope: '', seenAt: '2026-11-27T00:00:00.000Z' },
  ];

  async requestSnapshot(): Promise<RemoteSnapshot> {
    return {};
  }

  async callAction(action: string, payload: unknown): Promise<BackendActionResult> {
    this.calls.push({ action, payload });
    if (action === 'GET_SEEN_STATE') {
      return { success: true, data: { rows: this.rows } };
    }
    if (action === 'MARK_SEEN') {
      return { success: !this.failMarkSeen };
    }
    return { success: true };
  }
}

describe('seenStateStore (V3-24 R11-1)', () => {
  let prevBackend: RemoteBackend;

  beforeEach(() => {
    resetStorage();
    seenStateStore.reset();
    prevBackend = sheetsService.getBackend();
  });

  afterEach(() => {
    seenStateStore.reset();
    sheetsService.setBackend(prevBackend);
    vi.restoreAllMocks();
  });

  it('queues failed markSeen in PENDING_SEEN and flushes on next successful fetch', async () => {
    const backend = new StubSeenBackend();
    backend.failMarkSeen = true;
    sheetsService.setBackend(backend);

    await seenStateStore.syncForMember('m1', ['m1'], 100);
    await seenStateStore.markSeen('m1', [{ kind: 'comments', scope: 's1', upTo: '2026-11-27T02:00:00.000Z' }]);

    const pending = readPreference<unknown[]>(PREFERENCE_KEYS.PENDING_SEEN, Array.isArray, []);
    expect(pending).toHaveLength(1);
    // Local optimistic state reflects the markSeen immediately
    expect(seenStateStore.getSnapshot().seen?.comments.get('s1')).toBe(
      Date.parse('2026-11-27T02:00:00.000Z')
    );

    // Next sync succeeds and flushes pending queue
    backend.failMarkSeen = false;
    await seenStateStore.syncForMember('m1', ['m1'], 200);
    const remaining = readPreference<unknown[]>(PREFERENCE_KEYS.PENDING_SEEN, Array.isArray, []);
    expect(remaining).toHaveLength(0);
  });
});
