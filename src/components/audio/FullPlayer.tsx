import React, { useState, useRef } from 'react';
import type { AppConfig, PracticePiece, PracticeTrack } from '../../types/rollbook';
import { useAudioPlayer, useAudioPosition } from './audioPlayerContext';
import { buildPieceQueue, indexOnNext } from '../../utils/practiceQueue';
import { PlayerControls } from './PlayerControls';
import { PieceTracksCard } from './PieceTracksCard';
import { QueueSheet } from './QueueSheet';
import { SpeedSheet } from './SpeedSheet';
import '../../styles/v3/fullPlayer.css';

export interface FullPlayerProps {
  piece?: PracticePiece | null;
  siblingTracks?: PracticeTrack[];
  config?: AppConfig;
  onClose: () => void;
  onOpenScore?: (piece: PracticePiece) => void;
  onSelectVideo?: (track: PracticeTrack) => void;
}

function formatSeconds(sec: number): string {
  if (Number.isNaN(sec) || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/**
 * Full Screen Audio Player (MEMBER_UX_V3_SPEC.md §3-3-3, 시안 Player).
 * - 그라데이션 배경: --player-gradient-top -> --player-gradient-mid -> --player-surface-full
 * - 상단: 손잡이, 접기(⌄), 출처 두 줄(곡/공연 / 이름), 악보 보기 버튼
 * - 커버: 정사각형(화면폭-48px, 최대 340px), 라벤더 그라데이션 + 음표, 공연 큐 시 번호·곡이름 뱃지
 * - 제목: 트랙명(24px 굵게), 곡명 · 작곡가
 * - 재생바: 흰 진행선 + 동그란 손잡이, 경과 / 남은시간
 * - 조작 1·2줄: PlayerControls (이전, 5초, 재생, 5초, 다음 / 반복, 속도, 재생목록)
 * - 이 곡의 음원: PieceTracksCard
 * - 재생 목록 시트: QueueSheet
 */
export const FullPlayer: React.FC<FullPlayerProps> = ({
  piece,
  siblingTracks = [],
  config,
  onClose,
  onOpenScore,
  onSelectVideo,
}) => {
  const {
    currentTrack,
    queue,
    currentIndex,
    queueSource,
    isPlaying,
    playbackSpeed,
    repeatMode,
    togglePlay,
    seekTo,
    seekRelative,
    setSpeed,
    cycleRepeat,
    previousTrack,
    nextTrack,
    playQueue,
    playQueueIndex,
    activeVideo,
  } = useAudioPlayer();

  const { currentTime, duration } = useAudioPosition();
  const [showSpeedSheet, setShowSpeedSheet] = useState(false);
  const [showQueueSheet, setShowQueueSheet] = useState(false);

  // Swipe-to-dismiss gesture handling
  const touchStartY = useRef<number | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    touchStartY.current = e.clientY;
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (touchStartY.current === null) return;
    const deltaY = e.clientY - touchStartY.current;
    touchStartY.current = null;
    if (deltaY >= 80) {
      onClose();
    }
  };

  if (!currentTrack) {
    return null;
  }

  const isPerformanceSource = queueSource?.kind === 'performance';
  const sourceCategory = isPerformanceSource ? '공연' : '곡';
  const sourceTitle = queueSource?.title || currentTrack.pieceTitle;

  const hasScore = Boolean(piece?.scoreStorageKey || piece?.scoreUrl);
  const composer = piece?.composer?.trim();
  const pieceSubtitle = composer
    ? `${currentTrack.pieceTitle} · ${composer}`
    : currentTrack.pieceTitle;

  const hasNext = !activeVideo && indexOnNext(currentIndex, queue.length, repeatMode) !== null;
  const remainingSeconds = Math.max(0, duration - currentTime);

  const handleSelectAudioFromCard = (track: PracticeTrack) => {
    const effectiveTracks = siblingTracks.length > 0 ? siblingTracks : [track];
    const catalog = {
      pieces: piece ? [piece] : [],
      tracks: effectiveTracks,
      performancePieces: [],
      performances: [],
      programPieces: [],
    };
    const pieceQueue = buildPieceQueue(track.pieceId, catalog, config);
    const targetIdx = pieceQueue.findIndex((q) => q.track.id === track.id);
    playQueue(
      { kind: 'piece', id: track.pieceId, title: piece?.title || currentTrack.pieceTitle },
      pieceQueue,
      targetIdx >= 0 ? targetIdx : 0,
      'one'
    );
  };

  const handleSelectVideoFromCard = (track: PracticeTrack) => {
    if (onSelectVideo) {
      onSelectVideo(track);
    }
  };

  return (
    <div
      className="full-player-backdrop full-player-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="오디오 플레이어 전체 화면"
    >
      <div
        className="full-player-sheet"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      >
        {/* Pull Handle */}
        <div className="full-player-pull-area" aria-hidden="true" onClick={onClose}>
          <div className="full-player-pull-handle" />
        </div>

        {/* Top Bar: Fold down, Source tag & title, Score button */}
        <div className="full-player-header">
          <button
            type="button"
            className="full-player-fold-btn"
            onClick={onClose}
            aria-label="플레이어 접기"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          <div className="full-player-header-center">
            <span className="full-player-source-tag">{sourceCategory}</span>
            <span className="full-player-source-title">{sourceTitle}</span>
          </div>

          {hasScore ? (
            <button
              type="button"
              className="full-player-score-link"
              onClick={() => piece && onOpenScore?.(piece)}
            >
              악보 보기
            </button>
          ) : (
            <div style={{ width: 44 }} aria-hidden="true" />
          )}
        </div>

        {/* Scrollable Body */}
        <div className="full-player-body">
          {/* Cover Art */}
          <div className="full-player-cover-box" aria-hidden="true">
            <svg width="84" height="84" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>

            {isPerformanceSource && (
              <span className="full-player-perf-badge">
                {currentIndex + 1} · {currentTrack.pieceTitle}
              </span>
            )}
          </div>

          {/* Title Area */}
          <div className="full-player-titles">
            <h1 className="full-player-track-name">{currentTrack.track.label}</h1>
            <p className="full-player-piece-name">{pieceSubtitle}</p>
          </div>

          {/* Timeline / Slider */}
          <div className="full-player-timeline">
            <input
              type="range"
              className="full-player-slider"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onChange={(e) => seekTo(parseFloat(e.target.value))}
              aria-label="재생 위치"
            />
            <div className="full-player-time-labels">
              <span>{formatSeconds(currentTime)}</span>
              <span>−{formatSeconds(remainingSeconds)}</span>
            </div>
          </div>

          {/* Player Controls (Row 1 & Row 2) */}
          <PlayerControls
            isPlaying={isPlaying}
            playbackSpeed={playbackSpeed}
            repeatMode={repeatMode}
            hasNext={hasNext}
            togglePlay={togglePlay}
            previousTrack={previousTrack}
            nextTrack={nextTrack}
            seekRelative={seekRelative}
            cycleRepeat={cycleRepeat}
            onOpenSpeedSheet={() => setShowSpeedSheet(true)}
            onOpenQueueSheet={() => setShowQueueSheet(true)}
          />

          {/* "이 곡의 음원" Card */}
          <PieceTracksCard
            tracks={siblingTracks}
            activeTrackId={currentTrack.track.id}
            isActiveVideo={Boolean(activeVideo)}
            onSelectAudio={handleSelectAudioFromCard}
            onSelectVideo={handleSelectVideoFromCard}
          />
        </div>

        {/* Speed Sheet */}
        {showSpeedSheet && (
          <SpeedSheet
            currentSpeed={playbackSpeed}
            onChangeSpeed={setSpeed}
            onClose={() => setShowSpeedSheet(false)}
          />
        )}

        {/* Queue Sheet */}
        <QueueSheet
          isOpen={showQueueSheet}
          onClose={() => setShowQueueSheet(false)}
          queue={queue}
          currentIndex={currentIndex}
          queueSource={queueSource}
          repeatMode={repeatMode}
          cycleRepeat={cycleRepeat}
          onSelectTrack={(idx) => playQueueIndex(idx)}
        />
      </div>
    </div>
  );
};
