import React from 'react';
import type { DisplayMode, ThemeMode } from '../../services/displayMode';
import { InstallAppCard } from '../InstallAppCard';

export interface ProfileSettingsSectionProps {
  displayMode: DisplayMode;
  onChangeDisplayMode: (mode: DisplayMode) => void;
  themeMode: ThemeMode;
  onChangeThemeMode: (mode: ThemeMode) => void;
  onChangeBinding: () => void;
  onLogout?: () => Promise<void>;
  isLoggingOut: boolean;
}

const DISPLAY_MODE_LABELS: Record<DisplayMode, string> = {
  AUTO: '자동',
  DESKTOP: '데스크톱',
  MOBILE: '모바일',
};

const THEME_MODE_LABELS: Record<ThemeMode, string> = {
  LIGHT: '일반',
  DARK: '다크',
  SYSTEM: '시스템',
};

export const ProfileSettingsSection: React.FC<ProfileSettingsSectionProps> = ({
  displayMode,
  onChangeDisplayMode,
  themeMode,
  onChangeThemeMode,
  onChangeBinding,
  onLogout,
  isLoggingOut,
}) => {
  const handleDisplayModeChange = (value: string) => {
    if (value === 'AUTO' || value === 'DESKTOP' || value === 'MOBILE') {
      onChangeDisplayMode(value);
    }
  };

  const handleThemeModeChange = (value: string) => {
    if (value === 'LIGHT' || value === 'DARK' || value === 'SYSTEM') {
      onChangeThemeMode(value);
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

        <label className="profile-settings-menu-row" htmlFor="profile-theme-mode">
          <span>화면 테마</span>
          <select
            id="profile-theme-mode"
            className="profile-settings-select"
            style={{ minHeight: 44, minWidth: 44 }}
            value={themeMode}
            onChange={(event) => handleThemeModeChange(event.target.value)}
          >
            {Object.entries(THEME_MODE_LABELS).map(([mode, label]) => (
              <option key={mode} value={mode}>{label}</option>
            ))}
          </select>
        </label>

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
