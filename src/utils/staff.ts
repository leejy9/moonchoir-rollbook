import type { AppConfig, BoundDeviceProfile, Member } from '../types/rollbook';

/**
 * 활동 대시보드(내 활동)에서 '스태프(지도진/반주진)'로 분류하는 파트 키워드 목록.
 * 객원은 노래하는 단원이므로 스태프가 아님.
 */
export const ACTIVITY_STAFF_PART_KEYWORDS = ['선생님', '지휘', '반주'] as const;

/**
 * 기본 합창 파트 필터링(신규 일정·프로그램 카드 생성 시 비합창 파트 제외용) 키워드 목록.
 */
export const NON_CHOIR_PART_KEYWORDS = ['선생님', '지휘', '반주', '객원'] as const;

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

/**
 * 내 활동(ProfileTab)에서 단원 대신 '스태프 화면'(지도진/반주진)을 적용할지 판정하는 순수 함수 (Spec §5-7, V26).
 *
 * 판정 기준:
 * - memberStatus가 '선생님'
 * - 또는 part에 '선생님', '지휘', '반주' 키워드가 포함된 경우
 *
 * 주의:
 * - 객원은 노래하는 단원이므로 스태프가 아닙니다.
 * - role이 ADMIN/MASTER이더라도 파트가 알토/소프라노 등 합창 단원이면 노래하는 단원이므로 false를 반환합니다.
 */
export function isActivityStaff(
  member?: Member | BoundDeviceProfile | null,
  _config?: AppConfig | null,
  allMembers?: Member[]
): boolean {
  if (!member) return false;

  let memberStatus: string | undefined;
  let part: string | undefined;

  if ('role' in member) {
    memberStatus = member.memberStatus;
    part = member.part;
  } else if ('memberId' in member && allMembers) {
    const found = allMembers.find((m) => m.id === member.memberId);
    if (found) {
      memberStatus = found.memberStatus;
      part = found.part;
    } else {
      part = member.part;
    }
  } else if ('part' in member) {
    part = member.part;
  }

  if (memberStatus === '선생님') return true;

  if (part) {
    for (const kw of ACTIVITY_STAFF_PART_KEYWORDS) {
      if (part.includes(kw)) {
        return true;
      }
    }
  }

  return false;
}

