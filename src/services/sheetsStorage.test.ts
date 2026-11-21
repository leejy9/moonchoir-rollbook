import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  clearDataCache,
  DATA_CACHE_KEYS,
  loadFromStorage,
  resetStorage,
  saveToStorage,
  STORAGE_KEYS,
} from './sheetsStorage';

describe('sheetsStorage', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map<string, string>();
    const mockStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    };
    vi.stubGlobal('window', { localStorage: mockStorage });
    vi.stubGlobal('localStorage', mockStorage);
    resetStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('saves and loads data with fallback safely', () => {
    expect(loadFromStorage('non_existent', { fallback: true })).toEqual({ fallback: true });

    saveToStorage(STORAGE_KEYS.MEMBERS, [{ id: 'm1', name: '테스트' }]);
    expect(loadFromStorage(STORAGE_KEYS.MEMBERS, [])).toEqual([{ id: 'm1', name: '테스트' }]);
  });

  it('clearDataCache deletes all data cache keys while preserving device binding and admin tokens', () => {
    // Seed data cache keys
    for (const key of DATA_CACHE_KEYS) {
      saveToStorage(key, { key, value: 'cached_data' });
    }

    // Seed auth / device / preference keys that must NOT be deleted
    const preservedKeys: Record<string, string> = {
      moonchoir_bound_device_v1: JSON.stringify({ memberId: 'm1', boundDeviceId: 'dev-abc' }),
      moonchoir_admin_token_v1: 'token_admin_64char_value_for_testing',
      moonchoir_super_admin_token_v1: 'token_super_64char_value_for_testing',
      moonchoir_display_mode: 'notion',
    };
    for (const [key, value] of Object.entries(preservedKeys)) {
      window.localStorage.setItem(key, value);
    }

    // Execute clearDataCache
    clearDataCache();

    // Verify all data cache keys are removed
    for (const key of DATA_CACHE_KEYS) {
      expect(window.localStorage.getItem(key)).toBeNull();
    }

    // Verify all auth, session, and device keys remain intact
    for (const [key, expectedValue] of Object.entries(preservedKeys)) {
      expect(window.localStorage.getItem(key)).toBe(expectedValue);
    }
  });
});
