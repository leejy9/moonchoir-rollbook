import React from 'react';
import type { DisplayMode } from '../../services/displayMode';
import { InstallAppCard } from '../InstallAppCard';

export interface ProfileSettingsSectionProps {
  hasAdminMenuAccess: boolean;
  onOpenAdmin?: () => void;
  displayMode: DisplayMode;
  onChangeDisplayMode: (mode: DisplayMode) => void;
  isDarkMode: boolean;
  onChangeDarkMode: (enabled: boolean) => void;
  isSyncing: boolean;
  syncFeedback: { type: 'success' | 'error'; text: string } | null;
  onSyncRemote: () => Promise<void>;
  onChangeBinding: () => void;
  onLogout?: () => Promise<void>;
  isLoggingOut: boolean;
}

export const ProfileSettingsSection: React.FC<ProfileSettingsSectionProps> = ({
  hasAdminMenuAccess,
  onOpenAdmin,
  displayMode,
  onChangeDisplayMode,
  isDarkMode,
  onChangeDarkMode,
  isSyncing,
  syncFeedback,
  onSyncRemote,
  onChangeBinding,
  onLogout,
  isLoggingOut,
}) => {
  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '16px',
        background: 'var(--bg-card)',
        borderRadius: '16px',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>
        앱 설정 및 관리
      </span>

      {/* Sync Feedback Message */}
      {syncFeedback && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            backgroundColor:
              syncFeedback.type === 'success'
                ? 'var(--brand-lavender-tint)'
                : 'var(--status-danger-light, #fee2e2)',
            color:
              syncFeedback.type === 'success'
                ? 'var(--brand-lavender-text)'
                : 'var(--status-danger, #b91c1c)',
          }}
        >
          {syncFeedback.text}
        </div>
      )}

      {/* Admin Switch Button */}
      {hasAdminMenuAccess && onOpenAdmin && (
        <div>
          <button
            type="button"
            onClick={onOpenAdmin}
            style={{
              width: '100%',
              minHeight: '44px',
              padding: '10px 16px',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--brand-primary)',
              color: 'var(--text-white)',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            운영진 모드로 전환
          </button>
        </div>
      )}

      {/* Display Mode Selection */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-sub)' }}>
          화면 표시 모드
        </span>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(['AUTO', 'DESKTOP', 'MOBILE'] as DisplayMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onChangeDisplayMode(mode)}
              style={{
                flex: 1,
                minHeight: '44px',
                minWidth: '44px',
                padding: '8px 12px',
                borderRadius: '8px',
                border: `1px solid ${displayMode === mode ? 'var(--brand-lavender)' : 'var(--border-subtle)'}`,
                backgroundColor: displayMode === mode ? 'var(--brand-lavender-tint)' : 'var(--bg-card)',
                color: displayMode === mode ? 'var(--brand-lavender-text)' : 'var(--text-sub)',
                fontWeight: displayMode === mode ? 700 : 500,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              {mode === 'AUTO' ? '자동' : mode === 'DESKTOP' ? '데스크톱' : '모바일'}
            </button>
          ))}
        </div>
      </div>

      {/* Dark Mode Toggle */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: '8px',
          borderTop: '1px solid var(--border-subtle)',
        }}
      >
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>다크 모드</span>
        <button
          type="button"
          onClick={() => onChangeDarkMode(!isDarkMode)}
          style={{
            minHeight: '44px',
            minWidth: '44px',
            padding: '8px 16px',
            borderRadius: '8px',
            border: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-card)',
            color: 'var(--text-main)',
            fontWeight: 600,
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          {isDarkMode ? '켜짐' : '꺼짐'}
        </button>
      </div>

      {/* Google Sheets Sync Button */}
      <div style={{ paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
        <button
          type="button"
          onClick={() => void onSyncRemote()}
          disabled={isSyncing}
          style={{
            width: '100%',
            minHeight: '44px',
            padding: '10px 16px',
            borderRadius: '8px',
            border: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-card)',
            color: 'var(--text-main)',
            fontWeight: 600,
            fontSize: '13px',
            cursor: isSyncing ? 'not-allowed' : 'pointer',
          }}
        >
          {isSyncing ? '구글 시트 동기화 중...' : '구글 시트 최신 데이터와 동기화'}
        </button>
      </div>

      {/* Install PWA App Card */}
      <div style={{ paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
        <InstallAppCard />
      </div>

      {/* Switch Bound Member & Logout */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          paddingTop: '8px',
          borderTop: '1px solid var(--border-subtle)',
        }}
      >
        <button
          type="button"
          onClick={onChangeBinding}
          style={{
            width: '100%',
            minHeight: '44px',
            padding: '10px 16px',
            borderRadius: '8px',
            border: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-card)',
            color: 'var(--text-main)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          이 브라우저에 저장된 단원 바꾸기
        </button>

        {onLogout && (
          <button
            type="button"
            onClick={() => void onLogout()}
            disabled={isLoggingOut}
            style={{
              width: '100%',
              minHeight: '44px',
              padding: '10px 16px',
              borderRadius: '8px',
              border: '1px solid var(--status-danger-light, #fecdd3)',
              backgroundColor: 'var(--status-danger-light, #fff1f2)',
              color: 'var(--status-danger, #b91c1c)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: isLoggingOut ? 'not-allowed' : 'pointer',
            }}
          >
            {isLoggingOut ? '로그아웃 처리 중...' : '이 브라우저에서 로그아웃'}
          </button>
        )}
      </div>
    </section>
  );
};
