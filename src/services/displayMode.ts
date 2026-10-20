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

export function getDarkModePreference(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(DARK_MODE_KEY) === 'true';
  } catch (err) {
    console.warn('[Display mode] Failed to load dark mode preference:', err);
    return false;
  }
}

export function saveDarkModePreference(enabled: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(DARK_MODE_KEY, String(enabled));
  } catch (err) {
    console.warn('[Display mode] Failed to save dark mode preference:', err);
  }
}
