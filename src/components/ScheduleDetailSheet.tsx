import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Member, Schedule } from '../types/rollbook';
import { ScheduleDetailBody } from './ScheduleDetailBody';

export interface ScheduleDetailSheetProps {
  isOpen: boolean;
  date: string;
  scheduleId?: string;
  schedules: Schedule[];
  member: Member;
  onClose: () => void;
}

export const ScheduleDetailSheet: React.FC<ScheduleDetailSheetProps> = ({
  isOpen,
  date,
  scheduleId,
  schedules,
  member,
  onClose,
}) => {
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartYRef = useRef(0);

  const sheetRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // Filter schedules on this date
  const daySchedules = useMemo(() => {
    return schedules
      .filter((s) => s.date === date && !s.isArchived)
      .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  }, [date, schedules]);

  // 사용자가 복수 일정 중 직접 탭하여 선택한 ID (초기값 null)
  const [userPickedId, setUserPickedId] = useState<string | null>(null);

  // 렌더 중 유효한 선택 계산 (prop 우선 -> 사용자 선택 -> 단일 일정 자동 선택 -> null)
  const effectiveScheduleId =
    scheduleId ??
    (userPickedId && daySchedules.some((s) => s.id === userPickedId) ? userPickedId : null) ??
    (daySchedules.length === 1 ? daySchedules[0].id : null);

  // Save and restore focus, focus first element on open
  useEffect(() => {
    if (!isOpen) return;

    previousActiveElementRef.current = document.activeElement as HTMLElement | null;

    // Small delay to ensure sheet is rendered
    const timer = setTimeout(() => {
      closeBtnRef.current?.focus();
    }, 50);

    return () => {
      clearTimeout(timer);
      previousActiveElementRef.current?.focus?.();
    };
  }, [isOpen]);

  // Handle Escape key and Tab focus trapping
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        if (!sheetRef.current) return;
        const focusable = sheetRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const firstElement = focusable[0];
        const lastElement = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    },
    [onClose]
  );

  // Drag down to close gesture (Pointer Events)
  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    dragStartYRef.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const delta = e.clientY - dragStartYRef.current;
    if (delta > 0) {
      setDragOffsetY(delta);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);

    if (dragOffsetY >= 80) {
      onClose();
    }
    setDragOffsetY(0);
  };

  if (!isOpen) return null;

  // Check if explicit scheduleId is provided but not found in daySchedules
  const isInvalidExplicitSchedule = scheduleId && !daySchedules.some((s) => s.id === scheduleId);

  // Find target schedule if selected
  const activeSchedule = daySchedules.find((s) => s.id === effectiveScheduleId);

  return (
    <div
      className="schedule-detail-sheet-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      onKeyDown={handleKeyDown}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(3px)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        alignItems: 'center',
        animation: 'fadeIn 0.15s ease-out',
      }}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={isInvalidExplicitSchedule ? undefined : 'schedule-detail-title'}
        style={{
          width: '100%',
          maxWidth: '480px',
          maxHeight: '85vh',
          backgroundColor: 'var(--bg-card)',
          borderTopLeftRadius: 'var(--radius-xl)',
          borderTopRightRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-elevated)',
          display: 'flex',
          flexDirection: 'column',
          transform: `translateY(${dragOffsetY}px)`,
          transition: prefersReducedMotion || isDragging ? 'none' : 'transform 0.2s ease-out',
          overflow: 'hidden',
        }}
      >
        {/* Drag Handle Bar and Header */}
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{
            touchAction: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '12px 16px 8px',
            borderBottom: '1px solid var(--border-subtle)',
            cursor: 'grab',
            position: 'relative',
          }}
        >
          {/* Visual Grab Handle */}
          <div
            style={{
              width: '36px',
              height: '4px',
              borderRadius: '2px',
              backgroundColor: 'var(--border-subtle)',
              marginBottom: '8px',
            }}
          />

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
            }}
          >
            {daySchedules.length > 1 && activeSchedule ? (
              <button
                type="button"
                onClick={() => setUserPickedId(null)}
                style={{
                  minWidth: '44px',
                  minHeight: '44px',
                  padding: '8px 12px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--brand-lavender-text)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                ← 목록으로
              </button>
            ) : (
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-sub)' }}>
                {date} 일정 상세
              </span>
            )}

            <button
              ref={closeBtnRef}
              type="button"
              onClick={onClose}
              aria-label="닫기"
              style={{
                minWidth: '44px',
                minHeight: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                fontWeight: 600,
                color: 'var(--text-sub)',
                cursor: 'pointer',
                borderRadius: 'var(--radius-full)',
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Sheet Content Area */}
        <div
          style={{
            padding: '20px',
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {isInvalidExplicitSchedule ? (
            <p
              style={{
                fontSize: '15px',
                fontWeight: 600,
                color: 'var(--text-sub)',
                textAlign: 'center',
                padding: '32px 0',
                margin: 0,
              }}
            >
              볼 수 없는 일정입니다
            </p>
          ) : daySchedules.length === 0 ? (
            <p
              style={{
                fontSize: '15px',
                fontWeight: 600,
                color: 'var(--text-sub)',
                textAlign: 'center',
                padding: '32px 0',
                margin: 0,
              }}
            >
              일정이 없습니다.
            </p>
          ) : activeSchedule ? (
            /* Selected Schedule Detail View */
            <ScheduleDetailBody schedule={activeSchedule} member={member} />
          ) : (
            /* Multi-Schedule Picker List (when multiple schedules on date and none selected yet) */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-sub)', margin: '0 0 6px', fontWeight: 600 }}>
                해당 일자에 {daySchedules.length}개의 일정이 있습니다. 확인할 일정을 선택해 주세요.
              </p>
              {daySchedules.map((sch) => (
                <button
                  key={sch.id}
                  type="button"
                  onClick={() => setUserPickedId(sch.id)}
                  style={{
                    minHeight: '48px',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--border-subtle)',
                    backgroundColor: 'var(--bg-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-main)' }}>
                      {sch.title}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-sub)' }}>
                      {sch.startTime} ~ {sch.endTime} · {sch.locationName || '장소 미정'}
                    </span>
                  </div>
                  <span className="schedule-category-badge">{sch.category}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
