import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ScheduleDetailSheet } from './ScheduleDetailSheet';
import type { Member, Schedule } from '../types/rollbook';

describe('ScheduleDetailSheet Component', () => {
  const mockMember: Member = {
    id: 'mem_01',
    name: '김하은',
    part: '소프라노',
    phoneLast4: '1234',
    role: 'MEMBER',
    status: 'ACTIVE',
    createdAt: '2026-01-01',
    joinedAt: '2026-01-01',
  };

  const mockSchedules: Schedule[] = [
    {
      id: 'sch_multi_1',
      title: '파트 연습',
      category: '추가연습',
      date: '2026-11-20',
      startTime: '17:00',
      endTime: '18:30',
      locationName: '문콰이어 제1연습실',
      targetLat: 37.5665,
      targetLon: 126.978,
    },
    {
      id: 'sch_multi_2',
      title: '정기 연습',
      category: '정기연습',
      date: '2026-11-20',
      startTime: '19:30',
      endTime: '21:30',
      locationName: '문콰이어 제1연습실',
      targetLat: 37.5665,
      targetLon: 126.978,
    },
  ];

  it('renders single schedule directly with dialog role and aria attributes', () => {
    const single = [mockSchedules[0]];
    const html = renderToString(
      <ScheduleDetailSheet
        isOpen={true}
        date="2026-11-20"
        schedules={single}
        member={mockMember}
        onClose={() => {}}
      />
    ).replace(/<!-- -->/g, '');

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('파트 연습');
    expect(html).toContain('17:00 ~ 18:30');
    expect(html).toContain('문콰이어 제1연습실');
  });

  it('renders multi-schedule picker list when 2+ schedules exist without scheduleId', () => {
    const html = renderToString(
      <ScheduleDetailSheet
        isOpen={true}
        date="2026-11-20"
        schedules={mockSchedules}
        member={mockMember}
        onClose={() => {}}
      />
    ).replace(/<!-- -->/g, '');

    expect(html).toContain('해당 일자에 2개의 일정이 있습니다');
    expect(html).toContain('파트 연습');
    expect(html).toContain('정기 연습');
  });

  it('renders specific schedule directly when scheduleId is provided', () => {
    const html = renderToString(
      <ScheduleDetailSheet
        isOpen={true}
        date="2026-11-20"
        scheduleId="sch_multi_2"
        schedules={mockSchedules}
        member={mockMember}
        onClose={() => {}}
      />
    ).replace(/<!-- -->/g, '');

    expect(html).toContain('정기 연습');
    expect(html).toContain('19:30 ~ 21:30');
    expect(html).not.toContain('해당 일자에 2개의 일정이 있습니다');
  });

  it('displays "볼 수 없는 일정입니다" when unknown scheduleId is passed', () => {
    const html = renderToString(
      <ScheduleDetailSheet
        isOpen={true}
        date="2026-11-20"
        scheduleId="non_existent_id"
        schedules={mockSchedules}
        member={mockMember}
        onClose={() => {}}
      />
    );

    expect(html).toContain('볼 수 없는 일정입니다');
  });

  it('renders nothing when isOpen is false', () => {
    const html = renderToString(
      <ScheduleDetailSheet
        isOpen={false}
        date="2026-11-20"
        schedules={mockSchedules}
        member={mockMember}
        onClose={() => {}}
      />
    );

    expect(html).toBe('');
  });

  it('has close button with >= 44px min touch target and aria-label', () => {
    const html = renderToString(
      <ScheduleDetailSheet
        isOpen={true}
        date="2026-11-20"
        schedules={mockSchedules}
        member={mockMember}
        onClose={() => {}}
      />
    );

    expect(html).toMatch(/aria-label="닫기"[^>]*style="[^"]*min-width:44px[^"]*min-height:44px/);
  });
});
