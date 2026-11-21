import { describe, it, expect } from 'vitest';
import { isValidYoutubeUrl } from './youtubeUrl';

describe('isValidYoutubeUrl', () => {
  it('accepts valid https YouTube URLs', () => {
    expect(isValidYoutubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
    expect(isValidYoutubeUrl('https://youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
    expect(isValidYoutubeUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
    expect(isValidYoutubeUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
    expect(isValidYoutubeUrl('https://music.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
  });

  it('rejects http, non-YouTube domains, and invalid URLs', () => {
    // HTTP not HTTPS
    expect(isValidYoutubeUrl('http://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(false);
    expect(isValidYoutubeUrl('http://youtu.be/dQw4w9WgXcQ')).toBe(false);

    // Other video / phishing domains
    expect(isValidYoutubeUrl('https://vimeo.com/12345')).toBe(false);
    expect(isValidYoutubeUrl('https://not-youtube.com/watch?v=abc')).toBe(false);
    expect(isValidYoutubeUrl('https://fakeyoutube.com/watch')).toBe(false);

    // Malformed URLs
    expect(isValidYoutubeUrl('not a url')).toBe(false);
    expect(isValidYoutubeUrl('')).toBe(false);
  });
});
