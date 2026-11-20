import { describe, expect, it } from 'vitest';
import type { PracticeCatalog, PracticePiece, PracticeTrack, ProgramCard } from '../types/rollbook';
import { buildStudioView, resolveTrackPlayback, resolveTrackUrl } from './practiceMedia';

describe('practiceMedia utils', () => {
  const baseTrack: PracticeTrack = {
    id: 'track_1',
    pieceId: 'piece_1',
    label: '합창 MR',
    kind: 'MR',
    source: 'r2',
    orderIndex: 0,
    isArchived: false,
    createdAt: '2026-11-20T00:00:00Z',
    updatedAt: '2026-11-20T00:00:00Z',
  };

  describe('resolveTrackUrl', () => {
    it('composes baseUrl and storageKey encoding each path segment including Korean characters', () => {
      const track: PracticeTrack = {
        ...baseTrack,
        storageKey: '/2026 가을/아리랑_테너.mp3',
      };
      const url = resolveTrackUrl(track, 'https://media.moonchoir.org/');
      expect(url).toBe(
        'https://media.moonchoir.org/2026%20%EA%B0%80%EC%9D%84/%EC%95%84%EB%A6%AC%EB%9E%91_%ED%85%8C%EB%84%88.mp3'
      );
    });

    it('falls back to track.url when mediaPublicBaseUrl is not provided for r2', () => {
      const track: PracticeTrack = {
        ...baseTrack,
        url: 'https://cdn.example.com/audio.mp3',
      };
      expect(resolveTrackUrl(track)).toBe('https://cdn.example.com/audio.mp3');
    });

    it('returns track.url for external sources if https', () => {
      const track: PracticeTrack = {
        ...baseTrack,
        source: 'youtube',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      };
      expect(resolveTrackUrl(track)).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    });

    it('returns undefined for non-https or insecure urls', () => {
      const track1: PracticeTrack = {
        ...baseTrack,
        source: 'external_url',
        url: 'http://insecure.com/audio.mp3',
      };
      const track2: PracticeTrack = {
        ...baseTrack,
        source: 'external_url',
        url: 'javascript:alert(1)',
      };
      expect(resolveTrackUrl(track1)).toBeUndefined();
      expect(resolveTrackUrl(track2)).toBeUndefined();
    });
  });

  describe('resolveTrackPlayback', () => {
    const config = { mediaPublicBaseUrl: 'https://media.moonchoir.org' };

    it('resolves r2 track to audio mode with prefetch and background support', () => {
      const track: PracticeTrack = {
        ...baseTrack,
        source: 'r2',
        storageKey: 'audio/arirang.m4a',
      };
      const playback = resolveTrackPlayback(track, config);
      expect(playback.mode).toBe('audio');
      expect(playback.src).toBe('https://media.moonchoir.org/audio/arirang.m4a');
      expect(playback.canPrefetch).toBe(true);
      expect(playback.supportsBackground).toBe(true);
    });

    it('returns unavailable for r2 when mediaPublicBaseUrl is missing and no url is set', () => {
      const track: PracticeTrack = {
        ...baseTrack,
        source: 'r2',
        storageKey: 'audio/arirang.m4a',
      };
      const playback = resolveTrackPlayback(track, undefined);
      expect(playback.mode).toBe('unavailable');
      expect(playback.canPrefetch).toBe(false);
      expect(playback.supportsBackground).toBe(false);
      expect(playback.reason).toContain('mediaPublicBaseUrl');
    });

    it('resolves Google Drive track to external_link mode', () => {
      const track: PracticeTrack = {
        ...baseTrack,
        source: 'drive',
        url: 'https://drive.google.com/file/d/xyz123/view',
      };
      const playback = resolveTrackPlayback(track, config);
      expect(playback.mode).toBe('external_link');
      expect(playback.src).toBe('https://drive.google.com/file/d/xyz123/view');
      expect(playback.canPrefetch).toBe(false);
      expect(playback.supportsBackground).toBe(false);
    });

    it('resolves YouTube watch, youtu.be, and shorts to external_link mode', () => {
      const urls = [
        'https://www.youtube.com/watch?v=abc',
        'https://youtu.be/abc',
        'https://www.youtube.com/shorts/abc',
      ];
      for (const url of urls) {
        const track: PracticeTrack = {
          ...baseTrack,
          source: 'youtube',
          url,
        };
        const playback = resolveTrackPlayback(track, config);
        expect(playback.mode).toBe('external_link');
        expect(playback.src).toBe(url);
        expect(playback.supportsBackground).toBe(false);
      }
    });

    it('resolves unknown/custom source to external_link when https url exists', () => {
      const track: PracticeTrack = {
        ...baseTrack,
        source: 'vimeo',
        url: 'https://vimeo.com/123456',
      };
      const playback = resolveTrackPlayback(track, config);
      expect(playback.mode).toBe('external_link');
      expect(playback.src).toBe('https://vimeo.com/123456');
    });

    it('blocks malicious or insecure URLs (http, javascript:) and returns unavailable', () => {
      const insecureHttp: PracticeTrack = {
        ...baseTrack,
        source: 'drive',
        url: 'http://drive.google.com/insecure',
      };
      const maliciousJs: PracticeTrack = {
        ...baseTrack,
        source: 'youtube',
        url: 'javascript:alert(1)',
      };
      const emptyTrack: PracticeTrack = {
        ...baseTrack,
        source: 'drive',
        url: '',
      };

      expect(resolveTrackPlayback(insecureHttp, config).mode).toBe('unavailable');
      expect(resolveTrackPlayback(maliciousJs, config).mode).toBe('unavailable');
      expect(resolveTrackPlayback(emptyTrack, config).mode).toBe('unavailable');
    });
  });

  describe('buildStudioView', () => {
    const cards: ProgramCard[] = [
      {
        id: 'card_fall',
        title: '2026 가을 정기연습',
        description: '',
        category: '정기연습',
        isArchived: false,
        createdAt: '2026-10-01T00:00:00Z',
      },
      {
        id: 'card_winter',
        title: '2026 겨울 연주회',
        description: '',
        category: '연주',
        isArchived: false,
        createdAt: '2026-11-01T00:00:00Z',
      },
      {
        id: 'card_archived',
        title: '2025 과거 시즌',
        description: '',
        category: '정기연습',
        isArchived: true,
        createdAt: '2025-01-01T00:00:00Z',
      },
    ];

    const pieces: PracticePiece[] = [
      {
        id: 'piece_shared',
        title: '아리랑',
        isArchived: false,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      },
      {
        id: 'piece_winter_only',
        title: '고요한 밤 거룩한 밤',
        isArchived: false,
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z',
      },
      {
        id: 'piece_archived',
        title: '보관된 곡',
        isArchived: true,
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      },
    ];

    const tracks: PracticeTrack[] = [
      {
        id: 'track_1',
        pieceId: 'piece_shared',
        label: '아리랑 테너',
        kind: '가이드',
        source: 'r2',
        storageKey: 'arirang_tenor.mp3',
        orderIndex: 0,
        isArchived: false,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      },
      {
        id: 'track_archived',
        pieceId: 'piece_shared',
        label: '과거 트랙',
        kind: 'MR',
        source: 'r2',
        storageKey: 'old.mp3',
        orderIndex: 1,
        isArchived: true,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      },
    ];

    const catalog: PracticeCatalog = {
      pieces,
      tracks,
      programPieces: [
        { programId: 'card_fall', pieceId: 'piece_shared', orderIndex: 0, isArchived: false },
        { programId: 'card_winter', pieceId: 'piece_shared', orderIndex: 1, isArchived: false },
        { programId: 'card_winter', pieceId: 'piece_winter_only', orderIndex: 0, isArchived: false },
        { programId: 'card_fall', pieceId: 'piece_archived', orderIndex: 2, isArchived: false },
      ],
    };

    it('groups active pieces and tracks under active program cards and excludes archived ones', () => {
      const view = buildStudioView(catalog, cards);

      expect(view).toHaveLength(2); // card_archived excluded
      expect(view.map((s) => s.programCard.id)).toEqual(['card_fall', 'card_winter']);

      const fallSection = view.find((s) => s.programCard.id === 'card_fall')!;
      expect(fallSection.pieces).toHaveLength(1); // piece_archived excluded
      expect(fallSection.pieces[0].piece.id).toBe('piece_shared');
      expect(fallSection.pieces[0].tracks).toHaveLength(1); // track_archived excluded
    });

    it('shows a song linked to two active seasons in both season sections', () => {
      const view = buildStudioView(catalog, cards);
      const fallPieces = view.find((s) => s.programCard.id === 'card_fall')!.pieces;
      const winterPieces = view.find((s) => s.programCard.id === 'card_winter')!.pieces;

      expect(fallPieces.some((p) => p.piece.id === 'piece_shared')).toBe(true);
      expect(winterPieces.some((p) => p.piece.id === 'piece_shared')).toBe(true);
    });

    it('sorts pieces within a program card by orderIndex', () => {
      const view = buildStudioView(catalog, cards);
      const winterPieces = view.find((s) => s.programCard.id === 'card_winter')!.pieces;

      expect(winterPieces[0].piece.id).toBe('piece_winter_only'); // orderIndex 0
      expect(winterPieces[1].piece.id).toBe('piece_shared'); // orderIndex 1
    });
  });
});
