import { describe, it, expect } from 'vitest';
import { buildRsvpTally, countCheckedIn } from './rsvpTally';
import type { AttendanceReconciliation, Member, RSVPVote } from '../types/rollbook';

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

describe('countCheckedIn Pure Function', () => {
  const rec = (
    memberId: string,
    finalStatus: AttendanceReconciliation['finalStatus'],
    partial?: Partial<AttendanceReconciliation>
  ): AttendanceReconciliation => ({
    memberId,
    memberName: memberId,
    part: '소프라노',
    rsvpStatus: 'UNVOTED',
    finalStatus,
    isManualOverride: false,
    ...partial,
  });

  it('출석·지각·운영진(수동) 인정 상태인 단원 수를 정확히 센다', () => {
    const list: AttendanceReconciliation[] = [
      rec('m1', '출석'),
      rec('m2', '지각'),
      rec('m3', '수동인정'),
      rec('m4', '결석'),
      rec('m5', '사유결석'),
      rec('m6', '미참'),
    ];

    expect(countCheckedIn(list, [])).toBe(3);
  });

  it('출결이 취소된(isAttendanceCleared) 기록은 집계에서 제외한다', () => {
    const list: AttendanceReconciliation[] = [
      rec('m1', '출석'),
      rec('m2', '출석', { isAttendanceCleared: true }),
    ];

    expect(countCheckedIn(list, [])).toBe(1);
  });

  it('병합된 단원 ID 2개가 같은 사람이면 1명으로 센다', () => {
    const memberA = member('mem_a');
    const memberB: Member = { ...member('mem_b'), mergedIntoId: 'mem_a' };

    // mem_a와 mem_b 둘 다 출석으로 기록되어 있어도 대표 1명으로 집계
    const list: AttendanceReconciliation[] = [
      rec('mem_a', '출석'),
      rec('mem_b', '출석'),
      rec('mem_c', '지각'),
    ];

    const count = countCheckedIn(list, [memberA, memberB, member('mem_c')]);
    expect(count).toBe(2); // (mem_a + mem_b) -> 1명, mem_c -> 1명 => 총 2명
  });

  it('체인 병합 (C -> B -> A) 구조에서도 최상위 대표 1명으로 센다', () => {
    const memberA = member('mem_a');
    const memberB: Member = { ...member('mem_b'), mergedIntoId: 'mem_a' };
    const memberC: Member = { ...member('mem_c'), mergedIntoId: 'mem_b' };

    const list: AttendanceReconciliation[] = [
      rec('mem_b', '출석'),
      rec('mem_c', '수동인정'),
    ];

    const count = countCheckedIn(list, [memberA, memberB, memberC]);
    expect(count).toBe(1);
  });
});

