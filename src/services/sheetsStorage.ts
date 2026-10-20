export const STORAGE_KEYS = {
  MEMBERS: 'moonchoir_members_v3',
  SCHEDULES: 'moonchoir_schedules_v3',
  RSVP_VOTES: 'moonchoir_rsvp_votes_v3',
  LOGS: 'moonchoir_logs_v3',
  CONFIG: 'moonchoir_config_v3',
  LOCATIONS: 'moonchoir_locations_v3',
  PROGRAM_CARDS: 'moonchoir_program_cards_v3',
} as const;

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

export function resetStorage(): void {
  getStorage().clear();
}

// Safe JSON parser with fallback (Schema Evolution invariant)
export function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = getStorage().getItem(key);
    if (!raw) return JSON.parse(JSON.stringify(fallback)) as T;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn(`[Storage] Failed to parse key ${key}, falling back to initial data:`, err);
    return JSON.parse(JSON.stringify(fallback)) as T;
  }
}

export function saveToStorage<T>(key: string, data: T): void {
  try {
    getStorage().setItem(key, JSON.stringify(data));
  } catch (err) {
    console.error(`[Storage] Failed to save key ${key}:`, err);
  }
}
