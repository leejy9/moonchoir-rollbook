import React, { useEffect, useRef, useState } from 'react';
import { getOrCreateDeviceId } from '../../services/auth';
import { sheetsService } from '../../services/sheets';
import type { ReactionEmoji } from '../../types/rollbook';
import { REACTION_EMOJIS, type EmojiReactionBucket } from '../../utils/commentReactions';
import { useLongPress } from '../../hooks/useLongPress';

interface CommentReactionsProps {
  commentId: string;
  scheduleId: string;
  canonicalMemberId: string;
  reactions: Map<ReactionEmoji, EmojiReactionBucket>;
  onOpenReactors: (initialEmoji: ReactionEmoji) => void;
}

interface ReactionChipProps {
  emoji: ReactionEmoji;
  count: number;
  isMine: boolean;
  disabled: boolean;
  onToggle: () => void;
  onLongPress: () => void;
}

const ReactionChip: React.FC<ReactionChipProps> = ({
  emoji,
  count,
  isMine,
  disabled,
  onToggle,
  onLongPress,
}) => {
  const longPressHandlers = useLongPress({
    thresholdMs: 500,
    vibrate: false,
    onLongPress,
    onClick: () => {
      if (!disabled) onToggle();
    },
  });

  return (
    <button
      type="button"
      className={`rxn-chip ${isMine ? 'mine' : ''}`}
      aria-pressed={isMine}
      aria-label={`${emoji} ${count}명${isMine ? ', 내가 반응함' : ''}`}
      disabled={disabled}
      onMouseDown={longPressHandlers.onMouseDown}
      onMouseUp={longPressHandlers.onMouseUp}
      onMouseLeave={longPressHandlers.onMouseLeave}
      onTouchStart={longPressHandlers.onTouchStart}
      onTouchEnd={longPressHandlers.onTouchEnd}
      onTouchCancel={longPressHandlers.onTouchCancel}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onLongPress();
      }}
      onClick={longPressHandlers.onClick}
    >
      <span className="rxn-emoji" aria-hidden="true">{emoji}</span>
      <span className="rxn-count">{count}</span>
    </button>
  );
};

export const CommentReactions: React.FC<CommentReactionsProps> = ({
  commentId,
  scheduleId,
  canonicalMemberId,
  reactions,
  onOpenReactors,
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSupabase = sheetsService.getBackendKind() === 'supabase';

  useEffect(() => {
    if (!pickerOpen) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [pickerOpen]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleToggle = async (emoji: ReactionEmoji) => {
    if (!isSupabase) return;
    setErrorMsg('');
    const ok = await sheetsService.toggleReaction({
      commentId,
      scheduleId,
      memberId: canonicalMemberId,
      emoji,
      deviceId: getOrCreateDeviceId(),
    });
    if (!ok) {
      setErrorMsg('반응을 남기지 못했어요. 다시 시도해 주세요.');
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setErrorMsg(''), 3000);
    }
  };

  const activeChips = REACTION_EMOJIS.filter((emoji) => {
    const bucket = reactions.get(emoji);
    return bucket && bucket.memberAt.size > 0;
  });

  if (!isSupabase && activeChips.length === 0) {
    return null;
  }

  return (
    <div className="rxn-wrap" ref={wrapRef}>
      <div className="rxn-row">
        {activeChips.map((emoji) => {
          const bucket = reactions.get(emoji)!;
          const isMine = bucket.memberAt.has(canonicalMemberId);
          return (
            <ReactionChip
              key={emoji}
              emoji={emoji}
              count={bucket.memberAt.size}
              isMine={isMine}
              disabled={!isSupabase}
              onToggle={() => void handleToggle(emoji)}
              onLongPress={() => onOpenReactors(emoji)}
            />
          );
        })}

        {isSupabase && (
          <div className="rxn-add-anchor">
            <button
              type="button"
              className="rxn-add-btn"
              aria-label="반응 남기기"
              aria-expanded={pickerOpen}
              onClick={() => setPickerOpen((v) => !v)}
            >
              ☺+
            </button>
            {pickerOpen && (
              <div className="rxn-picker" role="menu" aria-label="이모지 고르기">
                {REACTION_EMOJIS.map((emoji) => {
                  const isMine = Boolean(reactions.get(emoji)?.memberAt.has(canonicalMemberId));
                  return (
                    <button
                      key={emoji}
                      type="button"
                      className={`rxn-pick-item ${isMine ? 'mine' : ''}`}
                      role="menuitem"
                      aria-label={`${emoji} 반응`}
                      onClick={() => {
                        setPickerOpen(false);
                        void handleToggle(emoji);
                      }}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {errorMsg && (
        <div role="alert" className="rxn-error">
          {errorMsg}
        </div>
      )}
    </div>
  );
};
