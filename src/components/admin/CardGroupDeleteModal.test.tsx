import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { CardGroupDeleteModal } from './CardGroupDeleteModal';
import type { CardGroupToDelete } from '../../hooks/useScheduleAdmin';

const mockGroupWithSchedules: CardGroupToDelete = {
  cardId: 'card-1',
  title: '2026 가을 정기연습',
  category: '정기연습',
  isRegisteredCard: true,
  schedules: [
    {
      id: 'sch-1',
      title: '가을 정기연습 1회차',
      date: '2026-10-18',
      startTime: '19:30',
      endTime: '21:30',
      locationName: '중앙 연습실',
      category: '정기연습',
    },
  ],
};

const mockEmptyGroup: CardGroupToDelete = {
  cardId: 'card-2',
  title: '빈 연주회 카드',
  category: '연주',
  isRegisteredCard: true,
  schedules: [],
};

describe('CardGroupDeleteModal Component', () => {
  it('returns null when cardGroupToDelete is null', () => {
    const html = renderToString(
      <CardGroupDeleteModal
        cardGroupToDelete={null}
        onClose={vi.fn()}
        onDataChanged={vi.fn()}
        onSetSuccessMsg={vi.fn()}
      />
    );
    expect(html).toBe('');
  });

  it('renders modal with schedule handling options when group has schedules', () => {
    const html = renderToString(
      <CardGroupDeleteModal
        cardGroupToDelete={mockGroupWithSchedules}
        onClose={vi.fn()}
        onDataChanged={vi.fn()}
        onSetSuccessMsg={vi.fn()}
      />
    );
    expect(html).toContain('2026 가을 정기연습');
    expect(html).toContain('일정 카드 삭제 확인');
    expect(html).toContain('소속 일정');
    expect(html).toContain('모두 일괄 삭제');
    expect(html).toContain('카드만 삭제');
    expect(html).toContain('미분류로 보존');
  });

  it('renders simple delete button when group has no schedules', () => {
    const html = renderToString(
      <CardGroupDeleteModal
        cardGroupToDelete={mockEmptyGroup}
        onClose={vi.fn()}
        onDataChanged={vi.fn()}
        onSetSuccessMsg={vi.fn()}
      />
    );
    expect(html).toContain('빈 연주회 카드');
    expect(html).toContain('이 카드에 소속된 일정이 없습니다');
    expect(html).toContain('빈 카드 삭제하기');
  });
});
