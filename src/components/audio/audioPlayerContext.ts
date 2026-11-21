import React, { createContext, useContext } from 'react';
import type { PlaybackSpeed, PlayableTrackItem } from '../../utils/audioQueue';

export interface AudioPlayerContextValue {
  currentTrack: PlayableTrackItem | null;
  queue: PlayableTrackItem[];
  currentIndex: number;
  isPlaying: boolean;
  isBlocked: boolean;
  playbackSpeed: PlaybackSpeed;
  repeatOne: boolean;
  autoNext: boolean;
  playTrack: (item: PlayableTrackItem, newQueue?: PlayableTrackItem[]) => void;
  togglePlay: () => void;
  pause: () => void;
  resume: () => void;
  seekTo: (timeSeconds: number) => void;
  seekRelative: (offsetSeconds: number) => void;
  setSpeed: (speed: PlaybackSpeed) => void;
  cycleSpeed: () => void;
  toggleRepeatOne: () => void;
  toggleAutoNext: () => void;
  closePlayer: () => void;
  audioElementRef: React.RefObject<HTMLAudioElement | null>;
}

export interface AudioPositionContextValue {
  currentTime: number;
  duration: number;
}

export const AudioPlayerContext = createContext<AudioPlayerContextValue | null>(null);
export const AudioPositionContext = createContext<AudioPositionContextValue>({
  currentTime: 0,
  duration: 0,
});

export const useAudioPlayer = (): AudioPlayerContextValue => {
  const ctx = useContext(AudioPlayerContext);
  if (!ctx) {
    throw new Error('useAudioPlayer must be used within an AudioPlayerProvider');
  }
  return ctx;
};

export const useAudioPosition = (): AudioPositionContextValue => {
  return useContext(AudioPositionContext);
};

export const useOptionalAudioPlayer = (): AudioPlayerContextValue | null => {
  return useContext(AudioPlayerContext);
};
