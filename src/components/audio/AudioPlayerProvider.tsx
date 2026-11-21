import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import type { PlaybackSpeed, PlayableTrackItem } from '../../utils/audioQueue';
import {
  getNextTrackIndex,
  getNextPlaybackSpeed,
  clampSeekTime,
} from '../../utils/audioQueue';
import {
  AudioPlayerContext,
  AudioPositionContext,
  type AudioPlayerContextValue,
  type AudioPositionContextValue,
} from './audioPlayerContext';

export interface AudioPlayerProviderProps {
  children: React.ReactNode;
  initialTrack?: PlayableTrackItem | null;
}

/**
 * 전역 단일 <audio> 오디오 플레이어 Provider (MEMBER_UX_AUDIO_SPEC.md §3-4).
 * - App 루트에 단 1개의 <audio> 요소만 마운트 (useRef로 인스턴스 보존)
 * - 탭 전환 및 화면 이동에도 언마운트되지 않음
 * - Web Audio API 사용 금지 (iOS WebKit 버그 회피)
 * - 한 곡 반복(repeatOne) 기본값 true, 자동 다음 곡(autoNext) 기본값 false
 * - MediaSession 연동 (5개 액션 핸들러 및 setPositionState)
 * - 배속 0.8 / 1.0 / 1.2 지원 및 preservesPitch = true
 * - 활성 시 CSS 변수 --mini-player-h = 56px 반영
 */
export const AudioPlayerProvider: React.FC<AudioPlayerProviderProps> = ({
  children,
  initialTrack = null,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTrack, setCurrentTrack] = useState<PlayableTrackItem | null>(initialTrack);
  const [queue, setQueue] = useState<PlayableTrackItem[]>(() => (initialTrack ? [initialTrack] : []));
  const [currentIndex, setCurrentIndex] = useState<number>(() => (initialTrack ? 0 : -1));
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isBlocked, setIsBlocked] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1.0);
  const [repeatOne, setRepeatOne] = useState<boolean>(true);
  const [autoNext, setAutoNext] = useState<boolean>(false);

  // --mini-player-h CSS 변수 연동
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const height = currentTrack ? '56px' : '0px';
      document.documentElement.style.setProperty('--mini-player-h', height);
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.documentElement.style.setProperty('--mini-player-h', '0px');
      }
    };
  }, [currentTrack]);

  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
    }
    setIsPlaying(false);
  }, []);

  const resume = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    audio.playbackRate = playbackSpeed;
    audio.preservesPitch = true;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setIsPlaying(true);
          setIsBlocked(false);
        })
        .catch((err) => {
          console.warn('[AudioPlayer] resume() rejected:', err);
          setIsPlaying(false);
          setIsBlocked(true);
        });
    }
  }, [currentTrack, playbackSpeed]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      resume();
    }
  }, [isPlaying, pause, resume]);

  const playTrack = useCallback(
    (item: PlayableTrackItem, newQueue?: PlayableTrackItem[]) => {
      const audio = audioRef.current;
      if (!audio) return;

      const effectiveQueue = newQueue && newQueue.length > 0 ? newQueue : [item];
      const idx = effectiveQueue.findIndex((q) => q.track.id === item.track.id);

      setQueue(effectiveQueue);
      setCurrentIndex(idx >= 0 ? idx : 0);
      setCurrentTrack(item);
      setIsBlocked(false);

      if (audio.src !== item.playbackUrl) {
        audio.src = item.playbackUrl;
      }
      audio.playbackRate = playbackSpeed;
      audio.preservesPitch = true;
      audio.currentTime = 0;

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
            setIsBlocked(false);
          })
          .catch((err) => {
            console.warn('[AudioPlayer] play() rejected (autoplay blocked):', err);
            setIsPlaying(false);
            setIsBlocked(true);
          });
      }
    },
    [playbackSpeed]
  );

  const seekTo = useCallback((targetSeconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const safeTime = clampSeekTime(targetSeconds, 0, audio.duration || 0);
    audio.currentTime = safeTime;
    setCurrentTime(safeTime);
  }, []);

  const seekRelative = useCallback((offsetSeconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const safeTime = clampSeekTime(audio.currentTime, offsetSeconds, audio.duration || 0);
    audio.currentTime = safeTime;
    setCurrentTime(safeTime);
  }, []);

  const setSpeed = useCallback((speed: PlaybackSpeed) => {
    setPlaybackSpeed(speed);
    const audio = audioRef.current;
    if (audio) {
      audio.playbackRate = speed;
      audio.preservesPitch = true;
    }
  }, []);

  const cycleSpeed = useCallback(() => {
    setSpeed(getNextPlaybackSpeed(playbackSpeed));
  }, [playbackSpeed, setSpeed]);

  const toggleRepeatOne = useCallback(() => {
    setRepeatOne((prev) => !prev);
  }, []);

  const toggleAutoNext = useCallback(() => {
    setAutoNext((prev) => !prev);
  }, []);

  const closePlayer = useCallback(() => {
    pause();
    setCurrentTrack(null);
    setQueue([]);
    setCurrentIndex(-1);
    setIsBlocked(false);
    setCurrentTime(0);
    setDuration(0);
    const audio = audioRef.current;
    if (audio) {
      audio.removeAttribute('src');
      audio.load();
    }
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator && navigator.mediaSession) {
      try {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('seekbackward', null);
        navigator.mediaSession.setActionHandler('seekforward', null);
        navigator.mediaSession.setActionHandler('seekto', null);
      } catch {
        // ignore
      }
    }
  }, [pause]);

  const handleEnded = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const nextIdx = getNextTrackIndex(currentIndex, queue.length, repeatOne, autoNext);
    if (nextIdx === currentIndex && currentTrack) {
      audio.currentTime = 0;
      const p = audio.play();
      if (p !== undefined) {
        p.catch(() => setIsBlocked(true));
      }
    } else if (nextIdx >= 0 && nextIdx < queue.length) {
      const nextItem = queue[nextIdx];
      playTrack(nextItem, queue);
    } else {
      setIsPlaying(false);
      audio.currentTime = 0;
      setCurrentTime(0);
    }
  }, [currentIndex, queue, repeatOne, autoNext, currentTrack, playTrack]);

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      setCurrentTime(audio.currentTime);
    }
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      setDuration(audio.duration || 0);
      audio.playbackRate = playbackSpeed;
      audio.preservesPitch = true;
    }
  }, [playbackSpeed]);

  const handleAudioPlay = useCallback(() => {
    setIsPlaying(true);
    setIsBlocked(false);
  }, []);

  const handleAudioPause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handleAudioError = useCallback(() => {
    console.warn('[AudioPlayer] Audio element error');
    setIsPlaying(false);
    setIsBlocked(true);
  }, []);

  // MediaSession 연동
  useEffect(() => {
    if (
      typeof navigator === 'undefined' ||
      !('mediaSession' in navigator) ||
      !navigator.mediaSession ||
      !currentTrack
    ) {
      return;
    }

    try {
      if (typeof MediaMetadata !== 'undefined') {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentTrack.pieceTitle,
          artist: '문콰이어',
          album: currentTrack.track.label,
        });
      }

      navigator.mediaSession.setActionHandler('play', () => {
        resume();
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        pause();
      });
      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        seekRelative(-(details?.seekOffset || 10));
      });
      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        seekRelative(details?.seekOffset || 10);
      });
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details?.seekTime !== undefined) {
          seekTo(details.seekTime);
        }
      });
    } catch {
      // MediaSession 미지원 환경 조용히 건너뜀
    }
  }, [currentTrack, pause, resume, seekRelative, seekTo]);

  // MediaSession 위치 동기화
  useEffect(() => {
    if (
      typeof navigator === 'undefined' ||
      !('mediaSession' in navigator) ||
      !navigator.mediaSession ||
      !('setPositionState' in navigator.mediaSession) ||
      duration <= 0
    ) {
      return;
    }
    try {
      navigator.mediaSession.setPositionState({
        duration: Math.max(0, duration),
        playbackRate: playbackSpeed,
        position: Math.max(0, Math.min(currentTime, duration)),
      });
    } catch {
      // 조용히 무시
    }
  }, [currentTime, duration, playbackSpeed]);

  const contextValue = useMemo<AudioPlayerContextValue>(
    () => ({
      currentTrack,
      queue,
      currentIndex,
      isPlaying,
      isBlocked,
      playbackSpeed,
      repeatOne,
      autoNext,
      playTrack,
      togglePlay,
      pause,
      resume,
      seekTo,
      seekRelative,
      setSpeed,
      cycleSpeed,
      toggleRepeatOne,
      toggleAutoNext,
      closePlayer,
      audioElementRef: audioRef,
    }),
    [
      currentTrack,
      queue,
      currentIndex,
      isPlaying,
      isBlocked,
      playbackSpeed,
      repeatOne,
      autoNext,
      playTrack,
      togglePlay,
      pause,
      resume,
      seekTo,
      seekRelative,
      setSpeed,
      cycleSpeed,
      toggleRepeatOne,
      toggleAutoNext,
      closePlayer,
    ]
  );

  const positionValue = useMemo<AudioPositionContextValue>(
    () => ({
      currentTime,
      duration,
    }),
    [currentTime, duration]
  );

  return (
    <AudioPlayerContext.Provider value={contextValue}>
      <AudioPositionContext.Provider value={positionValue}>
        {children}
        <audio
          ref={audioRef}
          preload="metadata"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onPlay={handleAudioPlay}
          onPause={handleAudioPause}
          onEnded={handleEnded}
          onError={handleAudioError}
          style={{ display: 'none' }}
        />
      </AudioPositionContext.Provider>
    </AudioPlayerContext.Provider>
  );
};
