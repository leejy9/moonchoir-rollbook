import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ListenLogger } from './listenLogger';
import type { PlayableTrackItem } from '../../utils/audioQueue';

const mockTrack: PlayableTrackItem = {
  track: {
    id: 'track_001',
    pieceId: 'piece_001',
    label: '합창 MR',
    kind: 'MR',
    source: 'r2',
    orderIndex: 0,
    isArchived: false,
    createdAt: '',
    updatedAt: '',
  },
  pieceTitle: '테스트곡',
  playbackUrl: 'https://example.com/audio.mp3',
};

describe('ListenLogger (V3-10)', () => {
  let currentTimeMs = 1000000;
  const mockNow = () => currentTimeMs;

  beforeEach(() => {
    currentTimeMs = 1000000;
    vi.restoreAllMocks();
  });

  it('탐색 제외: 2초 넘게 차이 나는 시간 점프는 누적하지 않는다', async () => {
    const sentSessions: unknown[] = [];
    const logger = new ListenLogger({
      getMemberId: () => 'mem_001',
      onSendSession: async (p) => {
        sentSessions.push(p);
        return true;
      },
      now: mockNow,
    });

    logger.onTrackChange(mockTrack);
    logger.onPlay();

    // 0s at t = 0
    logger.onTimeUpdate(0);

    // Normal progression: 10s passed in 10s wall clock
    currentTimeMs += 10000;
    logger.onTimeUpdate(10); // jump = 10 > 2 -> wait!
    // Since audio jumped from 0 to 10 in one step (> 2s), this is a seek!
    // It should be skipped.
    logger.onPause();
    expect(sentSessions).toHaveLength(0);

    // Step-by-step normal playback: 1s audio advance per 1s wall clock
    logger.onPlay();
    logger.onTimeUpdate(10);
    for (let i = 1; i <= 35; i++) {
      currentTimeMs += 1000;
      logger.onTimeUpdate(10 + i);
    }
    // Now jump 100s ahead (seek)
    currentTimeMs += 1000;
    logger.onTimeUpdate(150);

    logger.onPause();
    expect(sentSessions).toHaveLength(1);
    const session = sentSessions[0] as { listenedSeconds: number };
    // Should only have accumulated the 35 seconds of normal playback, ignoring the 100s jump
    expect(session.listenedSeconds).toBe(35);
  });

  it('30초 미만 보류: 30초 미만이면 보내지 않고 다음 묶음에 합친다', async () => {
    const sentSessions: unknown[] = [];
    const logger = new ListenLogger({
      getMemberId: () => 'mem_001',
      onSendSession: async (p) => {
        sentSessions.push(p);
        return true;
      },
      now: mockNow,
    });

    logger.onTrackChange(mockTrack);
    logger.onPlay();
    logger.onTimeUpdate(0);

    // 20s playback
    for (let i = 1; i <= 20; i++) {
      currentTimeMs += 1000;
      logger.onTimeUpdate(i);
    }

    // Pause at 20s (< 30s) -> should NOT send
    logger.onPause();
    expect(sentSessions).toHaveLength(0);

    // Resume and play 15s more (cumulative 35s)
    logger.onPlay();
    logger.onTimeUpdate(20);
    for (let i = 1; i <= 15; i++) {
      currentTimeMs += 1000;
      logger.onTimeUpdate(20 + i);
    }

    // Pause at 35s (>= 30s) -> should send 35s
    logger.onPause();
    expect(sentSessions).toHaveLength(1);
    const session = sentSessions[0] as { listenedSeconds: number };
    expect(session.listenedSeconds).toBe(35);
  });

  it('60초 주기: 60초 누적 시 자동으로 전송한다', async () => {
    const sentSessions: unknown[] = [];
    const logger = new ListenLogger({
      getMemberId: () => 'mem_001',
      onSendSession: async (p) => {
        sentSessions.push(p);
        return true;
      },
      now: mockNow,
    });

    logger.onTrackChange(mockTrack);
    logger.onPlay();
    logger.onTimeUpdate(0);

    // Continuously play for 65 seconds
    for (let i = 1; i <= 65; i++) {
      currentTimeMs += 1000;
      logger.onTimeUpdate(i);
    }

    // Reached 60s while still playing -> flushed
    expect(sentSessions).toHaveLength(1);
    const session = sentSessions[0] as { listenedSeconds: number };
    expect(session.listenedSeconds).toBe(60);
  });

  it('회원 없음 시 미전송: 로그인 전에는 전송하지 않는다', async () => {
    const sentSessions: unknown[] = [];
    const logger = new ListenLogger({
      getMemberId: () => null, // No member logged in
      onSendSession: async (p) => {
        sentSessions.push(p);
        return true;
      },
      now: mockNow,
    });

    logger.onTrackChange(mockTrack);
    logger.onPlay();
    logger.onTimeUpdate(0);

    for (let i = 1; i <= 40; i++) {
      currentTimeMs += 1000;
      logger.onTimeUpdate(i);
    }

    logger.onPause();
    expect(sentSessions).toHaveLength(0);
  });

  it('전송 실패 시 오류를 조용히 버리고 console.warn을 남긴다', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logger = new ListenLogger({
      getMemberId: () => 'mem_001',
      onSendSession: async () => {
        throw new Error('Network timeout');
      },
      now: mockNow,
    });

    logger.onTrackChange(mockTrack);
    logger.onPlay();
    logger.onTimeUpdate(0);

    for (let i = 1; i <= 35; i++) {
      currentTimeMs += 1000;
      logger.onTimeUpdate(i);
    }

    await logger.flush();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ListenLogger] Failed to log listen session:'),
      expect.anything()
    );
  });
});
