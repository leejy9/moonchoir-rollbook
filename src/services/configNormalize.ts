import type { AppConfig } from '../types/rollbook';

/**
 * 서버(app_config.value는 text)와 기기 저장소에서 온 설정값을 AppConfig 타입에 맞게 되돌린다.
 *
 * - Supabase 스냅샷은 모든 설정값을 문자열로 돌려준다(예: lateGraceMinutes: "15").
 *   문자열이 그대로 계산에 들어가면 `1170 + "15"`처럼 이어 붙여져 지각 판정이 깨진다.
 * - 숫자 필드: 숫자로 바꿀 수 없으면 그 키를 버려 기존 값(기본값)을 유지한다.
 * - 배열 필드: JSON 문자열이면 파싱하고, 배열이 아니면 그 키를 버린다.
 * - 그 밖의 키는 원문 그대로 둔다(하위 호환, AGENTS.md §1).
 */
const NUMBER_KEYS = ['lateGraceMinutes', 'defaultLat', 'defaultLon', 'defaultRadius'] as const;

const ARRAY_KEYS = [
  'customParts',
  'customMemberStatuses',
  'customCategories',
  'practiceTrackKinds',
  'performanceCategories',
] as const;

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function toArray(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim().startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : undefined;
    } catch (err) {
      console.warn('[config] 배열 설정값을 읽지 못해 기본값을 씁니다.', err);
      return undefined;
    }
  }
  return undefined;
}

export function normalizeAppConfig(raw: unknown): Partial<AppConfig> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result: Record<string, unknown> = { ...(raw as Record<string, unknown>) };

  for (const key of NUMBER_KEYS) {
    if (!(key in result)) continue;
    const n = toFiniteNumber(result[key]);
    if (n === undefined) delete result[key];
    else result[key] = n;
  }

  for (const key of ARRAY_KEYS) {
    if (!(key in result)) continue;
    const arr = toArray(result[key]);
    if (arr === undefined) delete result[key];
    else result[key] = arr;
  }

  return result as Partial<AppConfig>;
}
