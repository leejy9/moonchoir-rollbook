import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getDarkModePreference,
  getDisplayModePreference,
  saveDarkModePreference,
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

  it('defaults dark mode to off and persists the selected state', () => {
    expect(getDarkModePreference()).toBe(false);

    saveDarkModePreference(true);
    expect(getDarkModePreference()).toBe(true);

    saveDarkModePreference(false);
    expect(getDarkModePreference()).toBe(false);
  });
});
