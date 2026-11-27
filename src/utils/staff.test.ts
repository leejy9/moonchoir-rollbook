import { describe, it, expect } from 'vitest';
import { isStaffMember, isActivityStaff, ACTIVITY_STAFF_PART_KEYWORDS, NON_CHOIR_PART_KEYWORDS } from './staff';
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

describe('isActivityStaff (Spec §5-7, V26)', () => {
  const baseMember: Member = {
    id: 'mem_1',
    name: '김단원',
    part: 'Soprano',
    phoneLast4: '1234',
    role: 'MEMBER',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00Z',
    memberStatus: '정단원',
  };

  it('returns true when memberStatus is 선생님', () => {
    const teacher: Member = {
      ...baseMember,
      memberStatus: '선생님',
    };
    expect(isActivityStaff(teacher)).toBe(true);
  });

  it('returns true when part is 반주 (or includes 반주/지휘/선생님)', () => {
    const accompanist: Member = {
      ...baseMember,
      part: '반주',
    };
    const conductor: Member = {
      ...baseMember,
      part: '지휘자 선생님',
    };
    expect(isActivityStaff(accompanist)).toBe(true);
    expect(isActivityStaff(conductor)).toBe(true);
  });

  it('returns false for guest (객원 is a singing member, not staff)', () => {
    const guest: Member = {
      ...baseMember,
      part: '객원 베이스',
    };
    expect(isActivityStaff(guest)).toBe(false);
  });

  it('returns false for singing admin (role ADMIN + part Alto is member, not activity staff)', () => {
    const adminSinger: Member = {
      ...baseMember,
      role: 'ADMIN',
      part: 'Alto',
    };
    expect(isActivityStaff(adminSinger)).toBe(false);
  });

  it('resolves BoundDeviceProfile correctly', () => {
    const profile: BoundDeviceProfile = {
      memberId: 'mem_teach',
      name: '박선생',
      part: '반주',
      phoneLast4: '0000',
      boundAt: '2026-01-01T00:00:00Z',
    };
    expect(isActivityStaff(profile)).toBe(true);

    const normalProfile: BoundDeviceProfile = {
      memberId: 'mem_normal',
      name: '이단원',
      part: 'Tenor',
      phoneLast4: '1111',
      boundAt: '2026-01-01T00:00:00Z',
    };
    expect(isActivityStaff(normalProfile)).toBe(false);
  });

  it('exports valid staff part keywords and non-choir keywords', () => {
    expect(ACTIVITY_STAFF_PART_KEYWORDS).toContain('선생님');
    expect(ACTIVITY_STAFF_PART_KEYWORDS).toContain('지휘');
    expect(ACTIVITY_STAFF_PART_KEYWORDS).toContain('반주');
    expect(NON_CHOIR_PART_KEYWORDS).toContain('객원');
  });
});

