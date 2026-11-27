import { formatAccuracySuffix } from './geoPosition';

export type PinErrorClassification = 'WRONG' | 'LOCKED' | 'OTHER';

export type GeoStatusKind =
  | 'idle'
  | 'measuring'
  | 'ok'
  | 'ok_low'
  | 'bypass_measured'
  | 'bypass_skipped';

export type CheckInFailureKind = 'GEO_FAILED' | 'OUT_OF_RANGE' | 'SAVE_FAILED';

export interface FailureViewContext {
  locationName?: string;
  distanceMeters?: number;
  radiusMeters?: number;
  accuracyMeters?: number;
}

export interface FailureView {
  title: string;
  body: string;
  tips: string[];
}

/**
 * PIN 오류 문구를 세 종류로 분류한다 (V3-23 §3 R4).
 * - "일치하지 않습니다" 포함 -> 'WRONG'
 * - "시도 횟수가 너무 많습니다" 포함 -> 'LOCKED'
 * - 나머지 -> 'OTHER'
 */
export function classifyPinError(message: string): PinErrorClassification {
  if (message.includes('일치하지 않습니다')) return 'WRONG';
  if (message.includes('시도 횟수가 너무 많습니다')) return 'LOCKED';
  return 'OTHER';
}

/**
 * 거리를 m 또는 km(1000m 이상일 때 소수점 1자리)로 표기한다 (V3-23 §3 R5).
 */
export function formatDistance(m: number): string {
  if (m >= 1000) {
    return `${(m / 1000).toFixed(1)}km`;
  }
  return `${m}m`;
}

/**
 * 위치 상태 줄 문구를 돌려준다 (V3-23 §3 R2).
 */
export function geoStatusLabel(kind: GeoStatusKind, accuracyMeters?: number): string {
  switch (kind) {
    case 'idle':
      return '출석할 때 위치를 확인해요';
    case 'measuring':
      return '위치 확인 중…';
    case 'ok':
      return `위치 확인됨${formatAccuracySuffix(accuracyMeters)}`;
    case 'ok_low':
      return `위치 확인됨 · 정확도 낮음${formatAccuracySuffix(accuracyMeters)}`;
    case 'bypass_measured':
      return '위치 확인됨 (비상 면제)';
    case 'bypass_skipped':
      return '위치 확인 생략 (비상 면제)';
  }
}

/**
 * 실패 화면에 표시할 제목, 본문, 확인할 것 팁 목록을 만든다 (V3-23 §3 R5).
 */
export function buildFailureView(
  kind: CheckInFailureKind,
  detail: string,
  ctx?: FailureViewContext
): FailureView {
  switch (kind) {
    case 'GEO_FAILED':
      return {
        title: '위치를 확인하지 못했어요',
        body: '연습실 안에서 위치 사용을 허용했는지 확인하고 다시 시도해 주세요.',
        tips: [detail, '계속 안 되면 운영진에게 알려 주세요.'],
      };
    case 'OUT_OF_RANGE': {
      const venue = ctx?.locationName || '연습실';
      const dist = formatDistance(ctx?.distanceMeters ?? 0);
      const accSuffix = formatAccuracySuffix(ctx?.accuracyMeters);
      const radius = ctx?.radiusMeters ?? 100;
      return {
        title: '연습실 밖에서는 출석할 수 없어요',
        body: `${venue}에서 ${dist} 떨어져 있어요${accSuffix}. 연습실에 도착한 뒤 다시 시도해 주세요.`,
        tips: [`출석 인정 반경은 ${radius}m예요.`, '계속 안 되면 운영진에게 알려 주세요.'],
      };
    }
    case 'SAVE_FAILED':
      return {
        title: '출석을 저장하지 못했어요',
        body: detail,
        tips: ['인터넷 연결을 확인하고 다시 시도해 주세요.'],
      };
  }
}
