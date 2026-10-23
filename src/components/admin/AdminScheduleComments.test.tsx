import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import type React from 'react';
import { AdminScheduleComments } from './AdminScheduleComments';
import { resetStorage, sheetsService } from '../../services/sheets';
import type { Member } from '../../types/rollbook';

const render = (node: React.ReactElement) => renderToString(node).replace(/<!-- -->/g, '');

const member = (id: string, name: string): Member => ({
  id,
  name,
  part: '알토',
  phoneLast4: '1111',
  role: 'MEMBER',
  status: 'ACTIVE',
  createdAt: '2026-01-01 00:00:00',
  joinedAt: '2026-01-01',
  memberStatus: '정단원',
});

describe('AdminScheduleComments', () => {
  beforeEach(() => {
    resetStorage();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true }) })));
    sheetsService.seedTestData({ members: [member('m1', '박지후')] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('그 일정의 댓글을 읽기 전용으로 보여주고 입력창·수정 버튼은 없다', async () => {
    const created = await sheetsService.addComment({ scheduleId: 's1', member: member('m1', '박지후'), text: '내일 악보 가져갈게요' });
    await sheetsService.editComment({ commentId: created.id, member: member('m1', '박지후'), text: '다음 주에 가져갈게요' });
    await sheetsService.addComment({ scheduleId: 's2', member: member('m1', '박지후'), text: '다른 일정 댓글' });

    const html = render(<AdminScheduleComments scheduleId="s1" />);
    expect(html).toContain('댓글 1');
    expect(html).toContain('박지후');
    expect(html).toContain('다음 주에 가져갈게요');
    expect(html).toContain('수정됨');
    expect(html).not.toContain('다른 일정 댓글');
    expect(html).not.toContain('<textarea');
    expect(html).not.toContain('내 댓글 메뉴');
  });

  it('삭제된 댓글은 보이지 않고 댓글이 없으면 안내를 보여준다', async () => {
    const created = await sheetsService.addComment({ scheduleId: 's1', member: member('m1', '박지후'), text: '지울 댓글' });
    await sheetsService.deleteComment({ commentId: created.id, member: member('m1', '박지후') });

    const html = render(<AdminScheduleComments scheduleId="s1" />);
    expect(html).toContain('댓글 0');
    expect(html).toContain('댓글이 없습니다');
    expect(html).not.toContain('지울 댓글');
  });
});
