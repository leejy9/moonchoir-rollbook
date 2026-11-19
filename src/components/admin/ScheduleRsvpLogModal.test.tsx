import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { ScheduleRsvpLogModal } from './ScheduleRsvpLogModal';
import { sheetsService } from '../../services/sheets';
import type { Member, Schedule, RSVPVote } from '../../types/rollbook';

const mockSchedule: Schedule = {
  id: 'sch_test_rsvp',
  title: '테스트 정기연습',
  date: '2026-11-20',
  startTime: '19:30',
  endTime: '21:30',
  locationName: '서초 연습실',
  category: '정기연습',
};

const mockMembers: Member[] = [
  {
    id: 'm1',
    name: '김철수',
    part: '테너',
    phoneLast4: '1111',
    role: 'MEMBER',
    status: 'ACTIVE',
    joinedAt: '2026-01-01',
    memberStatus: '정단원',
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'm2',
    name: '이영희',
    part: '소프라노',
    phoneLast4: '2222',
    role: 'MEMBER',
    status: 'ACTIVE',
    joinedAt: '2026-01-01',
    memberStatus: '정단원',
    createdAt: '2026-01-01T00:00:00Z',
  },
];

const mockVotes: RSVPVote[] = [
  {
    id: 'vote_1',
    scheduleId: 'sch_test_rsvp',
    memberId: 'm1',
    memberName: '김철수',
    part: '테너',
    status: 'ATTEND',
    timestamp: '2026-11-19 14:00:00',
  },
  {
    id: 'vote_2',
    scheduleId: 'sch_test_rsvp',
    memberId: 'm2',
    memberName: '이영희',
    part: '소프라노',
    status: 'ABSENT',
    reason: '개인 사정',
    timestamp: '2026-11-19 15:30:00',
  },
];

describe('ScheduleRsvpLogModal', () => {
  beforeEach(() => {
    vi.spyOn(sheetsService, 'getRSVPVotes').mockReturnValue(mockVotes);
  });

  it('renders RSVP tally and timestamps properly', () => {
    const html = renderToString(
      React.createElement(ScheduleRsvpLogModal, {
        schedule: mockSchedule,
        members: mockMembers,
        onClose: vi.fn(),
      })
    );

    expect(html).toContain('테스트 정기연습');
    expect(html).toContain('김철수');
    expect(html).toContain('2026-11-19 14:00:00');
    expect(html).toContain('이영희');
    expect(html).toContain('개인 사정');
    expect(html).toContain('2026-11-19 15:30:00');
  });
});
