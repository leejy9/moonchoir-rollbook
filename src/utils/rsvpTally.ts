import type { Member, RSVPVote } from '../types/rollbook';

export interface RsvpTallyInput {
  /** 이 일정의 출결 의무 대상 단원 */
  targetMembers: Member[];
  /** 대표 단원 ID 기준으로 중복을 정리한 이 일정의 현재 투표 */
  votes: RSVPVote[];
  /** 이 일정에 출석(출석·지각·수동 인정)으로 판정된 단원 ID (대표 단원 ID 기준) */
  attendedMemberIds: ReadonlySet<string>;
}

export interface RsvpTally {
  /** 참석 투표를 했고 출석 여부와 상관없이 남는 대상 단원의 투표 */
  votedAttendees: RSVPVote[];
  /** 투표하지 않았거나 불참 투표를 했지만 실제로 출석한 대상 단원(출석 우선) */
  onSiteAttendees: Member[];
  /** 불참 투표를 했고 출석하지 않은 대상 단원의 투표 */
  absentees: RSVPVote[];
  /** 투표도 출석도 하지 않은 대상 단원 */
  unvotedMembers: Member[];
  /** 참석 합계 = 투표 참석 + 현장 출석 */
  attendTotal: number;
}

/**
 * 사전 투표 현황을 만든다. 표시용 계산이며 시트의 투표(RSVP)·출석 로그는 바꾸지 않는다.
 * 실제 출석이 투표보다 우선하므로 출석한 사람은 `미응답`·`불참`에 남지 않는다.
 */
export function buildRsvpTally({ targetMembers, votes, attendedMemberIds }: RsvpTallyInput): RsvpTally {
  const targetIds = new Set(targetMembers.map((m) => m.id));
  const voteByMember = new Map(votes.map((v) => [v.memberId, v]));

  const votedAttendees = votes.filter((v) => v.status === 'ATTEND' && targetIds.has(v.memberId));
  const absentees = votes.filter(
    (v) => v.status === 'ABSENT' && targetIds.has(v.memberId) && !attendedMemberIds.has(v.memberId)
  );

  const onSiteAttendees = targetMembers.filter((m) => {
    if (!attendedMemberIds.has(m.id)) return false;
    return voteByMember.get(m.id)?.status !== 'ATTEND';
  });

  const unvotedMembers = targetMembers.filter(
    (m) => !voteByMember.has(m.id) && !attendedMemberIds.has(m.id)
  );

  return {
    votedAttendees,
    onSiteAttendees,
    absentees,
    unvotedMembers,
    attendTotal: votedAttendees.length + onSiteAttendees.length,
  };
}
