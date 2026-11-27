import React, { useEffect, useRef, useState } from 'react';
import type { EvaluatedSticker, StickerTier } from '../../utils/praiseStickerDefinitions';
import { stickerImageUrl } from '../../utils/praiseStickers';
import '../../styles/v3/celebration.css';

export type CelebrationAction = 'NEXT' | 'OPEN_BOARD';

export interface CelebrationTransition {
  markIds: string[];
  remaining: EvaluatedSticker[];
  openBoard: boolean;
}

/**
 * 축하 대기열의 다음 상태를 계산하는 순수 함수.
 */
export function nextCelebration(
  queue: EvaluatedSticker[],
  action: CelebrationAction
): CelebrationTransition {
  if (queue.length === 0) {
    return { markIds: [], remaining: [], openBoard: action === 'OPEN_BOARD' };
  }
  if (action === 'OPEN_BOARD') {
    return {
      markIds: queue.map((s) => s.id),
      remaining: [],
      openBoard: true,
    };
  }
  return {
    markIds: [queue[0].id],
    remaining: queue.slice(1),
    openBoard: false,
  };
}

const TIER_LABEL: Record<StickerTier, string> = {
  bronze: '동메달',
  silver: '은메달',
  gold: '금메달',
};

const CONFETTI_PIECES = Array.from({ length: 40 }, (_, i) => ({
  id: i,
  colorClass: `c${(i % 5) + 1}`,
  dirClass: `d${i % 8}`,
}));

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function triggerCelebrationVibration(): void {
  if (prefersReducedMotion()) return;
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate([20, 40, 70]);
    } catch {
      // Ignore unsupported environments (e.g., iOS PWA)
    }
  }
}

interface StickerCelebrationProps {
  mode: 'single' | 'summary';
  queue: EvaluatedSticker[];
  alreadySeenCount: number;
  summaryStickers?: EvaluatedSticker[];
  onAction: (action: CelebrationAction) => void;
}

export const StickerCelebration: React.FC<StickerCelebrationProps> = ({
  mode,
  queue,
  alreadySeenCount,
  summaryStickers = [],
  onAction,
}) => {
  const primaryBtnRef = useRef<HTMLButtonElement>(null);
  const [rebounceTick, setRebounceTick] = useState(0);

  const currentSticker = queue[0];
  const activeKey = mode === 'summary' ? 'summary' : currentSticker?.id ?? 'none';

  useEffect(() => {
    primaryBtnRef.current?.focus();
    const timer = setTimeout(() => {
      triggerCelebrationVibration();
    }, 450);
    return () => clearTimeout(timer);
  }, [activeKey]);

  if (mode === 'single' && !currentSticker) return null;

  const isSummary = mode === 'summary';
  const totalCount = queue.length;
  const hasMore = !isSummary && totalCount > 1;
  const primaryLabel = hasMore ? '다음 스티커' : '좋아요!';

  const recentThree = isSummary
    ? [...summaryStickers]
        .sort((a, b) => (b.earnedOn ?? '').localeCompare(a.earnedOn ?? ''))
        .slice(0, 3)
    : [];

  return (
    <div
      className="scel-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="칭찬 스티커를 받았어요"
    >
      <div className="scel-card">
        <div className="scel-confetti-layer" aria-hidden="true">
          {CONFETTI_PIECES.map((piece) => (
            <span key={piece.id} className={`scel-confetti ${piece.colorClass} ${piece.dirClass}`} />
          ))}
        </div>

        <div className="scel-stage">
          <div className="scel-glow" aria-hidden="true" />
          <div className="scel-ring" aria-hidden="true" />
          {isSummary ? (
            <div className="scel-summary-stack">
              {recentThree.map((s, idx) => (
                <img
                  key={s.id}
                  src={stickerImageUrl(s.image)}
                  alt={s.name}
                  className={`scel-summary-img ${idx === 1 || recentThree.length === 1 ? 'center' : ''}`}
                />
              ))}
            </div>
          ) : (
            <button
              type="button"
              key={`${currentSticker.id}-${rebounceTick}`}
              className={`scel-sticker-btn ${rebounceTick > 0 ? 'rebounce' : ''}`}
              aria-label={currentSticker.name}
              onClick={() => setRebounceTick((t) => t + 1)}
            >
              <img
                src={stickerImageUrl(currentSticker.image)}
                alt={currentSticker.name}
                className="scel-sticker-img"
              />
            </button>
          )}
        </div>

        {isSummary ? (
          <>
            <h2 className="scel-title">지금까지 칭찬 스티커 {summaryStickers.length}개를 받았네요!</h2>
            <p className="scel-desc">앞으로 새 스티커를 받으면 바로 축하해 드릴게요</p>
          </>
        ) : (
          <>
            <p className="scel-kicker">칭찬 스티커를 받았어요!</p>
            <h2 className="scel-title">{currentSticker.name}</h2>
            <p className="scel-desc">{currentSticker.celebrationText}</p>
            <div className="scel-chips">
              {currentSticker.tier && (
                <span className={`scel-chip tier-${currentSticker.tier}`}>
                  {TIER_LABEL[currentSticker.tier]}
                </span>
              )}
              <span className="scel-chip">{currentSticker.bundleTitle}</span>
            </div>
            <p className="scel-order">{alreadySeenCount + 1}번째 칭찬 스티커예요</p>
            {totalCount > 1 && (
              <div className="scel-dots" aria-hidden="true">
                {queue.map((s, idx) => (
                  <span key={s.id} className={`scel-dot ${idx === 0 ? 'active' : ''}`} />
                ))}
              </div>
            )}
          </>
        )}

        <div className="scel-actions">
          <button
            ref={primaryBtnRef}
            type="button"
            className="scel-btn-primary"
            onClick={() => onAction('NEXT')}
          >
            {primaryLabel}
          </button>
          <button
            type="button"
            className="scel-btn-secondary"
            onClick={() => onAction('OPEN_BOARD')}
          >
            스티커판 보기
          </button>
        </div>
      </div>
    </div>
  );
};
