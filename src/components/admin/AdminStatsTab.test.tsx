import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { AdminStatsTab } from './AdminStatsTab';
import type { CumulativeMemberAttendance } from '../../types/rollbook';

const mockSummaries: CumulativeMemberAttendance[] = [
  {
    memberId: 'mem_1',
    memberName: '김철수',
    part: '테너',
    memberStatus: '정단원',
    totalSessions: 10,
    attended: 9,
    late: 1,
    excused: 0,
    absent: 0,
    attendanceRate: 90,
    recentStatusList: ['출석', '출석', '출석', '지각'],
    badges: ['우수'],
  },
  {
    memberId: 'mem_2',
    memberName: '이영희',
    part: '소프라노',
    memberStatus: '정단원',
    totalSessions: 10,
    attended: 10,
    late: 0,
    excused: 0,
    absent: 0,
    attendanceRate: 100,
    recentStatusList: ['출석', '출석', '출석', '출석'],
    badges: ['개근'],
  },
];

describe('AdminStatsTab Component', () => {
  it('통계 대시보드 및 단원 성적표를 온전히 렌더링한다', () => {
    const html = renderToString(
      <AdminStatsTab
        periodOption="3M"
        setPeriodOption={vi.fn()}
        partFilter="전체"
        setPartFilter={vi.fn()}
        memberStatusFilter="전체"
        setMemberStatusFilter={vi.fn()}
        searchQuery=""
        setSearchQuery={vi.fn()}
        selectedMemberIds={new Set(['mem_1'])}
        cumulativeSessions={[{ id: 'sch_1' } as any, { id: 'sch_2' } as any]}
        filteredSummaries={mockSummaries}
        selectedSummaries={[mockSummaries[0]]}
        selectedAvgRate={90}
        toggleSelectMember={vi.fn()}
        selectAllFiltered={vi.fn()}
        clearSelection={vi.fn()}
        dynamicParts={['소프라노', '알토', '테너', '베이스']}
        dynamicMemberStatuses={['정단원', '신입단원', '수습단원', '휴단원']}
      />
    );

    expect(html).toContain('조회 기간 설정');
    expect(html).toContain('최근 3개월');
    expect(html).toContain('비교 분석');
    expect(html).toContain('김철수');
    expect(html).toContain('이영희');
    expect(html).toContain('90');
    expect(html).toContain('100');
    expect(html).toContain('개근');
  });

  it('선택된 대원이 없을 때 비교 분석 카드가 표시되지 않는다', () => {
    const html = renderToString(
      <AdminStatsTab
        periodOption="1M"
        setPeriodOption={vi.fn()}
        partFilter="전체"
        setPartFilter={vi.fn()}
        memberStatusFilter="전체"
        setMemberStatusFilter={vi.fn()}
        searchQuery=""
        setSearchQuery={vi.fn()}
        selectedMemberIds={new Set()}
        cumulativeSessions={[]}
        filteredSummaries={[]}
        selectedSummaries={[]}
        selectedAvgRate={0}
        toggleSelectMember={vi.fn()}
        selectAllFiltered={vi.fn()}
        clearSelection={vi.fn()}
        dynamicParts={['소프라노', '알토']}
        dynamicMemberStatuses={['정단원']}
      />
    );

    expect(html).not.toContain('비교 분석');
    expect(html).toContain('선택한 조건에 일치하는 대원이 없습니다.');
  });
});
