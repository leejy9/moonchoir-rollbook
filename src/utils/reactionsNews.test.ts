import { describe, expect, it } from 'vitest';
import type { CommentReactionEvent, Member, RSVPVote, Schedule, ScheduleCommentEvent } from '../types/rollbook';
import { buildCommentReactions, REACTION_EMOJIS } from './commentReactions';
import { filterMentionCandidates, pruneMentions, splitMentionText } from './mentions';
import { buildNewsItems, formatRelativeKST, withObjectParticle } from './news';
import type { EvaluatedSticker } from './praiseStickerDefinitions';
import { STICKER_DEFINITIONS } from './praiseStickerDefinitions';
import { buildScheduleComments } from './scheduleComments';
import { isCommentUnread, mergeSeenRows, pickUnseenStickers } from './seenState';
import { parseServerTimeMs } from './serverTime';

function makeMember(id: string, name: string, part: Member['part'] = '알토', mergedIntoId?: string): Member {
  return {
    id,
    name,
    part,
    phoneLast4: '',
    role: 'MEMBER',
    status: mergedIntoId ? 'MERGED' : 'ACTIVE',
    createdAt: '2026-01-01T00:00:00+09:00',
    joinedAt: '2026-01-01',
    memberStatus: '정단원',
    note: '',
    ...(mergedIntoId ? { mergedIntoId } : {}),
  };
}

function makeSchedule(id: string, title: string, date: string, startTime: string, endTime: string, category: Schedule['category'] = '정기연습'): Schedule {
  return {
    id,
    title,
    date,
    startTime,
    endTime,
    locationName: '연습실',
    category,
  };
}

describe('parseServerTimeMs', () => {
  it('parses UTC ISO, realtime microsecond +00:00, space separator, and +00', () => {
    const expected = Date.parse('2026-11-27T02:30:00.123Z');
    expect(parseServerTimeMs('2026-11-27T02:30:00.123Z')).toBe(expected);
    expect(parseServerTimeMs('2026-11-27 02:30:00.123456+00:00')).toBe(expected);
    expect(parseServerTimeMs('2026-11-27 02:30:00.123+00')).toBe(expected);
    expect(Number.isNaN(parseServerTimeMs(''))).toBe(true);
    expect(Number.isNaN(parseServerTimeMs(undefined))).toBe(true);
    expect(Number.isNaN(parseServerTimeMs('2026-11-27 11:30:00'))).toBe(true);
  });
});

describe('buildCommentReactions (R2)', () => {
  const toCanon = (id: string) => (id === 'm1b' ? 'm1' : id);

  it('folds ADD/REMOVE, merges aliases, preserves emoji order, and supports multiple emojis per user', () => {
    const events: CommentReactionEvent[] = [
      { id: 'r1', commentId: 'c1', scheduleId: 'A', memberId: 'm2', emoji: '❤️', action: 'ADD', receivedAt: '2026-11-27T01:00:00.000Z' },
      { id: 'r2', commentId: 'c1', scheduleId: 'A', memberId: 'm3', emoji: '👍', action: 'ADD', receivedAt: '2026-11-27T01:05:00.000Z' },
      { id: 'r3', commentId: 'c1', scheduleId: 'A', memberId: 'm1b', emoji: '👏', action: 'ADD', receivedAt: '2026-11-27T01:10:00.000Z' },
      { id: 'r4', commentId: 'c1', scheduleId: 'A', memberId: 'm1', emoji: '👏', action: 'ADD', receivedAt: '2026-11-27T01:12:00.000Z' },
      { id: 'r5', commentId: 'c1', scheduleId: 'A', memberId: 'm1', emoji: '❤️', action: 'ADD', receivedAt: '2026-11-27T01:15:00.000Z' },
      { id: 'r6', commentId: 'c1', scheduleId: 'A', memberId: 'm3', emoji: '👍', action: 'REMOVE', receivedAt: '2026-11-27T01:20:00.000Z' },
    ];
    const map = buildCommentReactions(events, toCanon);
    const c1 = map.get('c1')!;
    expect(c1.get('👍')).toBeUndefined();
    expect(c1.get('❤️')!.memberAt.size).toBe(2);
    expect(c1.get('👏')!.memberAt.size).toBe(1);
    expect(c1.get('👏')!.memberAt.has('m1')).toBe(true);
    expect(REACTION_EMOJIS.indexOf('👍')).toBeLessThan(REACTION_EMOJIS.indexOf('❤️'));
  });
});

describe('Korean particles & relative KST time (R6)', () => {
  it('withObjectParticle', () => {
    expect(withObjectParticle('첫걸음')).toBe('첫걸음을');
    expect(withObjectParticle('열 번째 노래')).toBe('열 번째 노래를');
    expect(withObjectParticle('Day1')).toBe('Day1을(를)');
  });

  it('formatRelativeKST', () => {
    const now = Date.parse('2026-11-27T03:00:00.000Z'); // 12:00 KST
    expect(formatRelativeKST(now - 59_000, now)).toBe('방금');
    expect(formatRelativeKST(now - (59 * 60_000 + 59_000), now)).toBe('59분 전');
    // Same KST day 11 hours earlier (01:00 KST)
    expect(formatRelativeKST(now - 11 * 3_600_000, now)).toBe('11시간 전');
    // KST yesterday (25h ago -> 11/26 11:00 KST)
    expect(formatRelativeKST(now - 25 * 3_600_000, now)).toBe('어제');
    // Earlier date
    expect(formatRelativeKST(Date.parse('2026-11-20T00:00:00.000Z'), now)).toBe('11월 20일');
  });
});

describe('Mentions pure functions (R10)', () => {
  const members = [
    makeMember('m1', '이하은', '알토'),
    makeMember('m1b', '이하은_구', '알토', 'm1'),
    makeMember('m5', '이하', '소프라노'),
    makeMember('m2', '민지', '소프라노'),
  ];

  it('filterMentionCandidates excludes self, merged, deleted', () => {
    const res = filterMentionCandidates(members, '이하', 'm1');
    expect(res.map((m) => m.id)).toEqual(['m5']);
  });

  it('pruneMentions matches longest name first with boundary and preserves count', () => {
    expect(pruneMentions('@이하은 안녕', ['m5', 'm1'], members)).toEqual(['m1']);
    expect(pruneMentions('@민지 안녕', ['m2', 'm1'], members)).toEqual(['m2']);
  });

  it('splitMentionText highlights only mentioned current names', () => {
    const segs = splitMentionText('@이하은 @민지 안녕', ['m1'], members);
    expect(segs).toEqual([
      { text: '@이하은', isMention: true },
      { text: ' @민지 안녕', isMention: false },
    ]);
  });
});

describe('§5 End-to-End hand calculation', () => {
  const m1 = makeMember('m1', '이하은', '알토');
  const m1b = makeMember('m1b', '이하은_구', '알토', 'm1');
  const m2 = makeMember('m2', '민지', '소프라노');
  const m3 = makeMember('m3', '지은', '테너');
  const m4 = makeMember('m4', '도윤', '베이스');
  const members = [m1, m1b, m2, m3, m4];
  const aliasIds = new Set(['m1', 'm1b']);
  const toCanon = (id: string) => (id === 'm1b' ? 'm1' : id);

  const schA = makeSchedule('A', '추가연습', '2026-11-28', '14:00', '17:00', '추가연습');
  const schB = makeSchedule('B', '정기연습', '2026-12-01', '19:30', '21:40', '정기연습');

  const commentEvents: ScheduleCommentEvent[] = [
    { id: 'c1', scheduleId: 'A', memberId: 'm1', memberName: '이하은', part: '알토', action: 'CREATE', text: '화이팅!', timestamp: '2026-11-27 09:00:00', receivedAt: '2026-11-27T00:00:00.000Z' },
    { id: 'c2', scheduleId: 'A', memberId: 'm2', memberName: '민지', part: '소프라노', action: 'CREATE', text: '네!', timestamp: '2026-11-27 09:20:00', receivedAt: '2026-11-27T00:20:00.000Z' },
    { id: 'c3', scheduleId: 'A', memberId: 'm3', memberName: '지은', part: '테너', action: 'CREATE', text: '가즈아', timestamp: '2026-11-27 10:10:00', receivedAt: '2026-11-27T01:10:00.000Z' },
    { id: 'c4', scheduleId: 'A', memberId: 'm4', memberName: '도윤', part: '베이스', action: 'CREATE', text: '악보 챙겼어요', timestamp: '2026-11-27 11:40:00', receivedAt: '2026-11-27T02:40:00.000Z' },
  ];

  const reactionEvents: CommentReactionEvent[] = [
    { id: 'r1', commentId: 'c1', scheduleId: 'A', memberId: 'm2', emoji: '👏', action: 'ADD', receivedAt: '2026-11-27T01:00:00.000Z' },
    { id: 'r2', commentId: 'c1', scheduleId: 'A', memberId: 'm3', emoji: '👏', action: 'ADD', receivedAt: '2026-11-27T02:10:00.000Z' },
    { id: 'r3', commentId: 'c1', scheduleId: 'A', memberId: 'm3', emoji: '👏', action: 'REMOVE', receivedAt: '2026-11-27T02:20:00.000Z' },
    { id: 'r4', commentId: 'c1', scheduleId: 'A', memberId: 'm4', emoji: '❤️', action: 'ADD', receivedAt: '2026-11-27T02:50:00.000Z' },
    { id: 'r5', commentId: 'c2', scheduleId: 'A', memberId: 'm1b', emoji: '👍', action: 'ADD', receivedAt: '2026-11-27T02:55:00.000Z' },
  ];

  const seen = mergeSeenRows([
    { memberId: 'm1', kind: 'baseline', scope: '', seenAt: '2026-11-26T00:00:00.000Z' },
    { memberId: 'm1', kind: 'news', scope: '', seenAt: '2026-11-27T02:00:00.000Z' },
    { memberId: 'm1', kind: 'comments', scope: 'A', seenAt: '2026-11-27T00:30:00.000Z' },
    { memberId: 'm1', kind: 'vote', scope: 'A', seenAt: '2026-11-27T02:00:00.000Z' },
    { memberId: 'm1', kind: 'baseline', scope: 'stickers', seenAt: '2026-11-26T00:00:00.000Z' },
    { memberId: 'm1', kind: 'sticker', scope: 'first-step', seenAt: '2026-11-20T00:00:00.000Z' },
  ]);

  const evaluatedStickers: EvaluatedSticker[] = STICKER_DEFINITIONS.map((def) => {
    if (def.id === 'first-step') return { ...def, earned: true, earnedOn: '2026-11-20', progress: 1 };
    if (def.id === 'att-10') return { ...def, earned: true, earnedOn: '2026-11-27', progress: 1 };
    return { ...def, earned: false, progress: 0 };
  });

  const nowMs = Date.parse('2026-11-27T03:00:00.000Z'); // 12:00 KST
  const commentsA = buildScheduleComments(commentEvents, (a, b) => toCanon(a) === toCanon(b));
  const reactions = buildCommentReactions(reactionEvents, toCanon);

  it('matches §5 steps 1~4 exactly', () => {
    // 1. Chips
    expect(reactions.get('c1')!.get('👏')!.memberAt.size).toBe(1);
    expect(reactions.get('c1')!.get('❤️')!.memberAt.size).toBe(1);
    expect(reactions.get('c2')!.get('👍')!.memberAt.has('m1')).toBe(true);

    // 2. Unread comments on A: c3 & c4
    const unreadIds = commentsA
      .filter((c) => isCommentUnread(c, seen, toCanon(c.memberId) === 'm1'))
      .map((c) => c.id);
    expect(unreadIds).toEqual(['c3', 'c4']);

    // 3. News items
    const votes: RSVPVote[] = [];
    const { unread, read } = buildNewsItems({
      currentMember: m1,
      aliasIds,
      canonicalId: 'm1',
      members,
      schedules: [schA, schB],
      getComments: (sid) => (sid === 'A' ? commentsA : []),
      reactions,
      rsvpVotes: votes,
      evaluatedStickers,
      seen,
      nowMs,
      windowDays: 14,
    });

    expect(unread).toHaveLength(3);
    expect(unread.map((u) => u.kind)).toEqual(['reaction', 'comment', 'sticker']);
    expect(unread[0].title).toBe('도윤 님 외 1명이 내 댓글에 반응했어요');
    expect(unread[1].title).toBe('추가연습(11월 28일 토)에 새 댓글 1개');
    expect(unread[2].title).toBe('칭찬 스티커 열 번째 노래를 받았어요');

    expect(read.some((r) => r.key === 'unvoted:A')).toBe(true);
    expect(read.some((r) => r.key === 'sticker:first-step')).toBe(true);

    // 4. Celebration queue -> att-10 only, then after marking att-10 seen -> unread drops to 2
    const unseen = pickUnseenStickers(evaluatedStickers, seen);
    expect(unseen.map((s) => s.id)).toEqual(['att-10']);

    const seenAfterLike = mergeSeenRows([
      { memberId: 'm1', kind: 'baseline', scope: '', seenAt: '2026-11-26T00:00:00.000Z' },
      { memberId: 'm1', kind: 'news', scope: '', seenAt: '2026-11-27T02:00:00.000Z' },
      { memberId: 'm1', kind: 'comments', scope: 'A', seenAt: '2026-11-27T00:30:00.000Z' },
      { memberId: 'm1', kind: 'vote', scope: 'A', seenAt: '2026-11-27T02:00:00.000Z' },
      { memberId: 'm1', kind: 'baseline', scope: 'stickers', seenAt: '2026-11-26T00:00:00.000Z' },
      { memberId: 'm1', kind: 'sticker', scope: 'first-step', seenAt: '2026-11-20T00:00:00.000Z' },
      { memberId: 'm1', kind: 'sticker', scope: 'att-10', seenAt: '2026-11-27T03:00:00.000Z' },
    ]);
    const afterNews = buildNewsItems({
      currentMember: m1,
      aliasIds,
      canonicalId: 'm1',
      members,
      schedules: [schA, schB],
      getComments: (sid) => (sid === 'A' ? commentsA : []),
      reactions,
      rsvpVotes: votes,
      evaluatedStickers,
      seen: seenAfterLike,
      nowMs,
      windowDays: 14,
    });
    expect(afterNews.unread).toHaveLength(2);
  });
});
