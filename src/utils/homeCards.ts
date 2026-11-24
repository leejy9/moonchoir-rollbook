import type { RSVPVote, Schedule } from '../types/rollbook';
import { getCheckInWindowState } from './timeWindow';
import type { TodayFocusResult } from './todayFocus';

export interface BuildHomeCardsInput {
  focusResult: TodayFocusResult;
  schedules: Schedule[];
  now: Date;
  todayStr: string;
  maxPast?: number;
  maxUpcomingCards?: number;
  maxUpcoming?: number;
  /** @deprecated 하위 호환용 */
  maxCards?: number;
}

export interface HomeCardsResult {
  cards: Schedule[];
  upcoming: Schedule[];
}

const byDateThenStart = (a: Schedule, b: Schedule) =>
  a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime);

/**
 * 홈 카드 묶음과 "다가오는 일정" 목록을 한 번에 계산한다 (V3-22 R1).
 * 직전 1개 일정, 오늘(집중) 일정, 다가오는 일정 3개를 카드로 구성한다.
 * 카드에 나온 일정은 하단 목록에 다시 나오지 않는다.
 */
export function buildHomeCards({
  focusResult,
  schedules,
  now,
  todayStr,
  maxPast = 1,
  maxUpcomingCards = 3,
  maxUpcoming = 5,
}: BuildHomeCardsInput): HomeCardsResult {
  if (focusResult.mode === 'NONE' || focusResult.schedules.length === 0) {
    return { cards: [], upcoming: [] };
  }

  const valid = schedules.filter((s) => !s.isCancelled && !s.isArchived);
  const group = focusResult.schedules;
  const groupDate = group[0].date;
  const groupIds = new Set(group.map((s) => s.id));

  const earlier = valid
    .filter((s) => s.date < groupDate && !groupIds.has(s.id))
    .sort(byDateThenStart);
  const pastCards = maxPast > 0 ? earlier.slice(-maxPast) : [];

  const later = valid
    .filter((s) => s.date > groupDate && !groupIds.has(s.id))
    .sort(byDateThenStart);
  const upcomingCards = later.slice(0, maxUpcomingCards);

  const cards = [...pastCards, ...group, ...upcomingCards];
  const cardIds = new Set(cards.map((s) => s.id));

  const upcoming = valid
    .filter((s) => {
      if (cardIds.has(s.id)) return false;
      if (s.date < todayStr) return false;
      if (s.date === todayStr && getCheckInWindowState(s, now).status === 'WINDOW_CLOSED') {
        return false;
      }
      return true;
    })
    .sort(byDateThenStart)
    .slice(0, maxUpcoming);

  return { cards, upcoming };
}

export interface UpcomingStatusLabel {
  text: string;
  tone: 'success' | 'muted';
}

/** 다가오는 일정 줄 오른쪽 상태 글자 (V3-22 R5). 없으면 `undefined`. */
export function upcomingStatusLabel(
  myVote: Pick<RSVPVote, 'status'> | undefined,
  rsvpOpen: boolean
): UpcomingStatusLabel | undefined {
  if (myVote) {
    return myVote.status === 'ATTEND'
      ? { text: '참석', tone: 'success' }
      : { text: '불참', tone: 'muted' };
  }
  return rsvpOpen ? { text: '투표 전', tone: 'muted' } : undefined;
}
