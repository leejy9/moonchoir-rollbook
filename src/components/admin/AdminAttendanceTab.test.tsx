import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { AdminAttendanceTab } from './AdminAttendanceTab';
import type { Member, Schedule } from '../../types/rollbook';

const mockMembers: Member[] = [
  {
    id: 'mem_1',
    name: '김철수',
    part: '테너',
    phoneLast4: '1234',
    role: 'MEMBER',
    status: 'ACTIVE',
    joinedAt: '2026-01-01',
    memberStatus: '정단원',
    createdAt: '2026-01-01T00:00:00Z',
  },
];

const mockSchedules: Schedule[] = [
  {
    id: 'sch_1',
    title: '정기연습 1회차',
    date: '2026-10-18',
    startTime: '19:00',
    endTime: '21:00',
    locationName: '서초 연습실',
    category: '정기연습',
  },
];

describe('AdminAttendanceTab Component', () => {
  it('Notion 필터 바 및 매트릭스 그리드를 온전히 렌더링한다', () => {
    const html = renderToString(
      <AdminAttendanceTab
        members={mockMembers}
        schedules={mockSchedules}
        onDataChanged={vi.fn()}
        dynamicParts={['소프라노', '알토', '테너', '베이스']}
        dynamicMemberStatuses={['정단원', '신입단원', '수습단원', '휴단원']}
        selectedMemberForModal={null}
        isProfileModalOpen={false}
        setIsProfileModalOpen={vi.fn()}
        handleOpenAddMemberModal={vi.fn()}
        handleOpenEditMemberModal={vi.fn()}
        handleSaveMemberProfile={vi.fn()}
        handleDeleteMemberProfile={vi.fn()}
      />
    );

    // Filter Bar & Grid Rendering verification
    expect(html).toContain('김철수');
    expect(html).toContain('테너');
  });
});
