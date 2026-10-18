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

    expect(html).toContain('연습 및 연주 일정 등록 (반복 엔진)');
    expect(html).toContain('1회성 단일 일정');
    expect(html).toContain('요일별 주간 반복');
    expect(html).toContain('간격 주기 반복');
    expect(html).toContain('달력에서 콕콕 선택');
    expect(html).toContain('소속 일정 카드 (컨테이너)');
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

    expect(html).toContain('✏️ 일정 인라인 수정');
    expect(html).toContain('모차르트 집중 연습 1회차');
    expect(html).toContain('✕ 신규 등록으로 복귀');
    expect(html).toContain('💾 수정 내용 저장');
  });
});
