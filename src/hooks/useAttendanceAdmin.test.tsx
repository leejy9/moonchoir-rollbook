import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { useAttendanceAdmin, getPeriodRange, createManualLogMeta } from './useAttendanceAdmin';
import type { Member, Schedule } from '../types/rollbook';

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
  {
    id: 'mem_2',
    name: '이영희',
    part: '소프라노',
    phoneLast4: '5678',
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

describe('useAttendanceAdmin Hook', () => {
  it('초기 상태 및 출결/단원/통계 관리 인터페이스를 온전히 제공한다', () => {
    let hookResult: ReturnType<typeof useAttendanceAdmin> | undefined;

    function TestHarness() {
      // oxlint-disable-next-line react/globals
      hookResult = useAttendanceAdmin({
        schedules: mockSchedules,
        members: mockMembers,
        onDataChanged: vi.fn(),
      });
      return null;
    }

    renderToString(<TestHarness />);

    expect(hookResult).toBeDefined();
    const result = hookResult!;

    // 1. 단원 프로필 모달 상태
    expect(result.selectedMemberForModal).toBeNull();
    expect(result.isProfileModalOpen).toBe(false);
    expect(typeof result.handleOpenAddMemberModal).toBe('function');
    expect(typeof result.handleOpenEditMemberModal).toBe('function');
    expect(typeof result.handleSaveMemberProfile).toBe('function');
    expect(typeof result.handleDeleteMemberProfile).toBe('function');

    // 2. 회차별 출결 및 수동 인정
    expect(result.selectedScheduleId).toBe('sch_1');
    expect(result.currentSchedule?.id).toBe('sch_1');
    expect(result.sessionFilter).toBe('전체');
    expect(Array.isArray(result.reconciledList)).toBe(true);
    expect(Array.isArray(result.filteredSessionList)).toBe(true);
    expect(result.overrideTarget).toBeNull();
    expect(typeof result.handleManualOverrideSubmit).toBe('function');

    // 3. 누적 출결 통계 및 다중 선택
    expect(result.periodOption).toBe('3M');
    expect(result.partFilter).toBe('전체');
    expect(result.memberStatusFilter).toBe('전체');
    expect(result.searchQuery).toBe('');
    expect(typeof result.toggleSelectMember).toBe('function');
    expect(typeof result.selectAllFiltered).toBe('function');
    expect(typeof result.clearSelection).toBe('function');
  });

  it('getPeriodRange가 각 기간 옵션에 맞는 시작/종료 문자열을 안전하게 반환한다', () => {
    const rangeAll = getPeriodRange('ALL');
    expect(rangeAll.startStr).toBeUndefined();
    expect(rangeAll.endStr).toBeUndefined();

    const range3M = getPeriodRange('3M');
    expect(typeof range3M.startStr).toBe('string');
    expect(typeof range3M.endStr).toBe('string');
    expect(range3M.startStr! <= range3M.endStr!).toBe(true);
  });

  it('createManualLogMeta가 고유 id와 ISO 타임스탬프를 생성한다', () => {
    const meta = createManualLogMeta();
    expect(meta.id.startsWith('log_manual_')).toBe(true);
    expect(typeof meta.timestamp).toBe('string');
  });
});
