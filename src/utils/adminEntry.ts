import type { Member } from '../types/rollbook';
import { resolveMemberIdentity } from './memberIdentity';

/**
 * 설정(관리자 입구) 버튼을 보일지 정한다 (V3-22 R6). 화면 표시일 뿐 권한이 아니다.
 * - 관리자 세션이 있거나, 대표 회원(별칭이면 대표로 올라감)의 role이 ADMIN이면 보인다.
 * - `members`는 병합 행을 포함한 `getMembers(true)` 결과여야 한다.
 */
export function canShowAdminEntry(
  deviceMemberId: string,
  members: Member[],
  adminLoggedIn: boolean
): boolean {
  if (adminLoggedIn) return true;
  const { canonicalId } = resolveMemberIdentity(deviceMemberId, members);
  return members.find((m) => m.id === canonicalId)?.role === 'ADMIN';
}
