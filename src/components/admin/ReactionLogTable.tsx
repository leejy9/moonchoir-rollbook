import React from 'react';
import type {
  CommentReactionEvent,
  Member,
  Schedule,
  ScheduleCommentEvent,
} from '../../types/rollbook';
import { getKSTDateString, getKSTTimestampString } from '../../utils/date';
import { resolveMemberIdentity } from '../../utils/memberIdentity';
import { buildScheduleComments } from '../../utils/scheduleComments';
import { parseServerTimeMs } from '../../utils/serverTime';

interface ReactionLogTableProps {
  reactions: CommentReactionEvent[];
  commentEvents: ScheduleCommentEvent[];
  members: Member[];
  scheduleMap: Map<string, Schedule>;
  rangeBounds: { start: string | null; end: string | null };
  searchQuery: string;
  sortField: 'timestamp' | 'memberName';
  sortOrder: 'asc' | 'desc';
  onToggleSort: (field: 'timestamp' | 'memberName') => void;
}

export const ReactionLogTable: React.FC<ReactionLogTableProps> = ({
  reactions,
  commentEvents,
  members,
  scheduleMap,
  rangeBounds,
  searchQuery,
  sortField,
  sortOrder,
  onToggleSort,
}) => {
  const memberById = new Map(members.map((m) => [m.id, m]));
  const isSameMember = (a: string, b: string) =>
    a === b ||
    resolveMemberIdentity(a, members).canonicalId ===
      resolveMemberIdentity(b, members).canonicalId;

  const activeCommentsById = new Map(
    buildScheduleComments(commentEvents, isSameMember).map((c) => [c.id, c])
  );

  const rows = reactions
    .map((r) => {
      const ms = parseServerTimeMs(r.receivedAt);
      const kstDate = Number.isNaN(ms) ? '' : getKSTDateString(new Date(ms));
      const kstTimestamp = Number.isNaN(ms) ? '-' : getKSTTimestampString(new Date(ms));
      const memberName = memberById.get(r.memberId)?.name ?? r.memberId;
      const activeComment = activeCommentsById.get(r.commentId);
      const commentPreview = activeComment
        ? activeComment.text.slice(0, 30)
        : '(삭제된 댓글)';
      const scheduleTitle = scheduleMap.get(r.scheduleId)?.title ?? r.scheduleId;
      return {
        event: r,
        ms: Number.isNaN(ms) ? 0 : ms,
        kstDate,
        kstTimestamp,
        memberName,
        actionLabel: r.action === 'ADD' ? '추가' : '취소',
        commentPreview,
        scheduleTitle,
      };
    })
    .filter((row) => {
      if (rangeBounds.start && (!row.kstDate || row.kstDate < rangeBounds.start)) return false;
      if (rangeBounds.end && (!row.kstDate || row.kstDate > rangeBounds.end)) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        row.memberName.toLowerCase().includes(q) ||
        row.event.emoji.includes(q) ||
        row.actionLabel.includes(q) ||
        row.commentPreview.toLowerCase().includes(q) ||
        row.scheduleTitle.toLowerCase().includes(q) ||
        (row.event.deviceId && row.event.deviceId.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => {
      if (sortField === 'memberName') {
        const cmp = a.memberName.localeCompare(b.memberName, 'ko');
        return sortOrder === 'asc' ? cmp : -cmp;
      }
      const cmp = a.ms - b.ms;
      return sortOrder === 'asc' ? cmp : -cmp;
    });

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
      <thead>
        <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border-default)', color: 'var(--text-muted)' }}>
          <th
            onClick={() => onToggleSort('timestamp')}
            style={{ padding: '10px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}
            title="클릭하여 시각 정렬"
          >
            시각 (KST) {sortField === 'timestamp' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'}
          </th>
          <th
            onClick={() => onToggleSort('memberName')}
            style={{ padding: '10px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}
            title="클릭하여 단원명 정렬"
          >
            단원 {sortField === 'memberName' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'}
          </th>
          <th style={{ padding: '10px 12px' }}>이모지</th>
          <th style={{ padding: '10px 12px' }}>동작</th>
          <th style={{ padding: '10px 12px' }}>댓글</th>
          <th style={{ padding: '10px 12px' }}>일정 제목</th>
          <th style={{ padding: '10px 12px' }}>기기</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
              조건에 일치하는 반응 이력이 없습니다.
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={row.event.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <td style={{ padding: '8px 12px', color: 'var(--text-sub)', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                {row.kstTimestamp}
              </td>
              <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-main)' }}>{row.memberName}</td>
              <td style={{ padding: '8px 12px', fontSize: '15px' }}>{row.event.emoji}</td>
              <td style={{ padding: '8px 12px', color: row.event.action === 'ADD' ? 'var(--status-success)' : 'var(--status-danger)' }}>
                {row.actionLabel}
              </td>
              <td style={{ padding: '8px 12px', color: 'var(--text-main)' }}>{row.commentPreview}</td>
              <td style={{ padding: '8px 12px', color: 'var(--text-sub)' }}>{row.scheduleTitle}</td>
              <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                {row.event.deviceId || '-'}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
};
