import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import type { EvaluatedSticker } from '../../utils/praiseStickers';
import { ProfileStickersPreviewCard } from './ProfileStickersPreviewCard';

function makeSticker(
  id: string,
  name: string,
  earned: boolean,
  earnedOn?: string
): EvaluatedSticker {
  return {
    id,
    name,
    bundle: 'stage',
    bundleTitle: '무대',
    frame: 'circle',
    conditionDescription: '',
    celebrationText: '',
    image: 'check_mark_button',
    staffEligible: true,
    earned,
    earnedOn,
    progress: earned ? 100 : 0,
  };
}

describe('ProfileStickersPreviewCard', () => {
  it('shows the 3 most recently earned stickers and the next locked sticker only', () => {
    const stickers = [
      makeSticker('oldest', '오래된 획득', true, '2026-01-01'),
      makeSticker('next-locked', '다음 잠김', false),
      makeSticker('recent-2', '최근 획득 2', true, '2026-05-01'),
      makeSticker('later-locked', '그다음 잠김', false),
      makeSticker('recent-3', '최근 획득 3', true, '2026-06-01'),
      makeSticker('recent-1', '최근 획득 1', true, '2026-07-01'),
    ];

    const html = renderToString(
      <ProfileStickersPreviewCard
        stickers={stickers}
        isStaff={false}
        unseenCount={0}
        onOpen={vi.fn()}
      />
    );

    expect(html.match(/class="profile-sticker-mini /g)).toHaveLength(4);
    expect(html).toContain('최근 획득 1');
    expect(html).toContain('최근 획득 2');
    expect(html).toContain('최근 획득 3');
    expect(html).toContain('다음 잠김');
    expect(html).not.toContain('오래된 획득');
    expect(html).not.toContain('그다음 잠김');
  });

  it('uses a native button as the keyboard-operable opener', () => {
    const html = renderToString(
      <ProfileStickersPreviewCard
        stickers={[]}
        isStaff={false}
        unseenCount={0}
        onOpen={vi.fn()}
      />
    );

    expect(html).toMatch(/^<button type="button" class="profile-stickers-card"/);
    expect(html).not.toContain('role="button"');
  });
});
