import React, { useEffect, useState } from 'react';
import { sheetsService } from '../../services/sheets';
import type { PartType } from '../../types/rollbook';
import { getKSTDateString } from '../../utils/date';
import { COMMENT_PAGE_SIZE, formatCommentTime } from '../../utils/scheduleComments';

const PART_CLASS: Record<string, string> = {
  소프라노: 'part-소프라노',
  알토: 'part-알토',
  테너: 'part-테너',
  베이스: 'part-베이스',
};

interface AdminScheduleCommentsProps {
  scheduleId: string;
}

/**
 * 관리자용 읽기 전용 댓글 목록(임시). 새 일정 화면이 만들어지면 일정 패널의 댓글 탭으로 옮긴다.
 * 수정·삭제는 단원 본인만 하며, 모든 기록은 시트 `일정댓글` 탭에 남는다.
 */
export const AdminScheduleComments: React.FC<AdminScheduleCommentsProps> = ({ scheduleId }) => {
  const [, setTick] = useState(0);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => sheetsService.subscribeSync(() => setTick((t) => t + 1)), []);

  const comments = sheetsService.getComments(scheduleId);
  const visible = showAll ? comments : comments.slice(-COMMENT_PAGE_SIZE);
  const hiddenCount = comments.length - visible.length;
  const todayStr = getKSTDateString();

  return (
    <div className="toss-section-card">
      <div className="section-title-row">
        <h3 className="section-title">댓글 {comments.length}</h3>
      </div>
      {hiddenCount > 0 && (
        <button type="button" className="sc-more" onClick={() => setShowAll(true)}>
          이전 댓글 {hiddenCount}개 더 보기
        </button>
      )}
      {comments.length === 0 ? (
        <div className="sc-empty">댓글이 없습니다</div>
      ) : (
        <ul className="sc-list">
          {visible.map((comment) => (
            <li key={comment.id} className="sc-item">
              <div className="sc-avatar">{comment.memberName.slice(0, 1)}</div>
              <div className="sc-main">
                <div className="sc-head">
                  <strong>{comment.memberName}</strong>
                  <span className={`part-badge ${PART_CLASS[comment.part as PartType] ?? 'part-guest'}`}>{comment.part}</span>
                </div>
                <div className="sc-text">{comment.text}</div>
                <div className="sc-meta">
                  <span>{formatCommentTime(comment.createdAt, todayStr)}</span>
                  {comment.editedAt && <span>· 수정됨</span>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
