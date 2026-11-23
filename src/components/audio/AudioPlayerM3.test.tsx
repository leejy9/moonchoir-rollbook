import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { PlayerControls } from './PlayerControls';
import { QueueSheet } from './QueueSheet';
import { PieceTracksCard } from './PieceTracksCard';
import type { PlayableTrackItem } from '../../utils/audioQueue';
import type { PracticeTrack } from '../../types/rollbook';

const mockTrack1: PracticeTrack = {
  id: 'trk-1',
  pieceId: 'p1',
  label: '소프라노',
  kind: '가이드',
  source: 'R2',
  url: 'https://cdn.example.com/soprano.mp3',
  orderIndex: 0,
  durationSeconds: 180,
  isArchived: false,
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
};

const mockTrack2: PracticeTrack = {
  id: 'trk-2',
  pieceId: 'p1',
  label: '알토',
  kind: '가이드',
  source: 'R2',
  url: 'https://cdn.example.com/alto.mp3',
  orderIndex: 1,
  durationSeconds: 185,
  isArchived: false,
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
};

const mockTrackVideo: PracticeTrack = {
  id: 'trk-yt',
  pieceId: 'p1',
  label: '참고 영상',
  kind: '참고영상',
  source: 'YOUTUBE',
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  orderIndex: 2,
  isArchived: false,
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
};

const mockQueueItem1: PlayableTrackItem = {
  track: mockTrack1,
  pieceTitle: '아리랑',
  playbackUrl: mockTrack1.url || '',
};

const mockQueueItem2: PlayableTrackItem = {
  track: mockTrack2,
  pieceTitle: '아리랑',
  playbackUrl: mockTrack2.url || '',
};

const mockQueueItem3: PlayableTrackItem = {
  track: {
    ...mockTrack1,
    id: 'trk-3',
    label: '테너',
    orderIndex: 2,
  },
  pieceTitle: '도라지',
  playbackUrl: 'https://cdn.example.com/tenor.mp3',
};

describe('Audio Player v2 UI Components (M3 / V3-19)', () => {
  describe('PlayerControls (M3)', () => {
    it('renders aria-label in exact spec sequence for cycle repeat: 끔 -> 목록 전체 -> 한 곡', () => {
      // 1. off
      const htmlOff = renderToString(
        <PlayerControls
          isPlaying={false}
          playbackSpeed={1.0}
          repeatMode="off"
          hasNext={true}
          togglePlay={vi.fn()}
          previousTrack={vi.fn()}
          nextTrack={vi.fn()}
          seekRelative={vi.fn()}
          cycleRepeat={vi.fn()}
          onOpenSpeedSheet={vi.fn()}
          onOpenQueueSheet={vi.fn()}
        />
      );
      expect(htmlOff).toContain('aria-label="반복: 끔"');
      expect(htmlOff).toContain('aria-pressed="false"');

      // 2. all
      const htmlAll = renderToString(
        <PlayerControls
          isPlaying={false}
          playbackSpeed={1.0}
          repeatMode="all"
          hasNext={true}
          togglePlay={vi.fn()}
          previousTrack={vi.fn()}
          nextTrack={vi.fn()}
          seekRelative={vi.fn()}
          cycleRepeat={vi.fn()}
          onOpenSpeedSheet={vi.fn()}
          onOpenQueueSheet={vi.fn()}
        />
      );
      expect(htmlAll).toContain('aria-label="반복: 목록 전체"');
      expect(htmlAll).toContain('aria-pressed="true"');

      // 3. one
      const htmlOne = renderToString(
        <PlayerControls
          isPlaying={false}
          playbackSpeed={1.0}
          repeatMode="one"
          hasNext={true}
          togglePlay={vi.fn()}
          previousTrack={vi.fn()}
          nextTrack={vi.fn()}
          seekRelative={vi.fn()}
          cycleRepeat={vi.fn()}
          onOpenSpeedSheet={vi.fn()}
          onOpenQueueSheet={vi.fn()}
        />
      );
      expect(htmlOne).toContain('aria-label="반복: 한 곡"');
      expect(htmlOne).toContain('aria-pressed="true"');
      expect(htmlOne).toContain('>1</text>');
    });

    it('next button is disabled when hasNext is false, enabled when true', () => {
      const htmlDisabled = renderToString(
        <PlayerControls
          isPlaying={false}
          playbackSpeed={1.0}
          repeatMode="off"
          hasNext={false}
          togglePlay={vi.fn()}
          previousTrack={vi.fn()}
          nextTrack={vi.fn()}
          seekRelative={vi.fn()}
          cycleRepeat={vi.fn()}
          onOpenSpeedSheet={vi.fn()}
          onOpenQueueSheet={vi.fn()}
        />
      );
      const nextBtnDisabledMatch = htmlDisabled.match(/<button[^>]*aria-label="다음 곡"[^>]*>/);
      expect(nextBtnDisabledMatch).not.toBeNull();
      expect(nextBtnDisabledMatch![0]).toContain('disabled=""');

      const htmlEnabled = renderToString(
        <PlayerControls
          isPlaying={false}
          playbackSpeed={1.0}
          repeatMode="off"
          hasNext={true}
          togglePlay={vi.fn()}
          previousTrack={vi.fn()}
          nextTrack={vi.fn()}
          seekRelative={vi.fn()}
          cycleRepeat={vi.fn()}
          onOpenSpeedSheet={vi.fn()}
          onOpenQueueSheet={vi.fn()}
        />
      );
      const nextBtnEnabledMatch = htmlEnabled.match(/<button[^>]*aria-label="다음 곡"[^>]*>/);
      expect(nextBtnEnabledMatch).not.toBeNull();
      expect(nextBtnEnabledMatch![0]).not.toContain('disabled');
    });
  });

  describe('QueueSheet (M3)', () => {
    it('renders queue items with dimming past class for past items and active for current', () => {
      const html = renderToString(
        <QueueSheet
          isOpen={true}
          onClose={vi.fn()}
          queue={[mockQueueItem1, mockQueueItem2, mockQueueItem3]}
          currentIndex={1} // mockQueueItem2 is active
          queueSource={{ kind: 'performance', id: 'perf-1', title: '정기연주회' }}
          repeatMode="all"
          cycleRepeat={vi.fn()}
          onSelectTrack={vi.fn()}
        />
      );

      expect(html).toContain('재생 목록');
      expect(html).toContain('정기연주회 · 3곡');
      expect(html).toContain('목록 반복');

      // Check item 0 (past): contains 'past'
      const row0Match = html.match(/<button[^>]*class="([^"]*)"[^>]*aria-label="아리랑 재생"/);
      expect(row0Match).not.toBeNull();
      expect(row0Match![1]).toContain('past');
      expect(row0Match![1]).not.toContain('active');

      // Check item 1 (current): contains 'active' and does not contain 'past'
      const activeMatches = [...html.matchAll(/<button[^>]*class="([^"]*active[^"]*)"/g)];
      expect(activeMatches.length).toBeGreaterThan(0);
      expect(activeMatches[0][1]).toContain('active');
      expect(activeMatches[0][1]).not.toContain('past');

      // Check item 2 (upcoming): neither past nor active
      const row2Match = html.match(/<button[^>]*class="([^"]*)"[^>]*aria-label="도라지 재생"/);
      expect(row2Match).not.toBeNull();
      expect(row2Match![1]).not.toContain('past');
      expect(row2Match![1]).not.toContain('active');
    });

    it('returns null when isOpen is false', () => {
      const html = renderToString(
        <QueueSheet
          isOpen={false}
          onClose={vi.fn()}
          queue={[mockQueueItem1]}
          currentIndex={0}
          queueSource={null}
          repeatMode="off"
          cycleRepeat={vi.fn()}
          onSelectTrack={vi.fn()}
        />
      );
      expect(html).toBe('');
    });
  });

  describe('PieceTracksCard (M3)', () => {
    it('renders audio tracks with duration and video tracks with "영상"', () => {
      const html = renderToString(
        <PieceTracksCard
          tracks={[mockTrack1, mockTrack2, mockTrackVideo]}
          activeTrackId="trk-1"
          isActiveVideo={false}
          onSelectAudio={vi.fn()}
          onSelectVideo={vi.fn()}
        />
      );

      expect(html).toContain('이 곡의 음원');
      expect(html).toContain('소프라노');
      expect(html).toContain('3:00'); // 180s
      expect(html).toContain('알토');
      expect(html).toContain('3:05'); // 185s
      expect(html).toContain('참고 영상');
      expect(html).toContain('영상');
      expect(html).toContain('piece-track-playing-badge');
    });
  });
});
