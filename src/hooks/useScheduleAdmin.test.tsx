import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { useScheduleAdmin } from './useScheduleAdmin';
import type { ProgramCard, Schedule } from '../types/rollbook';

const mockSchedules: Schedule[] = [
  {
    id: 'sch-1',
    title: '정기연습 1회차',
    date: '2026-10-18',
    startTime: '19:00',
    endTime: '21:00',
    locationName: '서초 연습실',
    category: '정기연습',
  },
  {
    id: 'sch-2',
    title: '정기연습 2회차',
    date: '2026-10-25',
    startTime: '19:00',
    endTime: '21:00',
    locationName: '서초 연습실',
    category: '정기연습',
  },
];

const mockCards: ProgramCard[] = [
  {
    id: 'card-1',
    title: '2026 하반기 정기연습',
    category: '정기연습',
    isArchived: false,
    createdAt: '2026-01-01T00:00:00Z',
  },
];

describe('useScheduleAdmin Hook', () => {
  it('초기 상태 및 모든 관리 핸들러가 온전히 반환된다', () => {
    let hookResult: ReturnType<typeof useScheduleAdmin> | undefined;

    function TestHarness() {
      // oxlint-disable-next-line react/globals
      hookResult = useScheduleAdmin({
        schedules: mockSchedules,
        programCards: mockCards,
        onDataChanged: vi.fn(),
        setSelectedScheduleId: vi.fn(),
      });
      return null;
    }

    renderToString(<TestHarness />);

    expect(hookResult).toBeDefined();
    const result = hookResult!;

    // Initial State Verification
    expect(result.rightPanelMode).toBe('SCHEDULE_FORM');
    expect(result.editingScheduleForForm).toBeNull();
    expect(result.selectedBatchScheduleIds).toEqual([]);
    expect(result.scheduleViewTab).toBe('CALENDAR');

    // Handler Functions Existence
    expect(typeof result.handleSaveScheduleFromForm).toBe('function');
    expect(typeof result.handleSaveProgramCard).toBe('function');
    expect(typeof result.handleDeleteScheduleSingle).toBe('function');
    expect(typeof result.handleDeleteScheduleSeries).toBe('function');
    expect(typeof result.handleRestoreScheduleSingle).toBe('function');
    expect(typeof result.handleDeleteSchedule).toBe('function');
    expect(typeof result.handleApplyBatchScheduleUpdates).toBe('function');
    expect(typeof result.handleBatchDeleteSelected).toBe('function');
    expect(typeof result.handleToggleSelectSchedule).toBe('function');
    expect(typeof result.handleSelectAllSchedules).toBe('function');
    expect(typeof result.handleToggleArchiveSchedule).toBe('function');
    expect(typeof result.handleBatchArchiveSelected).toBe('function');
    expect(typeof result.handleToggleArchiveGroup).toBe('function');
    expect(typeof result.handleDuplicateSelectedSeries).toBe('function');
  });
});
