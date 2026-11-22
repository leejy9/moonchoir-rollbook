import { describe, expect, it } from 'vitest';
import { normalizeAppConfig, serializeConfigForSave } from './configNormalize';
import { reconcileSingleMemberAttendance } from '../utils/attendanceStats';
import type { Member, RawAttendanceLog, Schedule } from '../types/rollbook';

describe('normalizeAppConfig', () => {
  it('converts numeric strings from app_config into numbers', () => {
    const out = normalizeAppConfig({ lateGraceMinutes: '15', defaultLat: '37.5', defaultLon: '127.01', defaultRadius: '150' });
    expect(out.lateGraceMinutes).toBe(15);
    expect(out.defaultLat).toBe(37.5);
    expect(out.defaultLon).toBe(127.01);
    expect(out.defaultRadius).toBe(150);
  });

  it('drops numeric keys that cannot be parsed so defaults are kept', () => {
    const out = normalizeAppConfig({ lateGraceMinutes: 'abc', defaultRadius: '' });
    expect('lateGraceMinutes' in out).toBe(false);
    expect('defaultRadius' in out).toBe(false);
  });

  it('parses JSON array strings and drops invalid arrays', () => {
    const out = normalizeAppConfig({
      customParts: '["소프라노","알토"]',
      practiceTrackKinds: '["가이드","MR"]',
      customCategories: '[broken',
      performanceCategories: '"연주"',
    });
    expect(out.customParts).toEqual(['소프라노', '알토']);
    expect((out as Record<string, unknown>).practiceTrackKinds).toEqual(['가이드', 'MR']);
    expect('customCategories' in out).toBe(false);
    expect('performanceCategories' in out).toBe(false);
  });

  it('keeps unknown keys and real arrays/numbers as they are', () => {
    const out = normalizeAppConfig({ choirName: '문콰이어', lateGraceMinutes: 10, customParts: ['테너'], extra: 'x' });
    expect(out).toEqual({ choirName: '문콰이어', lateGraceMinutes: 10, customParts: ['테너'], extra: 'x' });
  });

  it('returns an empty object for non-object input', () => {
    expect(normalizeAppConfig(null)).toEqual({});
    expect(normalizeAppConfig('x')).toEqual({});
    expect(normalizeAppConfig([1])).toEqual({});
  });

  it('makes late detection work when the grace value came from the server as a string', () => {
    const member = { id: 'm1', name: '단원', part: '테너', status: 'ACTIVE', memberStatus: '정단원', joinedAt: '2020-01-01' } as unknown as Member;
    const schedule = { id: 's1', title: '정기연습', date: '2026-11-19', startTime: '19:30', endTime: '21:30', targetAudienceType: 'ALL' } as unknown as Schedule;
    const logAt = (time: string) => [{ id: 'l1', timestamp: `2026-11-19T${time}:00+09:00`, scheduleId: 's1', memberId: 'm1', authMethod: 'QR_WEB_CAM' }] as unknown as RawAttendanceLog[];
    const grace = normalizeAppConfig({ lateGraceMinutes: '15' }).lateGraceMinutes as number;

    expect(reconcileSingleMemberAttendance(member, schedule, logAt('19:46'), undefined, grace).finalStatus).toBe('지각');
    expect(reconcileSingleMemberAttendance(member, schedule, logAt('19:45'), undefined, grace).finalStatus).toBe('출석');
  });

  it('serializes array config values into JSON strings for server save', () => {
    expect(serializeConfigForSave(['파트', '연습'])).toBe('["파트","연습"]');
    expect(serializeConfigForSave([])).toBe('[]');
  });
});
