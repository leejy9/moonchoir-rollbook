import React, { useEffect, useRef, useState } from 'react';
import { getOrCreateDeviceId } from '../../services/auth';
import { sheetsService } from '../../services/sheets';
import type { Member, PartType, ScheduleComment } from '../../types/rollbook';
import { getKSTDateString } from '../../utils/date';
import { COMMENT_MAX_LENGTH, COMMENT_PAGE_SIZE, createCommentEventId, formatCommentTime } from '../../utils/scheduleComments';

interface ScheduleCommentsProps {
  scheduleId: string;
  author: Pick<Member, 'id' | 'name' | 'part'>;
  /** 시험·시안에서 처음부터 펼쳐 둘 때만 사용 */
  defaultExpanded?: boolean;
}

const PART_CLASS: Record<string, string> = {
  소프라노: 'part-소프라노',
  알토: 'part-알토',
  테너: 'part-테너',
  베이스: 'part-베이스',
};

const partClass = (part: PartType | string) => PART_CLASS[part] ?? 'part-guest';

const ChevronIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

/**
 * 투표 현황 카드 맨 아래에 붙는 접고 펴는 댓글 영역.
 * 일정이 바뀌면 입력 중이던 상태가 남지 않도록 호출하는 쪽에서 `key={scheduleId}`를 준다.
 */
export const ScheduleComments: React.FC<ScheduleCommentsProps> = ({ scheduleId, author, defaultExpanded = false }) => {
  const [, setTick] = useState(0);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showAll, setShowAll] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [menuId, setMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // 같은 댓글을 다시 보낼 때 같은 id를 써서 중복 저장을 막는다(성공하면 비운다)
  const pendingEventId = useRef<string | null>(null);

  // 시트에서 새로 받아오면 목록을 다시 그린다
  useEffect(() => sheetsService.subscribeSync(() => setTick((t) => t + 1)), []);

  const comments = sheetsService.getComments(scheduleId);
  const visible = showAll ? comments : comments.slice(-COMMENT_PAGE_SIZE);
  const hiddenCount = comments.length - visible.length;
  const todayStr = getKSTDateString();

  const run = async (task: () => Promise<unknown>, onDone?: () => void) => {
    setBusy(true);
    setError('');
    try {
      await task();
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '댓글을 저장하지 못했습니다. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
      setTick((t) => t + 1);
    }
  };

  const submit = () => {
    if (!text.trim() || busy) return;
    pendingEventId.current ??= createCommentEventId();
    void run(
      () =>
        sheetsService.addComment({
          scheduleId,
          member: author,
          text,
          deviceId: getOrCreateDeviceId(),
          eventId: pendingEventId.current ?? undefined,
        }),
      () => {
        setText('');
        pendingEventId.current = null;
      }
    );
  };

  const saveEdit = (comment: ScheduleComment) => {
    if (!editText.trim() || busy) return;
    void run(
      () => sheetsService.editComment({ commentId: comment.id, member: author, text: editText, deviceId: getOrCreateDeviceId() }),
      () => setEditingId(null)
    );
  };

  const remove = (comment: ScheduleComment) => {
    void run(
      () => sheetsService.deleteComment({ commentId: comment.id, member: author, deviceId: getOrCreateDeviceId() }),
      () => setConfirmDeleteId(null)
    );
  };

  return (
    <div className="sc-wrap">
      <button
        type="button"
        className="sc-toggle"
        aria-expanded={expanded}
        aria-label={`댓글 ${expanded ? '접기' : '펼치기'}`}
        onClick={() => setExpanded((v) => !v)}
      >
        <span>댓글 {comments.length}</span>
        <span className={`sc-chevron ${expanded ? 'open' : ''}`}>
          <ChevronIcon />
        </span>
      </button>

      {expanded && (
        <div className="sc-body">
          {hiddenCount > 0 && (
            <button type="button" className="sc-more" onClick={() => setShowAll(true)}>
              이전 댓글 {hiddenCount}개 더 보기
            </button>
          )}

          {comments.length === 0 ? (
            <div className="sc-empty">댓글이 없습니다</div>
          ) : (
            <ul className="sc-list">
              {visible.map((comment) => {
                const mine = sheetsService.isOwnComment(comment, author.id);
                return (
                  <li key={comment.id} className="sc-item">
                    <div className="sc-avatar">{comment.memberName.slice(0, 1)}</div>
                    <div className="sc-main">
                      <div className="sc-head">
                        <strong>{comment.memberName}</strong>
                        <span className={`part-badge ${partClass(comment.part)}`}>{comment.part}</span>
                        {mine && editingId !== comment.id && (
                          <button
                            type="button"
                            className="sc-menu-btn"
                            aria-label="내 댓글 메뉴"
                            onClick={() => {
                              setMenuId(menuId === comment.id ? null : comment.id);
                              setConfirmDeleteId(null);
                            }}
                          >
                            ⋯
                          </button>
                        )}
                      </div>

                      {editingId === comment.id ? (
                        <div className="sc-edit">
                          <textarea
                            className="sc-textarea"
                            value={editText}
                            maxLength={COMMENT_MAX_LENGTH}
                            onChange={(e) => setEditText(e.target.value)}
                            aria-label="댓글 수정"
                          />
                          <div className="sc-actions">
                            <button type="button" className="sc-btn primary" disabled={busy || !editText.trim()} onClick={() => saveEdit(comment)}>
                              저장
                            </button>
                            <button type="button" className="sc-btn" onClick={() => setEditingId(null)}>
                              취소
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="sc-text">{comment.text}</div>
                          <div className="sc-meta">
                            <span>{formatCommentTime(comment.createdAt, todayStr)}</span>
                            {comment.editedAt && <span>· 수정됨</span>}
                          </div>
                        </>
                      )}

                      {menuId === comment.id && (
                        <div className="sc-actions">
                          <button
                            type="button"
                            className="sc-btn"
                            onClick={() => {
                              setEditingId(comment.id);
                              setEditText(comment.text);
                              setMenuId(null);
                            }}
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            className="sc-btn danger"
                            onClick={() => {
                              setConfirmDeleteId(comment.id);
                              setMenuId(null);
                            }}
                          >
                            삭제
                          </button>
                        </div>
                      )}

                      {confirmDeleteId === comment.id && (
                        <div className="sc-actions">
                          <button type="button" className="sc-btn danger" disabled={busy} onClick={() => remove(comment)}>
                            삭제하기
                          </button>
                          <button type="button" className="sc-btn" onClick={() => setConfirmDeleteId(null)}>
                            취소
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="sc-composer">
            <textarea
              className="sc-textarea"
              placeholder="댓글 입력"
              value={text}
              maxLength={COMMENT_MAX_LENGTH}
              onChange={(e) => setText(e.target.value)}
              aria-label="댓글 입력"
            />
            <button type="button" className="sc-send" disabled={busy || !text.trim()} onClick={submit}>
              {busy ? '저장 중' : '등록'}
            </button>
          </div>
          {error && (
            <div role="alert" className="sc-error">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
