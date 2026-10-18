import React from 'react';

interface LiquidGaugeProps {
  percentage: number;
  size?: number;
  label?: string;
  showLabel?: boolean;
  subText?: string;
  className?: string;
}

export const LiquidGauge: React.FC<LiquidGaugeProps> = ({
  percentage,
  size = 48,
  label,
  showLabel = true,
  subText,
  className = '',
}) => {
  // Clamp between 0 and 100
  const clampedPercent = Math.max(0, Math.min(100, Math.round(percentage)));
  const isHigh = clampedPercent >= 45;
  const isFull = clampedPercent >= 100;

  const displayLabel = label !== undefined ? label : `${clampedPercent}%`;

  return (
    <div className={`liquid-gauge-wrapper ${className}`}>
      <div
        className={`liquid-gauge-container ${isFull ? 'full-charge' : ''}`}
        style={{ width: `${size}px`, height: `${size}px` }}
        title={`${subText || '투표율'}: ${clampedPercent}%`}
      >
        {/* Liquid Fill with Wave crests */}
        <div
          className="liquid-gauge-fill"
          style={{ height: `${clampedPercent}%` }}
        >
          {clampedPercent > 0 && clampedPercent < 100 && (
            <>
              <div className="liquid-wave-surface sub" />
              <div className="liquid-wave-surface" />
            </>
          )}
        </div>

        {/* Center Label */}
        {showLabel && (
          <span
            className={`liquid-gauge-label ${isHigh ? 'is-high' : 'is-low'}`}
            style={{ fontSize: `${Math.max(10, Math.round(size * 0.24))}px` }}
          >
            {displayLabel}
          </span>
        )}
      </div>

      {subText && <span className="liquid-gauge-subtext">{subText}</span>}
    </div>
  );
};
