import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { AdminProgramCardsView, type ProgramGroupItem } from './AdminProgramCardsView';
import type { LocationPreset, Schedule } from '../../types/rollbook';

const mockSchedules: Schedule[] = [
  {
    id: 'sch-1',
    title: '2026 하반기 정기연습 1회차',
    date: '2026-10-18',
    startTime: '19:00',
    endTime: '21:00',
    locationName: '언더스탠드에비뉴',
    category: '정기연습',
  },
];

const mockLocations: LocationPreset[] = [
  { id: 'loc-1', name: '언더스탠드에비뉴', latitude: 37.5, longitude: 127.0, radiusMeters: 100 },
];

const mockGroups: ProgramGroupItem[] = [
  {
    cardId: 'card-1',
    title: '2026 하반기 정기연습',
    category: '정기연습',
    description: '베토벤 합창 교향곡',
    locationName: '언더스탠드에비뉴',
    startTime: '19:00',
    endTime: '21:00',
    targetAudienceType: 'ALL',
    schedules: mockSchedules,
    startDate: '2026-10-18',
    endDate: '2026-10-18',
    isArchived: false,
    isRegisteredCard: true,
  },
];

describe('AdminProgramCardsView Component', () => {
  it('일정 카드 묶음 헤더를 간결하게 렌더링한다', () => {
    const html = renderToString(
      <AdminProgramCardsView
        programGroups={mockGroups}
        locationPresets={mockLocations}
        onOpenCreateCard={vi.fn()}
        onOpenEditCard={vi.fn()}
        onRequestDeleteCard={vi.fn()}
        onAddRehearsal={vi.fn()}
        onDuplicateSeries={vi.fn()}
        onToggleArchiveGroup={vi.fn()}
        onSelectScheduleForEdit={vi.fn()}
        onCloneSchedule={vi.fn()}
        onDeleteSchedule={vi.fn()}
      />
    );

    expect(html).toContain('2026 하반기 정기연습');
    expect(html).toContain('정기연습');
    expect(html).toContain('1');
    expect(html).toContain('회');
  });

  it('등록된 카드가 없을 때 빈 목록 안내 문구를 렌더링한다', () => {
    const html = renderToString(
      <AdminProgramCardsView
        programGroups={[]}
        locationPresets={mockLocations}
        onOpenCreateCard={vi.fn()}
        onOpenEditCard={vi.fn()}
        onRequestDeleteCard={vi.fn()}
        onAddRehearsal={vi.fn()}
        onDuplicateSeries={vi.fn()}
        onToggleArchiveGroup={vi.fn()}
        onSelectScheduleForEdit={vi.fn()}
        onCloneSchedule={vi.fn()}
        onDeleteSchedule={vi.fn()}
      />
    );

    expect(html).toContain('등록된 일정 카드가 없습니다.');
    expect(html).toContain('+ 카드 등록');
  });
});
