import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import type { Member, RSVPVote, Schedule } from '../types/rollbook';
import { resetStorage, sheetsService } from '../services/sheets';
import { HomeUpcomingListSection } from './home/HomeUpcomingListSection';
import { ScheduleDetailBody } from './ScheduleDetailBody';

afterEach(() => {
  resetStorage();
});

describe('merged member schedule targets', () => {
  const representative: Member = {
    id: 'representative',
    name: '대표',
    part: '소프라노',
    phoneLast4: '',
    role: 'MEMBER',
    status: 'ACTIVE',
    createdAt: '',
    joinedAt: '2020-01-01',
    memberStatus: '정단원',
  };
  const oldMember: Member = {
    ...representative,
    id: 'old',
    status: 'MERGED',
    mergedIntoId: representative.id,
  };
  const schedule: Schedule = {
    id: 'targeted',
    title: '지정 연습',
    date: '2026-12-01',
    startTime: '19:00',
    endTime: '21:00',
    locationName: '연습실',
    category: '추가연습',
    targetAudienceType: 'CUSTOM_MEMBERS',
    targetMemberIds: [oldMember.id],
  };
  const aliasVote: RSVPVote = {
    id: 'vote-old',
    scheduleId: schedule.id,
    memberId: oldMember.id,
    memberName: oldMember.name,
    part: oldMember.part,
    status: 'ATTEND',
    timestamp: '2026-11-20T12:00:00+09:00',
  };

  it('counts the representative once in the schedule detail target total', () => {
    sheetsService.seedTestData({
      members: [representative, oldMember],
      schedules: [schedule],
      logs: [],
      rsvpVotes: [],
    });

    const html = renderToString(
      React.createElement(ScheduleDetailBody, { schedule, member: representative })
    );

    expect(html).toContain('총 <!-- -->1<!-- -->명');
  });

  it('keeps the home upcoming gauge at 100% for one merged target attendee', () => {
    sheetsService.seedTestData({
      members: [representative, oldMember],
      schedules: [schedule],
      logs: [],
      rsvpVotes: [aliasVote],
    });

    const html = renderToString(
      React.createElement(HomeUpcomingListSection, {
        upcomingSchedules: [schedule],
        members: [representative, oldMember],
        canonicalMemberIdMap: new Map([
          [representative.id, representative.id],
          [oldMember.id, representative.id],
        ]),
        selectedDateStr: schedule.date,
        onSelectSchedule: () => undefined,
      })
    );

    expect(html).toContain('투표율: 100%');
  });
});
