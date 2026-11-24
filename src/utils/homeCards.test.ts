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

describe('buildHomeCards (V3-22 R1)', () => {
  it('10:00 → 카드 A,B,C / 목록 D,E,F', () => {
    expect(run(BASE, '10:00')).toEqual({ cards: ['A', 'B', 'C'], upcoming: ['D', 'E', 'F'] });
  });
  it('16:59 → 같음', () => {
    expect(run(BASE, '16:59')).toEqual({ cards: ['A', 'B', 'C'], upcoming: ['D', 'E', 'F'] });
  });
  it('17:00은 종료 시각 포함으로 A가 남는다', () => {
    expect(run(BASE, '17:00')).toEqual({ cards: ['A', 'B', 'C'], upcoming: ['D', 'E', 'F'] });
  });
  it('17:01은 A가 마감돼 B,C,D', () => {
    expect(run(BASE, '17:01')).toEqual({ cards: ['B', 'C', 'D'], upcoming: ['E', 'F'] });
  });
  it('오늘 일정이 둘이면 A,A2,B', () => {
    const list = [...BASE, sch('A2', TODAY, '19:00', '21:00')];
    expect(run(list, '10:00')).toEqual({ cards: ['A', 'A2', 'B'], upcoming: ['C', 'D', 'E', 'F'] });
  });
  it('오늘 일정이 4개면 카드 3장, 4번째는 목록 맨 앞', () => {
    const list = [
      ...BASE,
      sch('A2', TODAY, '19:00', '21:00'),
      sch('A3', TODAY, '20:00', '21:00'),
      sch('A4', TODAY, '21:00', '22:00'),
    ];
    expect(run(list, '10:00')).toEqual({
      cards: ['A', 'A2', 'A3'],
      upcoming: ['A4', 'B', 'C', 'D', 'E'],
    });
  });
  it('종료 시각 없는 오늘 일정은 마감으로 취급해 카드·목록 모두 빠진다', () => {
    const list = [...BASE, sch('A2', TODAY, '19:00', '')];
    expect(run(list, '10:00')).toEqual({ cards: ['A', 'B', 'C'], upcoming: ['D', 'E', 'F'] });
  });
  it('취소 일정은 빠진다', () => {
    const list = BASE.map((s) => (s.id === 'C' ? { ...s, isCancelled: true } : s));
    expect(run(list, '10:00')).toEqual({ cards: ['A', 'B', 'D'], upcoming: ['E', 'F'] });
  });
  it('보관 일정은 빠진다', () => {
    const list = BASE.map((s) => (s.id === 'D' ? { ...s, isArchived: true } : s));
    expect(run(list, '10:00')).toEqual({ cards: ['A', 'B', 'C'], upcoming: ['E', 'F'] });
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
