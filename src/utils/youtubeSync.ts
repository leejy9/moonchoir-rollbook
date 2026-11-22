/**
 * YouTube playback message & blur listeners for auto-pausing app audio player.
 * Compliant with §3-3 and §4-A-3.
 */

/**
 * Creates message listener for YouTube IFrame API events.
 */
export function createYoutubeMessageListener(onPause: () => void): (event: MessageEvent) => void {
  return (event: MessageEvent) => {
    // Only accept messages originating from YouTube embed domain
    if (event.origin !== 'https://www.youtube.com') return;

    // R9 exception: YouTube embeds emit numerous internal telemetry/string messages;
    // silently skip non-JSON or invalid strings without console.warn.
    let data: any = event.data;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        return;
      }
    }

    if (!data || typeof data !== 'object') return;

    // Detect playing state 1 from both standard onStateChange and infoDelivery formats
    const isPlaying =
      (data.event === 'onStateChange' && data.info === 1) ||
      (data.event === 'infoDelivery' && data.info?.playerState === 1);

    if (isPlaying) {
      onPause();
    }
  };
}

/**
 * Creates blur listener for detecting when user tapped into a YouTube iframe.
 */
export function createYoutubeBlurListener(
  getIframes: () => HTMLIFrameElement[],
  onPause: () => void,
  getDocument: () => Document | undefined = () => (typeof document !== 'undefined' ? document : undefined)
): () => void {
  return () => {
    const doc = getDocument();
    if (!doc) return;
    const activeEl = doc.activeElement;
    if (activeEl && activeEl.tagName === 'IFRAME') {
      const iframes = getIframes();
      if (iframes.includes(activeEl as HTMLIFrameElement)) {
        onPause();
      }
    }
  };
}
