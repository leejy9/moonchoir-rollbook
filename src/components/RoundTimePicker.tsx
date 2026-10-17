import React, { useState, useRef, useEffect, useMemo } from 'react';

interface RoundTimePickerProps {
  value: string; // 'HH:mm' format, e.g. '19:30'
  onChange: (timeStr: string) => void;
  id?: string;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}

export const RoundTimePicker: React.FC<RoundTimePickerProps> = ({
  value,
  onChange,
  id,
  className = '',
  disabled = false,
  placeholder = '시간 선택...',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse initial 24h string into AM/PM, 12h hour, and minute
  const parsed = useMemo(() => {
    if (!value || !/^\d{1,2}:\d{2}$/.test(value)) {
      return { isPM: true, hour12: 7, minute: 30 };
    }
    const [h24, m] = value.split(':').map(Number);
    const isPM = h24 >= 12;
    const hour12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
    return { isPM, hour12, minute: m };
  }, [value]);

  const [period, setPeriod] = useState<'AM' | 'PM'>(parsed.isPM ? 'PM' : 'AM');
  const [selectedHour, setSelectedHour] = useState<number>(parsed.hour12);
  const [selectedMinute, setSelectedMinute] = useState<number>(parsed.minute);

  // Sync internal picker state when popover opens
  const handleOpen = () => {
    if (disabled) return;
    setPeriod(parsed.isPM ? 'PM' : 'AM');
    setSelectedHour(parsed.hour12);
    setSelectedMinute(parsed.minute);
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

  // Convert current state into HH:mm and emit onChange
  const emitChange = (newPeriod: 'AM' | 'PM', newHour: number, newMin: number) => {
    let h24 = newPeriod === 'PM' ? (newHour === 12 ? 12 : newHour + 12) : (newHour === 12 ? 0 : newHour);
    if (h24 === 24) h24 = 12;
    const timeStr = `${String(h24).padStart(2, '0')}:${String(newMin).padStart(2, '0')}`;
    onChange(timeStr);
  };

  // Display label for the trigger button
  const displayLabel = useMemo(() => {
    if (!value) return placeholder;
    const [h, m] = value.split(':').map(Number);
    const isPM = h >= 12;
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${isPM ? '오후' : '오전'} ${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }, [value, placeholder]);

  const handlePeriodChange = (newPeriod: 'AM' | 'PM') => {
    setPeriod(newPeriod);
    emitChange(newPeriod, selectedHour, selectedMinute);
  };

  const handleHourClick = (h: number) => {
    setSelectedHour(h);
    emitChange(period, h, selectedMinute);
  };

  const handleMinuteClick = (m: number) => {
    setSelectedMinute(m);
    emitChange(period, selectedHour, m);
  };

  const handlePresetClick = (presetVal: string) => {
    onChange(presetVal);
    const [h24, m] = presetVal.split(':').map(Number);
    const isPM = h24 >= 12;
    const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
    setPeriod(isPM ? 'PM' : 'AM');
    setSelectedHour(h12);
    setSelectedMinute(m);
    setIsOpen(false);
  };

  const PRESETS = [
    { label: '오후 7:30 (기본)', val: '19:30' },
    { label: '오후 9:30 (종료)', val: '21:30' },
    { label: '오후 7:00', val: '19:00' },
    { label: '오후 9:00', val: '21:00' },
    { label: '오후 2:00', val: '14:00' },
    { label: '오후 6:00', val: '18:00' },
  ];

  const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  return (
    <div className={`round-time-picker-wrap ${className}`} ref={containerRef}>
      {/* Trigger Button */}
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={handleOpen}
        className={`round-time-picker-btn ${isOpen ? 'active' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <span className="picker-icon">⏰</span>
        <span className="picker-label">{displayLabel}</span>
        <span className="picker-arrow">▾</span>
      </button>

      {/* Floating Popover */}
      {isOpen && (
        <div className="round-time-popover">
          {/* Popover Header */}
          <div className="popover-time-header">
            <div className="popover-time-badge">
              {period === 'PM' ? '오후' : '오전'} {String(selectedHour).padStart(2, '0')}:{String(selectedMinute).padStart(2, '0')}
            </div>
            <button
              type="button"
              className="popover-close-btn"
              onClick={() => setIsOpen(false)}
              aria-label="닫기"
            >
              ✕
            </button>
          </div>

          {/* Practice Time Presets */}
          <div className="popover-time-presets">
            {PRESETS.map((p) => {
              const isMatch = value === p.val;
              return (
                <button
                  key={p.val}
                  type="button"
                  className={`time-preset-chip ${isMatch ? 'active' : ''}`}
                  onClick={() => handlePresetClick(p.val)}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* AM / PM Segmented Control */}
          <div className="popover-period-segment">
            <button
              type="button"
              className={`period-btn ${period === 'AM' ? 'selected' : ''}`}
              onClick={() => handlePeriodChange('AM')}
            >
              오전 (AM)
            </button>
            <button
              type="button"
              className={`period-btn ${period === 'PM' ? 'selected' : ''}`}
              onClick={() => handlePeriodChange('PM')}
            >
              오후 (PM)
            </button>
          </div>

          {/* Hour & Minute Picker Columns */}
          <div className="popover-time-columns">
            {/* Hour Selector */}
            <div className="time-column">
              <span className="column-label">시 (Hour)</span>
              <div className="hours-grid">
                {HOURS.map((h) => {
                  const isSel = selectedHour === h;
                  return (
                    <button
                      key={h}
                      type="button"
                      className={`time-cell-btn ${isSel ? 'selected' : ''}`}
                      onClick={() => handleHourClick(h)}
                    >
                      {h}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Minute Selector */}
            <div className="time-column">
              <span className="column-label">분 (Minute)</span>
              <div className="minutes-grid">
                {MINUTES.map((m) => {
                  const isSel = selectedMinute === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      className={`time-cell-btn ${isSel ? 'selected' : ''}`}
                      onClick={() => handleMinuteClick(m)}
                    >
                      {String(m).padStart(2, '0')}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Footer Done Button */}
          <div className="popover-time-footer">
            <button
              type="button"
              className="time-done-btn"
              onClick={() => setIsOpen(false)}
            >
              선택 완료
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
