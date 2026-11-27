export const STORAGE_KEYS = {
  MEMBERS: 'moonchoir_members_v3',
  SCHEDULES: 'moonchoir_schedules_v3',
  RSVP_VOTES: 'moonchoir_rsvp_votes_v3',
  LOGS: 'moonchoir_logs_v3',
  CONFIG: 'moonchoir_config_v3',
  LOCATIONS: 'moonchoir_locations_v3',
  PROGRAM_CARDS: 'moonchoir_program_cards_v3',
  COMMENTS: 'moonchoir_comments_v3',
  PRACTICE_CATALOG: 'moonchoir_practice_catalog_v1',
} as const;

export const PREFERENCE_KEYS = {
  HOME_CALENDAR_VIEW: 'moonchoir_pref_home_view_v1',
  STUDIO_SCOPE: 'moonchoir_pref_studio_scope_v1',
  PLAYBACK_RATE: 'moonchoir_pref_playback_rate_v1',
  SEEN_STICKERS: 'moonchoir_pref_seen_stickers_v1',
  SEEN_COMMENTS: 'moonchoir_pref_seen_comments_v1',
  UPLOAD_JOBS: 'moonchoir_pref_upload_jobs_v1',
  YT_MINIMIZE_HINT_COUNT: 'moonchoir_pref_yt_minimize_hint_v1',
} as const;

export const DATA_CACHE_KEYS: readonly string[] = Object.values(STORAGE_KEYS);

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

/**
 * 데이터 캐시만 안전하게 삭제한다.
 * 기기 바인딩(moonchoir_bound_device_v1), 관리자 세션 토큰(moonchoir_admin_token_v1 등),
 * 화면 설정 등 인증/식별 관련 키는 절대 삭제하지 않는다.
 */
export function clearDataCache(): void {
  const storage = getStorage();
  for (const key of DATA_CACHE_KEYS) {
    storage.removeItem(key);
  }
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

/**
 * 기기 선호값 읽기 헬퍼 (v3 / V3-02)
 * localStorage 접근 및 JSON 파싱 실패 시 fallback을 반환하며,
 * validate 검증을 통과하지 못하면 fallback을 반환한다.
 */
export function readPreference<T>(
  key: string,
  validate: (val: unknown) => val is T,
  fallback: T
): T {
  try {
    const raw = getStorage().getItem(key);
    if (raw === null || raw === undefined) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (validate(parsed)) {
      return parsed;
    }
    return fallback;
  } catch (err) {
    console.warn(`[Storage] Failed to read preference key ${key}, falling back:`, err);
    return fallback;
  }
}

export type PreferenceState<T> =
  | { kind: 'missing' }
  | { kind: 'invalid' }
  | { kind: 'ok'; value: T };

/**
 * 저장값 없음(missing)과 읽기·검사 실패(invalid)를 구분해 읽는다 (V3-22 R7).
 * 저장소 접근 자체가 실패해도 invalid다. invalid일 때는 덮어쓰지 않아야 한다.
 */
export function readPreferenceState<T>(
  key: string,
  validate: (val: unknown) => val is T
): PreferenceState<T> {
  try {
    const raw = getStorage().getItem(key);
    if (raw === null || raw === undefined) return { kind: 'missing' };
    const parsed: unknown = JSON.parse(raw);
    return validate(parsed) ? { kind: 'ok', value: parsed } : { kind: 'invalid' };
  } catch (err) {
    console.warn(`[Storage] Failed to read preference state ${key}:`, err);
    return { kind: 'invalid' };
  }
}

/**
 * 기기 선호값 쓰기 헬퍼 (v3 / V3-02)
 * try/catch로 안전하게 감싸서 QuotaExceededError 등 예외 발생 시 에러를 로깅하고 앱 크래시를 방지한다.
 */
export function writePreference<T>(key: string, value: T): void {
  try {
    getStorage().setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`[Storage] Failed to write preference key ${key}:`, err);
  }
}
