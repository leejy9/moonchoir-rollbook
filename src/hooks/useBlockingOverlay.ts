import { useEffect, useSyncExternalStore } from 'react';

let openCount = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): number {
  return openCount;
}

function increment(): void {
  openCount += 1;
  listeners.forEach((l) => l());
}

function decrement(): void {
  openCount = Math.max(0, openCount - 1);
  listeners.forEach((l) => l());
}

/**
 * 열려 있는 시트·모달·팝오버가 있는 동안 카운터를 1 올린다.
 * 스티커 축하 화면은 카운터가 0일 때만 띄운다 (R11-3).
 */
export function useBlockingOverlay(open: boolean): void {
  useEffect(() => {
    if (!open) return;
    increment();
    return () => {
      decrement();
    };
  }, [open]);
}

export function useIsAnyOverlayOpen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot) > 0;
}
