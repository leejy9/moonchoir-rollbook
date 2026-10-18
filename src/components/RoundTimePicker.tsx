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
  const dialRef = useRef<SVGSVGElement>(null);

  // Parse initial 24h string into 24-hour number and minute
  const parsed = useMemo(() => {
    if (!value || !/^\d{1,2}:\d{2}(:\d{2})?$/.test(value)) {
      return { hour24: 19, minute: 30 };
    }
    const [h24, m] = value.split(':').map(Number);
    const validH = isNaN(h24) ? 19 : Math.max(0, Math.min(23, h24));
    const validM = isNaN(m) ? 30 : Math.max(0, Math.min(59, m));
    return { hour24: validH, minute: validM };
  }, [value]);

  const [activeMode, setActiveMode] = useState<'hour' | 'minute'>('hour');
  const [selectedHour, setSelectedHour] = useState<number>(parsed.hour24);
  const [selectedMinute, setSelectedMinute] = useState<number>(parsed.minute);

  const [hourInputText, setHourInputText] = useState<string>(
    String(parsed.hour24).padStart(2, '0')
  );
  const [minuteInputText, setMinuteInputText] = useState<string>(
    String(parsed.minute).padStart(2, '0')
  );
  const [isDragging, setIsDragging] = useState(false);



  const handleOpen = () => {
    if (disabled) return;
    setSelectedHour(parsed.hour24);
    setSelectedMinute(parsed.minute);
    setHourInputText(String(parsed.hour24).padStart(2, '0'));
    setMinuteInputText(String(parsed.minute).padStart(2, '0'));
    setActiveMode('hour');
    setIsOpen(true);
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

  const emitChange = (h24: number, m: number) => {
    const clampedH = Math.max(0, Math.min(23, h24));
    const clampedM = Math.max(0, Math.min(59, m));
    const timeStr = `${String(clampedH).padStart(2, '0')}:${String(clampedM).padStart(2, '0')}`;
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

  // Subtitle header label, e.g. "오후 07:30 (19:30)"
  const currentFormattedLabel = useMemo(() => {
    const isPM = selectedHour >= 12;
    const h12 = selectedHour === 0 ? 12 : selectedHour > 12 ? selectedHour - 12 : selectedHour;
    return `${isPM ? '오후' : '오전'} ${String(h12).padStart(2, '0')}:${String(selectedMinute).padStart(2, '0')} (${String(selectedHour).padStart(2, '0')}:${String(selectedMinute).padStart(2, '0')})`;
  }, [selectedHour, selectedMinute]);

  // Direct Text Input Handlers
  const handleHourInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 2);
    setHourInputText(raw);
    if (raw !== '') {
      let num = parseInt(raw, 10);
      if (num > 23) num = 23;
      setSelectedHour(num);
      emitChange(num, selectedMinute);
    }
  };

  const handleHourInputBlur = () => {
    setHourInputText(String(selectedHour).padStart(2, '0'));
  };

  const handleMinuteInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 2);
    setMinuteInputText(raw);
    if (raw !== '') {
      let num = parseInt(raw, 10);
      if (num > 59) num = 59;
      setSelectedMinute(num);
      emitChange(selectedHour, num);
    }
  };

  const handleMinuteInputBlur = () => {
    setMinuteInputText(String(selectedMinute).padStart(2, '0'));
  };

  const handleToggleAMPM = (targetPeriod: 'AM' | 'PM') => {
    let nextH = selectedHour;
    if (targetPeriod === 'AM' && selectedHour >= 12) {
      nextH = selectedHour - 12;
    } else if (targetPeriod === 'PM' && selectedHour < 12) {
      nextH = selectedHour + 12;
    }
    setSelectedHour(nextH);
    setHourInputText(String(nextH).padStart(2, '0'));
    emitChange(nextH, selectedMinute);
  };

  // Clock Dial Pointer Coordinates & Calculation
  const updateFromPointer = (e: React.PointerEvent<SVGSVGElement>, isFinal: boolean = false) => {
    if (!dialRef.current) return;
    const rect = dialRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);
    const scaledDist = dist * (256 / rect.width);
    const deg = (Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360;

    if (activeMode === 'hour') {
      const isInner = scaledDist < 84;
      const step = Math.round(deg / 30) % 12;
      const hour = isInner ? step + 12 : step;
      setSelectedHour(hour);
      setHourInputText(String(hour).padStart(2, '0'));
      emitChange(hour, selectedMinute);
      if (isFinal) {
        // Auto-switch to minute mode after picking hour
        setTimeout(() => setActiveMode('minute'), 220);
      }
    } else {
      const minute = Math.round(deg / 6) % 60;
      setSelectedMinute(minute);
      setMinuteInputText(String(minute).padStart(2, '0'));
      emitChange(selectedHour, minute);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    updateFromPointer(e, false);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDragging) return;
    updateFromPointer(e, false);
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    updateFromPointer(e, true);
  };

  // Clock Hand Geometry
  const handGeometry = useMemo(() => {
    const cx = 128;
    const cy = 128;
    let handR = 100;
    let deg = 0;

    if (activeMode === 'hour') {
      const isInner = selectedHour >= 12;
      handR = isInner ? 66 : 100;
      deg = (selectedHour % 12) * 30;
    } else {
      handR = 100;
      deg = selectedMinute * 6;
    }

    const rad = (deg - 90) * Math.PI / 180;
    const tipX = cx + handR * Math.cos(rad);
    const tipY = cy + handR * Math.sin(rad);

    return { cx, cy, tipX, tipY, handR, deg };
  }, [activeMode, selectedHour, selectedMinute]);

  // Precomputed Clock Face Number Layouts
  const hourNumbers = useMemo(() => {
    const list: Array<{ val: number; x: number; y: number; isInner: boolean }> = [];
    // Outer ring: 0 ~ 11 (Radius 100)
    for (let i = 0; i < 12; i++) {
      const rad = (i * 30 - 90) * Math.PI / 180;
      list.push({
        val: i,
        x: 128 + 100 * Math.cos(rad),
        y: 128 + 100 * Math.sin(rad),
        isInner: false,
      });
    }
    // Inner ring: 12 ~ 23 (Radius 66)
    for (let i = 0; i < 12; i++) {
      const rad = (i * 30 - 90) * Math.PI / 180;
      list.push({
        val: i + 12,
        x: 128 + 66 * Math.cos(rad),
        y: 128 + 66 * Math.sin(rad),
        isInner: true,
      });
    }
    return list;
  }, []);

  const minuteNumbers = useMemo(() => {
    const list: Array<{ val: number; label: string; x: number; y: number }> = [];
    for (let i = 0; i < 12; i++) {
      const rad = (i * 30 - 90) * Math.PI / 180;
      const val = i * 5;
      list.push({
        val,
        label: String(val).padStart(2, '0'),
        x: 128 + 100 * Math.cos(rad),
        y: 128 + 100 * Math.sin(rad),
      });
    }
    return list;
  }, []);

  // Quick Rehearsal Presets
  const PRESETS = [
    { label: '오후 7:30 (기본)', val: '19:30' },
    { label: '오후 9:30 (종료)', val: '21:30' },
    { label: '오후 7:00', val: '19:00' },
    { label: '오후 9:00', val: '21:00' },
    { label: '오후 2:00', val: '14:00' },
    { label: '오후 6:00', val: '18:00' },
  ];

  const handlePresetClick = (presetVal: string) => {
    onChange(presetVal);
    const [h24, m] = presetVal.split(':').map(Number);
    setSelectedHour(h24);
    setSelectedMinute(m);
    setHourInputText(String(h24).padStart(2, '0'));
    setMinuteInputText(String(m).padStart(2, '0'));
    setIsOpen(false);
  };

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

      {/* Unified Modal Popup with Dim Backdrop */}
      {isOpen && (
        <div
          className="picker-modal-backdrop"
          onClick={() => setIsOpen(false)}
          role="presentation"
        >
          <div
            className="picker-modal-dialog round-time-popover"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {/* Popover Header */}
            <div className="popover-time-header">
              <div className="popover-time-badge">
                {currentFormattedLabel}
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

            {/* Big Digital Time Display Row (Clickable & Keyboard Input) */}
            <div className="analog-digital-display-row">
              {/* Hour Card */}
              <div
                className={`analog-digit-card ${activeMode === 'hour' ? 'active' : ''}`}
                onClick={() => setActiveMode('hour')}
              >
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={2}
                  className="analog-digit-input"
                  value={hourInputText}
                  onChange={handleHourInputChange}
                  onBlur={handleHourInputBlur}
                  onFocus={() => setActiveMode('hour')}
                  aria-label="시(Hour) 직접 입력"
                />
                <span className="analog-digit-sublabel">시 (Hour)</span>
              </div>

              <span className="analog-digit-separator">:</span>

              {/* Minute Card */}
              <div
                className={`analog-digit-card ${activeMode === 'minute' ? 'active' : ''}`}
                onClick={() => setActiveMode('minute')}
              >
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={2}
                  className="analog-digit-input"
                  value={minuteInputText}
                  onChange={handleMinuteInputChange}
                  onBlur={handleMinuteInputBlur}
                  onFocus={() => setActiveMode('minute')}
                  aria-label="분(Minute) 직접 입력"
                />
                <span className="analog-digit-sublabel">분 (Minute)</span>
              </div>

              {/* AM / PM Segmented Toggle */}
              <div className="analog-period-toggle">
                <button
                  type="button"
                  className={`analog-period-chip ${selectedHour < 12 ? 'active' : ''}`}
                  onClick={() => handleToggleAMPM('AM')}
                  aria-label="오전 선택"
                >
                  오전
                </button>
                <button
                  type="button"
                  className={`analog-period-chip ${selectedHour >= 12 ? 'active' : ''}`}
                  onClick={() => handleToggleAMPM('PM')}
                  aria-label="오후 선택"
                >
                  오후
                </button>
              </div>
            </div>

            {/* Mode Hint */}
            <div className="analog-mode-hint">
              {activeMode === 'hour'
                ? '🕒 시(Hour) 바늘을 터치/드래그하세요 (0~23시)'
                : '⏱️ 분(Minute) 바늘을 터치/드래그하세요 (0~59분)'}
            </div>

            {/* Analog Clock Dial Face with Hand Pointer */}
            <div className="analog-clock-dial-wrap">
              <svg
                ref={dialRef}
                viewBox="0 0 256 256"
                className="analog-clock-svg"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              >
                {/* Dial Base Circle */}
                <circle cx="128" cy="128" r="126" fill="#f1f5f9" />

                {/* Clock Hand (Line + Tip Selection Circle) */}
                <line
                  x1={handGeometry.cx}
                  y1={handGeometry.cy}
                  x2={handGeometry.tipX}
                  y2={handGeometry.tipY}
                  stroke="#4f46e5"
                  strokeWidth="2.5"
                />
                <circle
                  cx={handGeometry.cx}
                  cy={handGeometry.cy}
                  r="4"
                  fill="#4f46e5"
                />
                <circle
                  cx={handGeometry.tipX}
                  cy={handGeometry.tipY}
                  r="16"
                  fill="#4f46e5"
                  filter="drop-shadow(0px 2px 4px rgba(79, 70, 229, 0.4))"
                />

                {/* Mode Numbers: Hour (0~23) or Minute (00~55) */}
                {activeMode === 'hour' ? (
                  hourNumbers.map((num) => {
                    const isSelected = selectedHour === num.val;
                    return (
                      <text
                        key={`h-${num.val}`}
                        x={num.x}
                        y={num.y}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={num.isInner ? '11' : '13'}
                        fontWeight={isSelected ? '800' : '600'}
                        fill={isSelected ? '#ffffff' : num.isInner ? '#64748b' : '#1e293b'}
                        style={{ pointerEvents: 'none' }}
                      >
                        {num.val}
                      </text>
                    );
                  })
                ) : (
                  <>
                    {minuteNumbers.map((m) => {
                      const isSelected = selectedMinute === m.val;
                      return (
                        <text
                          key={`m-${m.val}`}
                          x={m.x}
                          y={m.y}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize="12.5"
                          fontWeight={isSelected ? '800' : '600'}
                          fill={isSelected ? '#ffffff' : '#1e293b'}
                          style={{ pointerEvents: 'none' }}
                        >
                          {m.label}
                        </text>
                      );
                    })}
                    {/* If selected minute is not on 5m mark, show selected number inside tip */}
                    {selectedMinute % 5 !== 0 && (
                      <text
                        x={handGeometry.tipX}
                        y={handGeometry.tipY}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize="12"
                        fontWeight="800"
                        fill="#ffffff"
                        style={{ pointerEvents: 'none' }}
                      >
                        {String(selectedMinute).padStart(2, '0')}
                      </text>
                    )}
                  </>
                )}
              </svg>
            </div>

            {/* Quick Practice Presets */}
            <div className="analog-presets-wrap">
              <span className="analog-presets-title">⚡ 빠른 연습 시간 선택</span>
              <div className="analog-presets-row">
                {PRESETS.map((p) => (
                  <button
                    key={p.val}
                    type="button"
                    className={`analog-preset-chip ${value === p.val ? 'selected' : ''}`}
                    onClick={() => handlePresetClick(p.val)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Done Button */}
            <button
              type="button"
              className="analog-done-btn"
              onClick={() => {
                emitChange(selectedHour, selectedMinute);
                setIsOpen(false);
              }}
            >
              ✓ 시간 선택 완료
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
