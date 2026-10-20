import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { AdminScheduleForm } from './AdminScheduleForm';
import type { LocationPreset, Member, Schedule, ProgramCard } from '../../types/rollbook';

describe('AdminScheduleForm Component', () => {
  const dummyLocations: LocationPreset[] = [
    { id: 'loc_1', name: '서초 연습실', latitude: 37.5, longitude: 127.0, radiusMeters: 100 },
  ];
  const dummyMembers: Member[] = [
    {
      id: 'mem_1',
      name: '이단원',
      part: 'Alto',
      phoneLast4: '5678',
      status: 'ACTIVE',
      role: 'MEMBER',
      createdAt: '2026-01-01T00:00:00Z',
    },
  ];
  const dummyCards: ProgramCard[] = [
    {
      id: 'card_1',
      title: '2026 하반기 정기연습',
      category: '정기연습',
      isArchived: false,
      createdAt: '2026-01-01T00:00:00Z',
    },
  ];

  it('renders creation form with mode tabs when editingSchedule is null', () => {
    const html = renderToString(
      <AdminScheduleForm
        editingSchedule={null}
        programCards={dummyCards}
        dynamicCategories={['정기연습', '추가연습', '연주']}
        dynamicParts={['Soprano', 'Alto', 'Tenor', 'Bass']}
        locationPresets={dummyLocations}
        members={dummyMembers}
        onSave={vi.fn()}
        onCancelEdit={vi.fn()}
        onOpenCreateCard={vi.fn()}
        onOpenEditCard={vi.fn()}
        onOpenLocationPickerModal={vi.fn()}
      />
    );

    expect(html).toContain('일정 등록');
    expect(html).toContain('단일');
    expect(html).toContain('매주');
    expect(html).toContain('주기');
    expect(html).toContain('직접선택');
    expect(html).toContain('카드');
    expect(html).toContain('Soprano, Alto, Tenor, Bass');
  });

  it('renders edit form when editingSchedule is provided', () => {
    const sampleSchedule: Schedule = {
      id: 'sch_1',
      title: '모차르트 집중 연습 1회차',
      date: '2026-10-22',
      startTime: '19:30',
      endTime: '21:30',
      locationName: '서초 연습실',
      category: '정기연습',
    };

    const html = renderToString(
      <AdminScheduleForm
        editingSchedule={sampleSchedule}
        programCards={dummyCards}
        dynamicCategories={['정기연습']}
        dynamicParts={['Soprano']}
        locationPresets={dummyLocations}
        members={dummyMembers}
        onSave={vi.fn()}
        onCancelEdit={vi.fn()}
        onOpenCreateCard={vi.fn()}
        onOpenEditCard={vi.fn()}
        onOpenLocationPickerModal={vi.fn()}
      />
    );

    expect(html).toContain('일정 수정');
    expect(html).toContain('모차르트 집중 연습 1회차');
    expect(html).toContain('← 뒤로');
    expect(html).toContain('저장');
  });
});
