import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ScheduleComments } from './ScheduleComments';
import { resetStorage, sheetsService } from '../../services/sheets';
import type { Member } from '../../types/rollbook';

const member = (id: string, name: string): Member => ({
  id,
  name,
  part: '소프라노',
  phoneLast4: '1111',
  role: 'MEMBER',
  status: 'ACTIVE',
  createdAt: '2026-01-01 00:00:00',
  joinedAt: '2026-01-01',
  memberStatus: '정단원',
});

// 서버 렌더링이 글자 사이에 넣는 주석(<!-- -->)을 지워 문구를 이어 붙여 비교한다
const render = (node: React.ReactElement) => renderToString(node).replace(/<!-- -->/g, '');

const kim = member('m1', '김하은');
const lee = member('m2', '이서연');

describe('ScheduleComments', () => {
  beforeEach(() => {
    resetStorage();
    // 시험이 실제 시트로 요청을 보내지 않도록 모든 요청을 성공으로 응답한다
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true }) })));
    sheetsService.seedTestData({ members: [kim, lee] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('접힌 상태에서는 댓글 개수 줄만 보이고 입력창은 없다', async () => {
    await sheetsService.addComment({ scheduleId: 's1', member: lee, text: '안녕하세요' });
    const html = render(<ScheduleComments scheduleId="s1" author={kim} />);

    expect(html).toContain('댓글 1');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('<textarea');
    expect(html).not.toContain('안녕하세요');
  });

  it('펼치면 댓글 목록과 입력창이 보이고 등록 버튼은 비어 있으면 비활성이다', async () => {
    await sheetsService.addComment({ scheduleId: 's1', member: lee, text: '안녕하세요' });
    const html = render(<ScheduleComments scheduleId="s1" author={kim} defaultExpanded />);

    expect(html).toContain('안녕하세요');
    expect(html).toContain('이서연');
    expect(html).toContain('placeholder="댓글 입력"');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>등록<\/button>/);
  });

  it('내 댓글에만 ⋯ 메뉴가 있다', async () => {
    await sheetsService.addComment({ scheduleId: 's1', member: kim, text: '내 댓글' });
    await sheetsService.addComment({ scheduleId: 's1', member: lee, text: '남의 댓글' });
    const html = render(<ScheduleComments scheduleId="s1" author={kim} defaultExpanded />);

    expect(html.match(/aria-label="내 댓글 메뉴"/g)).toHaveLength(1);
  });

  it('수정한 댓글에는 수정됨이 표시된다', async () => {
    const created = await sheetsService.addComment({ scheduleId: 's1', member: kim, text: '원문' });
    await sheetsService.editComment({ commentId: created.id, member: kim, text: '수정본' });
    const html = render(<ScheduleComments scheduleId="s1" author={kim} defaultExpanded />);

    expect(html).toContain('수정본');
    expect(html).not.toContain('원문');
    expect(html).toContain('수정됨');
  });

  it('50개를 넘으면 최근 50개만 보이고 이전 댓글 더 보기가 나온다', async () => {
    for (let i = 1; i <= 53; i++) {
      await sheetsService.addComment({ scheduleId: 's1', member: lee, text: `댓글 번호 ${i}번` });
    }
    const html = render(<ScheduleComments scheduleId="s1" author={kim} defaultExpanded />);

    expect(html).toContain('이전 댓글 3개 더 보기');
    expect(html).toContain('댓글 번호 53번');
    expect(html).not.toContain('댓글 번호 3번');
    expect(html).toContain('댓글 번호 4번');
  });

  it('댓글이 없으면 안내 한 줄을 보여준다', () => {
    const html = render(<ScheduleComments scheduleId="s9" author={kim} defaultExpanded />);
    expect(html).toContain('댓글이 없습니다');
  });
});
