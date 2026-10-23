import { describe, it, expect } from 'vitest';
import { isScheduleVisibleToMember } from './attendanceStats';
import type { Member, Schedule } from '../types/rollbook';

const member = (overrides: Partial<Member> = {}): Member => ({
  id: 'm1',
  name: '김하은',
  part: '소프라노',
  phoneLast4: '1234',
  role: 'MEMBER',
  createdAt: '2025-01-01T00:00:00Z',
  status: 'ACTIVE',
  joinedAt: '2025-01-01',
  memberStatus: '정단원',
  ...overrides,
});

const schedule = (overrides: Partial<Schedule> = {}): Schedule => ({
  id: 's1',
  title: '파트연습',
  date: '2026-10-30',
  startTime: '19:30',
  endTime: '21:30',
  locationName: '연습실',
  category: '정기연습',
  ...overrides,
});

describe('isScheduleVisibleToMember', () => {
  it('노출 범위가 비어 있으면 모든 단원에게 보인다(하위 호환 기본값)', () => {
    const sch = schedule({ targetAudienceType: 'PARTS', targetParts: ['베이스'] });
    expect(isScheduleVisibleToMember(member(), sch)).toBe(true);
  });

  it('ALL이면 대상이 아니어도 보인다', () => {
    const sch = schedule({ visibility: 'ALL', targetAudienceType: 'PARTS', targetParts: ['베이스'] });
    expect(isScheduleVisibleToMember(member(), sch)).toBe(true);
  });

  it('TARGETS_ONLY는 대상 파트 단원에게만 보인다', () => {
    const sch = schedule({ visibility: 'TARGETS_ONLY', targetAudienceType: 'PARTS', targetParts: ['베이스'] });
    expect(isScheduleVisibleToMember(member({ part: '소프라노' }), sch)).toBe(false);
    expect(isScheduleVisibleToMember(member({ part: '베이스' }), sch)).toBe(true);
  });

  it('TARGETS_ONLY는 지정한 개별 단원에게만 보인다', () => {
    const sch = schedule({ visibility: 'TARGETS_ONLY', targetAudienceType: 'CUSTOM_MEMBERS', targetMemberIds: ['m2'] });
    expect(isScheduleVisibleToMember(member({ id: 'm1' }), sch)).toBe(false);
    expect(isScheduleVisibleToMember(member({ id: 'm2' }), sch)).toBe(true);
  });

  it('TARGETS_ONLY인데 단원을 확인할 수 없으면 숨긴다', () => {
    const sch = schedule({ visibility: 'TARGETS_ONLY', targetAudienceType: 'ALL' });
    expect(isScheduleVisibleToMember(undefined, sch)).toBe(false);
  });

  it('TARGETS_ONLY + 전체 대상이라도 출결 의무가 없는 휴단원에게는 숨긴다', () => {
    const sch = schedule({ visibility: 'TARGETS_ONLY', targetAudienceType: 'ALL' });
    expect(isScheduleVisibleToMember(member({ memberStatus: '휴단원' }), sch)).toBe(false);
    expect(isScheduleVisibleToMember(member({ memberStatus: '정단원' }), sch)).toBe(true);
  });
});
