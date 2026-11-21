import { describe, it, expect } from 'vitest';
import { isValidYoutubeUrl, isVideoTrack } from './youtubeUrl';

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

  describe('isVideoTrack (F6)', () => {
    it('classifies youtu.be and m.youtube.com as video', () => {
      expect(isVideoTrack({ url: 'https://youtu.be/sample123' })).toBe(true);
      expect(isVideoTrack({ url: 'https://m.youtube.com/watch?v=sample123' })).toBe(true);
      expect(isVideoTrack({ source: 'youtube', url: '' })).toBe(true);
      expect(isVideoTrack({ kind: '참고영상' })).toBe(true);
    });

    it('classifies google drive and non-youtube links as audio (not video)', () => {
      expect(isVideoTrack({ url: 'https://drive.google.com/file/d/sample/view', source: 'link', kind: '가이드' })).toBe(false);
      expect(isVideoTrack({ source: 'r2', storageKey: 'audio/sample.m4a', kind: '파트음원' })).toBe(false);
    });
  });
});
