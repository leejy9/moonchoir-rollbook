import React from 'react';
import type { PassionTemperatureResult } from '../../utils/passionTemperature';
import { IconThermometer } from '../Icons';
import { PASSION_RULES } from '../../utils/passionRules';

export interface ProfilePassionTempCardProps {
  result: PassionTemperatureResult;
  onOpen: () => void;
}

export const ProfilePassionTempCard: React.FC<ProfilePassionTempCardProps> = ({
  result,
  onOpen,
}) => {
  const temperatureRange = PASSION_RULES.MAX_TEMPERATURE - PASSION_RULES.MIN_TEMPERATURE;
  const percent = Math.min(
    100,
    Math.max(0, ((result.value - PASSION_RULES.MIN_TEMPERATURE) / temperatureRange) * 100)
  );
  const baselinePercent =
    ((PASSION_RULES.BASE_TEMPERATURE - PASSION_RULES.MIN_TEMPERATURE) / temperatureRange) * 100;
  const roundedDelta = Math.round(result.weeklyDelta * 10) / 10;
  const showDelta = roundedDelta !== 0;
  const isUp = roundedDelta > 0;
  const deltaText = isUp
    ? `▲ ${roundedDelta.toFixed(1)}`
    : `▼ ${Math.abs(roundedDelta).toFixed(1)}`;

  return (
    <section
      className="profile-temp-card"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      aria-label="열정 온도 내역 보기"
    >
      <div className="profile-temp-top">
        <div className="profile-temp-left">
          <div className="profile-temp-icon-circle">
            <IconThermometer size={20} />
          </div>
          <div className="profile-temp-info">
            <span className="profile-temp-title">열정 온도</span>
            <span className="profile-temp-value">{`${result.value.toFixed(1)}°C`}</span>
          </div>
        </div>
        {showDelta && (
          <div className={`profile-temp-delta ${isUp ? 'up' : 'down'}`}>
            {deltaText}
          </div>
        )}
      </div>

      <div
        className="profile-temp-bar-wrap"
        role="meter"
        aria-label="열정 온도"
        aria-valuemin={PASSION_RULES.MIN_TEMPERATURE}
        aria-valuemax={PASSION_RULES.MAX_TEMPERATURE}
        aria-valuenow={result.value}
        aria-valuetext={`${result.value.toFixed(1)}°C`}
      >
        <div className="profile-temp-bar" style={{ width: `${percent}%` }} />
        <div className="profile-temp-tick" style={{ left: `${baselinePercent}%` }} />
        <div className="profile-temp-indicator" style={{ left: `${percent}%` }} />
      </div>
    </section>
  );
};
