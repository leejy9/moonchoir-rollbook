import React, { useRef, useState } from 'react';
import type { PracticePiece, PracticeTrack } from '../../types/rollbook';
import { useAudioPlayer, useAudioPosition } from './audioPlayerContext';
import { SpeedSheet } from './SpeedSheet';
import '../../styles/v3/fullPlayer.css';

export interface FullPlayerProps {
  piece?: PracticePiece | null;
  siblingTracks?: PracticeTrack[];
  onClose: () => void;
  onOpenScore?: (piece: PracticePiece) => void;
}

function formatSeconds(sec: number): string {
  if (Number.isNaN(sec) || sec < 0) return '0:00';
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export const FullPlayer: React.FC<FullPlayerProps> = ({
  piece,
  siblingTracks = [],
  onClose,
  onOpenScore,
}) => {
  const {
    currentTrack,
    isPlaying,
    playbackSpeed,
    repeatOne,
    togglePlay,
    seekTo,
    seekRelative,
    setSpeed,
    toggleRepeatOne,
    playTrack,
    queue,
  } = useAudioPlayer();

  const { currentTime, duration } = useAudioPosition();
  const [showSpeedSheet, setShowSpeedSheet] = useState(false);

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

    // Threshold: swipe down 64px and vertical > horizontal
    if (deltaY >= 64 && deltaY > deltaX) {
      onClose();
    }
  };

  if (!currentTrack) return null;

  const hasScore = Boolean(piece?.scoreStorageKey || piece?.scoreUrl);

  const handleScoreClick = () => {
    if (piece && onOpenScore) {
      onOpenScore(piece);
    } else if (piece?.scoreUrl) {
      window.open(piece.scoreUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const remainingSeconds = Math.max(0, duration - currentTime);

  return (
    <div
      className="full-player-overlay"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      role="dialog"
      aria-modal="true"
      aria-label="오디오 플레이어 전체 화면"
    >
      {/* Pull Handle */}
      <div className="full-player-handle-bar" aria-hidden="true" />

      {/* Top Header */}
      <header className="full-player-header">
        <button
          type="button"
          className="full-player-dismiss-btn"
          onClick={onClose}
          aria-label="플레이어 접기"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {hasScore && (
          <button
            type="button"
            className="full-player-score-btn"
            onClick={handleScoreClick}
          >
            악보 보기
          </button>
        )}
      </header>

      {/* Body */}
      <div className="full-player-body">
        {/* Large Cover */}
        <div className="full-player-cover-large" aria-hidden="true">
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        </div>

        {/* Track & Piece Info */}
        <h2 className="full-player-track-name">{currentTrack.track.label}</h2>
        <p className="full-player-piece-name">{currentTrack.pieceTitle}</p>

        {/* Timeline Slider */}
        <div className="full-player-timeline">
          <input
            type="range"
            className="full-player-slider"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={(e) => seekTo(parseFloat(e.target.value))}
            aria-label="재생 구간 탐색"
          />
          <div className="full-player-times">
            <span>{formatSeconds(currentTime)}</span>
            <span>−{formatSeconds(remainingSeconds)}</span>
          </div>
        </div>

        {/* Control Buttons Row */}
        <div className="full-player-controls-row">
          {/* Repeat One toggle */}
          <button
            type="button"
            className={`full-player-ctrl-btn ${repeatOne ? 'active' : ''}`}
            onClick={toggleRepeatOne}
            aria-label={repeatOne ? '1곡 반복 켜짐' : '1곡 반복 꺼짐'}
          >
            {repeatOne ? '1곡' : '전체'}
          </button>

          {/* 5s Back */}
          <button
            type="button"
            className="full-player-ctrl-btn"
            onClick={() => seekRelative(-5)}
            aria-label="5초 뒤로"
          >
            −5초
          </button>

          {/* Play/Pause */}
          <button
            type="button"
            className="full-player-play-btn"
            onClick={togglePlay}
            aria-label={isPlaying ? '일시정지' : '재생'}
          >
            {isPlaying ? (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            )}
          </button>

          {/* 5s Forward */}
          <button
            type="button"
            className="full-player-ctrl-btn"
            onClick={() => seekRelative(5)}
            aria-label="5초 앞으로"
          >
            +5초
          </button>

          {/* Speed Button */}
          <button
            type="button"
            className="full-player-ctrl-btn"
            onClick={() => setShowSpeedSheet(true)}
            aria-label="재생 속도"
          >
            {playbackSpeed.toFixed(1)}x
          </button>
        </div>

        {/* Other tracks of this piece */}
        {siblingTracks.length > 1 && (
          <div className="full-player-siblings-section">
            <h3 className="full-player-siblings-title">이 곡의 다른 음원</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {siblingTracks
                .filter((t) => !t.isArchived)
                .map((trk) => {
                  const isCurrent = trk.id === currentTrack.track.id;
                  const queueItem = queue.find((q) => q.track.id === trk.id);

                  return (
                    <button
                      key={trk.id}
                      type="button"
                      className={`full-player-sibling-item ${isCurrent ? 'active' : ''}`}
                      onClick={() => {
                        if (queueItem) {
                          playTrack(queueItem, queue);
                        }
                      }}
                    >
                      <span>{trk.label}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{trk.kind}</span>
                    </button>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      {/* Speed Sheet */}
      {showSpeedSheet && (
        <SpeedSheet
          currentSpeed={playbackSpeed}
          onChangeSpeed={(spd) => setSpeed(spd)}
          onClose={() => setShowSpeedSheet(false)}
        />
      )}
    </div>
  );
};
