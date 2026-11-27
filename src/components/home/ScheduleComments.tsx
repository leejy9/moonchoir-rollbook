import React, { useEffect, useRef, useState } from 'react';
import { getOrCreateDeviceId } from '../../services/auth';
import { seenStateStore } from '../../services/seenStateStore';
import { sheetsService } from '../../services/sheets';
import type { Member, PartType, ReactionEmoji, ScheduleComment } from '../../types/rollbook';
import { getKSTDateString } from '../../utils/date';
import { resolveMemberIdentity } from '../../utils/memberIdentity';
import { filterMentionCandidates, pruneMentions, splitMentionText } from '../../utils/mentions';
import { isCommentUnread } from '../../utils/seenState';
import { parseServerTimeMs } from '../../utils/serverTime';
import { COMMENT_MAX_LENGTH, COMMENT_PAGE_SIZE, createCommentEventId, formatCommentTime } from '../../utils/scheduleComments';
import { CommentReactions } from './CommentReactions';
import { MentionPicker } from './MentionPicker';
import { ReactorsSheet } from './ReactorsSheet';
import '../../styles/v3/reactions.css';

interface ScheduleCommentsProps {
  scheduleId: string;
  author: Pick<Member, 'id' | 'name' | 'part'>;
  /** 처음 펼침 여부. 기본은 펼침이며, 사용자가 접기 버튼으로 닫을 수 있다 */
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

function detectMentionTrigger(value: string, cursorPos: number): { start: number; query: string } | null {
  const before = value.slice(0, cursorPos);
  const atIndex = before.lastIndexOf('@');
  if (atIndex < 0) return null;
  if (atIndex > 0 && !/[\s(]/.test(before[atIndex - 1])) return null;
  const query = before.slice(atIndex + 1);
  if (/[\n]/.test(query)) return null;
  return { start: atIndex, query };
}

/**
 * 일정 상세 맨 아래에 붙는 댓글 영역. 기본으로 펼쳐 보이고, 접기 버튼으로 전체를 닫을 수 있다.
 * 일정이 바뀌면 입력 중이던 상태가 남지 않도록 호출하는 쪽에서 `key={scheduleId}`를 준다.
 */
export const ScheduleComments: React.FC<ScheduleCommentsProps> = ({ scheduleId, author, defaultExpanded = true }) => {
  const [, setTick] = useState(0);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showAll, setShowAll] = useState(false);
  const [text, setText] = useState('');
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [menuId, setMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editMentionIds, setEditMentionIds] = useState<string[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [reactorsTarget, setReactorsTarget] = useState<{ commentId: string; emoji: ReactionEmoji } | null>(null);

  const [mentionContext, setMentionContext] = useState<{
    mode: 'new' | 'edit';
    start: number;
    end: number;
    query: string;
    highlightedIndex: number;
  } | null>(null);

  // 같은 댓글을 다시 보낼 때 같은 id를 써서 중복 저장을 막는다(성공하면 비운다)
  const pendingEventId = useRef<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);

  // 시트에서 새로 받아오면 목록을 다시 그린다
  useEffect(() => sheetsService.subscribeSync(() => setTick((t) => t + 1)), []);

  const isSupabase = sheetsService.getBackendKind() === 'supabase';
  const allMembers = sheetsService.getMembers(true, true);
  const activeMembers = sheetsService.getMembers();
  const canonicalAuthorId = resolveMemberIdentity(author.id, allMembers).canonicalId;

  const comments = sheetsService.getComments(scheduleId);
  const reactionsMap = sheetsService.getReactionsMap();
  const visible = showAll ? comments : comments.slice(-COMMENT_PAGE_SIZE);
  const hiddenCount = comments.length - visible.length;

  // 상세를 열 때의 저장값 기준으로 "새 댓글"을 정한다(열려 있는 동안 지워지지 않는다).
  const [seenAtOpen] = useState(() => seenStateStore.getSnapshot().seen);
  const newIds = new Set(
    comments
      .filter((c) => isCommentUnread(c, seenAtOpen, sheetsService.isOwnComment(c, author.id)))
      .map((c) => c.id)
  );

  // 닫을 때(언마운트): 펼쳐 있었으면 보인 댓글 중 가장 늦은 receivedAt을 "본 것"으로 기록한다.
  const latest = useRef({ expanded, scheduleId, canonicalAuthorId, maxReceivedAt: '' });
  let maxMs = -Infinity;
  let maxReceivedAt = '';
  for (const c of visible) {
    if (!c.receivedAt) continue;
    const ms = parseServerTimeMs(c.receivedAt);
    if (!Number.isNaN(ms) && ms > maxMs) {
      maxMs = ms;
      maxReceivedAt = c.receivedAt;
    }
  }
  useEffect(() => {
    latest.current = { expanded, scheduleId, canonicalAuthorId, maxReceivedAt };
  });
  useEffect(
    () => () => {
      if (latest.current.expanded && latest.current.maxReceivedAt) {
        void seenStateStore.markSeen(latest.current.canonicalAuthorId, [
          { kind: 'comments', scope: latest.current.scheduleId, upTo: latest.current.maxReceivedAt },
        ]);
      }
    },
    []
  );
  const todayStr = getKSTDateString();

  const mentionCandidates =
    mentionContext && isSupabase
      ? filterMentionCandidates(activeMembers, mentionContext.query, canonicalAuthorId)
      : [];

  const handleTextChange = (mode: 'new' | 'edit', nextValue: string, cursorPos: number) => {
    if (mode === 'new') setText(nextValue);
    else setEditText(nextValue);

    if (!isSupabase) {
      setMentionContext(null);
      return;
    }
    const trigger = detectMentionTrigger(nextValue, cursorPos);
    if (trigger) {
      setMentionContext({
        mode,
        start: trigger.start,
        end: cursorPos,
        query: trigger.query,
        highlightedIndex: 0,
      });
    } else {
      setMentionContext(null);
    }
  };

  const applyMentionCandidate = (member: Member) => {
    if (!mentionContext) return;
    const isNew = mentionContext.mode === 'new';
    const current = isNew ? text : editText;
    const inserted = `@${member.name} `;
    const next = current.slice(0, mentionContext.start) + inserted + current.slice(mentionContext.end);
    const canonId = resolveMemberIdentity(member.id, allMembers).canonicalId;
    if (isNew) {
      setText(next.slice(0, COMMENT_MAX_LENGTH));
      setMentionIds((prev) => [...prev, canonId]);
    } else {
      setEditText(next.slice(0, COMMENT_MAX_LENGTH));
      setEditMentionIds((prev) => [...prev, canonId]);
    }
    setMentionContext(null);
    const targetEl = isNew ? composerRef.current : editRef.current;
    if (targetEl) {
      const nextCursor = Math.min(COMMENT_MAX_LENGTH, mentionContext.start + inserted.length);
      requestAnimationFrame(() => {
        targetEl.focus();
        targetEl.setSelectionRange(nextCursor, nextCursor);
      });
    }
  };

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, mode: 'new' | 'edit') => {
    if (!mentionContext || mentionContext.mode !== mode) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      setMentionContext(null);
      return;
    }
    if (mentionCandidates.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMentionContext((prev) =>
        prev ? { ...prev, highlightedIndex: (prev.highlightedIndex + 1) % mentionCandidates.length } : null
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMentionContext((prev) =>
        prev
          ? {
              ...prev,
              highlightedIndex: (prev.highlightedIndex - 1 + mentionCandidates.length) % mentionCandidates.length,
            }
          : null
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const chosen = mentionCandidates[mentionContext.highlightedIndex] ?? mentionCandidates[0];
      if (chosen) applyMentionCandidate(chosen);
    }
  };

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
    const pruned = isSupabase ? pruneMentions(text, mentionIds, allMembers) : undefined;
    void run(
      () =>
        sheetsService.addComment({
          scheduleId,
          member: author,
          text,
          deviceId: getOrCreateDeviceId(),
          ...(pruned !== undefined ? { mentionMemberIds: pruned } : {}),
          eventId: pendingEventId.current ?? undefined,
        }),
      () => {
        setText('');
        setMentionIds([]);
        setMentionContext(null);
        pendingEventId.current = null;
      }
    );
  };

  const saveEdit = (comment: ScheduleComment) => {
    if (!editText.trim() || busy) return;
    const pruned = isSupabase ? pruneMentions(editText, editMentionIds, allMembers) : undefined;
    void run(
      () =>
        sheetsService.editComment({
          commentId: comment.id,
          member: author,
          text: editText,
          deviceId: getOrCreateDeviceId(),
          ...(pruned !== undefined ? { mentionMemberIds: pruned } : {}),
        }),
      () => {
        setEditingId(null);
        setEditMentionIds([]);
        setMentionContext(null);
      }
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
                        {newIds.has(comment.id) && <span className="sc-new">새 댓글</span>}
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
                        <div className="sc-edit sc-composer-wrap">
                          <MentionPicker
                            open={Boolean(mentionContext && mentionContext.mode === 'edit')}
                            candidates={mentionCandidates}
                            highlightedIndex={mentionContext?.highlightedIndex ?? 0}
                            onSelect={applyMentionCandidate}
                          />
                          <textarea
                            ref={editRef}
                            className="sc-textarea"
                            value={editText}
                            maxLength={COMMENT_MAX_LENGTH}
                            onChange={(e) => handleTextChange('edit', e.target.value, e.target.selectionStart ?? e.target.value.length)}
                            onKeyDown={(e) => handleComposerKeyDown(e, 'edit')}
                            aria-label="댓글 수정"
                          />
                          <div className="sc-actions">
                            <button type="button" className="sc-btn primary" disabled={busy || !editText.trim()} onClick={() => saveEdit(comment)}>
                              저장
                            </button>
                            <button
                              type="button"
                              className="sc-btn"
                              onClick={() => {
                                setEditingId(null);
                                setEditMentionIds([]);
                                setMentionContext(null);
                              }}
                            >
                              취소
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="sc-text">
                            {splitMentionText(comment.text, comment.mentionMemberIds, allMembers).map((seg, idx) =>
                              seg.isMention ? (
                                <span key={idx} className="sc-mention">
                                  {seg.text}
                                </span>
                              ) : (
                                <React.Fragment key={idx}>{seg.text}</React.Fragment>
                              )
                            )}
                          </div>
                          <div className="sc-meta">
                            <span>{formatCommentTime(comment.createdAt, todayStr)}</span>
                            {comment.editedAt && <span>· 수정됨</span>}
                          </div>
                          <CommentReactions
                            commentId={comment.id}
                            scheduleId={scheduleId}
                            canonicalMemberId={canonicalAuthorId}
                            reactions={reactionsMap.get(comment.id) ?? new Map()}
                            onOpenReactors={(emoji) => setReactorsTarget({ commentId: comment.id, emoji })}
                          />
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
                              setEditMentionIds(comment.mentionMemberIds ? [...comment.mentionMemberIds] : []);
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

          <div className="sc-composer sc-composer-wrap">
            <MentionPicker
              open={Boolean(mentionContext && mentionContext.mode === 'new')}
              candidates={mentionCandidates}
              highlightedIndex={mentionContext?.highlightedIndex ?? 0}
              onSelect={applyMentionCandidate}
            />
            <textarea
              ref={composerRef}
              className="sc-textarea"
              placeholder="댓글 입력"
              value={text}
              maxLength={COMMENT_MAX_LENGTH}
              onChange={(e) => handleTextChange('new', e.target.value, e.target.selectionStart ?? e.target.value.length)}
              onKeyDown={(e) => handleComposerKeyDown(e, 'new')}
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

      <ReactorsSheet
        open={Boolean(reactorsTarget)}
        initialEmoji={reactorsTarget?.emoji ?? null}
        reactions={reactorsTarget ? reactionsMap.get(reactorsTarget.commentId) ?? new Map() : new Map()}
        members={allMembers}
        canonicalMemberId={canonicalAuthorId}
        onClose={() => setReactorsTarget(null)}
      />
    </div>
  );
};
