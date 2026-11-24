import { describe, expect, it } from 'vitest';
import type { ScheduleCommentEvent } from '../types/rollbook';
import { buildHomeCards } from './homeCards';
import { findMyVote } from './myVote';
import { buildScheduleComments } from './scheduleComments';
import { mergeSeenIds, pickNewCommentIds, resolveSeen } from './seenComments';
import { selectTodayFocus } from './todayFocus';
import type { Schedule } from '../types/rollbook';

const ALL = ['c1', 'c2', 'c3'];

describe('resolveSeen (V3-22 R7)', () => {
  it('missing + 준비 안 됨: 표시도 저장도 없음', () =>
    expect(resolveSeen({ kind: 'missing' }, false, ALL)).toEqual({ seen: null, baselineToWrite: null }));
  it('missing + 준비됨: 전부 기준값으로 저장, 새 댓글 0', () => {
    const r = resolveSeen({ kind: 'missing' }, true, ALL);
    expect(r.baselineToWrite).toEqual(ALL);
    expect(pickNewCommentIds([{ id: 'c1', memberId: 'x' }], r.seen, () => false)).toEqual([]);
  });
  it('invalid: 표시 없음, 덮어쓰지 않음(준비돼도)', () =>
    expect(resolveSeen({ kind: 'invalid' }, true, ALL)).toEqual({ seen: null, baselineToWrite: null }));
  it('ok + 준비 안 됨(백엔드 없는 모드): 저장값 기준으로 정상 표시', () => {
    const r = resolveSeen({ kind: 'ok', value: ['c1'] }, false, ALL);
    expect(r.baselineToWrite).toBeNull();
    expect(pickNewCommentIds([{ id: 'c2', memberId: 'x' }], r.seen, () => false)).toEqual(['c2']);
  });
});

describe('pickNewCommentIds', () => {
  const seen = new Set(['c1']);
  it('남의 새 댓글은 새 댓글', () =>
    expect(pickNewCommentIds([{ id: 'c2', memberId: 'o' }], seen, () => false)).toEqual(['c2']));
  it('내(별칭 포함) 댓글은 아니다', () =>
    expect(pickNewCommentIds([{ id: 'c3', memberId: 'm1b' }], seen, (id) => id === 'm1b')).toEqual([]));
  it('수정된 댓글은 id가 같아 새 댓글이 아니다', () =>
    expect(pickNewCommentIds([{ id: 'c1', memberId: 'o' }], seen, () => false)).toEqual([]));
});

describe('mergeSeenIds', () => {
  it('중복 없이 더한다', () => expect(mergeSeenIds(['c1'], ['c1', 'c2', 'c3'])).toEqual(['c1', 'c2', 'c3']));
});

describe('끝에서 끝까지 손계산 (지시서 §4)', () => {
  const sch = (id: string, date: string, s: string, e: string): Schedule => ({
    id, title: id, date, startTime: s, endTime: e, locationName: '연습실', category: '정기연습',
  });
  const schedules = [
    sch('A', '2026-11-21', '14:00', '17:00'),
    sch('B', '2026-11-24', '19:30', '21:40'),
    sch('C', '2026-11-28', '14:00', '17:00'),
    sch('D', '2026-12-01', '19:30', '21:40'),
    sch('E', '2026-12-05', '13:00', '18:00'),
    sch('F', '2026-12-08', '19:30', '21:40'),
  ];
  const ev = (
    id: string, scheduleId: string, memberId: string, name: string, part: string,
    action: 'CREATE' | 'DELETE', targetId?: string
  ): ScheduleCommentEvent => ({
    id, scheduleId, memberId, memberName: name, part: part as ScheduleCommentEvent['part'],
    action, targetId, text: action === 'CREATE' ? '글' : undefined, timestamp: '2026-11-20 10:00:00',
  });
  const events: ScheduleCommentEvent[] = [
    ev('c1', 'A', 'o1', '민지', '알토', 'CREATE'),
    ev('c2', 'A', 'o2', '지은', '소프라노', 'CREATE'),
    ev('c3', 'A', 'm1', '나', '알토', 'CREATE'),
    ...['c4', 'c5', 'c6', 'c7', 'c8'].map((id) => ev(id, 'C', 'o3', '도윤', '테너', 'CREATE')),
    ev('d1', 'C', 'o3', '도윤', '테너', 'DELETE', 'c5'),
  ];
  const alias = new Set(['m1', 'm1b']);
  const isOwn = (id: string) => alias.has(id);
  const commentsOf = (id: string) => buildScheduleComments(events.filter((e) => e.scheduleId === id));

  const now = new Date('2026-11-21T10:00:00+09:00');
  const focusResult = selectTodayFocus({ schedules, member: undefined, now, todayStr: '2026-11-21' });
  const { cards, upcoming } = buildHomeCards({ focusResult, schedules, now, todayStr: '2026-11-21' });

  it('1. 카드 [A,B,C,D], 목록 [E,F]', () => {
    expect(cards.map((s) => s.id)).toEqual(['A', 'B', 'C', 'D']);
    expect(upcoming.map((s) => s.id)).toEqual(['E', 'F']);
  });
  it('2. A 댓글 3, 최근은 본인 c3, 새 댓글은 c2', () => {
    const a = commentsOf('A');
    expect(a.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
    expect(isOwn(a[a.length - 1].memberId)).toBe(true);
    expect(pickNewCommentIds(a, new Set(['c1']), isOwn)).toEqual(['c2']);
  });
  it('3. C 댓글 수 4(c5 삭제)', () => expect(commentsOf('C')).toHaveLength(4));
  it('4. E 상태는 별칭 투표로 참석', () => {
    const votes = [{ id: 'v', scheduleId: 'E', memberId: 'm1b', memberName: '나', part: '알토' as const, status: 'ATTEND' as const, timestamp: 't' }];
    expect(findMyVote(votes, alias)?.status).toBe('ATTEND');
  });
  it('5. A를 보고 닫으면 저장값 [c1,c2,c3]가 되어 점이 사라진다', () => {
    const merged = mergeSeenIds(['c1'], commentsOf('A').map((c) => c.id));
    expect(merged).toEqual(['c1', 'c2', 'c3']);
    expect(pickNewCommentIds(commentsOf('A'), new Set(merged), isOwn)).toEqual([]);
  });
});
