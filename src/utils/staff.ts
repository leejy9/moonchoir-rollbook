import type { BoundDeviceProfile, Member } from '../types/rollbook';

/**
 * 운영진 메뉴/버튼 노출 여부를 판정하는 순수 함수.
 *
 * [보안 주의]
 * 이 판정은 클라이언트 UI에서 '운영진 모드' 버튼을 보여주기 위한 메뉴 노출용일 뿐이며, 보안 권한이 아닙니다.
 * 실제 관리자 콘솔 진입 및 데이터 변경 시에는 관리자 PIN 검증과 Supabase 서버 RPC 토큰(fn_check_admin_token)이 필수로 요구됩니다.
 *
 * 판정 기준:
 * - 명부의 역할(role)이 'ADMIN' 또는 'MASTER'인 경우
 * - 또는 동적 신분(memberStatus)이 '선생님' 또는 '운영진'인 경우
 */
export function isStaffMember(
  member?: Member | BoundDeviceProfile | null,
  allMembers?: Member[]
): boolean {
  if (!member) return false;

  let role: string | undefined;
  let status: string | undefined;

  if ('role' in member) {
    role = member.role;
    status = member.memberStatus;
  } else if ('memberId' in member && allMembers) {
    const found = allMembers.find((m) => m.id === member.memberId);
    if (found) {
      role = found.role;
      status = found.memberStatus;
    }
  }

  return (
    role === 'ADMIN' ||
    role === 'MASTER' ||
    status === '선생님' ||
    status === '운영진'
  );
}
