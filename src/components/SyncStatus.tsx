import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { sheetsService, type SheetsNotice } from '../services/sheets';

const NOTICE_VISIBLE_MS = 8_000;

function formatElapsed(lastSyncedAt: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - lastSyncedAt) / 1000));
  if (seconds < 10) return '방금 동기화됨';
  if (seconds < 60) return `${seconds}초 전 동기화`;
  return `${Math.floor(seconds / 60)}분 전 동기화`;
}

export const SyncStatus: React.FC = () => {
  const state = useSyncExternalStore(
    (listener) => sheetsService.subscribeSync(listener),
    () => sheetsService.getSyncState()
  );
  const [notices, setNotices] = useState<SheetsNotice[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    return sheetsService.subscribeNotices((notice) => {
      setNotices((prev) => [...prev.slice(-2), notice]);
      window.setTimeout(() => {
        setNotices((prev) => prev.filter((n) => n.id !== notice.id));
      }, NOTICE_VISIBLE_MS);
    });
  }, []);

  const hasSynced = state.lastSyncedAt > 0;
  const label =
    state.status === 'SYNCING'
      ? '동기화 중…'
      : state.status === 'ERROR'
        ? '동기화 실패 · 눌러서 다시 시도'
        : hasSynced
          ? formatElapsed(state.lastSyncedAt, now)
          : '';

  return (
    <>
      {notices.length > 0 && (
        <div className="sync-notice-stack" role="alert">
          {notices.map((notice) => (
            <div key={notice.id} className="sync-notice">
              <span>⚠️ {notice.message}</span>
              <button
                type="button"
                aria-label="알림 닫기"
                onClick={() => setNotices((prev) => prev.filter((n) => n.id !== notice.id))}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      {label && (
        <button
          type="button"
          className={`sync-status-pill ${state.status === 'ERROR' ? 'error' : ''}`}
          disabled={state.status === 'SYNCING'}
          onClick={() => void sheetsService.refreshRemoteData({ force: true })}
        >
          {state.status === 'SYNCING' ? '🔄' : state.status === 'ERROR' ? '⚠️' : '✓'} {label}
        </button>
      )}
    </>
  );
};
