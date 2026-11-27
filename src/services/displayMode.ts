export type DisplayMode = 'AUTO' | 'MOBILE' | 'DESKTOP';

const DISPLAY_MODE_KEY = 'moonchoir_display_mode_v1';
/** 예전 다크 모드 스위치가 저장하던 키(true/false). 읽기만 한다 */
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
const THEME_MODE_KEY = 'moonchoir_theme_mode_v1';

/** 화면 테마 선택: 일반(LIGHT) · 다크(DARK) · 시스템 설정 따라가기(SYSTEM) */
export type ThemeMode = 'LIGHT' | 'DARK' | 'SYSTEM';

/** 기기(시스템)가 다크 모드인지. matchMedia가 없는 환경에서는 false */
export function getSystemPrefersDark(): boolean {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(DARK_QUERY).matches === true;
  } catch {
    return false;
  }
}

/**
 * 저장된 테마 선택. 새 키가 없으면 예전 다크 모드 스위치 값(true/false)을 DARK/LIGHT로 읽고,
 * 둘 다 없거나 읽을 수 없으면 SYSTEM(시스템 설정 따라가기)이다.
 */
export function getThemeModePreference(): ThemeMode {
  try {
    if (typeof localStorage === 'undefined') return 'SYSTEM';
    const saved = localStorage.getItem(THEME_MODE_KEY);
    if (saved === 'LIGHT' || saved === 'DARK' || saved === 'SYSTEM') return saved;
    const legacy = localStorage.getItem(DARK_MODE_KEY);
    if (legacy === 'true') return 'DARK';
    if (legacy === 'false') return 'LIGHT';
    return 'SYSTEM';
  } catch (err) {
    console.warn('[Display mode] Failed to load theme preference:', err);
    return 'SYSTEM';
  }
}

export function saveThemeModePreference(mode: ThemeMode): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(THEME_MODE_KEY, mode);
  } catch (err) {
    console.warn('[Display mode] Failed to save theme preference:', err);
  }
}

/** 선택값과 시스템 설정으로 실제 다크 여부를 정한다 */
export function resolveIsDark(mode: ThemeMode, systemPrefersDark: boolean): boolean {
  return mode === 'DARK' || (mode === 'SYSTEM' && systemPrefersDark);
}

/** html에도 같은 테마를 표시해, 앱 바깥(배경·스크롤바·입력 기본 색)이 앱 테마와 어긋나지 않게 한다 */
export function applyThemeToDocument(isDark: boolean): void {
  if (typeof document === 'undefined' || typeof document.documentElement?.setAttribute !== 'function') return;
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
}

/** 시스템 다크 모드가 바뀔 때마다 알려 준다. 해제 함수를 돌려준다 */
export function subscribeSystemDarkMode(onChange: (isDark: boolean) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(DARK_QUERY);
  if (typeof query.addEventListener !== 'function') return () => {};
  const handler = (event: MediaQueryListEvent) => onChange(event.matches);
  query.addEventListener('change', handler);
  return () => query.removeEventListener('change', handler);
}
