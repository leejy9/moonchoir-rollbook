import { describe, it, expect } from 'vitest';
import {
  filterPlayableAudioTracks,
  buildAudioQueue,
  getNextTrackIndex,
  getNextPlaybackSpeed,
  clampSeekTime,
} from './audioQueue';
import type { PracticeTrack } from '../types/rollbook';

describe('audioQueue pure functions (MEMBER_UX_AUDIO_SPEC §3-4)', () => {
  const mockTracks: PracticeTrack[] = [
    {
      id: 'trk_r2',
      pieceId: 'piece_1',
      label: '소프라노 가이드',
      kind: 'guide_soprano',
      source: 'r2',
      storageKey: '2026-season/soprano.m4a',
      orderIndex: 0,
      isArchived: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'trk_youtube',
      pieceId: 'piece_1',
      label: '유튜브 참고 영상',
      kind: 'reference',
      source: 'youtube',
      url: 'https://youtube.com/watch?v=12345',
      orderIndex: 1,
      isArchived: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'trk_drive',
      pieceId: 'piece_1',
      label: '구글 드라이브 원곡',
      kind: 'mr',
      source: 'drive',
      url: 'https://drive.google.com/file/d/12345/view',
      orderIndex: 2,
      isArchived: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'trk_archived',
      pieceId: 'piece_1',
      label: '보관된 트랙',
      kind: 'guide_alto',
      source: 'r2',
      storageKey: '2026-season/alto.m4a',
      orderIndex: 3,
      isArchived: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'trk_insecure',
      pieceId: 'piece_1',
      label: '안전하지 않은 주소',
      kind: 'custom',
      source: 'external_url',
      url: 'http://insecure.com/audio.mp3',
      orderIndex: 4,
      isArchived: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ];

  const config = { mediaPublicBaseUrl: 'https://media.moonchoir.workers.dev' };

  it('filters out non-audio (YouTube, Drive), archived, and insecure tracks from queue (Spec §6-2 #2)', () => {
    const playable = filterPlayableAudioTracks(mockTracks, config);
    expect(playable).toHaveLength(1);
    expect(playable[0].id).toBe('trk_r2');

    const pieceMap = new Map([['piece_1', '바람이 불어오는 곳']]);
    const queue = buildAudioQueue(mockTracks, pieceMap, config);
    expect(queue).toHaveLength(1);
    expect(queue[0].pieceTitle).toBe('바람이 불어오는 곳');
    expect(queue[0].playbackUrl).toBe('https://media.moonchoir.workers.dev/2026-season/soprano.m4a');
  });

  describe('getNextTrackIndex', () => {
    it('returns same index when repeatOne is true (default single track loop)', () => {
      expect(getNextTrackIndex(0, 3, true, false)).toBe(0);
      expect(getNextTrackIndex(1, 3, true, false)).toBe(1);
      expect(getNextTrackIndex(2, 3, true, true)).toBe(2);
    });

    it('advances to next index when repeatOne is false and autoNext is true', () => {
      expect(getNextTrackIndex(0, 3, false, true)).toBe(1);
      expect(getNextTrackIndex(1, 3, false, true)).toBe(2);
      expect(getNextTrackIndex(2, 3, false, true)).toBe(-1); // End of queue
    });

    it('returns -1 (stops) when repeatOne is false and autoNext is false', () => {
      expect(getNextTrackIndex(0, 3, false, false)).toBe(-1);
    });

    it('handles empty queue or out of bound index safely', () => {
      expect(getNextTrackIndex(0, 0, true, false)).toBe(-1);
      expect(getNextTrackIndex(-1, 3, true, false)).toBe(-1);
      expect(getNextTrackIndex(5, 3, true, false)).toBe(-1);
    });
  });

  describe('getNextPlaybackSpeed', () => {
    it('cycles between 0.8 -> 1.0 -> 1.2 -> 0.8', () => {
      expect(getNextPlaybackSpeed(0.8)).toBe(1.0);
      expect(getNextPlaybackSpeed(1.0)).toBe(1.2);
      expect(getNextPlaybackSpeed(1.2)).toBe(0.8);
    });
  });

  describe('clampSeekTime', () => {
    it('clamps backwards seek at 0 seconds', () => {
      expect(clampSeekTime(5, -10, 100)).toBe(0);
    });

    it('clamps forwards seek at duration', () => {
      expect(clampSeekTime(95, 10, 100)).toBe(100);
    });

    it('calculates normal seek within bounds', () => {
      expect(clampSeekTime(50, 10, 100)).toBe(60);
      expect(clampSeekTime(50, -10, 100)).toBe(40);
    });
  });
});
