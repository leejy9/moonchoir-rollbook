import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type {
  CommentReactionEvent,
  Member,
  Schedule,
  ScheduleCommentEvent,
} from '../../types/rollbook';
import { ReactionLogTable } from './ReactionLogTable';

const members: Member[] = [
  {
    id: 'm1',
    name: '이하은',
    part: '알토',
    phoneLast4: '',
    role: 'MEMBER',
    status: 'ACTIVE',
    createdAt: '',
    joinedAt: '2026-01-01',
    memberStatus: '정단원',
  },
  {
    id: 'm1b',
    name: '이하은_구',
    part: '알토',
    phoneLast4: '',
    role: 'MEMBER',
    status: 'MERGED',
    mergedIntoId: 'm1',
    createdAt: '',
    joinedAt: '2026-01-01',
    memberStatus: '정단원',
  },
  {
    id: 'm2',
    name: '민지',
    part: '소프라노',
    phoneLast4: '',
    role: 'MEMBER',
    status: 'ACTIVE',
    createdAt: '',
    joinedAt: '2026-01-01',
    memberStatus: '정단원',
  },
];

const scheduleMap = new Map<string, Schedule>([
  [
    's1',
    {
      id: 's1',
      title: '추가연습',
      date: '2026-11-28',
      startTime: '14:00',
      endTime: '17:00',
      locationName: '연습실',
      category: '추가연습',
    },
  ],
]);

describe('ReactionLogTable (W5 R9)', () => {
  it('renders raw ADD/REMOVE rows, (삭제된 댓글), alias row name, and KST date filtering', () => {
    const commentEvents: ScheduleCommentEvent[] = [
      {
        id: 'c1',
        scheduleId: 's1',
        memberId: 'm1',
        memberName: '이하은',
        part: '알토',
        action: 'CREATE',
        text: '살아있는 댓글',
        timestamp: '2026-11-27 09:00:00',
      },
      {
        id: 'c2',
        scheduleId: 's1',
        memberId: 'm1',
        memberName: '이하은',
        part: '알토',
        action: 'CREATE',
        text: '지울 댓글',
        timestamp: '2026-11-27 09:05:00',
      },
      {
        id: 'c2_del',
        scheduleId: 's1',
        memberId: 'm1',
        memberName: '이하은',
        part: '알토',
        action: 'DELETE',
        targetId: 'c2',
        timestamp: '2026-11-27 09:06:00',
      },
    ];

    const reactions: CommentReactionEvent[] = [
      {
        id: 'r1',
        commentId: 'c1',
        scheduleId: 's1',
        memberId: 'm2',
        emoji: '👏',
        action: 'ADD',
        // 2026-11-26 20:00 UTC = 2026-11-27 05:00 KST!
        receivedAt: '2026-11-26T20:00:00.000Z',
      },
      {
        id: 'r2',
        commentId: 'c1',
        scheduleId: 's1',
        memberId: 'm2',
        emoji: '👏',
        action: 'REMOVE',
        receivedAt: '2026-11-27T01:00:00.000Z',
      },
      {
        id: 'r3',
        commentId: 'c2',
        scheduleId: 's1',
        memberId: 'm1b',
        emoji: '👍',
        action: 'ADD',
        receivedAt: '2026-11-27T02:00:00.000Z',
      },
    ];

    const html = renderToString(
      <ReactionLogTable
        reactions={reactions}
        commentEvents={commentEvents}
        members={members}
        scheduleMap={scheduleMap}
        rangeBounds={{ start: '2026-11-27', end: '2026-11-27' }}
        searchQuery=""
        sortField="timestamp"
        sortOrder="desc"
        onToggleSort={() => {}}
      />
    ).replace(/<!-- -->/g, '');

    expect(html).toContain('2026-11-27 05:00:00');
    expect(html).toContain('추가');
    expect(html).toContain('취소');
    expect(html).toContain('(삭제된 댓글)');
    expect(html).toContain('이하은_구');
    expect(html).toContain('추가연습');
  });
});
