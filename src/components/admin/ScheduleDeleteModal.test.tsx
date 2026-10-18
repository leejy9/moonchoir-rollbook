import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ScheduleDeleteModal } from './ScheduleDeleteModal';
import type { Schedule } from '../../types/rollbook';

const mockSchedule: Schedule = {
  id: 'sch-1',
  title: '정기연습 1회차',
  date: '2026-10-18',
  startTime: '19:30',
  endTime: '21:30',
  locationName: '중앙 연습실',
  category: '정기연습',
};

describe('ScheduleDeleteModal Component', () => {
  it('returns null when scheduleToDelete is null', () => {
    const html = renderToString(
      <ScheduleDeleteModal
        scheduleToDelete={null}
        schedules={[mockSchedule]}
        programCards={[]}
        forceHardDeleteSelected={false}
        setForceHardDeleteSelected={vi.fn()}
        onClose={vi.fn()}
        onDeleteSingle={vi.fn()}
        onDeleteSeries={vi.fn()}
      />
    );
    expect(html).toBe('');
  });

  it('renders modal details for single non-repeating schedule', () => {
    const html = renderToString(
      <ScheduleDeleteModal
        scheduleToDelete={mockSchedule}
        schedules={[mockSchedule]}
        programCards={[]}
        forceHardDeleteSelected={false}
        setForceHardDeleteSelected={vi.fn()}
        onClose={vi.fn()}
        onDeleteSingle={vi.fn()}
        onDeleteSeries={vi.fn()}
      />
    );
    expect(html).toContain('정기연습 1회차');
    expect(html).toContain('일정 삭제 확인');
    expect(html).toContain('2026-10-18');
    expect(html).toContain('중앙 연습실');
  });

  it('renders repeating series options when companions exist', () => {
    const companionSchedule: Schedule = {
      id: 'sch-2',
      title: '정기연습 1회차',
      date: '2026-10-25',
      startTime: '19:30',
      endTime: '21:30',
      locationName: '중앙 연습실',
      category: '정기연습',
    };

    const html = renderToString(
      <ScheduleDeleteModal
        scheduleToDelete={mockSchedule}
        schedules={[mockSchedule, companionSchedule]}
        programCards={[]}
        forceHardDeleteSelected={false}
        setForceHardDeleteSelected={vi.fn()}
        onClose={vi.fn()}
        onDeleteSingle={vi.fn()}
        onDeleteSeries={vi.fn()}
      />
    );
    expect(html).toContain('삭제할 범위를 선택하세요');
    expect(html).toContain('이 회차만 삭제');
    expect(html).toContain('오늘 포함 이후 회차 일괄 삭제');
    expect(html).toContain('회차 모두 삭제');
  });
});
