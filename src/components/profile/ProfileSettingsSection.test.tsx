import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ProfileSettingsSection } from './ProfileSettingsSection';

describe('ProfileSettingsSection', () => {
  it('shows only the five compact member settings and management rows', () => {
    const html = renderToString(
      <ProfileSettingsSection
        displayMode="AUTO"
        onChangeDisplayMode={vi.fn()}
        isDarkMode={false}
        onChangeDarkMode={vi.fn()}
        onChangeBinding={vi.fn()}
        onLogout={vi.fn()}
        isLoggingOut={false}
      />
    );

    expect(html.match(/profile-settings-menu-row/g)).toHaveLength(5);
    expect(html).toContain('화면 표시 모드');
    expect(html).toContain('다크 모드');
    expect(html).toContain('앱처럼 설치하기');
    expect(html).toContain('브라우저 저장 단원 바꾸기');
    expect(html).toContain('로그아웃');
    expect(html).not.toContain('운영진 모드로 전환');
    expect(html).not.toContain('구글 시트 최신 데이터와 동기화');
  });

  it('omits the install menu row when the app is already standalone', () => {
    vi.stubGlobal('navigator', { userAgent: 'test', standalone: true });

    const html = renderToString(
      <ProfileSettingsSection
        displayMode="AUTO"
        onChangeDisplayMode={vi.fn()}
        isDarkMode={false}
        onChangeDarkMode={vi.fn()}
        onChangeBinding={vi.fn()}
        isLoggingOut={false}
      />
    );

    expect(html).not.toContain('profile-settings-install-row');
    expect(html.match(/profile-settings-menu-row/g)).toHaveLength(3);
  });

  it('keeps the external-browser action in a Kakao in-app browser', () => {
    vi.stubGlobal('navigator', { userAgent: 'KAKAOTALK', standalone: false });
    vi.stubGlobal('window', { location: { href: 'https://example.test/profile' } });

    const html = renderToString(
      <ProfileSettingsSection
        displayMode="AUTO"
        onChangeDisplayMode={vi.fn()}
        isDarkMode={false}
        onChangeDarkMode={vi.fn()}
        onChangeBinding={vi.fn()}
        isLoggingOut={false}
      />
    );

    expect(html).toContain('기본 브라우저로 열기');
    expect(html).toContain('kakaotalk://web/openExternal?url=https%3A%2F%2Fexample.test%2Fprofile');
  });

  afterEach(() => vi.unstubAllGlobals());
});
