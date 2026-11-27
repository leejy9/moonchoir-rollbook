import { useSyncExternalStore } from 'react';
import type { PendingSeenItem, SeenStateItem, SeenStateRow } from '../types/rollbook';
import { mergeSeenRows, type MergedSeenState } from '../utils/seenState';
import { sheetsService } from './sheets';
import { PREFERENCE_KEYS, readPreference, writePreference } from './sheetsStorage';

export type SeenStateStatus = 'notReady' | 'ready' | 'error';

export interface SeenStoreSnapshot {
  status: SeenStateStatus;
  seen: MergedSeenState | null;
}

function isPendingSeenArray(val: unknown): val is PendingSeenItem[] {
  return (
    Array.isArray(val) &&
    val.every(
      (item) =>
        item &&
        typeof item === 'object' &&
        typeof (item as PendingSeenItem).memberId === 'string' &&
        typeof (item as PendingSeenItem).kind === 'string' &&
        typeof (item as PendingSeenItem).scope === 'string'
    )
  );
}

function readPendingSeen(): PendingSeenItem[] {
  return readPreference<PendingSeenItem[]>(PREFERENCE_KEYS.PENDING_SEEN, isPendingSeenArray, []);
}

function writePendingSeen(items: PendingSeenItem[]): void {
  writePreference(PREFERENCE_KEYS.PENDING_SEEN, items);
}

class SeenStateStore {
  private status: SeenStateStatus = 'notReady';
  private serverRows: SeenStateRow[] = [];
  private localRows: SeenStateRow[] = [];
  private currentCanonicalId: string | null = null;
  private currentAliasSet = new Set<string>();
  private inFlightPromise: Promise<void> | null = null;
  private lastFetchedSyncAt = 0;
  private snapshot: SeenStoreSnapshot = { status: 'notReady', seen: null };
  private listeners = new Set<() => void>();

  private rebuildSnapshot(): void {
    if (this.status !== 'ready') {
      this.snapshot = { status: this.status, seen: null };
    } else {
      const pendingRows: SeenStateRow[] = readPendingSeen()
        .filter((p) => this.currentAliasSet.has(p.memberId))
        .map((p) => ({
          memberId: p.memberId,
          kind: p.kind,
          scope: p.scope,
          seenAt: p.upTo ?? new Date().toISOString(),
        }));
      const merged = mergeSeenRows([...this.serverRows, ...this.localRows, ...pendingRows]);
      this.snapshot = { status: 'ready', seen: merged };
    }
    this.listeners.forEach((listener) => listener());
  }

  public getSnapshot = (): SeenStoreSnapshot => this.snapshot;

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  public reset(): void {
    this.status = 'notReady';
    this.serverRows = [];
    this.localRows = [];
    this.currentCanonicalId = null;
    this.currentAliasSet = new Set();
    this.inFlightPromise = null;
    this.lastFetchedSyncAt = 0;
    this.rebuildSnapshot();
  }

  public async syncForMember(
    canonicalId: string,
    aliasIds: string[],
    lastSyncedAt: number
  ): Promise<void> {
    if (sheetsService.getBackendKind() !== 'supabase') {
      if (this.status !== 'notReady') {
        this.reset();
      }
      return;
    }

    if (!canonicalId || lastSyncedAt <= 0) return;

    if (this.currentCanonicalId !== canonicalId) {
      this.status = 'notReady';
      this.serverRows = [];
      this.localRows = [];
      this.currentCanonicalId = canonicalId;
      this.currentAliasSet = new Set(aliasIds);
      this.lastFetchedSyncAt = 0;
      this.rebuildSnapshot();
    } else {
      this.currentAliasSet = new Set(aliasIds);
    }

    if (this.lastFetchedSyncAt === lastSyncedAt && this.status === 'ready') {
      return;
    }
    if (this.inFlightPromise) {
      return this.inFlightPromise;
    }

    const targetCanonical = canonicalId;
    const targetAliases = [...aliasIds];

    this.inFlightPromise = (async () => {
      try {
        const rows = await sheetsService.fetchSeenState(targetAliases);
        if (this.currentCanonicalId !== targetCanonical) return;
        if (rows === null) {
          this.status = 'error';
          this.rebuildSnapshot();
          return;
        }
        this.serverRows = rows;
        this.lastFetchedSyncAt = lastSyncedAt;
        this.status = 'ready';
        this.rebuildSnapshot();

        // 받아 오기 성공 직후 대기열 재전송
        await this.flushPending(targetCanonical, targetAliases);
      } finally {
        this.inFlightPromise = null;
      }
    })();

    return this.inFlightPromise;
  }

  private async flushPending(canonicalId: string, aliasIds: string[]): Promise<void> {
    const aliasSet = new Set(aliasIds);
    const allPending = readPendingSeen();
    const mine = allPending.filter((p) => aliasSet.has(p.memberId));
    if (mine.length === 0) return;

    const items: SeenStateItem[] = mine.map(({ kind, scope, upTo }) => ({
      kind,
      scope,
      ...(upTo ? { upTo } : {}),
    }));
    const ok = await sheetsService.markSeen(canonicalId, items);
    if (ok) {
      const remaining = readPendingSeen().filter((p) => !aliasSet.has(p.memberId));
      writePendingSeen(remaining);
    }
  }

  public async markSeen(canonicalId: string, items: SeenStateItem[]): Promise<boolean> {
    if (!canonicalId || items.length === 0) return true;
    const nowIso = new Date().toISOString();

    for (const item of items) {
      this.localRows.push({
        memberId: canonicalId,
        kind: item.kind,
        scope: item.scope,
        seenAt: item.kind === 'baseline' ? nowIso : (item.upTo ?? nowIso),
      });
    }
    if (this.status === 'ready') {
      this.rebuildSnapshot();
    }

    if (sheetsService.getBackendKind() !== 'supabase') {
      return false;
    }

    const ok = await sheetsService.markSeen(canonicalId, items);
    if (!ok) {
      const existing = readPendingSeen();
      const additions: PendingSeenItem[] = items.map((item) => ({
        memberId: canonicalId,
        kind: item.kind,
        scope: item.scope,
        ...(item.upTo ? { upTo: item.upTo } : {}),
      }));
      writePendingSeen([...existing, ...additions]);
    }
    return ok;
  }
}

export const seenStateStore = new SeenStateStore();

export function useSeenState(): SeenStoreSnapshot {
  return useSyncExternalStore(
    seenStateStore.subscribe,
    seenStateStore.getSnapshot,
    seenStateStore.getSnapshot
  );
}
