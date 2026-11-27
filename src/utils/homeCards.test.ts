import { describe, expect, it } from 'vitest';
import type { Schedule } from '../types/rollbook';
import { buildHomeCards, upcomingStatusLabel } from './homeCards';
import { selectTodayFocus } from './todayFocus';

const TODAY = '2026-11-21';

const sch = (id: string, date: string, startTime: string, endTime: string, extra: Partial<Schedule> = {}): Schedule => ({
  id,
  title: id,
  date,
  startTime,
  endTime,
  locationName: '연습실',
  category: '정기연습',
  ...extra,
});

const BASE: Schedule[] = [
  sch('A', '2026-11-21', '14:00', '17:00'),
  sch('B', '2026-11-24', '19:30', '21:40'),
  sch('C', '2026-11-28', '14:00', '17:00'),
  sch('D', '2026-12-01', '19:30', '21:40'),
  sch('E', '2026-12-05', '13:00', '18:00'),
  sch('F', '2026-12-08', '19:30', '21:40'),
];

function run(schedules: Schedule[], at: string) {
  const now = new Date(`2026-11-21T${at}:00+09:00`);
  const focusResult = selectTodayFocus({ schedules, member: undefined, now, todayStr: TODAY });
  const r = buildHomeCards({ focusResult, schedules, now, todayStr: TODAY });
  return { cards: r.cards.map((s) => s.id), upcoming: r.upcoming.map((s) => s.id) };
}

describe('buildHomeCards (V3-22 R1 개정: 직전 1개 + 오늘 + 다가오는 3개)', () => {
  it('10:00 → 카드 A,B,C,D / 목록 E,F', () => {
    expect(run(BASE, '10:00')).toEqual({ cards: ['A', 'B', 'C', 'D'], upcoming: ['E', 'F'] });
  });
  it('16:59 → 같음', () => {
    expect(run(BASE, '16:59')).toEqual({ cards: ['A', 'B', 'C', 'D'], upcoming: ['E', 'F'] });
  });
  it('17:00은 종료 시각 포함으로 A가 남는다', () => {
    expect(run(BASE, '17:00')).toEqual({ cards: ['A', 'B', 'C', 'D'], upcoming: ['E', 'F'] });
  });
  it('17:01은 A가 마감돼 직전 A + 포커스 B + 다가오는 C,D,E', () => {
    expect(run(BASE, '17:01')).toEqual({ cards: ['A', 'B', 'C', 'D', 'E'], upcoming: ['F'] });
  });
  it('직전 과거 일정 Z가 있으면 카드 맨 앞에 포함된다', () => {
    const list = [sch('Z', '2026-11-18', '19:00', '21:00'), ...BASE];
    expect(run(list, '10:00')).toEqual({ cards: ['Z', 'A', 'B', 'C', 'D'], upcoming: ['E', 'F'] });
  });
  it('과거 일정이 2개 이상이면 가장 최근 1개만 포함된다', () => {
    const list = [
      sch('Y', '2026-11-15', '14:00', '17:00'),
      sch('Z', '2026-11-18', '19:00', '21:00'),
      ...BASE,
    ];
    expect(run(list, '10:00')).toEqual({ cards: ['Z', 'A', 'B', 'C', 'D'], upcoming: ['E', 'F'] });
  });
  it('오늘 일정이 둘이면 A,A2 + 다가오는 3개 B,C,D', () => {
    const list = [...BASE, sch('A2', TODAY, '19:00', '21:00')];
    expect(run(list, '10:00')).toEqual({ cards: ['A', 'A2', 'B', 'C', 'D'], upcoming: ['E', 'F'] });
  });
  it('종료 시각 없는 오늘 일정은 마감으로 취급해 카드·목록 모두 빠진다', () => {
    const list = [...BASE, sch('A2', TODAY, '19:00', '')];
    expect(run(list, '10:00')).toEqual({ cards: ['A', 'B', 'C', 'D'], upcoming: ['E', 'F'] });
  });
  it('취소 일정은 빠진다', () => {
    const list = BASE.map((s) => (s.id === 'C' ? { ...s, isCancelled: true } : s));
    expect(run(list, '10:00')).toEqual({ cards: ['A', 'B', 'D', 'E'], upcoming: ['F'] });
  });
  it('보관 일정은 빠진다', () => {
    const list = BASE.map((s) => (s.id === 'D' ? { ...s, isArchived: true } : s));
    expect(run(list, '10:00')).toEqual({ cards: ['A', 'B', 'C', 'E'], upcoming: ['F'] });
  });
  it('23:00에 B만 있으면 카드 B, 목록 없음', () => {
    expect(run([BASE[1]], '23:00')).toEqual({ cards: ['B'], upcoming: [] });
  });
  it('일정이 없으면 둘 다 비어 있다', () => {
    expect(run([], '10:00')).toEqual({ cards: [], upcoming: [] });
  });
  it('17:01에 A만 있으면 둘 다 비어 있다', () => {
    expect(run([BASE[0]], '17:01')).toEqual({ cards: [], upcoming: [] });
  });
  it('카드에 나온 일정은 목록에 다시 나오지 않는다', () => {
    for (const at of ['10:00', '17:00', '17:01']) {
      const r = run(BASE, at);
      expect(r.upcoming.filter((id) => r.cards.includes(id))).toEqual([]);
    }
  });
});

describe('upcomingStatusLabel (V3-22 R5)', () => {
  it('참석', () => expect(upcomingStatusLabel({ status: 'ATTEND' }, false)).toEqual({ text: '참석', tone: 'success' }));
  it('불참', () => expect(upcomingStatusLabel({ status: 'ABSENT' }, false)).toEqual({ text: '불참', tone: 'muted' }));
  it('투표 없음 + 투표 가능 → 투표 전', () =>
    expect(upcomingStatusLabel(undefined, true)).toEqual({ text: '투표 전', tone: 'muted' }));
  it('투표 없음 + 투표 마감 → 없음', () => expect(upcomingStatusLabel(undefined, false)).toBeUndefined());
});
