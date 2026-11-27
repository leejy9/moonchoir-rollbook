import React from 'react';
import { snapPlaybackSpeed } from '../../utils/audioQueue';

export interface SpeedSheetProps {
  currentSpeed: number;
  onChangeSpeed: (speed: number) => void;
  onClose: () => void;
}

export const SpeedSheet: React.FC<SpeedSheetProps> = ({
  currentSpeed,
  onChangeSpeed,
  onClose,
}) => {
  const PRESETS = [0.75, 1.0, 1.25, 1.5];

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = parseFloat(e.target.value);
    const snapped = snapPlaybackSpeed(rawVal);
    onChangeSpeed(snapped);
  };

  const handleStep = (delta: number) => {
    const next = snapPlaybackSpeed(currentSpeed + delta);
    onChangeSpeed(next);
  };

  return (
    <div
      className="speed-sheet-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="재생 속도 조절"
    >
      <div className="speed-sheet-card" onClick={(e) => e.stopPropagation()}>
        {/* Large Speed Display */}
        <div className="speed-sheet-display">
          {currentSpeed.toFixed(2)}x
        </div>

        {/* Range Slider with +/- 0.05 step buttons */}
        <div className="speed-sheet-slider-row">
          <button
            type="button"
            className="speed-sheet-step-btn"
            onClick={() => handleStep(-0.05)}
            disabled={currentSpeed <= 0.5}
            aria-label="속도 0.05 감소"
          >
            −0.05
          </button>

          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.05"
            value={currentSpeed}
            onChange={handleSliderChange}
            aria-label="재생 속도"
            style={{ flex: 1, accentColor: 'var(--brand-primary)', height: '6px', cursor: 'pointer' }}
          />

          <button
            type="button"
            className="speed-sheet-step-btn"
            onClick={() => handleStep(0.05)}
            disabled={currentSpeed >= 2.0}
            aria-label="속도 0.05 증가"
          >
            +0.05
          </button>
        </div>

        {/* Preset Buttons */}
        <div className="speed-sheet-presets">
          {PRESETS.map((preset) => {
            const isActive = Math.abs(currentSpeed - preset) < 0.02;
            return (
              <button
                key={preset}
                type="button"
                className={`speed-sheet-preset-btn ${isActive ? 'active' : ''}`}
                onClick={() => onChangeSpeed(preset)}
              >
                {preset}x
              </button>
            );
          })}
        </div>

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          style={{
            width: '100%',
            minHeight: '44px',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-subtle)',
            color: 'var(--text-main)',
            fontSize: '14px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          닫기
        </button>
      </div>
    </div>
  );
};
