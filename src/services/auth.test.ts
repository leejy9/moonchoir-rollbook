import { beforeEach, describe, expect, it } from 'vitest';
import {
  bindDeviceProfile,
  clearDeviceProfile,
  getBoundDeviceProfile,
  isAdminLoggedIn,
  setAdminLoggedIn,
  validateAdminPin,
} from './auth';

describe('Device Binding & Authentication Service', () => {
  beforeEach(() => {
    clearDeviceProfile();
    setAdminLoggedIn(false);
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
});
