import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  clearDataCache,
  DATA_CACHE_KEYS,
  loadFromStorage,
  PREFERENCE_KEYS,
  readPreference,
  readPreferenceState,
  resetStorage,
  saveToStorage,
  STORAGE_KEYS,
  writePreference,
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

  it('reads preference with validator and handles invalid format by returning fallback', () => {
    writePreference(PREFERENCE_KEYS.HOME_CALENDAR_VIEW, 'invalid_view');
    const result = readPreference(
      PREFERENCE_KEYS.HOME_CALENDAR_VIEW,
      (val): val is 'week' | 'month' => val === 'week' || val === 'month',
      'week'
    );
    expect(result).toBe('week');

    writePreference(PREFERENCE_KEYS.HOME_CALENDAR_VIEW, 'month');
    const validResult = readPreference(
      PREFERENCE_KEYS.HOME_CALENDAR_VIEW,
      (val): val is 'week' | 'month' => val === 'week' || val === 'month',
      'week'
    );
    expect(validResult).toBe('month');
  });

  it('returns fallback when localStorage throws an error', () => {
    const errorStorage = {
      getItem: () => {
        throw new Error('SecurityError: access denied');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
      clear: () => {},
    };
    vi.stubGlobal('window', { localStorage: errorStorage });
    vi.stubGlobal('localStorage', errorStorage);

    const result = readPreference(
      PREFERENCE_KEYS.PLAYBACK_RATE,
      (val): val is number => typeof val === 'number',
      1
    );
    expect(result).toBe(1);

    expect(() => writePreference(PREFERENCE_KEYS.PLAYBACK_RATE, 1.5)).not.toThrow();
  });

  it('preserves preferences when clearDataCache is executed', () => {
    writePreference(PREFERENCE_KEYS.HOME_CALENDAR_VIEW, 'month');
    writePreference(PREFERENCE_KEYS.PLAYBACK_RATE, 1.25);
    writePreference(PREFERENCE_KEYS.STUDIO_SCOPE, 'all');

    clearDataCache();

    expect(
      readPreference(
        PREFERENCE_KEYS.HOME_CALENDAR_VIEW,
        (val): val is 'week' | 'month' => val === 'week' || val === 'month',
        'week'
      )
    ).toBe('month');
    expect(
      readPreference(
        PREFERENCE_KEYS.PLAYBACK_RATE,
        (val): val is number => typeof val === 'number',
        1
      )
    ).toBe(1.25);
  });

  describe('readPreferenceState (V3-22 R7)', () => {
    const isStrArr = (v: unknown): v is string[] =>
      Array.isArray(v) && v.every((x) => typeof x === 'string');

    it('키가 없으면 missing', () => {
      expect(readPreferenceState('k_none', isStrArr)).toEqual({ kind: 'missing' });
    });
    it('정상 값은 ok', () => {
      writePreference(PREFERENCE_KEYS.SEEN_COMMENTS, ['c1']);
      expect(readPreferenceState(PREFERENCE_KEYS.SEEN_COMMENTS, isStrArr)).toEqual({
        kind: 'ok',
        value: ['c1'],
      });
    });
    it('깨진 JSON은 invalid이고 저장값은 그대로다', () => {
      store.set(PREFERENCE_KEYS.SEEN_COMMENTS, '{broken');
      expect(readPreferenceState(PREFERENCE_KEYS.SEEN_COMMENTS, isStrArr)).toEqual({ kind: 'invalid' });
      expect(store.get(PREFERENCE_KEYS.SEEN_COMMENTS)).toBe('{broken');
    });
    it('검사에 실패하면 invalid', () => {
      store.set(PREFERENCE_KEYS.SEEN_COMMENTS, '[1,2]');
      expect(readPreferenceState(PREFERENCE_KEYS.SEEN_COMMENTS, isStrArr)).toEqual({ kind: 'invalid' });
    });
    it('저장소 접근이 실패해도 invalid', () => {
      const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => undefined, removeItem: () => undefined, clear: () => undefined };
      vi.stubGlobal('window', { localStorage: broken });
      vi.stubGlobal('localStorage', broken);
      resetStorage();
      expect(readPreferenceState('k', isStrArr)).toEqual({ kind: 'invalid' });
    });
  });
});
