import React, { createContext, useContext } from 'react';
import type { PracticeTrack } from '../../types/rollbook';
import type { PlayableTrackItem } from '../../utils/audioQueue';
import type { RepeatMode } from '../../utils/practiceQueue';

export type QueueSource = {
  kind: 'piece' | 'performance';
  id: string;
  title: string;
} | null;

export interface ActiveVideoState {
  track: PracticeTrack;
  pieceTitle: string;
  resumeAt: number;
}

export interface AudioPlayerContextValue {
  currentTrack: PlayableTrackItem | null;
  queue: PlayableTrackItem[];
  currentIndex: number;
  queueSource: QueueSource;
  isPlaying: boolean;
  isBlocked: boolean;
  playbackSpeed: number;
  repeatMode: RepeatMode;
  playTrack: (item: PlayableTrackItem, newQueue?: PlayableTrackItem[]) => void;
  playQueue: (
    source: { kind: 'piece' | 'performance'; id: string; title: string },
    items: PlayableTrackItem[],
    startIndex: number,
    repeatMode: RepeatMode
  ) => void;
  playQueueIndex: (index: number) => void;
  togglePlay: () => void;
  pause: () => void;
  resume: () => void;
  seekTo: (timeSeconds: number) => void;
  seekRelative: (offsetSeconds: number) => void;
  setSpeed: (speed: number) => void;
  cycleSpeed: () => void;
  cycleRepeat: () => void;
  previousTrack: () => void;
  nextTrack: () => void;
  closePlayer: () => void;
  audioElementRef: React.RefObject<HTMLAudioElement | null>;
  activeVideo?: ActiveVideoState | null;
  setActiveVideo?: (video: ActiveVideoState | null) => void;
  showMinimizeHint?: boolean;
  triggerMinimizeHint?: () => void;
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
