import { useEffect, useRef } from 'react';
import type { PlayableTrackItem } from '../../utils/audioQueue';
import { ListenLogger } from '../../services/media/listenLogger';

export function useAudioListenLogger(currentTrack: PlayableTrackItem | null) {
  const loggerRef = useRef<ListenLogger | null>(null);

  useEffect(() => {
    const logger = new ListenLogger();
    loggerRef.current = logger;
    const handleVis = () => {
      logger.onVisibilityChange(document.visibilityState === 'hidden');
    };
    document.addEventListener('visibilitychange', handleVis);
    return () => {
      document.removeEventListener('visibilitychange', handleVis);
      logger.destroy();
    };
  }, []);

  useEffect(() => {
    loggerRef.current?.onTrackChange(currentTrack);
  }, [currentTrack]);

  return loggerRef;
}
