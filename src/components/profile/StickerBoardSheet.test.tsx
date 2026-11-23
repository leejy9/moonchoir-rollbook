import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { StickerBoardSheet } from './StickerBoardSheet';
import { computeUnseenStickers } from './useSeenStickers';
import { STICKER_DEFINITIONS, type EvaluatedSticker } from '../../utils/praiseStickers';

describe('StickerBoardSheet & computeUnseenStickers (V3-13, Spec §5-6, §5-7)', () => {
  const mockStickers: EvaluatedSticker[] = STICKER_DEFINITIONS.map((d, i) => ({
    ...d,
    earned: i < 3,
    earnedOn: i < 3 ? '2026-05-01' : undefined,
    progress: i < 3 ? 1 : 0,
  }));

  it('renders sticker board sheet with 24 stickers for regular member', () => {
    const html = renderToString(
      <StickerBoardSheet
        stickers={mockStickers}
        isStaff={false}
        unseenStickerIds={new Set(['first-step'])}
        onClose={vi.fn()}
      />
    );

    expect(html).toContain('칭찬 스티커');
    expect(html).toContain('획득 3 / 24');
    expect(html).toContain('첫걸음');
    expect(html).toContain('신규');
    expect(html).toContain('2026-05-01 획득');
    expect(html).toContain('sticker-modal-overlay');
    expect(html).toContain('sticker-modal-container');
  });

  it('renders staff board with 8 stickers (V26)', () => {
    const staffStickers = mockStickers.filter((s) => s.staffEligible);
    const html = renderToString(
      <StickerBoardSheet
        stickers={staffStickers}
        isStaff={true}
        unseenStickerIds={new Set()}
        onClose={vi.fn()}
      />
    );

    expect(html).toContain('획득 3 / 8');
  });

  it('computeUnseenStickers initializes without "new" on first device launch', () => {
    const earnedIds = ['first-step', 'att-10'];
    const result = computeUnseenStickers(earnedIds, null);

    // First launch -> unseenCount should be 0, nextSeen should be current earnedIds, shouldInitialize true
    expect(result.unseenIds.size).toBe(0);
    expect(result.nextSeen).toEqual(earnedIds);
    expect(result.shouldInitialize).toBe(true);
  });

  it('computeUnseenStickers detects new stickers for returning devices', () => {
    const previouslySeen = ['first-step'];
    const currentEarned = ['first-step', 'att-10']; // att-10 is newly earned

    const result = computeUnseenStickers(currentEarned, previouslySeen);

    expect(result.unseenIds.size).toBe(1);
    expect(result.unseenIds.has('att-10')).toBe(true);
    expect(result.unseenIds.has('first-step')).toBe(false);
    expect(result.shouldInitialize).toBe(false);
  });
});
