import type { Member, PartType } from '../types/rollbook';
import { getKSTTimestampString } from './date';

export function buildNewMember(
  name: string,
  part: PartType,
  phone: string,
  phoneLast4: string,
  deviceId: string
): Member {
  const kstNow = getKSTTimestampString();
  return {
    id: `mem_new_${Date.now()}`,
    name,
    part,
    phone,
    phoneLast4,
    role: part === '선생님' ? 'ADMIN' : part === '객원' ? 'GUEST' : 'MEMBER',
    createdAt: kstNow,
    status: 'ACTIVE',
    joinedAt: kstNow.slice(0, 10),
    memberStatus: part === '선생님' ? '선생님' : part === '객원' ? '객원' : '정단원',
    boundDeviceId: deviceId,
    boundDeviceAt: kstNow,
  };
}
