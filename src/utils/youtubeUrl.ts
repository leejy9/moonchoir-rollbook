import type { PracticeTrack } from '../types/rollbook';

/**
 * YouTube URL validator compliant with §4-2.
 * Validates HTTPS protocol and allowed hostnames:
 * youtube.com, www.youtube.com, m.youtube.com, music.youtube.com, youtu.be
 */

const ALLOWED_YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
]);

export function isValidYoutubeUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const url = new URL(rawUrl.trim());
    if (url.protocol !== 'https:') return false;
    return ALLOWED_YOUTUBE_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Determines whether a track is classified as video or audio.
 * A track is considered video if its source is 'youtube', its kind is '참고영상',
 * or its URL points to an allowed YouTube host.
 */
export function isVideoTrack(track: Partial<PracticeTrack>): boolean {
  if (track.source === 'youtube') return true;
  if (track.kind === '참고영상') return true;
  if (track.url && isValidYoutubeUrl(track.url)) return true;
  return false;
}

/**
 * Extracts the 11-character YouTube video ID from supported URL patterns:
 * - youtube.com/watch?v=ID (including query parameters)
 * - youtu.be/ID
 * - youtube.com/shorts/ID
 * - youtube.com/embed/ID
 * - m.youtube.com/watch?v=ID
 * - music.youtube.com/watch?v=ID
 * Returns null if the URL is invalid or the video ID cannot be extracted.
 */
export function getYoutubeVideoId(rawUrl: string): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  try {
    const url = new URL(rawUrl.trim());
    const host = url.hostname.toLowerCase();
    if (!ALLOWED_YOUTUBE_HOSTS.has(host)) return null;

    let id: string | null = null;
    if (host === 'youtu.be') {
      id = url.pathname.slice(1).split('/')[0];
    } else if (url.pathname.startsWith('/shorts/')) {
      id = url.pathname.slice('/shorts/'.length).split('/')[0];
    } else if (url.pathname.startsWith('/embed/')) {
      id = url.pathname.slice('/embed/'.length).split('/')[0];
    } else if (url.pathname.startsWith('/watch')) {
      id = url.searchParams.get('v');
    }

    if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) {
      return id;
    }
    return null;
  } catch {
    return null;
  }
}

