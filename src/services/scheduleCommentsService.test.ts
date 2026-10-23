import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Member } from '../types/rollbook';
import { SheetsService, resetStorage } from './sheets';

const URL = 'https://script.google.com/macros/s/test/exec';

const member = (id: string, name: string, extra: Partial<Member> = {}): Member => ({
  id,
  name,
  part: '소프라노',
  phoneLast4: '1111',
  role: 'MEMBER',
  status: 'ACTIVE',
  createdAt: '2026-01-01 00:00:00',
  joinedAt: '2026-01-01',
  memberStatus: '정단원',
  ...extra,
});

const kim = member('m1', '김하은');
const lee = member('m2', '이서연');

interface Posted {
  action: string;
  data: Record<string, unknown>;
}

interface FakeBackend {
  posts: Posted[];
  failPosts: boolean;
  /** GET 응답에 실을 댓글 행 */
  commentRows: Array<Record<string, unknown>>;
}

function installBackend(): FakeBackend {
  const backend: FakeBackend = { posts: [], failPosts: false, commentRows: [] };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: { method?: string; body?: string }) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(init.body ?? '{}') as Posted;
        backend.posts.push(body);
        if (backend.failPosts) return { ok: false, status: 500, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => ({ success: true }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { members: [kim, lee], schedules: [], logs: [], comments: backend.commentRows },
        }),
      };
    })
  );
  return backend;
}

describe('SheetsService 일정 댓글', () => {
  let service: SheetsService;
  let backend: FakeBackend;

  beforeEach(() => {
    resetStorage();
    backend = installBackend();
    service = new SheetsService();
    service.updateConfig({ sheetsWebAppUrl: URL });
    service.seedTestData({ members: [kim, lee] });
  });

  /** 설정 저장 등 다른 요청을 빼고 댓글 요청만 본다 */
  const commentPosts = () => backend.posts.filter((p) => p.action.endsWith('_COMMENT'));

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('댓글을 쓰면 시트가 저장을 확인한 뒤에 목록에 나타난다', async () => {
    const event = await service.addComment({ scheduleId: 's1', member: kim, text: '  늦을 것 같아요  ', deviceId: 'dev_a' });

    expect(commentPosts()).toHaveLength(1);
    expect(commentPosts()[0].action).toBe('ADD_COMMENT');
    expect(commentPosts()[0].data).toMatchObject({ scheduleId: 's1', memberId: 'm1', text: '늦을 것 같아요', deviceId: 'dev_a', action: 'CREATE' });
    expect(service.getComments('s1').map((c) => [c.id, c.text])).toEqual([[event.id, '늦을 것 같아요']]);
  });

  it('저장이 확인되지 않으면 오류를 알리고 목록에 넣지 않으며, 같은 id로 다시 시도하면 한 번만 쌓인다', async () => {
    backend.failPosts = true;
    await expect(service.addComment({ scheduleId: 's1', member: kim, text: '안녕', eventId: 'cmt_retry' })).rejects.toThrow();
    expect(service.getComments('s1')).toHaveLength(0);

    backend.failPosts = false;
    await service.addComment({ scheduleId: 's1', member: kim, text: '안녕', eventId: 'cmt_retry' });
    expect(service.getComments('s1')).toHaveLength(1);

    const postsBefore = commentPosts().length;
    await service.addComment({ scheduleId: 's1', member: kim, text: '안녕', eventId: 'cmt_retry' });
    expect(service.getComments('s1')).toHaveLength(1);
    expect(commentPosts()).toHaveLength(postsBefore); // 이미 반영된 id는 다시 보내지 않는다
  });

  it('빈 글과 500자 초과는 시트로 보내지 않고 거부한다', async () => {
    await expect(service.addComment({ scheduleId: 's1', member: kim, text: '   ' })).rejects.toThrow('입력');
    await expect(service.addComment({ scheduleId: 's1', member: kim, text: 'a'.repeat(501) })).rejects.toThrow('500');
    expect(commentPosts()).toHaveLength(0);
  });

  it('내 댓글을 수정하면 수정본이 보이고 EDIT 요청이 원 댓글을 가리킨다', async () => {
    const created = await service.addComment({ scheduleId: 's1', member: kim, text: '원문' });
    await service.editComment({ commentId: created.id, member: kim, text: '수정본', deviceId: 'dev_a' });

    expect(commentPosts()[1].action).toBe('EDIT_COMMENT');
    expect(commentPosts()[1].data).toMatchObject({ targetId: created.id, scheduleId: 's1', action: 'EDIT' });
    const [comment] = service.getComments('s1');
    expect(comment.text).toBe('수정본');
    expect(comment.editedAt).toBeDefined();
  });

  it('남의 댓글은 수정·삭제할 수 없고 시트로 요청도 보내지 않는다', async () => {
    const created = await service.addComment({ scheduleId: 's1', member: kim, text: '김하은 댓글' });
    const postsBefore = commentPosts().length;

    await expect(service.editComment({ commentId: created.id, member: lee, text: '변조' })).rejects.toThrow('본인');
    await expect(service.deleteComment({ commentId: created.id, member: lee })).rejects.toThrow('본인');
    expect(commentPosts()).toHaveLength(postsBefore);
    expect(service.getComments('s1')[0].text).toBe('김하은 댓글');
  });

  it('삭제하면 목록에서 사라지고 DELETE 요청이 기기와 함께 간다', async () => {
    const created = await service.addComment({ scheduleId: 's1', member: kim, text: '지울 댓글' });
    await service.deleteComment({ commentId: created.id, member: kim, deviceId: 'dev_b' });

    expect(commentPosts()[1].action).toBe('DELETE_COMMENT');
    expect(commentPosts()[1].data).toMatchObject({ targetId: created.id, deviceId: 'dev_b', action: 'DELETE' });
    expect(service.getComments('s1')).toEqual([]);
    await expect(service.editComment({ commentId: created.id, member: kim, text: '다시' })).rejects.toThrow('찾을 수 없');
  });

  it('통합된 단원(별칭)도 같은 사람의 댓글로 인식한다', async () => {
    const old = member('m_old', '김하은(구)', { status: 'MERGED', mergedIntoId: 'm1' });
    service.seedTestData({ members: [kim, lee, old] });
    const created = await service.addComment({ scheduleId: 's1', member: old, text: '예전 계정으로 쓴 글' });

    const [comment] = service.getComments('s1');
    expect(service.isOwnComment(comment, 'm1')).toBe(true); // 대표 계정에서도 내 댓글
    expect(service.isOwnComment(comment, 'm2')).toBe(false);
    await expect(service.editComment({ commentId: created.id, member: kim, text: '대표 계정에서 수정' })).resolves.toBeDefined();
  });

  it('시트에서 받아온 댓글 행을 목록과 일정별 개수로 보여준다', async () => {
    backend.commentRows = [
      { id: 'c1', scheduleId: 's1', memberId: 'm1', memberName: '김하은', part: '소프라노', action: 'CREATE', text: '하나', timestamp: '2026-10-29 18:00:00' },
      { id: 'c2', scheduleId: 's1', memberId: 'm2', memberName: '이서연', part: '소프라노', action: 'CREATE', text: '둘', timestamp: '2026-10-29 18:05:00' },
      { id: 'c3', scheduleId: 's2', memberId: 'm1', memberName: '김하은', part: '소프라노', action: 'CREATE', text: '다른 일정', timestamp: '2026-10-29 18:06:00' },
      { id: 'd1', scheduleId: 's1', memberId: 'm2', memberName: '이서연', part: '소프라노', action: 'DELETE', targetId: 'c2', text: '', timestamp: '2026-10-29 18:10:00' },
    ];
    await service.refreshRemoteData({ force: true });

    expect(service.getComments('s1').map((c) => c.id)).toEqual(['c1']);
    expect(service.getCommentCounts().get('s1')).toBe(1);
    expect(service.getCommentCounts().get('s2')).toBe(1);
  });

  it('시트 주소가 없으면(로컬 시험) 요청 없이 이 기기에만 저장한다', async () => {
    const local = new SheetsService();
    local.updateConfig({ sheetsWebAppUrl: '' });
    local.seedTestData({ members: [kim] });
    await local.addComment({ scheduleId: 's1', member: kim, text: '로컬 댓글' });

    expect(local.getComments('s1')).toHaveLength(1);
    expect(commentPosts()).toHaveLength(0);
  });
});
