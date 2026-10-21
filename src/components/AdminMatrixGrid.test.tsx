import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import type { Member, RawAttendanceLog, Schedule } from '../types/rollbook';
import { resetStorage, sheetsService } from '../services/sheets';
import { AdminMatrixGrid } from './AdminMatrixGrid';

describe('AdminMatrixGrid attendance reset display', () => {
  afterEach(() => {
    vi.useRealTimers();
    resetStorage();
  });

  it('shows a cleared future attendance correction as "-" instead of absence', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-21T12:00:00+09:00'));

    const member: Member = {
      id: 'mem_test_reset',
      name: 'ADMIN',
      part: '베이스',
      phoneLast4: '0000',
      role: 'MEMBER',
      createdAt: '2026-10-21T00:00:00Z',
      status: 'ACTIVE',
      joinedAt: '2026-10-21',
      memberStatus: '준단원',
    };
    const schedule: Schedule = {
      id: 'sch_test_reset_future',
      title: '정기연습',
      date: '2026-10-22',
      startTime: '19:30',
      endTime: '22:00',
      locationName: '연습실',
      category: '정기연습',
      targetAudienceType: 'PARTS',
      targetParts: ['베이스'],
    };
    const logs: RawAttendanceLog[] = [
      {
        id: 'log_test_future_attendance',
        scheduleId: schedule.id,
        memberId: member.id,
        memberName: member.name,
        part: member.part,
        timestamp: '2026-10-22T19:30:00',
        authMethod: 'MANUAL_BY_ADMIN',
        isVerifiedLocation: true,
        adminNote: '관리자 수동 출석 인정',
      },
      {
        id: 'log_test_future_reset',
        scheduleId: schedule.id,
        memberId: member.id,
        memberName: member.name,
        part: member.part,
        timestamp: '2026-10-21T12:00:00+09:00',
        authMethod: 'MANUAL_BY_ADMIN',
        isVerifiedLocation: false,
        adminNote: '관리자 출결 취소 (초기화)',
      },
    ];
    sheetsService.seedTestData({ members: [member], schedules: [schedule], logs });

    const html = renderToString(
      <AdminMatrixGrid members={[member]} schedules={[schedule]} onDataChanged={() => {}} />
    );

    expect(html).toContain('cell-upcoming');
    expect(html).toContain('>-</span>');
    expect(html).not.toContain('>결석</span>');
  });
});
