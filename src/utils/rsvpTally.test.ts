import { describe, it, expect } from 'vitest';
import { buildRsvpTally } from './rsvpTally';
import type { Member, RSVPVote } from '../types/rollbook';

const member = (id: string): Member =>
  ({ id, name: id, part: '소프라노', phoneLast4: '0000', role: 'MEMBER', createdAt: '', status: 'ACTIVE' }) as Member;

const vote = (memberId: string, status: 'ATTEND' | 'ABSENT'): RSVPVote => ({
  id: `v_${memberId}`,
  scheduleId: 's1',
  memberId,
  memberName: memberId,
  part: '소프라노',
  status,
  timestamp: '',
});

const targets = ['a', 'b', 'c', 'd', 'e'].map(member);

describe('buildRsvpTally', () => {
  it('투표하지 않고 출석한 단원은 미응답이 아니라 현장 출석으로 센다', () => {
    const tally = buildRsvpTally({
      targetMembers: targets,
      votes: [vote('a', 'ATTEND')],
      attendedMemberIds: new Set(['b']),
    });

    expect(tally.onSiteAttendees.map((m) => m.id)).toEqual(['b']);
    expect(tally.unvotedMembers.map((m) => m.id)).toEqual(['c', 'd', 'e']);
    expect(tally.attendTotal).toBe(2);
  });

  it('불참 투표 후 출석하면 출석을 우선해 불참에서 빠지고 현장으로 센다', () => {
    const tally = buildRsvpTally({
      targetMembers: targets,
      votes: [vote('a', 'ABSENT'), vote('b', 'ABSENT')],
      attendedMemberIds: new Set(['a']),
    });

    expect(tally.absentees.map((v) => v.memberId)).toEqual(['b']);
    expect(tally.onSiteAttendees.map((m) => m.id)).toEqual(['a']);
  });

  it('참석 투표 후 출석한 단원은 한 번만 센다', () => {
    const tally = buildRsvpTally({
      targetMembers: targets,
      votes: [vote('a', 'ATTEND')],
      attendedMemberIds: new Set(['a']),
    });

    expect(tally.votedAttendees).toHaveLength(1);
    expect(tally.onSiteAttendees).toHaveLength(0);
    expect(tally.attendTotal).toBe(1);
  });

  it('출석이 취소되어 출석 목록에서 빠지면 다시 미응답이 된다', () => {
    const tally = buildRsvpTally({ targetMembers: targets, votes: [], attendedMemberIds: new Set() });

    expect(tally.unvotedMembers).toHaveLength(5);
    expect(tally.attendTotal).toBe(0);
  });

  it('대상이 아닌 단원의 출석·투표는 대상 집계에 들어가지 않는다', () => {
    const tally = buildRsvpTally({
      targetMembers: targets,
      votes: [vote('x', 'ATTEND')],
      attendedMemberIds: new Set(['x']),
    });

    expect(tally.attendTotal).toBe(0);
    expect(tally.onSiteAttendees).toHaveLength(0);
  });
});
