/**
 * 서버가 발급한 관리자 세션 토큰 보관소.
 *
 * Supabase 백엔드는 PIN 확인에 성공하면 무작위 토큰을 발급하고, 관리자 전용 RPC는 이 토큰이
 * 있어야 실행된다. 토큰은 PIN이 아니며 서버에서 만료·폐기된다. 이 모듈은 다른 서비스에
 * 의존하지 않아 백엔드 어댑터와 인증 모듈이 함께 쓸 수 있다.
 */
export type AdminTier = 'admin' | 'super';

const TOKEN_KEYS: Record<AdminTier, string> = {
  admin: 'moonchoir_admin_token_v1',
  super: 'moonchoir_super_admin_token_v1',
};

const memoryTokens: Partial<Record<AdminTier, string>> = {};

function readStorage(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch {
    // 저장소 접근이 막힌 환경(사생활 보호 모드 등)에서는 메모리 값만 쓴다.
  }
  return null;
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    }
  } catch {
    // 메모리 값으로 계속 동작한다.
  }
}

export function getAdminToken(tier: AdminTier): string | null {
  return memoryTokens[tier] ?? readStorage(TOKEN_KEYS[tier]);
}

export function setAdminToken(tier: AdminTier, token: string | null): void {
  if (token) memoryTokens[tier] = token;
  else delete memoryTokens[tier];
  writeStorage(TOKEN_KEYS[tier], token);
}

/** 요청에 실을 토큰: 최고 관리자 토큰이 있으면 우선, 없으면 운영진 토큰. */
export function getActiveAdminToken(): string | null {
  return getAdminToken('super') ?? getAdminToken('admin');
}

export function clearAllAdminTokens(): void {
  setAdminToken('admin', null);
  setAdminToken('super', null);
}

/** PIN 확인 응답(`data`)에서 토큰을 꺼낸다. 형식이 다르면 null. */
export function extractIssuedToken(data: unknown): { token: string; tier: AdminTier } | null {
  if (!data || typeof data !== 'object') return null;
  const { token, tier } = data as { token?: unknown; tier?: unknown };
  if (typeof token !== 'string' || token.length < 32) return null;
  if (tier !== 'admin' && tier !== 'super') return null;
  return { token, tier };
}
