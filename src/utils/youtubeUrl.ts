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

