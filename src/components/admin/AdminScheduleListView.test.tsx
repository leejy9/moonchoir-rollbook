import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { AdminScheduleListView } from './AdminScheduleListView';
import type { Schedule } from '../../types/rollbook';

const mockSchedules: Schedule[] = [
  {
    id: 'sch-1',
    title: '정기연습 1회차',
    date: '2026-10-18',
    startTime: '19:00',
    endTime: '21:00',
    locationName: '언더스탠드에비뉴',
    category: '정기연습',
    seriesIndex: 1,
    seriesTotal: 10,
    checkInPin: '1234',
  },
  {
    id: 'sch-2',
    title: '연주회 리허설',
    date: '2026-11-01',
    startTime: '14:00',
    endTime: '18:00',
    locationName: '성남아트센터',
    category: '연주',
  },
];

describe('AdminScheduleListView Component', () => {
  it('일정 목록 및 필터/검색 UI를 올바르게 렌더링한다', () => {
    const html = renderToString(
      <AdminScheduleListView
        schedules={mockSchedules}
        categories={['정기연습', '연주']}
        selectedBatchScheduleIds={[]}
        onToggleSelectSchedule={vi.fn()}
        onSelectAllSchedules={vi.fn()}
        onClearSelection={vi.fn()}
        onOpenBatchEdit={vi.fn()}
        onDuplicateSeries={vi.fn()}
        onBatchArchive={vi.fn()}
        onBatchDelete={vi.fn()}
        showArchivedSchedules={false}
        onToggleShowArchived={vi.fn()}
        onSelectScheduleForEdit={vi.fn()}
        onToggleArchiveSchedule={vi.fn()}
        onCloneSchedule={vi.fn()}
        onDeleteSchedule={vi.fn()}
      />
    );

    expect(html).toContain('전체 등록 일정 일괄 관리');
    expect(html).toContain('일정명, 날짜, 장소, 곡목 검색...');
    expect(html).toContain('전체 카테고리');
    expect(html).toContain('정기연습');
    expect(html).toContain('연주');
    expect(html).toContain('정기연습 1회차');
    expect(html).toContain('연주회 리허설');
    expect(html).toContain('회차');
    expect(html).toContain('언더스탠드에비뉴');
    expect(html).toContain('성남아트센터');
  });

  it('선택된 일정이 있을 때 일괄 작업 바(수정, 복제, 아카이브, 삭제 버튼)를 렌더링한다', () => {
    const html = renderToString(
      <AdminScheduleListView
        schedules={mockSchedules}
        categories={['정기연습', '연주']}
        selectedBatchScheduleIds={['sch-1']}
        onToggleSelectSchedule={vi.fn()}
        onSelectAllSchedules={vi.fn()}
        onClearSelection={vi.fn()}
        onOpenBatchEdit={vi.fn()}
        onDuplicateSeries={vi.fn()}
        onBatchArchive={vi.fn()}
        onBatchDelete={vi.fn()}
        showArchivedSchedules={false}
        onToggleShowArchived={vi.fn()}
        onSelectScheduleForEdit={vi.fn()}
        onToggleArchiveSchedule={vi.fn()}
        onCloneSchedule={vi.fn()}
        onDeleteSchedule={vi.fn()}
      />
    );

    expect(html).toContain('일괄 수정');
    expect(html).toContain('아카이브');
    expect(html).toContain('일괄 삭제');
    expect(html).toContain('선택 해제');
  });

  it('일정이 전혀 없을 때 빈 목록 안내 문구를 렌더링한다', () => {
    const html = renderToString(
      <AdminScheduleListView
        schedules={[]}
        categories={['정기연습']}
        selectedBatchScheduleIds={[]}
        onToggleSelectSchedule={vi.fn()}
        onSelectAllSchedules={vi.fn()}
        onClearSelection={vi.fn()}
        onOpenBatchEdit={vi.fn()}
        onDuplicateSeries={vi.fn()}
        onBatchArchive={vi.fn()}
        onBatchDelete={vi.fn()}
        showArchivedSchedules={false}
        onToggleShowArchived={vi.fn()}
        onSelectScheduleForEdit={vi.fn()}
        onToggleArchiveSchedule={vi.fn()}
        onCloneSchedule={vi.fn()}
        onDeleteSchedule={vi.fn()}
      />
    );

    expect(html).toContain('조건에 부합하는 일정이 없습니다.');
  });
});
