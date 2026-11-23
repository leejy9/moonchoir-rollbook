import React from 'react';
import type { RepeatMode } from '../../utils/practiceQueue';

export interface PlayerControlsProps {
  isPlaying: boolean;
  playbackSpeed: number;
  repeatMode: RepeatMode;
  hasNext: boolean;
  togglePlay: () => void;
  previousTrack: () => void;
  nextTrack: () => void;
  seekRelative: (sec: number) => void;
  cycleRepeat: () => void;
  onOpenSpeedSheet: () => void;
  onOpenQueueSheet: () => void;
  disabledControls?: boolean;
}

/**
 * Player Controls (Rows 1 & 2) for FullPlayer (MEMBER_UX_V3_SPEC.md §3-3-3, V25).
 * - Row 1: Previous, -5s, Play/Pause (68px circle), +5s, Next
 * - Row 2: Repeat (off -> all -> one -> off), Playback speed pill, Queue button
 */
export const PlayerControls: React.FC<PlayerControlsProps> = ({
  isPlaying,
  playbackSpeed,
  repeatMode,
  hasNext,
  togglePlay,
  previousTrack,
  nextTrack,
  seekRelative,
  cycleRepeat,
  onOpenSpeedSheet,
  onOpenQueueSheet,
  disabledControls = false,
}) => {
  const repeatAriaLabel =
    repeatMode === 'off'
      ? '반복: 끔'
      : repeatMode === 'all'
      ? '반복: 목록 전체'
      : '반복: 한 곡';

  const speedLabel = `${playbackSpeed % 1 === 0 ? playbackSpeed.toFixed(1) : playbackSpeed.toFixed(2)}x`;

  return (
    <div className="player-controls-container">
      {/* Row 1: Main Playback Controls */}
      <div className="player-controls-row-main">
        {/* Previous Track */}
        <button
          type="button"
          className="player-ctrl-btn player-nav-btn"
          onClick={previousTrack}
          disabled={disabledControls}
          aria-label="이전 곡"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="19 20 9 12 19 4 19 20" fill="currentColor" />
            <line x1="5" y1="4" x2="5" y2="20" strokeWidth="2.5" />
          </svg>
        </button>

        {/* 5s Rewind: Circular arrow with number 5 (V3-20 R9) */}
        <button
          type="button"
          className="player-ctrl-btn player-seek-btn"
          onClick={() => seekRelative(-5)}
          aria-label="5초 뒤로"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <text x="12" y="15.5" fontSize="8" fill="currentColor" textAnchor="middle" stroke="none" fontWeight="bold">
              5
            </text>
          </svg>
        </button>

        {/* Play / Pause Main Circle (68px) */}
        <button
          type="button"
          className="player-play-main-btn"
          onClick={togglePlay}
          aria-label={isPlaying ? '일시정지' : '재생'}
        >
          {isPlaying ? (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="6" y="4" width="4" height="16" rx="1.5" />
              <rect x="14" y="4" width="4" height="16" rx="1.5" />
            </svg>
          ) : (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: '3px' }} aria-hidden="true">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          )}
        </button>

        {/* 5s Forward: Circular arrow with number 5 (V3-20 R9) */}
        <button
          type="button"
          className="player-ctrl-btn player-seek-btn"
          onClick={() => seekRelative(5)}
          aria-label="5초 앞으로"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <text x="12" y="15.5" fontSize="8" fill="currentColor" textAnchor="middle" stroke="none" fontWeight="bold">
              5
            </text>
          </svg>
        </button>

        {/* Next Track */}
        <button
          type="button"
          className="player-ctrl-btn player-nav-btn"
          onClick={nextTrack}
          disabled={disabledControls || !hasNext}
          aria-label="다음 곡"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="5 4 15 12 5 20 5 4" fill="currentColor" />
            <line x1="19" y1="4" x2="19" y2="20" strokeWidth="2.5" />
          </svg>
        </button>
      </div>

      {/* Row 2: Secondary Options (Repeat, Speed Pill, Queue Sheet Button) */}
      <div className="player-controls-row-sub">
        {/* Repeat Toggle */}
        <button
          type="button"
          className={`player-sub-btn player-repeat-btn ${repeatMode !== 'off' ? 'active' : ''}`}
          onClick={cycleRepeat}
          disabled={disabledControls}
          aria-label={repeatAriaLabel}
          aria-pressed={repeatMode !== 'off'}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m17 2 4 4-4 4" />
            <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
            <path d="m7 22-4-4 4-4" />
            <path d="M21 13v1a4 4 0 0 1-4 4H3" />
            {repeatMode === 'one' && (
              <text x="12" y="15" fontSize="8" fill="currentColor" textAnchor="middle" stroke="none" fontWeight="bold">
                1
              </text>
            )}
          </svg>
          {repeatMode !== 'off' && <span className="player-active-dot" aria-hidden="true" />}
        </button>

        {/* Speed Pill */}
        <button
          type="button"
          className="player-speed-pill-btn"
          onClick={onOpenSpeedSheet}
          aria-label="재생 속도 설정"
        >
          {speedLabel}
        </button>

        {/* Queue Button */}
        <button
          type="button"
          className="player-sub-btn player-queue-btn"
          onClick={onOpenQueueSheet}
          aria-label="재생 목록"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" strokeWidth="3" />
            <line x1="3" y1="12" x2="3.01" y2="12" strokeWidth="3" />
            <line x1="3" y1="18" x2="3.01" y2="18" strokeWidth="3" />
          </svg>
        </button>
      </div>
    </div>
  );
};
