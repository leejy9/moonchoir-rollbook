import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getSystemPrefersDark,
  getThemeModePreference,
  resolveIsDark,
  getDisplayModePreference,
  saveThemeModePreference,
  saveDisplayModePreference,
} from './displayMode';

describe('display mode preference', () => {
  let values: Map<string, string>;

  beforeEach(() => {
    values = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to automatic mode', () => {
    expect(getDisplayModePreference()).toBe('AUTO');
  });

  it('persists a selected display mode', () => {
    saveDisplayModePreference('MOBILE');

    expect(getDisplayModePreference()).toBe('MOBILE');
  });

  it('returns to automatic mode when the preference is cleared', () => {
    saveDisplayModePreference('DESKTOP');
    saveDisplayModePreference('AUTO');

    expect(getDisplayModePreference()).toBe('AUTO');
  });

  it('ignores invalid stored values', () => {
    localStorage.setItem('moonchoir_display_mode_v1', 'TABLET');

    expect(getDisplayModePreference()).toBe('AUTO');
  });

  it('defaults the theme to SYSTEM and persists the selected mode', () => {
    expect(getThemeModePreference()).toBe('SYSTEM');

    saveThemeModePreference('DARK');
    expect(getThemeModePreference()).toBe('DARK');

    saveThemeModePreference('LIGHT');
    expect(getThemeModePreference()).toBe('LIGHT');

    saveThemeModePreference('SYSTEM');
    expect(getThemeModePreference()).toBe('SYSTEM');
  });

  it('migrates the legacy dark-mode switch value when no theme mode is saved', () => {
    localStorage.setItem('moonchoir_dark_mode_v1', 'true');
    expect(getThemeModePreference()).toBe('DARK');

    localStorage.setItem('moonchoir_dark_mode_v1', 'false');
    expect(getThemeModePreference()).toBe('LIGHT');

    // 새 선택값이 있으면 예전 값보다 우선한다
    saveThemeModePreference('SYSTEM');
    expect(getThemeModePreference()).toBe('SYSTEM');
  });

  it('treats an unreadable stored value as SYSTEM', () => {
    localStorage.setItem('moonchoir_theme_mode_v1', 'maybe');
    localStorage.setItem('moonchoir_dark_mode_v1', 'maybe');
    expect(getThemeModePreference()).toBe('SYSTEM');
  });

  it('resolves dark only for DARK, or for SYSTEM while the device is dark', () => {
    expect(resolveIsDark('DARK', false)).toBe(true);
    expect(resolveIsDark('LIGHT', true)).toBe(false);
    expect(resolveIsDark('SYSTEM', true)).toBe(true);
    expect(resolveIsDark('SYSTEM', false)).toBe(false);
  });

  it('reads the system dark preference from matchMedia', () => {
    expect(getSystemPrefersDark()).toBe(false);
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
    expect(getSystemPrefersDark()).toBe(true);
  });
});
