import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import type { PlayableTrackItem } from '../../utils/audioQueue';
import { clampSeekTime, snapPlaybackSpeed } from '../../utils/audioQueue';
import {
  actionOnPrevious,
  cycleRepeat as cycleRepeatMode,
  indexOnNext,
  indexOnTrackEnd,
  type RepeatMode,
} from '../../utils/practiceQueue';
import {
  PREFERENCE_KEYS,
  readPreference,
  writePreference,
} from '../../services/sheetsStorage';
import {
  AudioPlayerContext,
  AudioPositionContext,
  type ActiveVideoState,
  type AudioPlayerContextValue,
  type AudioPositionContextValue,
  type QueueSource,
} from './audioPlayerContext';
import { useMediaSession } from './useMediaSession';

export interface AudioPlayerProviderProps {
  children: React.ReactNode;
  initialTrack?: PlayableTrackItem | null;
}

/**
 * 전역 단일 <audio> 오디오 플레이어 Provider (MEMBER_UX_V3_SPEC.md §3-3, V25).
 * - App 루트에 단 1개의 <audio> 요소만 마운트 (useRef로 인스턴스 보존)
 * - 3단계 반복(repeatMode): 'off' | 'all' | 'one'
 * - MediaSession 연동 (useMediaSession 훅 분리)
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
  const [queueSource, setQueueSource] = useState<QueueSource>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isBlocked, setIsBlocked] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(() =>
    readPreference<number>(
      PREFERENCE_KEYS.PLAYBACK_RATE,
      (v): v is number => typeof v === 'number' && v >= 0.5 && v <= 2.0,
      1.0
    )
  );
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('one');
  const [activeVideo, setActiveVideo] = useState<ActiveVideoState | null>(null);

  // --mini-player-h CSS 변수 연동
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const height = currentTrack || activeVideo ? '56px' : '0px';
      document.documentElement.style.setProperty('--mini-player-h', height);
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.documentElement.style.setProperty('--mini-player-h', '0px');
      }
    };
  }, [currentTrack, activeVideo]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const resume = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    audio.playbackRate = playbackSpeed;
    audio.preservesPitch = true;
    const p = audio.play();
    if (p !== undefined) {
      p.then(() => {
        setIsPlaying(true);
        setIsBlocked(false);
      }).catch((err) => {
        console.warn('[AudioPlayer] resume() rejected:', err);
        setIsPlaying(false);
        setIsBlocked(true);
      });
    }
  }, [currentTrack, playbackSpeed]);

  const togglePlay = useCallback(() => {
    if (isPlaying) pause();
    else resume();
  }, [isPlaying, pause, resume]);

  const playTrackInternal = useCallback(
    (item: PlayableTrackItem, targetIndex: number, effectiveQueue: PlayableTrackItem[]) => {
      const audio = audioRef.current;
      if (!audio) return;

      setActiveVideo(null);
      setQueue(effectiveQueue);
      setCurrentIndex(targetIndex);
      setCurrentTrack(item);
      setIsBlocked(false);

      if (audio.src !== item.playbackUrl) {
        audio.src = item.playbackUrl;
      }
      audio.playbackRate = playbackSpeed;
      audio.preservesPitch = true;
      audio.currentTime = 0;

      const p = audio.play();
      if (p !== undefined) {
        p.then(() => {
          setIsPlaying(true);
          setIsBlocked(false);
        }).catch((err) => {
          console.warn('[AudioPlayer] play() rejected (autoplay blocked):', err);
          setIsPlaying(false);
          setIsBlocked(true);
        });
      }
    },
    [playbackSpeed]
  );

  const playTrack = useCallback(
    (item: PlayableTrackItem, newQueue?: PlayableTrackItem[]) => {
      const effectiveQueue = newQueue && newQueue.length > 0 ? newQueue : [item];
      const idx = effectiveQueue.findIndex((q) => q.track.id === item.track.id);
      playTrackInternal(item, idx >= 0 ? idx : 0, effectiveQueue);
    },
    [playTrackInternal]
  );

  const playQueue = useCallback(
    (
      source: { kind: 'piece' | 'performance'; id: string; title: string },
      items: PlayableTrackItem[],
      startIndex: number,
      mode: RepeatMode
    ) => {
      setQueueSource(source);
      setRepeatMode(mode);
      if (items.length === 0) {
        setQueue([]);
        setCurrentIndex(-1);
        setCurrentTrack(null);
        return;
      }
      const safeIndex = startIndex >= 0 && startIndex < items.length ? startIndex : 0;
      playTrackInternal(items[safeIndex], safeIndex, items);
    },
    [playTrackInternal]
  );

  const playQueueIndex = useCallback(
    (index: number) => {
      if (index >= 0 && index < queue.length) {
        playTrackInternal(queue[index], index, queue);
      }
    },
    [queue, playTrackInternal]
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

  const setSpeed = useCallback((speed: number) => {
    const snapped = snapPlaybackSpeed(speed);
    setPlaybackSpeed(snapped);
    writePreference(PREFERENCE_KEYS.PLAYBACK_RATE, snapped);
    if (audioRef.current) {
      audioRef.current.playbackRate = snapped;
      audioRef.current.preservesPitch = true;
    }
  }, []);

  const cycleSpeed = useCallback(() => {
    const presets = [0.75, 1.0, 1.25, 1.5];
    const currentRounded = Math.round(playbackSpeed * 100) / 100;
    const idx = presets.findIndex((p) => Math.abs(p - currentRounded) < 0.05);
    setSpeed(presets[(idx + 1) % presets.length]);
  }, [playbackSpeed, setSpeed]);

  const cycleRepeat = useCallback(() => {
    setRepeatMode((prev) => cycleRepeatMode(prev));
  }, []);

  const previousTrack = useCallback(() => {
    const action = actionOnPrevious(currentIndex, currentTime);
    if (action.type === 'restart') {
      seekTo(0);
      if (!isPlaying) resume();
    } else {
      playQueueIndex(action.index);
    }
  }, [currentIndex, currentTime, isPlaying, playQueueIndex, resume, seekTo]);

  const nextTrack = useCallback(() => {
    const nextIdx = indexOnNext(currentIndex, queue.length, repeatMode);
    if (nextIdx !== null) {
      playQueueIndex(nextIdx);
    }
  }, [currentIndex, queue.length, repeatMode, playQueueIndex]);

  const closePlayer = useCallback(() => {
    pause();
    setCurrentTrack(null);
    setQueue([]);
    setCurrentIndex(-1);
    setQueueSource(null);
    setActiveVideo(null);
    setIsBlocked(false);
    setCurrentTime(0);
    setDuration(0);
    if (audioRef.current) {
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
    }
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator && navigator.mediaSession) {
      try {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('seekbackward', null);
        navigator.mediaSession.setActionHandler('seekforward', null);
        navigator.mediaSession.setActionHandler('seekto', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
      } catch (err) {
        console.warn('[AudioPlayer] closePlayer mediaSession cleanup failed:', err);
      }
    }
  }, [pause]);

  const handleEnded = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const nextIdx = indexOnTrackEnd(currentIndex, queue.length, repeatMode);
    if (nextIdx === currentIndex && currentTrack) {
      audio.currentTime = 0;
      const p = audio.play();
      if (p !== undefined) {
        p.catch(() => setIsBlocked(true));
      }
    } else if (nextIdx !== null && nextIdx >= 0 && nextIdx < queue.length) {
      playTrackInternal(queue[nextIdx], nextIdx, queue);
    } else {
      setIsPlaying(false);
      audio.currentTime = 0;
      setCurrentTime(0);
    }
  }, [currentIndex, queue, repeatMode, currentTrack, playTrackInternal]);

  useMediaSession({
    currentTrack,
    queueLength: queue.length,
    playbackSpeed,
    currentTime,
    duration,
    resume,
    pause,
    seekRelative,
    seekTo,
    previousTrack,
    nextTrack,
    activeVideo,
  });

  const contextValue = useMemo<AudioPlayerContextValue>(
    () => ({
      currentTrack,
      queue,
      currentIndex,
      queueSource,
      isPlaying,
      isBlocked,
      playbackSpeed,
      repeatMode,
      playTrack,
      playQueue,
      playQueueIndex,
      togglePlay,
      pause,
      resume,
      seekTo,
      seekRelative,
      setSpeed,
      cycleSpeed,
      cycleRepeat,
      previousTrack,
      nextTrack,
      closePlayer,
      audioElementRef: audioRef,
      activeVideo,
      setActiveVideo,
    }),
    [
      currentTrack,
      queue,
      currentIndex,
      queueSource,
      isPlaying,
      isBlocked,
      playbackSpeed,
      repeatMode,
      playTrack,
      playQueue,
      playQueueIndex,
      togglePlay,
      pause,
      resume,
      seekTo,
      seekRelative,
      setSpeed,
      cycleSpeed,
      cycleRepeat,
      previousTrack,
      nextTrack,
      closePlayer,
      activeVideo,
    ]
  );

  const positionValue = useMemo<AudioPositionContextValue>(
    () => ({ currentTime, duration }),
    [currentTime, duration]
  );

  return (
    <AudioPlayerContext.Provider value={contextValue}>
      <AudioPositionContext.Provider value={positionValue}>
        {children}
        <audio
          ref={audioRef}
          preload="metadata"
          onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
          onLoadedMetadata={() => {
            if (audioRef.current) {
              setDuration(audioRef.current.duration || 0);
              audioRef.current.playbackRate = playbackSpeed;
              audioRef.current.preservesPitch = true;
            }
          }}
          onPlay={() => {
            setIsPlaying(true);
            setIsBlocked(false);
          }}
          onPause={() => setIsPlaying(false)}
          onEnded={handleEnded}
          onError={() => {
            console.warn('[AudioPlayer] Audio element error');
            setIsPlaying(false);
            setIsBlocked(true);
          }}
          style={{ display: 'none' }}
        />
      </AudioPositionContext.Provider>
    </AudioPlayerContext.Provider>
  );
};
