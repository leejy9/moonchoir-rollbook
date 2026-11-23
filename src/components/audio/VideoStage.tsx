import React, { useEffect, useRef, useState } from 'react';
import type { ActiveVideoState } from './audioPlayerContext';
import type { YTPlayerInstance } from '../../services/media/youtubeIframeApi';
import { getYoutubeVideoId } from '../../utils/youtubeUrl';
import { nearestRate } from '../../utils/practiceQueue';
import '../../styles/v3/videoStage.css';

export interface VideoStageProps {
  activeVideo: ActiveVideoState;
  playbackSpeed: number;
  onPlayerReady?: (player: YTPlayerInstance) => void;
  onStateChange?: (isPlaying: boolean) => void;
  onPositionUpdate?: (currentTime: number, duration: number) => void;
}

/**
 * YouTube Video Stage for FullPlayer (MEMBER_UX_V3_SPEC.md §3-3-5, V25).
 * - Mounts YT.Player in 16:9 container at cover position
 * - Strict referrer policy and playsinline=1
 * - Destroys instance on unmount
 * - Falls back to external link button if load fails
 */
export const VideoStage: React.FC<VideoStageProps> = ({
  activeVideo,
  playbackSpeed,
  onPlayerReady,
  onStateChange,
  onPositionUpdate,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayerInstance | null>(null);
  const [failedVideoId, setFailedVideoId] = useState<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const videoId = activeVideo.track.url ? getYoutubeVideoId(activeVideo.track.url) : null;
  const resumeAtRef = useRef(activeVideo.resumeAt);
  const callbacksRef = useRef({ onPlayerReady, onStateChange, onPositionUpdate, playbackSpeed });

  useEffect(() => {
    resumeAtRef.current = activeVideo.resumeAt;
    callbacksRef.current = { onPlayerReady, onStateChange, onPositionUpdate, playbackSpeed };
  });

  useEffect(() => {
    let isCancelled = false;
    const initialResumeAt = resumeAtRef.current;

    import('../../services/media/youtubeIframeApi')
      .then(({ loadYoutubeIframeApi }) => loadYoutubeIframeApi())
      .then((YT) => {
        if (isCancelled || !containerRef.current || !videoId) return;

        const placeholder = document.createElement('div');
        containerRef.current.innerHTML = '';
        containerRef.current.appendChild(placeholder);

        new YT.Player(placeholder, {
          videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            playsinline: 1,
            rel: 0,
            controls: 1,
            origin: typeof window !== 'undefined' ? window.location.origin : '',
            start: initialResumeAt > 0 ? Math.floor(initialResumeAt) : undefined,
          },
          events: {
            onReady: (event) => {
              if (isCancelled) {
                event.target.destroy();
                return;
              }
              playerRef.current = event.target;
              callbacksRef.current.onPlayerReady?.(event.target);

              // Set iframe referrerpolicy fallback
              const iframe = containerRef.current?.querySelector('iframe');
              if (iframe) {
                iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
              }

              if (initialResumeAt > 0) {
                event.target.seekTo(initialResumeAt, true);
              }

              const availableRates = event.target.getAvailablePlaybackRates?.() || [];
              if (availableRates.length > 0) {
                const target = nearestRate(availableRates, callbacksRef.current.playbackSpeed);
                event.target.setPlaybackRate(target);
              }

              event.target.playVideo();
            },
            onStateChange: (event) => {
              if (isCancelled) return;
              const isPlaying = event.data === 1; // YT.PlayerState.PLAYING
              callbacksRef.current.onStateChange?.(isPlaying);
            },
            onError: (err) => {
              console.warn('[VideoStage] YouTube player error:', err);
              if (!isCancelled) setFailedVideoId(videoId);
            },
          },
        });

        // V3-20 R11: Set iframe referrerpolicy immediately before onReady if iframe was created
        const immediateIframe = containerRef.current?.querySelector('iframe');
        if (immediateIframe) {
          immediateIframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
        }
      })
      .catch((err) => {
        console.warn('[VideoStage] loadYoutubeIframeApi failed:', err);
        if (!isCancelled) setFailedVideoId(videoId);
      });

    // Time polling interval (0.5s)
    pollIntervalRef.current = setInterval(() => {
      const p = playerRef.current;
      if (p && typeof p.getCurrentTime === 'function' && typeof p.getDuration === 'function') {
        const cur = p.getCurrentTime() || 0;
        const dur = p.getDuration() || 0;
        callbacksRef.current.onPositionUpdate?.(cur, dur);
      }
    }, 500);

    return () => {
      isCancelled = true;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch (err) {
          console.warn('[VideoStage] player destroy error:', err);
        }
        playerRef.current = null;
      }
    };
  }, [videoId]);

  // Update playback speed if changed
  useEffect(() => {
    const p = playerRef.current;
    if (p && typeof p.getAvailablePlaybackRates === 'function' && typeof p.setPlaybackRate === 'function') {
      const availableRates = p.getAvailablePlaybackRates() || [];
      if (availableRates.length > 0) {
        const target = nearestRate(availableRates, playbackSpeed);
        p.setPlaybackRate(target);
      }
    }
  }, [playbackSpeed]);

  if (failedVideoId === videoId || !videoId) {
    return (
      <div className="full-player-video-stage fallback" role="region" aria-label="유튜브 영상">
        {activeVideo.track.url && (
          <a
            href={activeVideo.track.url}
            target="_blank"
            rel="noopener noreferrer"
            className="full-player-yt-open-btn"
            aria-label="유튜브 앱으로 열기"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
            </svg>
            <span>↗</span>
          </a>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="full-player-video-stage"
      role="region"
      aria-label="유튜브 영상"
    />
  );
};
