import React, { useRef } from 'react';
import { useAudioPlayer, useAudioPosition } from './audioPlayerContext';
import { indexOnNext } from '../../utils/practiceQueue';
import '../../styles/v3/player.css';

export interface MiniPlayerProps {
  onOpenFullPlayer?: () => void;
}

/**
 * Mini Player bar (MEMBER_UX_V3_SPEC.md §3-3-2, 시안 PlayerMini).
 * - 단원 화면의 모든 탭에서 하단 탭 위에 고정
 * - 구성: 커버(라벤더 사각+음표, 영상이면 어두운 사각+영상), 트랙이름 / 곡이름(탭하면 전체화면)
 * - 재생·일시정지, 다음(큐 기준), × 닫기(44px, aria-label="플레이어 닫기"), 맨 아래 2px 진행선
 */
export const MiniPlayer: React.FC<MiniPlayerProps> = ({ onOpenFullPlayer }) => {
  const {
    currentTrack,
    isPlaying,
    isBlocked,
    togglePlay,
    resume,
    nextTrack,
    closePlayer,
    queue,
    currentIndex,
    repeatMode,
    activeVideo,
  } = useAudioPlayer();

  const { currentTime, duration } = useAudioPosition();

  // Swipe-to-dismiss gesture handling
  const touchStartY = useRef<number | null>(null);
  const touchStartX = useRef<number | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    touchStartY.current = e.clientY;
    touchStartX.current = e.clientX;
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (touchStartY.current === null || touchStartX.current === null) return;
    const deltaY = e.clientY - touchStartY.current;
    const deltaX = Math.abs(e.clientX - touchStartX.current);

    touchStartY.current = null;
    touchStartX.current = null;

    // Threshold: swipe down >= 64px and vertical > horizontal
    if (deltaY >= 64 && deltaY > deltaX) {
      closePlayer();
    }
  };

  if (!currentTrack && !activeVideo) {
    return null;
  }

  const hasNext = !activeVideo && indexOnNext(currentIndex, queue.length, repeatMode) !== null;
  const isVideo = Boolean(activeVideo);

  const trackLabel = activeVideo ? activeVideo.track.label : currentTrack?.track.label || '';
  const pieceTitle = activeVideo ? activeVideo.pieceTitle : currentTrack?.pieceTitle || '';

  const progressPercent =
    !isVideo && duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  return (
    <div
      className="mini-player-container"
      role="region"
      aria-label="오디오 플레이어"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onClick={onOpenFullPlayer}
    >
      {/* 1. Cover Art (Lavender + note, or dark + video) */}
      <div
        className={`mini-player-cover ${isVideo ? 'video' : 'audio'}`}
        aria-hidden="true"
        style={
          isVideo
            ? { background: 'var(--player-surface-full)', color: 'var(--text-white, #ffffff)' }
            : undefined
        }
      >
        {isVideo ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        )}
      </div>

      {/* 2. Track & Piece Info (tap to open full player) */}
      <div className="mini-player-info">
        <span className="mini-player-track-title">{trackLabel}</span>
        <span className="mini-player-piece-title">{pieceTitle}</span>
      </div>

      {/* 3. Controls (Play/Pause, Next Track, Close X) */}
      <div
        className="mini-player-controls"
        onClick={(e) => e.stopPropagation()} // Prevent opening full player when tapping buttons
      >
        {isVideo ? (
          <button
            type="button"
            className="mini-player-btn"
            onClick={onOpenFullPlayer}
            aria-label="플레이어에서 이어 보기"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </button>
        ) : isBlocked ? (
          <button
            type="button"
            className="mini-player-btn"
            onClick={resume}
            aria-label="탭하여 다시 재생"
            style={{ fontSize: '12px', fontWeight: 700, color: 'var(--brand-primary)' }}
          >
            재생
          </button>
        ) : (
          <button
            type="button"
            className="mini-player-btn"
            onClick={togglePlay}
            aria-label={isPlaying ? '일시정지' : '재생'}
          >
            {isPlaying ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            )}
          </button>
        )}

        <button
          type="button"
          className="mini-player-btn"
          onClick={nextTrack}
          disabled={!hasNext}
          aria-label="다음 트랙"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5 4 15 12 5 20 5 4" fill="currentColor" />
            <line x1="19" y1="5" x2="19" y2="19" />
          </svg>
        </button>

        <button
          type="button"
          className="mini-player-btn"
          onClick={(e) => {
            e.stopPropagation();
            closePlayer();
          }}
          aria-label="플레이어 닫기"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* 4. Bottom 2px Progress Line */}
      <div
        className="mini-player-progress-line"
        style={{ width: `${progressPercent}%` }}
        aria-hidden="true"
      />
    </div>
  );
};
