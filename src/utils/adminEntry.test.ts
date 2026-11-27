import { describe, expect, it } from 'vitest';
import type { Member } from '../types/rollbook';
import { canShowAdminEntry } from './adminEntry';

const m = (id: string, role: Member['role'], extra: Partial<Member> = {}): Member => ({
  id,
  name: id,
  part: '알토',
  phoneLast4: '1234',
  role,
  status: 'ACTIVE',
  createdAt: '2026-01-01',
  joinedAt: '2026-01-01',
  ...extra,
});

describe('canShowAdminEntry (V3-22 R6)', () => {
  it('role MEMBER, 세션 없음 → 없음', () => expect(canShowAdminEntry('m1', [m('m1', 'MEMBER')], false)).toBe(false));
  it('role ADMIN → 있음', () => expect(canShowAdminEntry('m1', [m('m1', 'ADMIN')], false)).toBe(true));
  it('role MEMBER + 관리자 세션 → 있음', () => expect(canShowAdminEntry('m1', [m('m1', 'MEMBER')], true)).toBe(true));
  it('기기가 별칭 id, 대표가 ADMIN → 있음', () => {
    const members = [m('m1', 'ADMIN'), m('m1b', 'MEMBER', { status: 'MERGED', mergedIntoId: 'm1' })];
    expect(canShowAdminEntry('m1b', members, false)).toBe(true);
  });
  it('새 기기, 회원 목록 동기화 전 → 없음, 동기화 후 ADMIN이면 나타남', () => {
    expect(canShowAdminEntry('m1', [], false)).toBe(false);
    expect(canShowAdminEntry('m1', [m('m1', 'ADMIN')], false)).toBe(true);
  });
  it('병합 행이 빠진 목록이면 별칭 기기는 ADMIN을 못 찾는다(그래서 getMembers(true) 필수)', () => {
    expect(canShowAdminEntry('m1b', [m('m1', 'ADMIN')], false)).toBe(false);
  });
});
