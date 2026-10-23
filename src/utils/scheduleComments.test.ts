import { describe, expect, it } from 'vitest';
import type { ScheduleCommentEvent } from '../types/rollbook';
import { COMMENT_MAX_LENGTH, buildScheduleComments, formatCommentTime, normalizeCommentText } from './scheduleComments';

const ev = (overrides: Partial<ScheduleCommentEvent>): ScheduleCommentEvent => ({
  id: 'c1',
  scheduleId: 's1',
  memberId: 'm1',
  memberName: '김하은',
  part: '소프라노',
  action: 'CREATE',
  text: '안녕하세요',
  timestamp: '2026-10-29 18:00:00',
  ...overrides,
});

describe('buildScheduleComments', () => {
  it('쓴 순서대로 댓글을 만든다', () => {
    const list = buildScheduleComments([ev({ id: 'c1' }), ev({ id: 'c2', text: '두 번째', timestamp: '2026-10-29 18:05:00' })]);
    expect(list.map((c) => [c.id, c.text])).toEqual([['c1', '안녕하세요'], ['c2', '두 번째']]);
  });

  it('가장 최근 수정본을 보여주고 수정 시각을 남긴다', () => {
    const list = buildScheduleComments([
      ev({}),
      ev({ id: 'e1', action: 'EDIT', targetId: 'c1', text: '수정 1', timestamp: '2026-10-29 18:10:00' }),
      ev({ id: 'e2', action: 'EDIT', targetId: 'c1', text: '수정 2', timestamp: '2026-10-29 18:20:00' }),
    ]);
    expect(list[0].text).toBe('수정 2');
    expect(list[0].editedAt).toBe('2026-10-29 18:20:00');
    expect(list[0].createdAt).toBe('2026-10-29 18:00:00');
  });

  it('삭제된 댓글은 목록에서 빠진다', () => {
    const list = buildScheduleComments([ev({}), ev({ id: 'd1', action: 'DELETE', targetId: 'c1', text: undefined })]);
    expect(list).toEqual([]);
  });

  it('삭제된 뒤의 수정과 원본이 없는 수정·삭제는 무시한다', () => {
    const list = buildScheduleComments([
      ev({}),
      ev({ id: 'd1', action: 'DELETE', targetId: 'c1' }),
      ev({ id: 'e1', action: 'EDIT', targetId: 'c1', text: '되살리기 시도' }),
      ev({ id: 'e2', action: 'EDIT', targetId: 'nope', text: '고아 수정' }),
      ev({ id: 'd2', action: 'DELETE', targetId: 'nope' }),
    ]);
    expect(list).toEqual([]);
  });

  it('작성자가 아닌 사람의 수정·삭제는 무시하고 통합된 별칭은 같은 사람으로 본다', () => {
    const events = [
      ev({}),
      ev({ id: 'e1', action: 'EDIT', targetId: 'c1', memberId: 'x9', text: '변조' }),
      ev({ id: 'd1', action: 'DELETE', targetId: 'c1', memberId: 'x9' }),
    ];
    expect(buildScheduleComments(events)[0].text).toBe('안녕하세요');

    const alias = [ev({}), ev({ id: 'e2', action: 'EDIT', targetId: 'c1', memberId: 'm2', text: '대표 계정 수정' })];
    const same = (a: string, b: string) => a === b || (a === 'm1' && b === 'm2') || (a === 'm2' && b === 'm1');
    expect(buildScheduleComments(alias, same)[0].text).toBe('대표 계정 수정');
  });

  it('같은 id의 CREATE가 중복돼도 한 번만 보인다', () => {
    expect(buildScheduleComments([ev({}), ev({})])).toHaveLength(1);
  });
});

describe('normalizeCommentText', () => {
  it('앞뒤 공백을 지우고 빈 글과 500자 초과를 거부한다', () => {
    expect(normalizeCommentText('  안녕  ').text).toBe('안녕');
    expect(normalizeCommentText('   ').error).toBeDefined();
    expect(normalizeCommentText('a'.repeat(COMMENT_MAX_LENGTH)).error).toBeUndefined();
    expect(normalizeCommentText('a'.repeat(COMMENT_MAX_LENGTH + 1)).error).toBeDefined();
  });
});

describe('formatCommentTime', () => {
  it('오늘은 시:분, 다른 날은 월/일 시:분으로 보여준다', () => {
    expect(formatCommentTime('2026-10-29 18:05:00', '2026-10-29')).toBe('18:05');
    expect(formatCommentTime('2026-10-28 21:30:00', '2026-10-29')).toBe('10/28 21:30');
    expect(formatCommentTime('이상한 값', '2026-10-29')).toBe('이상한 값');
  });
});
