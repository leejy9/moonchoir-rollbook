import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bindDeviceProfile,
  clearDeviceProfile,
  getBoundDeviceProfile,
  isAdminLoggedIn,
  setAdminLoggedIn,
  touchAdminSession,
  validateAdminPin,
} from './auth';

describe('Device Binding & Authentication Service', () => {
  beforeEach(() => {
    clearDeviceProfile();
    setAdminLoggedIn(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('correctly binds and retrieves device profile', () => {
    expect(getBoundDeviceProfile()).toBeNull();

    const bound = bindDeviceProfile('mem_s01', '김하은', '소프라노', '1234');
    expect(bound.name).toBe('김하은');
    expect(bound.part).toBe('소프라노');

    const retrieved = getBoundDeviceProfile();
    expect(retrieved?.memberId).toBe('mem_s01');
    expect(retrieved?.phoneLast4).toBe('1234');
  });

  it('validates admin master PIN correctly', () => {
    // Default PIN is 1234
    expect(validateAdminPin('1234')).toBe(true);
    expect(validateAdminPin('0000')).toBe(false);
    expect(validateAdminPin(' 1234 ')).toBe(true); // Trimming support
  });

  it('manages admin session state', () => {
    expect(isAdminLoggedIn()).toBe(false);
    setAdminLoggedIn(true);
    expect(isAdminLoggedIn()).toBe(true);
    setAdminLoggedIn(false);
    expect(isAdminLoggedIn()).toBe(false);
  });

  it('expires the admin session after 15 minutes without activity', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T12:00:00'));
    setAdminLoggedIn(true);

    vi.advanceTimersByTime(15 * 60 * 1000 - 1);
    expect(isAdminLoggedIn()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(isAdminLoggedIn()).toBe(false);
  });

  it('extends the admin session when activity is recorded', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T12:00:00'));
    setAdminLoggedIn(true);

    vi.advanceTimersByTime(14 * 60 * 1000);
    touchAdminSession();
    vi.advanceTimersByTime(14 * 60 * 1000);

    expect(isAdminLoggedIn()).toBe(true);
  });
});
