import { describe, it, expect } from 'vitest';
import { isStaffMember } from './staff';
import type { BoundDeviceProfile, Member } from '../types/rollbook';

describe('isStaffMember', () => {
  const baseMember: Member = {
    id: 'mem_1',
    name: '김합창',
    part: 'Soprano',
    phoneLast4: '1234',
    role: 'MEMBER',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00Z',
    memberStatus: '정단원',
  };

  it('returns true when role is ADMIN', () => {
    const adminMember: Member = {
      ...baseMember,
      role: 'ADMIN',
    };
    expect(isStaffMember(adminMember)).toBe(true);
  });

  it('returns true when role is MASTER', () => {
    const masterMember = {
      ...baseMember,
      role: 'MASTER' as unknown as Member['role'],
    };
    expect(isStaffMember(masterMember)).toBe(true);
  });

  it('returns true when memberStatus is 선생님 or 운영진', () => {
    const teacherMember: Member = {
      ...baseMember,
      memberStatus: '선생님',
    };
    const staffMember: Member = {
      ...baseMember,
      memberStatus: '운영진',
    };
    expect(isStaffMember(teacherMember)).toBe(true);
    expect(isStaffMember(staffMember)).toBe(true);
  });

  it('returns false for ordinary member', () => {
    expect(isStaffMember(baseMember)).toBe(false);
  });

  it('resolves BoundDeviceProfile using allMembers list', () => {
    const profile: BoundDeviceProfile = {
      memberId: 'mem_staff',
      name: '이관리',
      part: 'Tenor',
      phoneLast4: '9999',
      boundAt: '2026-01-01T00:00:00Z',
    };
    const staffMember: Member = {
      id: 'mem_staff',
      name: '이관리',
      part: 'Tenor',
      phoneLast4: '9999',
      role: 'ADMIN',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00Z',
      memberStatus: '정단원',
    };

    expect(isStaffMember(profile, [staffMember])).toBe(true);
    expect(isStaffMember(profile, [baseMember])).toBe(false);
  });

  it('returns false for null or undefined', () => {
    expect(isStaffMember(null)).toBe(false);
    expect(isStaffMember(undefined)).toBe(false);
  });
});
