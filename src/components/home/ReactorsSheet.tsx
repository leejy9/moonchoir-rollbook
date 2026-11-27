import React, { useState } from 'react';
import { useBlockingOverlay } from '../../hooks/useBlockingOverlay';
import type { Member, PartType, ReactionEmoji } from '../../types/rollbook';
import { REACTION_EMOJIS, type EmojiReactionBucket } from '../../utils/commentReactions';

interface ReactorsSheetProps {
  open: boolean;
  initialEmoji: ReactionEmoji | null;
  reactions: Map<ReactionEmoji, EmojiReactionBucket>;
  members: Member[];
  canonicalMemberId: string;
  onClose: () => void;
}

const PART_CLASS: Record<string, string> = {
  소프라노: 'part-소프라노',
  알토: 'part-알토',
  테너: 'part-테너',
  베이스: 'part-베이스',
};

const partClass = (part: PartType | string) => PART_CLASS[part] ?? 'part-guest';

export const ReactorsSheet: React.FC<ReactorsSheetProps> = ({
  open,
  initialEmoji,
  reactions,
  members,
  canonicalMemberId,
  onClose,
}) => {
  useBlockingOverlay(open);

  const activeEmojis = REACTION_EMOJIS.filter((emoji) => {
    const bucket = reactions.get(emoji);
    return bucket && bucket.memberAt.size > 0;
  });

  const [overrideEmoji, setOverrideEmoji] = useState<ReactionEmoji | null>(null);

  if (!open) return null;

  const currentEmoji =
    (overrideEmoji && reactions.get(overrideEmoji)?.memberAt.size ? overrideEmoji : null) ??
    (initialEmoji && reactions.get(initialEmoji)?.memberAt.size ? initialEmoji : null) ??
    activeEmojis[0] ??
    null;

  const handleClose = () => {
    setOverrideEmoji(null);
    onClose();
  };

  const memberById = new Map(members.map((m) => [m.id, m]));
  const bucket = currentEmoji ? reactions.get(currentEmoji) : undefined;
  const reactorIds = bucket ? Array.from(bucket.memberAt.keys()) : [];

  // 내가 있으면 "나(이름)"로 맨 위
  reactorIds.sort((a, b) => {
    if (a === canonicalMemberId) return -1;
    if (b === canonicalMemberId) return 1;
    const nameA = memberById.get(a)?.name ?? a;
    const nameB = memberById.get(b)?.name ?? b;
    return nameA.localeCompare(nameB, 'ko');
  });

  return (
    <div
      className="rs-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className="rs-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="반응한 사람"
      >
        <div className="rs-handle" aria-hidden="true" />
        <div className="rs-header">
          <h3 className="rs-title">반응한 사람</h3>
          <button type="button" className="rs-close" aria-label="닫기" onClick={handleClose}>
            ✕
          </button>
        </div>

        {activeEmojis.length > 0 && (
          <div className="rs-tabs" role="tablist">
            {activeEmojis.map((emoji) => {
              const count = reactions.get(emoji)?.memberAt.size ?? 0;
              const active = emoji === currentEmoji;
              return (
                <button
                  key={emoji}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`rs-tab ${active ? 'active' : ''}`}
                  onClick={() => setOverrideEmoji(emoji)}
                >
                  <span>{emoji}</span>
                  <span>{count}</span>
                </button>
              );
            })}
          </div>
        )}

        <ul className="rs-list">
          {reactorIds.map((id) => {
            const member = memberById.get(id);
            const rawName = member?.name ?? id;
            const displayName = id === canonicalMemberId ? `나(${rawName})` : rawName;
            const part = member?.part;
            return (
              <li key={id} className="rs-row">
                <span className="rs-avatar">{rawName.slice(0, 1)}</span>
                <span className="rs-name">{displayName}</span>
                {part && <span className={`part-badge ${partClass(part)}`}>{part}</span>}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};
