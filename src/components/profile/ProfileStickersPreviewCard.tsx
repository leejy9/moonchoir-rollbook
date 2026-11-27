import React from 'react';
import { stickerImageUrl, type EvaluatedSticker } from '../../utils/praiseStickers';

export interface ProfileStickersPreviewCardProps {
  stickers: EvaluatedSticker[];
  isStaff: boolean;
  unseenCount: number;
  onOpen: (trigger: HTMLButtonElement) => void;
}

const TIER_BORDER_COLOR: Record<string, string> = {
  bronze: 'var(--sticker-bronze)',
  silver: 'var(--sticker-silver)',
  gold: 'var(--sticker-gold)',
};

export const ProfileStickersPreviewCard: React.FC<ProfileStickersPreviewCardProps> = ({
  stickers,
  isStaff,
  unseenCount,
  onOpen,
}) => {
  const earnedCount = stickers.filter((s) => s.earned).length;
  const totalCount = isStaff ? 8 : 24;
  const countText = `${earnedCount} / ${totalCount}`;

  const recentEarned = stickers
    .filter((sticker) => sticker.earned)
    .sort((a, b) => (b.earnedOn || '').localeCompare(a.earnedOn || ''))
    .slice(0, 3);
  const nextLocked = stickers.find((sticker) => !sticker.earned);
  const previewList = nextLocked ? [...recentEarned, nextLocked] : recentEarned;

  return (
    <button
      type="button"
      className="profile-stickers-card"
      onClick={(event) => onOpen(event.currentTarget)}
      aria-label="칭찬 스티커 보기"
    >
      <div className="profile-stickers-header">
        <div className="profile-stickers-title-row">
          <span className="profile-stickers-title">칭찬 스티커</span>
          {unseenCount > 0 && (
            <span className="profile-stickers-new-pill">신규 {unseenCount}</span>
          )}
        </div>
        <div className="profile-stickers-right">
          <span>{`획득 ${countText}`}</span>
          <span style={{ fontSize: '16px' }}>›</span>
        </div>
      </div>

      <div className="profile-stickers-preview-row">
        {previewList.map((sticker) => {
          const tierBorder =
            sticker.earned && sticker.tier
              ? TIER_BORDER_COLOR[sticker.tier] || 'transparent'
              : 'transparent';

          return (
            <div
              key={sticker.id}
              className={`profile-sticker-mini ${sticker.earned ? 'earned' : 'locked'}`}
            >
              <div
                className="profile-sticker-mini-frame"
                style={{
                  border: sticker.earned && sticker.tier ? `2px solid ${tierBorder}` : undefined,
                  background:
                    sticker.bundle === 'stage'
                      ? 'var(--sticker-stage-tint)'
                      : sticker.bundle === 'punctuality'
                        ? 'var(--brand-apricot-tint)'
                        : sticker.bundle === 'promise'
                          ? 'var(--status-info-light)'
                          : 'var(--brand-lavender-tint)',
                }}
              >
                <img
                  src={stickerImageUrl(sticker.image)}
                  alt={sticker.name}
                  className="profile-sticker-mini-img"
                  loading="lazy"
                />
              </div>
              <span className="profile-sticker-mini-name">{sticker.name}</span>
            </div>
          );
        })}
      </div>
    </button>
  );
};
