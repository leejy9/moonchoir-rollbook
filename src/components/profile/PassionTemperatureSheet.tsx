import React from 'react';
import type { PassionTemperatureResult } from '../../utils/passionTemperature';

export interface PassionTemperatureSheetProps {
  result: PassionTemperatureResult;
  onClose: () => void;
  onSelectScheduleFilter: (itemLabel: string, scheduleIds: string[]) => void;
}

export const PassionTemperatureSheet: React.FC<PassionTemperatureSheetProps> = ({
  result,
  onClose,
  onSelectScheduleFilter,
}) => {
  const { value, weeklyDelta, windowSize, groups } = result;

  // Temperature gauge percentage (34.0 ~ 42.0°C range)
  const gaugePercent = Math.max(0, Math.min(100, ((value - 34.0) / 8.0) * 100));

  const formatDelta = (d: number): string => {
    if (d > 0) return `+${d.toFixed(2)}`;
    if (d < 0) return `−${Math.abs(d).toFixed(2)}`;
    return '0';
  };

  const formatWeeklyDelta = (d: number): string => {
    if (d > 0) return `▲ +${d.toFixed(1)}`;
    if (d < 0) return `▼ −${Math.abs(d).toFixed(1)}`;
    return '— 0.0';
  };

  return (
    <div
      className="profile-sheet-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="passion-temperature-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="profile-sheet-content">
        <div className="profile-sheet-header">
          <h2 id="passion-temperature-title" className="profile-sheet-title">
            열정 온도
          </h2>
          <button
            type="button"
            className="profile-sheet-close-btn"
            onClick={onClose}
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        {/* Hero Card */}
        <div className="passion-sheet-hero-card">
          <div className="passion-sheet-hero-top">
            <div>
              <div className="passion-sheet-big-num">{`${value.toFixed(1)}°C`}</div>
              <div className="passion-sheet-hero-subtitle">
                {windowSize > 0 ? `최근 ${windowSize}회` : '아직 기록이 없어요'}
              </div>
            </div>
            {windowSize > 0 && (
              <span
                className={`passion-sheet-delta-pill ${
                  weeklyDelta > 0 ? 'up' : weeklyDelta < 0 ? 'down' : 'zero'
                }`}
              >
                {formatWeeklyDelta(weeklyDelta)}
              </span>
            )}
          </div>

          {/* Temperature Bar */}
          <div className="passion-gauge-track">
            <div
              className="passion-gauge-fill"
              style={{ width: `${gaugePercent}%` }}
            />
            {/* Base temperature marker (36.5°C = 31.25%) */}
            <div
              className="passion-gauge-base-marker"
              style={{ left: '31.25%' }}
              title="기준 36.5°C"
            />
          </div>
          <div className="passion-gauge-labels">
            <span>34.0</span>
            <span className="passion-gauge-base-label">36.5</span>
            <span>42.0</span>
          </div>
        </div>

        {/* 기록이 없으면 위 큰 숫자 아래 "아직 기록이 없어요" 한 줄만 보인다(명세 §5-5). 묶음 영역은 그리지 않는다. */}
        {windowSize === 0 ? null : (
          <div className="passion-sheet-groups">
            {groups.map((group) => {
              // 0이 아닌 항목만 표시. 지각은 점수가 0이어도 1회 이상이면 표시(명세 §5-5)
              const visibleItems = group.items.filter((item) => item.count > 0 || item.delta !== 0);
              if (visibleItems.length === 0) return null;

              return (
                <div key={group.key} className="passion-group-section">
                  <div className="passion-group-header">
                    <span className="passion-group-title">{group.title}</span>
                    <span
                      className={`passion-group-total ${
                        group.totalDelta > 0
                          ? 'positive'
                          : group.totalDelta < 0
                            ? 'negative'
                            : ''
                      }`}
                    >
                      {formatDelta(group.totalDelta)}
                    </span>
                  </div>

                  <div className="passion-group-items">
                    {visibleItems.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className="passion-item-row"
                        onClick={() =>
                          item.scheduleIds.length > 0 &&
                          onSelectScheduleFilter(item.label, item.scheduleIds)
                        }
                        disabled={item.scheduleIds.length === 0}
                      >
                        <span className="passion-item-label">{item.label}</span>
                        <div className="passion-item-right">
                          <span
                            className={`passion-item-score ${
                              item.delta > 0
                                ? 'positive'
                                : item.delta < 0
                                  ? 'negative'
                                  : 'neutral'
                            }`}
                          >
                            {formatDelta(item.delta)}
                          </span>
                          {item.scheduleIds.length > 0 && (
                            <span className="passion-item-arrow" aria-hidden="true">
                              ›
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
