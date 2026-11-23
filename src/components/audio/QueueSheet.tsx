import React, { useRef } from 'react';
import type { PlayableTrackItem } from '../../utils/audioQueue';
import type { RepeatMode } from '../../utils/practiceQueue';
import type { QueueSource } from './audioPlayerContext';

export interface QueueSheetProps {
  isOpen: boolean;
  onClose: () => void;
  queue: PlayableTrackItem[];
  currentIndex: number;
  queueSource: QueueSource;
  repeatMode: RepeatMode;
  cycleRepeat: () => void;
  onSelectTrack: (index: number) => void;
}

function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/**
 * 재생 목록 시트 (MEMBER_UX_V3_SPEC.md §3-3-4, 시안 PlayerQueue).
 * - 전체 화면 플레이어 위로 올라오는 시트 (약 72% 높이)
 * - 머리: "재생 목록", 출처 이름 · n곡, 반복 켜져 있을 때 반복 상태 알약
 * - 행: 번호/막대아이콘, 커버 44px, 제목/부제목. 지나간 항목은 past 클래스로 흐림
 * - 행 클릭 시 playQueueIndex(index), 시트는 열린 채 유지
 */
export const QueueSheet: React.FC<QueueSheetProps> = ({
  isOpen,
  onClose,
  queue,
  currentIndex,
  queueSource,
  repeatMode,
  cycleRepeat,
  onSelectTrack,
}) => {
  const touchStartY = useRef<number | null>(null);

  if (!isOpen) return null;

  const sourceTitle = queueSource?.title || '재생 목록';
  const isPerformanceSource = queueSource?.kind === 'performance';

  const handlePointerDown = (e: React.PointerEvent) => {
    touchStartY.current = e.clientY;
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (touchStartY.current === null) return;
    const deltaY = e.clientY - touchStartY.current;
    touchStartY.current = null;
    if (deltaY >= 50) {
      onClose();
    }
  };

  const repeatPillText =
    repeatMode === 'all' ? '목록 반복' : repeatMode === 'one' ? '한 곡 반복' : '';

  return (
    <div
      className="queue-sheet-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="재생 목록"
    >
      <div
        className="queue-sheet-card"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      >
        {/* Pull Handle */}
        <div className="queue-sheet-handle-row" aria-hidden="true">
          <div className="queue-sheet-handle" />
        </div>

        {/* Header */}
        <div className="queue-sheet-header">
          <div className="queue-sheet-header-titles">
            <h2 className="queue-sheet-title">재생 목록</h2>
            <span className="queue-sheet-subtitle">
              {`${sourceTitle} · ${queue.length}곡`}
            </span>
          </div>

          <div className="queue-sheet-header-actions">
            {repeatMode !== 'off' && (
              <button
                type="button"
                className="queue-sheet-repeat-pill"
                onClick={cycleRepeat}
                aria-label={`반복 상태 변경 (현재: ${repeatPillText})`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m17 2 4 4-4 4" />
                  <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
                  <path d="m7 22-4-4 4-4" />
                  <path d="M21 13v1a4 4 0 0 1-4 4H3" />
                </svg>
                <span>{repeatPillText}</span>
              </button>
            )}

            <button
              type="button"
              className="queue-sheet-close-btn"
              onClick={onClose}
              aria-label="재생 목록 닫기"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Queue Items List */}
        <div className="queue-sheet-list" role="list">
          {queue.map((item, idx) => {
            const isPlayingItem = idx === currentIndex;
            const isPastItem = idx < currentIndex;

            let rowClass = 'queue-item-row';
            if (isPlayingItem) rowClass += ' active';
            if (isPastItem) rowClass += ' past';

            const primaryText = isPerformanceSource ? item.pieceTitle : item.track.label;
            const secondaryText = isPerformanceSource
              ? item.track.label
              : formatDuration(item.track.durationSeconds);

            return (
              <button
                key={`${item.track.id}-${idx}`}
                type="button"
                className={rowClass}
                onClick={() => onSelectTrack(idx)}
                aria-label={`${primaryText} 재생`}
              >
                {/* Index / Playing icon */}
                <div className="queue-item-idx-box" aria-hidden="true">
                  {isPlayingItem ? (
                    <span className="queue-playing-bars">
                      <span className="playing-bar bar-1" />
                      <span className="playing-bar bar-2" />
                      <span className="playing-bar bar-3" />
                    </span>
                  ) : (
                    <span className="queue-item-idx-num">{idx + 1}</span>
                  )}
                </div>

                {/* 44px Cover Thumbnail */}
                <div className="queue-item-cover" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                </div>

                {/* Titles */}
                <div className="queue-item-info">
                  <span className="queue-item-primary">{primaryText}</span>
                  {secondaryText && (
                    <span className="queue-item-secondary">{secondaryText}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
