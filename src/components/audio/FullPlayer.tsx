import React, { useState, useRef, useEffect } from 'react';
import type { AppConfig, PracticePiece, PracticeTrack } from '../../types/rollbook';
import { useAudioPlayer, useAudioPosition } from './audioPlayerContext';
import { buildPieceQueue, indexOnNext, nearestRate } from '../../utils/practiceQueue';
import { PlayerControls } from './PlayerControls';
import { PieceTracksCard } from './PieceTracksCard';
import { QueueSheet } from './QueueSheet';
import { SpeedSheet } from './SpeedSheet';
import { VideoStage } from './VideoStage';
import type { YTPlayerInstance } from '../../services/media/youtubeIframeApi';
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
 * - 유튜브 영상 재생 시 커버 자리에 16:9 VideoStage 마운트 (PlayerVideo)
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
    pause,
    seekTo,
    seekRelative,
    setSpeed,
    cycleRepeat,
    previousTrack,
    nextTrack,
    playQueue,
    playQueueIndex,
    activeVideo,
    setActiveVideo,
    triggerMinimizeHint,
  } = useAudioPlayer();

  const { currentTime, duration } = useAudioPosition();
  const [showSpeedSheet, setShowSpeedSheet] = useState(false);
  const [showQueueSheet, setShowQueueSheet] = useState(false);

  // YouTube player state
  const ytPlayerRef = useRef<YTPlayerInstance | null>(null);
  const [ytIsPlaying, setYtIsPlaying] = useState<boolean>(false);
  const [ytPosition, setYtPosition] = useState<{ currentTime: number; duration: number }>({
    currentTime: 0,
    duration: 0,
  });

  const isVideo = Boolean(activeVideo);

  // R8: Track last saved resume position & trigger hint on unmount
  const lastSavedResumeAtRef = useRef<number>(activeVideo?.resumeAt || 0);
  const activeVideoRef = useRef(activeVideo);
  useEffect(() => {
    activeVideoRef.current = activeVideo;
  });

  useEffect(() => {
    return () => {
      if (activeVideoRef.current) {
        triggerMinimizeHint?.();
      }
    };
  }, [triggerMinimizeHint]);

  // Swipe-to-dismiss gesture handling
  const touchStartY = useRef<number | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    touchStartY.current = e.clientY;
  };

  const handleClose = () => onClose();

  const handlePointerUp = (e: React.PointerEvent) => {
    if (touchStartY.current === null) return;
    const deltaY = e.clientY - touchStartY.current;
    touchStartY.current = null;
    if (deltaY >= 80) handleClose();
  };

  if (!currentTrack && !activeVideo) {
    return null;
  }

  const pieceTitle = activeVideo ? activeVideo.pieceTitle : currentTrack?.pieceTitle || '';
  const isPerformanceSource = queueSource?.kind === 'performance';
  const sourceCategory = isPerformanceSource ? '공연' : '곡';
  const sourceTitle = queueSource?.title || pieceTitle;

  const hasScore = Boolean(piece?.scoreStorageKey || piece?.scoreUrl);
  const composer = piece?.composer?.trim();
  const pieceSubtitle = composer ? `${pieceTitle} · ${composer}` : pieceTitle;
  const displayTrackName = activeVideo ? activeVideo.track.label : currentTrack?.track.label || '';

  const displayCurrentTime = isVideo ? ytPosition.currentTime : currentTime;
  const displayDuration = isVideo ? ytPosition.duration : duration;
  const displayIsPlaying = isVideo ? ytIsPlaying : isPlaying;
  const remainingSeconds = Math.max(0, displayDuration - displayCurrentTime);
  const hasNext = !isVideo && indexOnNext(currentIndex, queue.length, repeatMode) !== null;

  const handleTogglePlay = () => {
    if (isVideo) {
      if (ytIsPlaying) {
        ytPlayerRef.current?.pauseVideo();
      } else {
        ytPlayerRef.current?.playVideo();
      }
    } else {
      togglePlay();
    }
  };

  const handleSeekRelative = (sec: number) => {
    if (isVideo) {
      const cur = ytPlayerRef.current?.getCurrentTime() || 0;
      ytPlayerRef.current?.seekTo(Math.max(0, cur + sec), true);
    } else {
      seekRelative(sec);
    }
  };

  const handleSeekTo = (targetSec: number) => {
    if (isVideo) {
      ytPlayerRef.current?.seekTo(targetSec, true);
    } else {
      seekTo(targetSec);
    }
  };

  const handleSetSpeed = (newSpeed: number) => {
    if (isVideo && ytPlayerRef.current) {
      const availableRates = ytPlayerRef.current.getAvailablePlaybackRates?.() || [];
      if (availableRates.length > 0) {
        const target = nearestRate(availableRates, newSpeed);
        ytPlayerRef.current.setPlaybackRate(target);
      }
    }
    setSpeed(newSpeed);
  };

  const handleSelectAudioFromCard = (track: PracticeTrack) => {
    if (activeVideo) {
      try {
        ytPlayerRef.current?.stopVideo();
        ytPlayerRef.current?.destroy();
      } catch (err) {
        console.warn('[FullPlayer] ytPlayer destroy error:', err);
      }
      ytPlayerRef.current = null;
      setActiveVideo?.(null);
    }
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
      { kind: 'piece', id: track.pieceId, title: piece?.title || pieceTitle },
      pieceQueue,
      targetIdx >= 0 ? targetIdx : 0,
      'one'
    );
  };

  const handleSelectVideoFromCard = (track: PracticeTrack) => {
    pause();
    setActiveVideo?.({
      track,
      pieceTitle: piece?.title || pieceTitle,
      resumeAt: 0,
    });
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
        <div className="full-player-pull-area" aria-hidden="true" onClick={handleClose}>
          <div className="full-player-pull-handle" />
        </div>

        {/* Top Bar: Fold down, Source tag & title, Score button */}
        <div className="full-player-header">
          <button
            type="button"
            className="full-player-fold-btn"
            onClick={handleClose}
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
          {/* Cover Art or Video Stage */}
          {activeVideo ? (
            <VideoStage
              activeVideo={activeVideo}
              playbackSpeed={playbackSpeed}
              onPlayerReady={(p) => {
                ytPlayerRef.current = p;
              }}
              onStateChange={(playing) => {
                setYtIsPlaying(playing);
              }}
              onPositionUpdate={(cur, dur) => {
                setYtPosition({ currentTime: cur, duration: dur });
                if (activeVideo && Math.abs(cur - lastSavedResumeAtRef.current) >= 1) {
                  lastSavedResumeAtRef.current = cur;
                  setActiveVideo?.({ ...activeVideo, resumeAt: cur });
                }
              }}
            />
          ) : (
            <div className="full-player-cover-box" aria-hidden="true">
              <svg width="84" height="84" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>

              {isPerformanceSource && currentTrack && (
                <span className="full-player-perf-badge">
                  {currentIndex + 1} · {currentTrack.pieceTitle}
                </span>
              )}
            </div>
          )}

          {/* Title Area */}
          <div className="full-player-titles">
            <div className="full-player-title-row">
              <h1 className="full-player-track-name">{displayTrackName}</h1>
              {activeVideo?.track.url && (
                <a
                  href={activeVideo.track.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="full-player-yt-badge-btn"
                  aria-label="유튜브 앱으로 열기"
                >
                  <svg width="20" height="14" viewBox="0 0 24 17" fill="none" aria-hidden="true">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.5 12 3.5 12 3.5s-7.505 0-9.377.55a3.016 3.016 0 0 0-2.122 2.136C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.55 9.376.55 9.376.55s7.505 0 9.377-.55a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="#FF0000" />
                  </svg>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>
              )}
            </div>
            <p className="full-player-piece-name">{pieceSubtitle}</p>
          </div>

          {/* Timeline / Slider */}
          <div className="full-player-timeline">
            <input
              type="range"
              className="full-player-slider"
              min={0}
              max={displayDuration || 100}
              step={0.1}
              value={displayCurrentTime}
              onChange={(e) => handleSeekTo(parseFloat(e.target.value))}
              aria-label="재생 위치"
            />
            <div className="full-player-time-labels">
              <span>{formatSeconds(displayCurrentTime)}</span>
              <span>−{formatSeconds(remainingSeconds)}</span>
            </div>
          </div>

          {/* Player Controls (Row 1 & Row 2) */}
          <PlayerControls
            isPlaying={displayIsPlaying}
            playbackSpeed={playbackSpeed}
            repeatMode={repeatMode}
            hasNext={hasNext}
            togglePlay={handleTogglePlay}
            previousTrack={previousTrack}
            nextTrack={nextTrack}
            seekRelative={handleSeekRelative}
            cycleRepeat={cycleRepeat}
            onOpenSpeedSheet={() => setShowSpeedSheet(true)}
            onOpenQueueSheet={() => setShowQueueSheet(true)}
            disabledControls={isVideo}
          />

          {/* "이 곡의 음원" Card */}
          <PieceTracksCard
            tracks={siblingTracks}
            activeTrackId={activeVideo ? activeVideo.track.id : currentTrack?.track.id || null}
            isActiveVideo={Boolean(activeVideo)}
            onSelectAudio={handleSelectAudioFromCard}
            onSelectVideo={handleSelectVideoFromCard}
          />
        </div>

        {/* Speed Sheet */}
        {showSpeedSheet && (
          <SpeedSheet
            currentSpeed={playbackSpeed}
            onChangeSpeed={handleSetSpeed}
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

