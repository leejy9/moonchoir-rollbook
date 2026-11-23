export type DisplayMode = 'AUTO' | 'MOBILE' | 'DESKTOP';

const DISPLAY_MODE_KEY = 'moonchoir_display_mode_v1';
const DARK_MODE_KEY = 'moonchoir_dark_mode_v1';

export function getDisplayModePreference(): DisplayMode {
  try {
    if (typeof localStorage === 'undefined') return 'AUTO';
    const saved = localStorage.getItem(DISPLAY_MODE_KEY);
    if (saved === 'AUTO' || saved === 'MOBILE' || saved === 'DESKTOP') return saved;
    return 'AUTO';
  } catch (err) {
    console.warn('[Display mode] Failed to load preference:', err);
    return 'AUTO';
  }
}

export function saveDisplayModePreference(mode: DisplayMode): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (mode === 'AUTO') {
      localStorage.removeItem(DISPLAY_MODE_KEY);
    } else {
      localStorage.setItem(DISPLAY_MODE_KEY, mode);
    }
  } catch (err) {
    console.warn('[Display mode] Failed to save preference:', err);
  }
}

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** 기기(시스템)가 다크 모드인지. matchMedia가 없는 환경에서는 false */
export function getSystemPrefersDark(): boolean {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(DARK_QUERY).matches === true;
  } catch {
    return false;
  }
}

/** 사용자가 설정에서 다크 모드를 직접 골랐는지(저장값이 있는지). 읽기 실패는 "없음"으로 본다 */
export function hasSavedDarkModePreference(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    const saved = localStorage.getItem(DARK_MODE_KEY);
    return saved === 'true' || saved === 'false';
  } catch {
    return false;
  }
}

/** 직접 고른 값이 있으면 그 값, 없으면 시스템 설정(prefers-color-scheme)을 따른다 */
export function getDarkModePreference(): boolean {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(DARK_MODE_KEY);
      if (saved === 'true') return true;
      if (saved === 'false') return false;
    }
  } catch (err) {
    console.warn('[Display mode] Failed to load dark mode preference:', err);
  }
  return getSystemPrefersDark();
}

/** html에도 같은 테마를 표시해, 앱 바깥(배경·스크롤바·입력 기본 색)이 앱 테마와 어긋나지 않게 한다 */
export function applyThemeToDocument(isDark: boolean): void {
  if (typeof document === 'undefined' || typeof document.documentElement?.setAttribute !== 'function') return;
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
}

/** 저장값이 없을 때만 시스템 다크 모드 변경을 따라가도록 구독한다. 해제 함수를 돌려준다 */
export function subscribeSystemDarkMode(onChange: (isDark: boolean) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(DARK_QUERY);
  if (typeof query.addEventListener !== 'function') return () => {};
  const handler = (event: MediaQueryListEvent) => {
    if (!hasSavedDarkModePreference()) onChange(event.matches);
  };
  query.addEventListener('change', handler);
  return () => query.removeEventListener('change', handler);
}

export function saveDarkModePreference(enabled: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(DARK_MODE_KEY, String(enabled));
  } catch (err) {
    console.warn('[Display mode] Failed to save dark mode preference:', err);
  }
}
