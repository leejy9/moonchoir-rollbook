import type { BoundDeviceProfile, PartType } from '../types/rollbook';
import { sheetsService } from './sheets';

const AUTH_KEYS = {
  DEVICE_PROFILE: 'moonchoir_bound_device_v1',
  ADMIN_SESSION: 'moonchoir_admin_session_v1',
};

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
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    return window.localStorage;
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

export function bindDeviceProfile(
  memberId: string,
  name: string,
  part: PartType,
  phoneLast4: string
): BoundDeviceProfile {
  const profile: BoundDeviceProfile = {
    memberId,
    name,
    part,
    phoneLast4,
    boundAt: new Date().toISOString(),
  };

  const storage = getStorage();
  if (storage) {
    storage.setItem(AUTH_KEYS.DEVICE_PROFILE, JSON.stringify(profile));
  }
  return profile;
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
  return storage.getItem(AUTH_KEYS.ADMIN_SESSION) === 'true';
}

export function setAdminLoggedIn(loggedIn: boolean): void {
  const storage = getStorage();
  if (storage) {
    if (loggedIn) {
      storage.setItem(AUTH_KEYS.ADMIN_SESSION, 'true');
    } else {
      storage.removeItem(AUTH_KEYS.ADMIN_SESSION);
    }
  }
}
