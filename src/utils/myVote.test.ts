import { describe, expect, it } from 'vitest';
import type { RSVPVote } from '../types/rollbook';
import { findMyVote } from './myVote';

const vote = (memberId: string, status: RSVPVote['status'], memberName = '민지'): RSVPVote => ({
  id: `v_${memberId}`,
  scheduleId: 'E',
  memberId,
  memberName,
  part: '알토',
  status,
  timestamp: '2026-11-20 10:00:00',
});

const alias = new Set(['m1', 'm1b']);

describe('findMyVote (V3-22 R2-1)', () => {
  it('대표 id 투표', () => expect(findMyVote([vote('m1', 'ATTEND')], alias)?.memberId).toBe('m1'));
  it('별칭 id 투표', () => expect(findMyVote([vote('m1b', 'ATTEND')], alias)?.memberId).toBe('m1b'));
  it('둘 다 있으면 배열 순서 첫 번째', () => {
    const r = findMyVote([vote('m1b', 'ATTEND'), vote('m1', 'ABSENT')], alias);
    expect(r?.memberId).toBe('m1b');
    expect(r?.status).toBe('ATTEND');
  });
  it('이름만 같은 다른 id는 내 투표가 아니다', () =>
    expect(findMyVote([vote('x9', 'ATTEND', '민지')], alias)).toBeUndefined());
  it('빈 배열', () => expect(findMyVote([], alias)).toBeUndefined());
});
