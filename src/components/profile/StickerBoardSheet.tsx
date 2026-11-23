import React, { useMemo } from 'react';
import type { EvaluatedSticker, StickerBundle } from '../../utils/praiseStickers';

export interface StickerBoardSheetProps {
  stickers: EvaluatedSticker[];
  isStaff: boolean;
  unseenStickerIds: Set<string>;
  onClose: () => void;
}

const BUNDLE_ORDER: { bundle: StickerBundle; title: string }[] = [
  { bundle: 'perseverance', title: '꾸준함' },
  { bundle: 'punctuality', title: '시간 약속' },
  { bundle: 'promise', title: '약속' },
  { bundle: 'studio', title: '연습실' },
  { bundle: 'stage', title: '무대' },
];

export const StickerBoardSheet: React.FC<StickerBoardSheetProps> = ({
  stickers,
  isStaff: _isStaff,
  unseenStickerIds,
  onClose,
}) => {
  const earnedCount = useMemo(() => stickers.filter((s) => s.earned).length, [stickers]);
  const totalCount = stickers.length; // 24 for member, 8 for staff

  // Group stickers by bundle in order
  const groupedStickers = useMemo(() => {
    const map = new Map<StickerBundle, EvaluatedSticker[]>();
    for (const s of stickers) {
      const list = map.get(s.bundle) || [];
      list.push(s);
      map.set(s.bundle, list);
    }
    return BUNDLE_ORDER.map(({ bundle, title }) => ({
      bundle,
      title,
      items: map.get(bundle) || [],
    })).filter((g) => g.items.length > 0);
  }, [stickers]);

  return (
    <div
      className="profile-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="칭찬 스티커 보드"
      onClick={onClose}
    >
      <div
        className="profile-sheet-container sticker-sheet-container"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="profile-sheet-header">
          <button
            type="button"
            className="profile-sheet-back-btn"
            onClick={onClose}
            aria-label="닫기"
          >
            ‹
          </button>
          <h2 className="profile-sheet-title">칭찬 스티커</h2>
          <div className="sticker-sheet-header-pill">
            {`획득 ${earnedCount} / ${totalCount}`}
          </div>
        </div>

        {/* Content */}
        <div className="profile-sheet-content sticker-board-scroll">
          {groupedStickers.map((group) => (
            <section key={group.bundle} className="sticker-bundle-section">
              <div className="sticker-bundle-header">
                <h3 className="sticker-bundle-title">{group.title}</h3>
                <span className="sticker-bundle-count">
                  {`${group.items.filter((i) => i.earned).length} / ${group.items.length}`}
                </span>
              </div>

              <div className="sticker-bundle-grid">
                {group.items.map((sticker) => {
                  const isNew = unseenStickerIds.has(sticker.id);
                  const tierClass = sticker.tier ? `tier-${sticker.tier}` : '';
                  const shapeClass = `shape-${sticker.frame}`;
                  const bundleClass = `bundle-${sticker.bundle}`;

                  return (
                    <div
                      key={sticker.id}
                      className={`sticker-card ${sticker.earned ? 'earned' : 'locked'}`}
                    >
                      <div className="sticker-frame-wrapper">
                        <div
                          className={`sticker-frame ${shapeClass} ${bundleClass} ${tierClass}`}
                        >
                          <img
                            src={`/stickers/${sticker.image}.png`}
                            alt={sticker.name}
                            className="sticker-image"
                            loading="lazy"
                          />
                        </div>
                        {isNew && <span className="sticker-new-badge">신규</span>}
                      </div>

                      <div className="sticker-info">
                        <span className="sticker-name">{sticker.name}</span>
                        <span className="sticker-date-or-cond">
                          {sticker.earned
                            ? sticker.earnedOn
                              ? `${sticker.earnedOn} 획득`
                              : '획득 완료'
                            : sticker.conditionDescription}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
};
