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
