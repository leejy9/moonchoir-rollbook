import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { AttendanceRecordSheet } from './AttendanceRecordSheet';
import type { MemberScheduleRecord } from '../../utils/memberRecords';

describe('AttendanceRecordSheet row formatting (Spec §5-4, V3-20 R10)', () => {
  const baseRecord: MemberScheduleRecord = {
    id: 'rec_1',
    schedule: {
      id: 'sch_1',
      title: '정기연습 1회차',
      date: '2026-11-14',
      startTime: '19:30',
      endTime: '21:30',
      locationName: '연습실',
      category: '정기연습',
    },
    title: '정기연습 1회차',
    date: '2026-11-14',
    category: '정기연습',
    voteStatus: 'ATTEND',
    voteReason: '',
    voteTimestamp: '2026-11-10 10:00:00',
    isAttended: true,
    finalStatus: '출석',
    checkInTime: '19:28',
    isPast: true,
    isToday: false,
    isExempt: false,
  };

  it('formats date as 11/14 토, displays vote status as subtitle, and places check-in time on right', () => {
    const html = renderToString(
      <AttendanceRecordSheet
        records={[baseRecord]}
        onClose={vi.fn()}
      />
    );

    // 1. Date must be 11/14 토 (2026-11-14 is Saturday)
    expect(html).toContain('11/14 토');
    expect(html).not.toContain('26-11-14');

    // 2. Subtitle for attended row should show vote status "투표 참석"
    expect(html).toContain('투표 참석');

    // 3. CheckInTime 19:28 in right container
    expect(html).toContain('19:28');
  });

  it('displays 시작 HH:MM as subtitle for late status row', () => {
    const lateRecord: MemberScheduleRecord = {
      ...baseRecord,
      id: 'rec_late',
      finalStatus: '지각',
      checkInTime: '19:42',
    };

    const html = renderToString(
      <AttendanceRecordSheet
        records={[lateRecord]}
        onClose={vi.fn()}
      />
    );

    expect(html).toContain('시작 19:30');
    expect(html).not.toContain('투표 참석');
    expect(html).toContain('19:42');
  });

  it('displays 투표 불참 · 사유 when voteStatus is ABSENT with reason', () => {
    const excusedRecord: MemberScheduleRecord = {
      ...baseRecord,
      id: 'rec_excused',
      finalStatus: '사유결석',
      voteStatus: 'ABSENT',
      voteReason: '야근',
      checkInTime: '',
    };

    const html = renderToString(
      <AttendanceRecordSheet
        records={[excusedRecord]}
        onClose={vi.fn()}
      />
    );

    expect(html).toContain('투표 불참 · 야근');
  });

  it('displays 미투표 when voteStatus is null/empty', () => {
    const unvotedRecord: MemberScheduleRecord = {
      ...baseRecord,
      id: 'rec_unvoted',
      finalStatus: '결석',
      voteStatus: null,
      voteReason: '',
      checkInTime: '',
    };

    const html = renderToString(
      <AttendanceRecordSheet
        records={[unvotedRecord]}
        onClose={vi.fn()}
      />
    );

    expect(html).toContain('미투표');
  });
});
