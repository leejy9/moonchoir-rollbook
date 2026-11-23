import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { AttendanceRecordSheet } from './AttendanceRecordSheet';
import type { MemberScheduleRecord } from '../../utils/memberRecords';

describe('AttendanceRecordSheet (V3-11, V3-12)', () => {
  const mockRecords: MemberScheduleRecord[] = [
    {
      id: 's1',
      schedule: {
        id: 's1',
        title: '정기연습 1',
        date: '2026-11-20',
        startTime: '19:30',
        endTime: '21:30',
        locationName: '연습실',
        category: '정기연습',
        isCancelled: false,
      },
      title: '정기연습 1',
      date: '2026-11-20',
      category: '정기연습',
      voteStatus: 'ATTEND',
      voteReason: '',
      voteTimestamp: '2026-11-19 12:00:00',
      isAttended: true,
      finalStatus: '출석',
      checkInTime: '2026-11-20 19:20:00',
      isPast: true,
      isToday: false,
      isExempt: false,
    },
    {
      id: 's2',
      schedule: {
        id: 's2',
        title: '정기연습 2',
        date: '2026-11-15',
        startTime: '19:30',
        endTime: '21:30',
        locationName: '연습실',
        category: '정기연습',
        isCancelled: false,
      },
      title: '정기연습 2',
      date: '2026-11-15',
      category: '정기연습',
      voteStatus: 'ATTEND',
      voteReason: '',
      voteTimestamp: '2026-11-14 12:00:00',
      isAttended: true,
      finalStatus: '지각',
      checkInTime: '2026-11-15 19:35:00',
      isPast: true,
      isToday: false,
      isExempt: false,
    },
  ];

  it('renders standard record sheet with status toggles and period chips', () => {
    const html = renderToString(
      <AttendanceRecordSheet records={mockRecords} onClose={vi.fn()} />
    );

    expect(html).toContain('출석 기록');
    expect(html).toContain('출석');
    expect(html).toContain('지각');
    expect(html).toContain('사유 결석');
    expect(html).toContain('결석');
    expect(html).toContain('최근 3개월');
    expect(html).toContain('올해');
    expect(html).toContain('전체');
  });

  it('renders selectedScheduleFilter chip and locks period when active', () => {
    const html = renderToString(
      <AttendanceRecordSheet
        records={mockRecords}
        onClose={vi.fn()}
        selectedScheduleFilter={{
          itemLabel: '일찍 도착 3회',
          scheduleIds: ['s1'],
        }}
      />
    );

    expect(html).toContain('일찍 도착 3회');
    expect(html).toContain('attendance-selected-filter-chip');
    expect(html).toContain('필터 해제');
  });
});
