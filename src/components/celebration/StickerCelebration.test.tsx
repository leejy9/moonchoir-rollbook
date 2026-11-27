import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EvaluatedSticker } from '../../utils/praiseStickerDefinitions';
import { STICKER_DEFINITIONS } from '../../utils/praiseStickerDefinitions';
import {
  nextCelebration,
  StickerCelebration,
  triggerCelebrationVibration,
} from './StickerCelebration';

function getSticker(id: string, earnedOn?: string): EvaluatedSticker {
  const def = STICKER_DEFINITIONS.find((s) => s.id === id)!;
  return { ...def, earned: true, earnedOn, progress: 1 };
}

describe('StickerCelebration (W5 R7)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('nextCelebration advances queue on NEXT and marks all on OPEN_BOARD', () => {
    const s1 = getSticker('first-step', '2026-11-20');
    const s2 = getSticker('att-10', '2026-11-25');

    const step1 = nextCelebration([s1, s2], 'NEXT');
    expect(step1).toEqual({ markIds: ['first-step'], remaining: [s2], openBoard: false });

    const step2 = nextCelebration([s1, s2], 'OPEN_BOARD');
    expect(step2).toEqual({
      markIds: ['first-step', 'att-10'],
      remaining: [],
      openBoard: true,
    });
  });

  it('does not vibrate when prefers-reduced-motion: reduce is active', () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: true }),
    });

    triggerCelebrationVibration();
    expect(vibrate).not.toHaveBeenCalled();

    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: false }),
    });
    triggerCelebrationVibration();
    expect(vibrate).toHaveBeenCalledWith([20, 40, 70]);
  });

  it('renders single celebration with order, chips, and 다음 스티커 when queue > 1', () => {
    const s1 = getSticker('first-step', '2026-11-20');
    const s2 = getSticker('att-10', '2026-11-25');
    const html = renderToString(
      <StickerCelebration
        mode="single"
        queue={[s1, s2]}
        alreadySeenCount={1}
        onAction={() => {}}
      />
    ).replace(/<!-- -->/g, '');

    expect(html).toContain('칭찬 스티커를 받았어요!');
    expect(html).toContain('2번째 칭찬 스티커예요');
    expect(html).toContain('다음 스티커');
    expect(html).toContain('꾸준함');
  });

  it('renders summary celebration with count', () => {
    const earned = STICKER_DEFINITIONS.slice(0, 7).map((d) => ({
      ...d,
      earned: true,
      earnedOn: '2026-11-20',
      progress: 1,
    }));
    const html = renderToString(
      <StickerCelebration
        mode="summary"
        queue={[]}
        alreadySeenCount={0}
        summaryStickers={earned}
        onAction={() => {}}
      />
    ).replace(/<!-- -->/g, '');

    expect(html).toContain('지금까지 칭찬 스티커 7개를 받았네요!');
    expect(html).toContain('좋아요!');
    expect(html).toContain('스티커판 보기');
  });
});
