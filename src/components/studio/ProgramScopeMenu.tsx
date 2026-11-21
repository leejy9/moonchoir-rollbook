import React, { useEffect, useRef, useState } from 'react';
import type { ProgramScopeItem } from '../../utils/practiceScope';

export interface ProgramScopeMenuProps {
  scopes: ProgramScopeItem[];
  selectedScopeId: string;
  onSelectScope: (scopeId: string) => void;
}

export const ProgramScopeMenu: React.FC<ProgramScopeMenuProps> = ({
  scopes,
  selectedScopeId,
  onSelectScope,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const selectedScope = scopes.find((s) => s.id === selectedScopeId) || scopes[0];

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setIsOpen(false);
        triggerRef.current.focus();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Handle focus on open
  useEffect(() => {
    if (isOpen) {
      // Find selected item index or first item
      const activeIdx = scopes
        .filter((s) => !s.isDivider)
        .findIndex((s) => s.id === selectedScopeId);
      const focusTarget = itemsRef.current[activeIdx >= 0 ? activeIdx : 0];
      focusTarget?.focus();
    }
  }, [isOpen, scopes, selectedScopeId]);

  const handleToggle = () => {
    setIsOpen((prev) => !prev);
  };

  const handleSelectItem = (id: string) => {
    onSelectScope(id);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  // Keyboard navigation inside menu
  const handleItemKeyDown = (e: React.KeyboardEvent, index: number, selectableCount: number) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIdx = (index + 1) % selectableCount;
      itemsRef.current[nextIdx]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIdx = (index - 1 + selectableCount) % selectableCount;
      itemsRef.current[prevIdx]?.focus();
    }
  };

  const selectableScopes = scopes.filter((s) => !s.isDivider);

  return (
    <div className="studio-scope-container">
      <button
        ref={triggerRef}
        type="button"
        className="studio-scope-btn"
        onClick={handleToggle}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls="program-scope-menu"
      >
        <span>
          {selectedScope ? (
            selectedScope.dateStr ? (
              `${selectedScope.title} · ${selectedScope.dateStr}`
            ) : (
              selectedScope.title
            )
          ) : (
            '전체 곡'
          )}
        </span>
        <svg
          className="studio-scope-chevron"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          id="program-scope-menu"
          className="studio-scope-popover"
          role="menu"
          aria-label="공연 선택"
        >
          {scopes.map((scope) => {
            if (scope.isDivider) {
              return <div key={scope.id} className="studio-scope-divider" role="separator" />;
            }

            const selectableIdx = selectableScopes.findIndex((s) => s.id === scope.id);
            const isSelected = scope.id === selectedScopeId;

            return (
              <button
                key={scope.id}
                ref={(el) => {
                  itemsRef.current[selectableIdx] = el;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={isSelected}
                tabIndex={isSelected ? 0 : -1}
                className={`studio-scope-item ${scope.isPast ? 'is-past' : ''}`}
                onClick={() => handleSelectItem(scope.id)}
                onKeyDown={(e) => handleItemKeyDown(e, selectableIdx, selectableScopes.length)}
              >
                <div className="studio-scope-item-left">
                  <span className="studio-scope-item-title">{scope.title}</span>
                  {scope.dateStr && <span className="studio-scope-item-date">{scope.dateStr}</span>}
                </div>
                <span className="studio-scope-item-count">{scope.pieceCount}곡</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
