import React from 'react';
import type { MemberLevelInfo } from '../../utils/memberProgress';

export interface ProfileHeroCardsProps {
  levelInfo: MemberLevelInfo;
  attendanceRate: number | null;
  onOpenLevel: () => void;
  onOpenAttendance: () => void;
}

export const ProfileHeroCards: React.FC<ProfileHeroCardsProps> = ({
  levelInfo,
  attendanceRate,
  onOpenLevel,
  onOpenAttendance,
}) => {
  return (
    <section className="profile-hero-row">
      {/* Level Card */}
      <button
        type="button"
        className="profile-level-card"
        onClick={onOpenLevel}
      >
        <div className="profile-level-header">
          <span className="profile-level-label">내 레벨</span>
        </div>
        <div className="profile-level-main">
          <span className="profile-level-num">{`Lv.${levelInfo.level}`}</span>
          <span className="profile-level-title">{levelInfo.name}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div className="profile-level-progress-bg">
            <div
              className="profile-level-progress-bar"
              style={{ width: `${levelInfo.progressPercent}%` }}
            />
          </div>
          {levelInfo.summaryText ? (
            <div className="profile-level-hint">{levelInfo.summaryText}</div>
          ) : null}
        </div>
      </button>

      {/* Attendance Donut Ring Card */}
      <button
        type="button"
        className="profile-ring-card"
        onClick={onOpenAttendance}
      >
        <svg className="profile-donut-svg" viewBox="0 0 96 96">
          <circle
            className="profile-donut-bg"
            cx={48}
            cy={48}
            r={38}
            stroke="var(--border-subtle)"
            strokeWidth={8}
            fill="none"
          />
          {attendanceRate !== null && (
            <circle
              className="profile-donut-fill"
              cx={48}
              cy={48}
              r={38}
              stroke="var(--brand-primary)"
              strokeWidth={8}
              fill="none"
              strokeDasharray={238.76}
              strokeDashoffset={238.76 * (1 - (attendanceRate || 0) / 100)}
              strokeLinecap="round"
              transform="rotate(-90 48 48)"
            />
          )}
          <text
            x={48}
            y={attendanceRate !== null ? 52 : 55}
            textAnchor="middle"
            fill="var(--text-main)"
            fontSize={attendanceRate !== null ? '20' : '24'}
            fontWeight="800"
          >
            {attendanceRate !== null ? `${attendanceRate}%` : '—'}
          </text>
        </svg>
        {attendanceRate !== null && (
          <span className="profile-ring-label">출석률</span>
        )}
      </button>
    </section>
  );
};
