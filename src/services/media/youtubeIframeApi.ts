/**
 * Minimal YouTube IFrame API Loader (MEMBER_UX_V3_SPEC.md §3-3-5, V25).
 * - Dynamically loads https://www.youtube.com/iframe_api only when first playing video in player
 * - Injects <script> at most once
 * - Rejects after 10-second timeout with console.warn
 * - No @types/youtube dependency (Rule 10)
 */

export interface YTPlayerOptions {
  videoId?: string;
  width?: string | number;
  height?: string | number;
  playerVars?: {
    playsinline?: number;
    rel?: number;
    controls?: number;
    origin?: string;
    start?: number;
    [key: string]: unknown;
  };
  events?: {
    onReady?: (event: { target: YTPlayerInstance }) => void;
    onStateChange?: (event: { data: number; target: YTPlayerInstance }) => void;
    onError?: (event: { data: number; target: YTPlayerInstance }) => void;
  };
}

export interface YTPlayerInstance {
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(seconds: number, allowSeekAhead?: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  getAvailablePlaybackRates(): number[];
  setPlaybackRate(rate: number): void;
  destroy(): void;
}

export interface YTNamespace {
  Player: new (element: HTMLElement | string, options: YTPlayerOptions) => YTPlayerInstance;
  PlayerState?: {
    UNSTARTED?: number;
    ENDED?: number;
    PLAYING?: number;
    PAUSED?: number;
    BUFFERING?: number;
    CUED?: number;
  };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let loadPromise: Promise<YTNamespace> | null = null;

export function loadYoutubeIframeApi(): Promise<YTNamespace> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Window is not defined'));
  }

  if (window.YT && window.YT.Player) {
    return Promise.resolve(window.YT);
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise<YTNamespace>((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      cleanup();
      if (typeof prevReady === 'function') {
        try {
          prevReady();
        } catch (err) {
          console.warn('[YouTube API] Previous onYouTubeIframeAPIReady error:', err);
        }
      }
      if (window.YT && window.YT.Player) {
        resolve(window.YT);
      } else {
        console.warn('[YouTube API] YT.Player not defined after API ready');
        reject(new Error('YouTube API ready but YT.Player not found'));
      }
    };

    const SCRIPT_ID = 'youtube-iframe-api';
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      document.head.appendChild(script);
    }

    timeoutId = setTimeout(() => {
      loadPromise = null;
      console.warn('[YouTube API] Failed to load YouTube iframe API within 10s');
      reject(new Error('YouTube iframe API load timeout'));
    }, 10000);
  });

  return loadPromise;
}

/**
 * Reset loader state (primarily for unit tests).
 */
export function resetYoutubeApiLoader(): void {
  loadPromise = null;
}
