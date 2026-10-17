import React, { useState, useEffect, useRef, useMemo } from 'react';
import { getCalendarGrid } from '../utils/calendar';
import { getKSTDateString } from '../utils/date';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

interface RoundDatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (dateStr: string) => void;
  id?: string;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

export const RoundDatePicker: React.FC<RoundDatePickerProps> = ({
  value,
  onChange,
  id,
  className = '',
  placeholder = '날짜 선택...',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse initial view year and month
  const todayStr = useMemo(() => getKSTDateString(), []);
  const initialDateStr = value || todayStr;
  const [initialY, initialM] = initialDateStr.split('-').map(Number);

  const [viewYear, setViewYear] = useState<number>(initialY || 2026);
  const [viewMonthIndex, setViewMonthIndex] = useState<number>(
    (initialM ? initialM - 1 : 9)
  );

  const handleOpen = () => {
    if (disabled) return;
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m] = value.split('-').map(Number);
      setViewYear(y);
      setViewMonthIndex(m - 1);
    }
    setIsOpen((prev) => !prev);
  };

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonthIndex === 0) {
      setViewMonthIndex(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonthIndex((m) => m - 1);
    }
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonthIndex === 11) {
      setViewMonthIndex(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonthIndex((m) => m + 1);
    }
  };

  const calendarDays = useMemo(() => {
    return getCalendarGrid(viewYear, viewMonthIndex);
  }, [viewYear, viewMonthIndex]);

  // Formatted display label: e.g. "2026. 10. 18. (일)"
  const displayLabel = useMemo(() => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return placeholder;
    const [y, m, d] = value.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const dayName = WEEKDAYS[dateObj.getDay()];
    return `${y}. ${String(m).padStart(2, '0')}. ${String(d).padStart(2, '0')}. (${dayName})`;
  }, [value, placeholder]);

  // Quick jump helpers
  const handleSelectToday = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(todayStr);
    setIsOpen(false);
  };

  const handleSelectNextThu = (e: React.MouseEvent) => {
    e.stopPropagation();
    const cur = new Date(todayStr + 'T00:00:00');
    // 4 is Thursday
    const diff = (4 - cur.getDay() + 7) % 7 || 7;
    cur.setDate(cur.getDate() + diff);
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    onChange(`${y}-${m}-${d}`);
    setIsOpen(false);
  };

  return (
    <div className={`round-date-picker-wrap ${className}`} ref={containerRef}>
      {/* Trigger Button */}
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={handleOpen}
        className={`round-date-picker-btn ${isOpen ? 'active' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <span className="picker-icon">📅</span>
        <span className="picker-label">{displayLabel}</span>
        <span className="picker-arrow">▾</span>
      </button>

      {/* Floating Popover Dialog */}
      {isOpen && (
        <div className="round-date-popover">
          {/* Header Controller */}
          <div className="popover-month-nav">
            <button
              type="button"
              className="month-nav-btn"
              onClick={handlePrevMonth}
              aria-label="이전 달"
            >
              ‹
            </button>
            <span className="popover-month-title">
              {viewYear}년 {viewMonthIndex + 1}월
            </span>
            <button
              type="button"
              className="month-nav-btn"
              onClick={handleNextMonth}
              aria-label="다음 달"
            >
              ›
            </button>
          </div>

          {/* Quick preset chips */}
          <div className="popover-quick-chips">
            <button type="button" onClick={handleSelectToday}>
              오늘
            </button>
            <button type="button" onClick={handleSelectNextThu}>
              다가오는 목요일
            </button>
          </div>

          {/* Weekday Row */}
          <div className="popover-weekdays-row">
            {WEEKDAYS.map((wd, i) => (
              <span
                key={wd}
                className={`popover-weekday ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}`}
              >
                {wd}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div className="popover-days-grid">
            {calendarDays.map((cell) => {
              const isSelected = cell.dateStr === value;
              const isToday = cell.dateStr === todayStr;

              return (
                <button
                  key={cell.dateStr}
                  type="button"
                  className={`popover-day-cell ${cell.isCurrentMonth ? 'in-month' : 'other-month'} ${
                    isSelected ? 'selected' : ''
                  } ${isToday ? 'today' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(cell.dateStr);
                    setIsOpen(false);
                  }}
                  title={cell.dateStr}
                >
                  <span className="day-number">{cell.dayNumber}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
