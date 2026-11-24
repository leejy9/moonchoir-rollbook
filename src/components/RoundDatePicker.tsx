import React, { useState, useEffect, useRef, useMemo } from 'react';
import { getCalendarGrid } from '../utils/calendar';
import { getKSTDateString } from '../utils/date';
import { buildYearOptions, parseDateInput } from '../utils/datePickerYears';
import '../styles/v3/datePicker.css';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;
const MONTH_INDEXES = Array.from({ length: 12 }, (_, i) => i);
type PickerView = 'days' | 'months' | 'years';
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

  const [pickerView, setPickerView] = useState<PickerView>('days');
  const [typed, setTyped] = useState('');
  const [typedError, setTypedError] = useState('');
  const yearListRef = useRef<HTMLDivElement>(null);

  const yearOptions = useMemo(
    () => buildYearOptions(Number(todayStr.slice(0, 4)), viewYear),
    [todayStr, viewYear]
  );

  const handleOpen = () => {
    if (disabled) return;
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m] = value.split('-').map(Number);
      setViewYear(y);
      setViewMonthIndex(m - 1);
    }
    setPickerView('days');
    setTyped(value || '');
    setTypedError('');
    setIsOpen(true);
  };

  // 연도 보기를 열면 고른 연도가 보이게 스크롤한다
  useEffect(() => {
    if (pickerView !== 'years') return;
    const el = yearListRef.current?.querySelector<HTMLElement>('.rdp-grid-cell.selected');
    el?.scrollIntoView({ block: 'center' });
  }, [pickerView]);

  const applyTyped = () => {
    const parsed = parseDateInput(typed);
    if (!parsed) {
      setTypedError('2024-03-14처럼 연-월-일로 입력해 주세요.');
      return;
    }
    onChange(parsed);
    setIsOpen(false);
  };

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pickerView === 'months') {
      setViewYear((y) => y - 1);
      return;
    }
    if (viewMonthIndex === 0) {
      setViewMonthIndex(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonthIndex((m) => m - 1);
    }
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pickerView === 'months') {
      setViewYear((y) => y + 1);
      return;
    }
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

      {/* Unified Modal Popup with Dim Backdrop */}
      {isOpen && (
        <div
          className="picker-modal-backdrop"
          onClick={() => setIsOpen(false)}
          role="presentation"
        >
          <div
            className="picker-modal-dialog round-date-popover"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {/* Header Controller */}
            <div className="popover-month-nav">
              {pickerView !== 'years' ? (
                <button
                  type="button"
                  className="month-nav-btn"
                  onClick={handlePrevMonth}
                  aria-label={pickerView === 'months' ? '이전 해' : '이전 달'}
                >
                  ‹
                </button>
              ) : (
                <span className="rdp-nav-spacer" aria-hidden="true" />
              )}
              <span className="popover-month-title rdp-ym">
                <button
                  type="button"
                  className={`rdp-ym-btn ${pickerView === 'years' ? 'active' : ''}`}
                  aria-label="연도 고르기"
                  aria-expanded={pickerView === 'years'}
                  onClick={() => setPickerView((v) => (v === 'years' ? 'days' : 'years'))}
                >
                  {viewYear}년 <span aria-hidden="true">▾</span>
                </button>
                <button
                  type="button"
                  className={`rdp-ym-btn ${pickerView === 'months' ? 'active' : ''}`}
                  aria-label="월 고르기"
                  aria-expanded={pickerView === 'months'}
                  onClick={() => setPickerView((v) => (v === 'months' ? 'days' : 'months'))}
                >
                  {viewMonthIndex + 1}월 <span aria-hidden="true">▾</span>
                </button>
              </span>
              {pickerView !== 'years' ? (
                <button
                  type="button"
                  className="month-nav-btn"
                  onClick={handleNextMonth}
                  aria-label={pickerView === 'months' ? '다음 해' : '다음 달'}
                >
                  ›
                </button>
              ) : (
                <span className="rdp-nav-spacer" aria-hidden="true" />
              )}
              <button
                type="button"
                className="popover-close-btn"
                onClick={() => setIsOpen(false)}
                aria-label="닫기"
                style={{ marginLeft: '6px' }}
              >
                ✕
              </button>
            </div>

            {/* 직접 입력 */}
            <form
              className="rdp-typed"
              onSubmit={(e) => {
                e.preventDefault();
                applyTyped();
              }}
            >
              <input
                type="text"
                className="rdp-typed-input"
                aria-label="날짜 직접 입력"
                placeholder="2024-03-14"
                value={typed}
                onChange={(e) => {
                  setTyped(e.target.value);
                  setTypedError('');
                }}
              />
              <button type="submit" className="rdp-typed-apply">
                적용
              </button>
            </form>
            {typedError && (
              <p className="rdp-typed-error" role="alert">
                {typedError}
              </p>
            )}

            {pickerView === 'years' && (
              <div className="rdp-grid rdp-grid-years" ref={yearListRef} role="listbox" aria-label="연도">
                {yearOptions.map((y) => (
                  <button
                    key={y}
                    type="button"
                    role="option"
                    aria-selected={y === viewYear}
                    className={`rdp-grid-cell ${y === viewYear ? 'selected' : ''}`}
                    onClick={() => {
                      setViewYear(y);
                      setPickerView('months');
                    }}
                  >
                    {y}
                  </button>
                ))}
              </div>
            )}

            {pickerView === 'months' && (
              <div className="rdp-grid rdp-grid-months" role="listbox" aria-label="월">
                {MONTH_INDEXES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="option"
                    aria-selected={m === viewMonthIndex}
                    className={`rdp-grid-cell ${m === viewMonthIndex ? 'selected' : ''}`}
                    onClick={() => {
                      setViewMonthIndex(m);
                      setPickerView('days');
                    }}
                  >
                    {m + 1}월
                  </button>
                ))}
              </div>
            )}

            {pickerView === 'days' && (
            <>
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
            </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
