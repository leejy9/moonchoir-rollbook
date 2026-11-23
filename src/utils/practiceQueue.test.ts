import { describe, expect, it } from 'vitest';
import type { PracticeCatalog, PracticePiece, PracticeTrack } from '../types/rollbook';
import {
  actionOnPrevious,
  buildPerformanceQueue,
  buildPieceQueue,
  cycleRepeat,
  getRepresentativeTrack,
  indexOnNext,
  indexOnTrackEnd,
  nearestRate,
} from './practiceQueue';

describe('practiceQueue (M1 / V3-19)', () => {
  const samplePieces: PracticePiece[] = [
    {
      id: 'p1',
      title: '아리랑',
      composer: '민요',
      isArchived: false,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    },
    {
      id: 'p2',
      title: '도라지',
      composer: '민요',
      isArchived: false,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    },
    {
      id: 'p3',
      title: '경복궁 타령',
      composer: '민요',
      isArchived: false,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    },
  ];

  const sampleTracks: PracticeTrack[] = [
    {
      id: 't1-1',
      pieceId: 'p1',
      label: '전체 (보관됨)',
      kind: '가이드',
      source: 'R2',
      url: 'https://cdn.example.com/audio1.mp3',
      orderIndex: 0,
      isArchived: true,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    },
    {
      id: 't1-2',
      pieceId: 'p1',
      label: '소프라노',
      kind: '가이드',
      source: 'R2',
      url: 'https://cdn.example.com/soprano.mp3',
      orderIndex: 1,
      isArchived: false,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    },
    {
      id: 't1-3',
      pieceId: 'p1',
      label: '알토',
      kind: '가이드',
      source: 'R2',
      url: 'https://cdn.example.com/alto.mp3',
      orderIndex: 2,
      isArchived: false,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    },
    {
      id: 't2-yt',
      pieceId: 'p2',
      label: '참고 영상',
      kind: '참고영상',
      source: 'YOUTUBE',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      orderIndex: 0,
      isArchived: false,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    },
    {
      id: 't3-1',
      pieceId: 'p3',
      label: '피아노 반주',
      kind: 'MR',
      source: 'R2',
      storageKey: 'audio/p3_piano.mp3',
      orderIndex: 0,
      isArchived: false,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    },
  ];

  const sampleCatalog: PracticeCatalog = {
    pieces: samplePieces,
    tracks: sampleTracks,
    performancePieces: [
      {
        performanceId: 'perf-1',
        pieceId: 'p1',
        orderIndex: 1,
        isArchived: false,
      },
      {
        performanceId: 'perf-1',
        pieceId: 'p2',
        orderIndex: 2,
        isArchived: false,
      },
      {
        performanceId: 'perf-1',
        pieceId: 'p3',
        orderIndex: 0, // p3 comes first in performance order
        isArchived: false,
      },
    ],
    performances: [
      {
        id: 'perf-1',
        title: '정기연주회',
        performanceDate: '2026-12-25',
        venue: '콘서트홀',
        isArchived: false,
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z',
      },
    ],
    programPieces: [],
  };

  describe('getRepresentativeTrack', () => {
    it('picks lowest orderIndex playable audio track and skips archived track (t1-1 archived -> t1-2)', () => {
      const rep = getRepresentativeTrack('p1', sampleTracks);
      expect(rep).not.toBeNull();
      expect(rep?.id).toBe('t1-2');
      expect(rep?.label).toBe('소프라노');
    });

    it('returns null if the piece only has YouTube tracks', () => {
      const rep = getRepresentativeTrack('p2', sampleTracks);
      expect(rep).toBeNull();
    });

    it('returns null if no tracks exist for the piece', () => {
      const rep = getRepresentativeTrack('non-existent', sampleTracks);
      expect(rep).toBeNull();
    });
  });

  describe('buildPieceQueue', () => {
    it('returns playable audio tracks for piece in order', () => {
      const queue = buildPieceQueue('p1', sampleCatalog);
      expect(queue).toHaveLength(2);
      expect(queue[0].track.id).toBe('t1-2');
      expect(queue[0].pieceTitle).toBe('아리랑');
      expect(queue[1].track.id).toBe('t1-3');
    });

    it('returns empty array if piece is archived', () => {
      const archivedCatalog: PracticeCatalog = {
        ...sampleCatalog,
        pieces: [{ ...samplePieces[0], isArchived: true }],
      };
      const queue = buildPieceQueue('p1', archivedCatalog);
      expect(queue).toEqual([]);
    });
  });

  describe('buildPerformanceQueue', () => {
    it('builds queue in performance order, excluding pieces with only video (p3 -> p1)', () => {
      const config = { mediaPublicBaseUrl: 'https://media.example.com' };
      const queue = buildPerformanceQueue('perf-1', sampleCatalog, config);

      // p3 has orderIndex 0, p1 has orderIndex 1. p2 only has video, so excluded.
      expect(queue).toHaveLength(2);
      expect(queue[0].pieceTitle).toBe('경복궁 타령');
      expect(queue[0].track.id).toBe('t3-1');
      expect(queue[0].playbackUrl).toBe('https://media.example.com/audio/p3_piano.mp3');

      expect(queue[1].pieceTitle).toBe('아리랑');
      expect(queue[1].track.id).toBe('t1-2');
    });
  });

  describe('cycleRepeat', () => {
    it('cycles off -> all -> one -> off', () => {
      expect(cycleRepeat('off')).toBe('all');
      expect(cycleRepeat('all')).toBe('one');
      expect(cycleRepeat('one')).toBe('off');
    });
  });

  describe('indexOnTrackEnd', () => {
    it('in mode "one", returns same index', () => {
      expect(indexOnTrackEnd(0, 3, 'one')).toBe(0);
      expect(indexOnTrackEnd(2, 3, 'one')).toBe(2);
    });

    it('in mode "all", advances and wraps to 0 at end', () => {
      expect(indexOnTrackEnd(0, 3, 'all')).toBe(1);
      expect(indexOnTrackEnd(1, 3, 'all')).toBe(2);
      expect(indexOnTrackEnd(2, 3, 'all')).toBe(0);
    });

    it('in mode "off", advances but returns null at end', () => {
      expect(indexOnTrackEnd(0, 3, 'off')).toBe(1);
      expect(indexOnTrackEnd(1, 3, 'off')).toBe(2);
      expect(indexOnTrackEnd(2, 3, 'off')).toBeNull();
    });

    it('returns null on invalid index or length 0', () => {
      expect(indexOnTrackEnd(0, 0, 'all')).toBeNull();
      expect(indexOnTrackEnd(-1, 2, 'all')).toBeNull();
      expect(indexOnTrackEnd(2, 2, 'all')).toBeNull();
    });
  });

  describe('indexOnNext', () => {
    it('advances to next index when available', () => {
      expect(indexOnNext(0, 3, 'off')).toBe(1);
      expect(indexOnNext(0, 3, 'all')).toBe(1);
      expect(indexOnNext(0, 3, 'one')).toBe(1);
    });

    it('at last index, wraps to 0 only for mode "all", otherwise returns null', () => {
      expect(indexOnNext(2, 3, 'all')).toBe(0);
      expect(indexOnNext(2, 3, 'off')).toBeNull();
      expect(indexOnNext(2, 3, 'one')).toBeNull();
    });
  });

  describe('actionOnPrevious', () => {
    it('returns restart if currentTime > 3.0s (e.g. 3.01s or 5.0s)', () => {
      expect(actionOnPrevious(1, 3.01)).toEqual({ type: 'restart' });
      expect(actionOnPrevious(1, 5.0)).toEqual({ type: 'restart' });
    });

    it('returns go previous if currentTime <= 3.0s and index > 0 (e.g. 3.0s or 2.0s)', () => {
      expect(actionOnPrevious(1, 3.0)).toEqual({ type: 'go', index: 0 });
      expect(actionOnPrevious(2, 2.0)).toEqual({ type: 'go', index: 1 });
    });

    it('returns restart if currentTime <= 3.0s and index === 0', () => {
      expect(actionOnPrevious(0, 2.0)).toEqual({ type: 'restart' });
      expect(actionOnPrevious(0, 0.0)).toEqual({ type: 'restart' });
    });
  });

  describe('nearestRate', () => {
    it('finds closest playback rate to target', () => {
      const rates = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
      expect(nearestRate(rates, 0.8)).toBe(0.75);
      expect(nearestRate(rates, 1.1)).toBe(1);
      expect(nearestRate(rates, 1.2)).toBe(1.25);
    });
  });
});
