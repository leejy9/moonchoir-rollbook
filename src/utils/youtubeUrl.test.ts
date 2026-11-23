import { describe, it, expect } from 'vitest';
import { isValidYoutubeUrl, isVideoTrack, getYoutubeVideoId } from './youtubeUrl';

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

  describe('getYoutubeVideoId (G3)', () => {
    it('extracts 11-char video id from all 6 allowed formats', () => {
      const id = 'dQw4w9WgXcQ';
      expect(getYoutubeVideoId(`https://www.youtube.com/watch?v=${id}`)).toBe(id);
      expect(getYoutubeVideoId(`https://youtube.com/watch?v=${id}&t=42s`)).toBe(id);
      expect(getYoutubeVideoId(`https://youtu.be/${id}`)).toBe(id);
      expect(getYoutubeVideoId(`https://youtube.com/shorts/${id}`)).toBe(id);
      expect(getYoutubeVideoId(`https://www.youtube.com/embed/${id}`)).toBe(id);
      expect(getYoutubeVideoId(`https://m.youtube.com/watch?v=${id}`)).toBe(id);
      expect(getYoutubeVideoId(`https://music.youtube.com/watch?v=${id}`)).toBe(id);
    });

    it('returns null for invalid or non-extractable urls', () => {
      expect(getYoutubeVideoId('https://vimeo.com/12345678901')).toBe(null);
      expect(getYoutubeVideoId('not a url')).toBe(null);
      expect(getYoutubeVideoId('https://youtube.com/watch?v=short')).toBe(null);
      expect(getYoutubeVideoId('https://youtu.be/')).toBe(null);
      expect(getYoutubeVideoId('')).toBe(null);
    });
  });
});
