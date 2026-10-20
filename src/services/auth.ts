import type { BoundDeviceProfile, PartType } from '../types/rollbook';
import { sheetsService } from './sheets';
import { getKSTTimestampString } from '../utils/date';

const AUTH_KEYS = {
  DEVICE_PROFILE: 'moonchoir_bound_device_v1',
  ADMIN_SESSION: 'moonchoir_admin_session_v1',
};
const ADMIN_IDLE_TIMEOUT_MS = 15 * 60 * 1000;

class MemoryStorage {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = value;
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  clear(): void {
    this.store = {};
  }
}

const memoryStorage = new MemoryStorage();

function getStorage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const testKey = '__mc_auth_probe__';
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return window.localStorage;
    }
  } catch (err) {
    console.warn('[Auth] localStorage probe failed, using fallback:', err);
  }
  return memoryStorage;
}

export function getBoundDeviceProfile(): BoundDeviceProfile | null {
  try {
    const storage = getStorage();
    if (!storage) return null;
    const raw = storage.getItem(AUTH_KEYS.DEVICE_PROFILE);
    if (!raw) return null;
    return JSON.parse(raw) as BoundDeviceProfile;
  } catch (err) {
    console.warn('[Auth] Failed to load device profile:', err);
    return null;
  }
}

export function getOrCreateDeviceId(): string {
  const storage = getStorage();
  if (!storage) return 'dev_temp_' + Math.random().toString(36).slice(2);
  let devId = storage.getItem('moonchoir_client_device_id');
  if (!devId) {
    devId = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
    storage.setItem('moonchoir_client_device_id', devId);
  }
  return devId;
}

export function bindDeviceProfile(
  memberId: string,
  name: string,
  part: PartType,
  phoneLast4: string,
  deviceId?: string
): BoundDeviceProfile {
  const profile: BoundDeviceProfile = {
    memberId,
    name,
    part,
    phoneLast4,
    boundAt: getKSTTimestampString(),
    deviceId: deviceId || getOrCreateDeviceId(),
  };

  const storage = getStorage();
  if (storage) {
    storage.setItem(AUTH_KEYS.DEVICE_PROFILE, JSON.stringify(profile));
  }
  return profile;
}

export function updateBoundDeviceProfile(
  updates: Partial<BoundDeviceProfile>
): BoundDeviceProfile | null {
  const current = getBoundDeviceProfile();
  if (!current) return null;
  const updated: BoundDeviceProfile = {
    ...current,
    ...updates,
  };
  const storage = getStorage();
  if (storage) {
    storage.setItem(AUTH_KEYS.DEVICE_PROFILE, JSON.stringify(updated));
  }
  return updated;
}

export function clearDeviceProfile(): void {
  const storage = getStorage();
  if (storage) {
    storage.removeItem(AUTH_KEYS.DEVICE_PROFILE);
  }
}

export function validateAdminPin(inputPin: string): boolean {
  const config = sheetsService.getConfig();
  const validPin = config.adminPin || '1234';
  return inputPin.trim() === validPin.trim();
}

export function isAdminLoggedIn(): boolean {
  const storage = getStorage();
  if (!storage) return false;
  const raw = storage.getItem(AUTH_KEYS.ADMIN_SESSION);
  if (!raw) return false;

  try {
    const session = JSON.parse(raw) as { lastActivityAt?: number };
    if (
      typeof session.lastActivityAt !== 'number' ||
      Date.now() - session.lastActivityAt >= ADMIN_IDLE_TIMEOUT_MS
    ) {
      storage.removeItem(AUTH_KEYS.ADMIN_SESSION);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Auth] Invalid admin session; requiring sign-in:', err);
    storage.removeItem(AUTH_KEYS.ADMIN_SESSION);
    return false;
  }
}

export function setAdminLoggedIn(loggedIn: boolean): void {
  const storage = getStorage();
  if (storage) {
    if (loggedIn) {
      storage.setItem(
        AUTH_KEYS.ADMIN_SESSION,
        JSON.stringify({ lastActivityAt: Date.now() })
      );
    } else {
      storage.removeItem(AUTH_KEYS.ADMIN_SESSION);
    }
  }
}

export function touchAdminSession(): void {
  if (!isAdminLoggedIn()) return;
  const storage = getStorage();
  storage.setItem(
    AUTH_KEYS.ADMIN_SESSION,
    JSON.stringify({ lastActivityAt: Date.now() })
  );
}
