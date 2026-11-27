import React from 'react';
import { useBlockingOverlay } from '../../hooks/useBlockingOverlay';
import type { Member, PartType } from '../../types/rollbook';

interface MentionPickerProps {
  open: boolean;
  candidates: Member[];
  highlightedIndex: number;
  onSelect: (member: Member) => void;
}

const PART_CLASS: Record<string, string> = {
  소프라노: 'part-소프라노',
  알토: 'part-알토',
  테너: 'part-테너',
  베이스: 'part-베이스',
};

const partClass = (part: PartType | string) => PART_CLASS[part] ?? 'part-guest';

export const MentionPicker: React.FC<MentionPickerProps> = ({
  open,
  candidates,
  highlightedIndex,
  onSelect,
}) => {
  useBlockingOverlay(open);

  if (!open) return null;

  return (
    <div className="mp-popover" role="listbox" aria-label="언급할 단원 선택">
      {candidates.length === 0 ? (
        <div className="mp-empty">일치하는 단원이 없어요</div>
      ) : (
        <ul className="mp-list">
          {candidates.map((member, index) => {
            const active = index === highlightedIndex;
            return (
              <li key={member.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`mp-item ${active ? 'active' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelect(member);
                  }}
                >
                  <span className="mp-name">{member.name}</span>
                  <span className={`part-badge ${partClass(member.part)}`}>{member.part}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
