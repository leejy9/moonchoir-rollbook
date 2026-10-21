import { describe, expect, it } from 'vitest';
import { parseRemoteMembers, parseRemoteSchedules } from './sheetsParser';

const baseSchedule = {
    title: '경찰의날 녹음',
    date: '2026-10-20',
    startTime: '19:00',
    endTime: '21:00',
    locationName: '연습실',
    category: '녹음',
};

describe('parseRemoteSchedules', () => {
  it('normalizes string and boolean archive values from Sheets', () => {
    const sheetRows = JSON.parse(
      JSON.stringify([
        { ...baseSchedule, id: 'active', isArchived: 'FALSE' },
        { ...baseSchedule, id: 'archived', isArchived: 'TRUE' },
        { ...baseSchedule, id: 'boolean-active', isArchived: false },
        { ...baseSchedule, id: 'boolean-archived', isArchived: true },
      ])
    );
    const parsed = parseRemoteSchedules(sheetRows);

    expect(parsed.map((schedule) => schedule.isArchived)).toEqual([false, true, false, true]);
  });

  describe('parseRemoteMembers', () => {
    it('restores leading zeroes when Sheets returns a numeric phoneLast4 value', () => {
      const sheetRows = JSON.parse(JSON.stringify([
        {
          id: 'mem_phone_zero',
          name: '전화번호 테스트',
          part: '알토',
          role: 'MEMBER',
          status: 'ACTIVE',
          createdAt: '2026-10-21T00:00:00Z',
          phoneLast4: 357,
          phone: '010-1234-0357',
        },
      ]));

      const [member] = parseRemoteMembers(sheetRows);

      expect(member.phoneLast4).toBe('0357');
    });
  });

  it('parses the rehearsal PARTS list from the Google Sheets CSV value', () => {
    const sheetRows = JSON.parse(
      JSON.stringify([
        {
          ...baseSchedule,
          id: 'sch_20261022_prm7',
          date: '2026-10-22',
          targetAudienceType: 'PARTS',
          targetParts: '소프라노,알토,테너,베이스',
        },
      ])
    );
    const [schedule] = parseRemoteSchedules(sheetRows);

    expect(schedule.targetParts).toEqual(['소프라노', '알토', '테너', '베이스']);
  });
});
