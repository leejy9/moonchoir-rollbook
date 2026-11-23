import React, { useCallback, useEffect, useMemo, useRef } from 'react';
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

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

  useEffect(() => {
    previousActiveElementRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    return () => previousActiveElementRef.current?.focus();
  }, []);

  const handleDialogKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== 'Tab' || !dialogRef.current) return;

    const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current.focus();
      return;
    }

    const firstElement = focusable[0];
    const lastElement = focusable[focusable.length - 1];
    const activeElement = document.activeElement;
    const focusOutside = !dialogRef.current.contains(activeElement);

    if (event.shiftKey && (activeElement === firstElement || focusOutside)) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && (activeElement === lastElement || focusOutside)) {
      event.preventDefault();
      firstElement.focus();
    }
  }, [onClose]);

  return (
    <div
      className="sticker-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sticker-modal-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="sticker-modal-container"
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
      >
        {/* Header */}
        <div className="sticker-modal-header">
          <h2 id="sticker-modal-title" className="profile-sheet-title">칭찬 스티커</h2>
          <div className="sticker-sheet-header-pill">
            {`획득 ${earnedCount} / ${totalCount}`}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="sticker-modal-close-btn"
            onClick={onClose}
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="sticker-modal-content sticker-board-scroll">
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
