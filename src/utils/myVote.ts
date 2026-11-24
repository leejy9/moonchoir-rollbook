import type { RSVPVote } from '../types/rollbook';

/**
 * 내 투표 하나로 찾기 (V3-22 R2-1).
 * 출결 엔진(`buildMemberScheduleRecords`)과 같은 규칙이다: 별칭 id를 포함한 내 id 집합에 속한
 * 첫 투표(배열 순서). 이름 대조는 하지 않고 시각도 비교하지 않는다.
 * 호출하는 쪽이 한 일정의 투표만 넘기거나, 이미 일정별로 걸러서 넘긴다.
 */
export function findMyVote<T extends Pick<RSVPVote, 'memberId'>>(
  votes: readonly T[],
  aliasIds: ReadonlySet<string>
): T | undefined {
  return votes.find((v) => aliasIds.has(v.memberId));
}
