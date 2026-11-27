import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Schedule } from '../../types/rollbook';
import type { TodayCtaState } from '../../utils/todayCta';
import { activeCardIndex } from '../../utils/homeCarousel';
import { HomeActiveScheduleCard, type HomeCardComments } from './HomeActiveScheduleCard';

export interface HomeCardModel {
  schedule: Schedule;
  isToday: boolean;
  dDay?: number;
  isRequired: boolean;
  cta: TodayCtaState;
  checkedInCount?: number;
  checkedInTimeStr?: string;
  comments: HomeCardComments;
}

export interface HomeCardCarouselProps {
  cards: HomeCardModel[];
  onActiveDateChange?: (date: string | undefined) => void;
  onOpenQRScanner: (scheduleId: string) => void;
  onOpenRSVP: (schedule: Schedule) => void;
  onOpenDetail?: (schedule: Schedule) => void;
}

export const HomeCardCarousel: React.FC<HomeCardCarouselProps> = ({
  cards,
  onActiveDateChange,
  onOpenQRScanner,
  onOpenRSVP,
  onOpenDetail,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const hasInitializedRef = useRef(false);
  // 눌러도 되는 카드: 완전히 보이는 카드와 현재 카드. 일부만 보이는 카드는 첫 탭에 스크롤만 한다.
  const [interactive, setInteractive] = useState<ReadonlySet<number>>(() => new Set([0]));

  const measure = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const items = Array.from(track.children) as HTMLElement[];
    if (items.length === 0) return;
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    const idx = activeCardIndex(
      track.scrollLeft,
      items[0].offsetWidth,
      gap,
      items.length,
      track.scrollWidth - track.clientWidth
    );
    const next = new Set<number>([idx]);
    items.forEach((item, i) => {
      const left = item.offsetLeft - track.scrollLeft;
      if (left >= -1 && left + item.offsetWidth <= track.clientWidth + 1) next.add(i);
    });
    setActiveIndex(idx);
    setInteractive((prev) =>
      prev.size === next.size && [...next].every((i) => prev.has(i)) ? prev : next
    );
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure, cards.length]);

  useEffect(() => {
    if (cards.length === 0 || hasInitializedRef.current) return;
    const track = trackRef.current;
    if (!track) return;

    // 오늘 카드 우선, 없으면 첫 번째 미래 일정, 없으면 0번
    const todayIdx = cards.findIndex((c) => c.isToday);
    const fallbackIdx = cards.findIndex((c) => (c.dDay ?? 0) >= 0);
    const resolvedIdx = todayIdx >= 0 ? todayIdx : fallbackIdx >= 0 ? fallbackIdx : 0;

    if (resolvedIdx > 0) {
      const item = track.children[resolvedIdx] as HTMLElement | undefined;
      if (item) {
        track.scrollLeft = item.offsetLeft - (track.clientWidth - item.offsetWidth) / 2;
        measure();
      }
    }
    hasInitializedRef.current = true;
  }, [cards, measure]);

  const activeDate = cards[Math.min(activeIndex, cards.length - 1)]?.schedule.date;
  useEffect(() => {
    onActiveDateChange?.(activeDate);
  }, [activeDate, onActiveDateChange]);

  const scrollToCard = (index: number) => {
    const track = trackRef.current;
    const item = track?.children[index] as HTMLElement | undefined;
    if (!track || !item) return;
    track.scrollTo({
      left: item.offsetLeft - (track.clientWidth - item.offsetWidth) / 2,
      behavior: 'smooth',
    });
  };

  if (cards.length === 0) return null;

  return (
    <section className="home-card-section" aria-label="오늘과 다음 일정">
      <div className="home-card-track" ref={trackRef} onScroll={measure}>
        {cards.map((card, i) => (
          <div
            key={card.schedule.id}
            className={`home-card-slot${interactive.has(i) ? '' : ' is-peek'}`}
            onClick={interactive.has(i) ? undefined : () => scrollToCard(i)}
          >
            <div className="home-card-inner" inert={!interactive.has(i)}>
              <HomeActiveScheduleCard
                schedule={card.schedule}
                isToday={card.isToday}
                dDay={card.dDay}
                isRequired={card.isRequired}
                cta={card.cta}
                checkedInCount={card.checkedInCount}
                checkedInTimeStr={card.checkedInTimeStr}
                comments={card.comments}
                onOpenQRScanner={onOpenQRScanner}
                onOpenRSVP={onOpenRSVP}
                onOpenDetail={onOpenDetail}
              />
            </div>
          </div>
        ))}
      </div>
      {cards.length > 1 && (
        <div className="home-card-dots" aria-hidden="true">
          {cards.map((card, i) => (
            <span key={card.schedule.id} className={`home-card-dot${i === activeIndex ? ' is-on' : ''}`} />
          ))}
        </div>
      )}
    </section>
  );
};
