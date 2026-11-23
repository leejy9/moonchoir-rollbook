import React from 'react';
import type { DisplayMode } from '../../services/displayMode';
import { InstallAppCard } from '../InstallAppCard';

export interface ProfileSettingsSectionProps {
  displayMode: DisplayMode;
  onChangeDisplayMode: (mode: DisplayMode) => void;
  isDarkMode: boolean;
  onChangeDarkMode: (enabled: boolean) => void;
  onChangeBinding: () => void;
  onLogout?: () => Promise<void>;
  isLoggingOut: boolean;
}

const DISPLAY_MODE_LABELS: Record<DisplayMode, string> = {
  AUTO: '자동',
  DESKTOP: '데스크톱',
  MOBILE: '모바일',
};

export const ProfileSettingsSection: React.FC<ProfileSettingsSectionProps> = ({
  displayMode,
  onChangeDisplayMode,
  isDarkMode,
  onChangeDarkMode,
  onChangeBinding,
  onLogout,
  isLoggingOut,
}) => {
  const handleDisplayModeChange = (value: string) => {
    if (value === 'AUTO' || value === 'DESKTOP' || value === 'MOBILE') {
      onChangeDisplayMode(value);
    }
  };

  return (
    <section className="profile-settings">
      <h2 className="profile-settings-title">앱 설정 및 관리</h2>
      <div className="profile-settings-menu">
        <label className="profile-settings-menu-row" htmlFor="profile-display-mode">
          <span>화면 표시 모드</span>
          <select
            id="profile-display-mode"
            className="profile-settings-select"
            style={{ minHeight: 44, minWidth: 44 }}
            value={displayMode}
            onChange={(event) => handleDisplayModeChange(event.target.value)}
          >
            {Object.entries(DISPLAY_MODE_LABELS).map(([mode, label]) => (
              <option key={mode} value={mode}>{label}</option>
            ))}
          </select>
        </label>

        <div className="profile-settings-menu-row">
          <span>다크 모드</span>
          <button
            type="button"
            className={`profile-settings-switch ${isDarkMode ? 'is-on' : ''}`}
            style={{ minHeight: 44, minWidth: 44 }}
            role="switch"
            aria-checked={isDarkMode}
            aria-label="다크 모드"
            onClick={() => onChangeDarkMode(!isDarkMode)}
          >
            <span className="profile-settings-switch-knob" />
          </button>
        </div>

        <InstallAppCard compact />

        <button
          type="button"
          className="profile-settings-menu-row profile-settings-action"
          onClick={onChangeBinding}
        >
          <span>브라우저 저장 단원 바꾸기</span>
          <span className="profile-settings-chevron" aria-hidden="true">›</span>
        </button>

        {onLogout && (
          <button
            type="button"
            className="profile-settings-menu-row profile-settings-action is-danger"
            onClick={() => void onLogout()}
            disabled={isLoggingOut}
          >
            <span>{isLoggingOut ? '로그아웃 처리 중...' : '로그아웃'}</span>
            <span className="profile-settings-chevron" aria-hidden="true">›</span>
          </button>
        )}
      </div>
    </section>
  );
};
