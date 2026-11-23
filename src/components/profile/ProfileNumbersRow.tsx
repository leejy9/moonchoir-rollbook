import React from 'react';

export interface ProfileNumbersRowProps {
  daysTogether: number;
  practiceHours: number;
  performanceCount: number;
}

export const ProfileNumbersRow: React.FC<ProfileNumbersRowProps> = ({
  daysTogether,
  practiceHours,
  performanceCount,
}) => {
  return (
    <section className="profile-numbers-row">
      <div className="profile-number-card">
        <svg
          className="profile-number-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <div className="profile-number-value">{daysTogether}일</div>
        <div className="profile-number-label">함께한 날</div>
      </div>

      <div className="profile-number-card">
        <svg
          className="profile-number-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <div className="profile-number-value">{practiceHours}시간</div>
        <div className="profile-number-label">연습</div>
      </div>

      <div className="profile-number-card">
        <svg
          className="profile-number-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
        <div className="profile-number-value">{performanceCount}번</div>
        <div className="profile-number-label">공연</div>
      </div>
    </section>
  );
};
