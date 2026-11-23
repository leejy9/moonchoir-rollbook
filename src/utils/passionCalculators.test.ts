import { describe, expect, it } from 'vitest';
import type { Schedule } from '../types/rollbook';
import type { MemberScheduleRecord } from './memberRecords';
import { calculateAttendanceGroup } from './passionCalculators';

function record(id: string, finalStatus: MemberScheduleRecord['finalStatus'], checkInTime: string): MemberScheduleRecord {
  const schedule = { id, title: '정기연습', date: '2026-11-17', startTime: '19:30', endTime: '22:00', locationName: '', category: '정기연습' } as Schedule;
  return {
    id, schedule, title: '정기연습', date: '2026-11-17', category: '정기연습',
    voteStatus: null, voteReason: '', voteTimestamp: '',
    isAttended: finalStatus !== '결석', finalStatus, checkInTime,
    isPast: true, isToday: false, isExempt: false,
  };
}

describe('calculateAttendanceGroup — 지각 항목 (명세 §5-5 내역: 0이 아닌 항목만, 지각은 점수 0이어도 표시)', () => {
  it('지각이 0회면 지각 항목을 만들지 않는다', () => {
    const { items } = calculateAttendanceGroup([record('a', '출석', '19:28'), record('b', '출석', '19:29')], new Set());
    expect(items.find((it) => it.key === 'late')).toBeUndefined();
  });

  it('지각이 1회 이상이면 점수 0으로 표시한다', () => {
    const { items } = calculateAttendanceGroup([record('a', '출석', '19:28'), record('b', '지각', '19:45')], new Set());
    const late = items.find((it) => it.key === 'late');
    expect(late).toMatchObject({ count: 1, delta: 0, scheduleIds: ['b'] });
  });
});
