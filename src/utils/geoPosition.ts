/**
 * 출석 인증용 위치/카메라 획득 도우미.
 * 실패 원인을 구분해 사용자가 할 행동을 안내하고, 고정밀 측정이 실패하면 저정밀로 한 번 더 시도한다.
 * 출석 인정 반경 판정은 이 파일에서 하지 않는다(geo.ts).
 */

export type GeoFailureKind = 'UNSUPPORTED' | 'PERMISSION_DENIED' | 'UNAVAILABLE' | 'TIMEOUT' | 'UNKNOWN';

export class GeoAcquireError extends Error {
  readonly kind: GeoFailureKind;

  constructor(kind: GeoFailureKind) {
    super(describeGeoFailure(kind));
    this.name = 'GeoAcquireError';
    this.kind = kind;
  }
}

export interface AcquiredPosition {
  latitude: number;
  longitude: number;
  /** 브라우저가 알려준 측정 오차 반경(m). 알 수 없으면 undefined */
  accuracyMeters?: number;
  /** 고정밀 측정이 실패해 저정밀로 다시 측정한 경우 */
  usedFallback: boolean;
}

interface GeolocationLike {
  getCurrentPosition: (
    success: PositionCallback,
    error: PositionErrorCallback,
    options?: PositionOptions
  ) => void;
}

const HIGH_ACCURACY_TIMEOUT_MS = 8000;
const FALLBACK_TIMEOUT_MS = 10000;
const FALLBACK_MAX_AGE_MS = 10000;

export function describeGeoFailure(kind: GeoFailureKind): string {
  switch (kind) {
    case 'UNSUPPORTED':
      return '이 브라우저에서는 위치(GPS)를 사용할 수 없습니다. 카카오톡 안이라면 기본 브라우저(사파리/크롬)로 열어 주세요.';
    case 'PERMISSION_DENIED':
      return '위치 권한이 꺼져 있습니다. 브라우저(또는 휴대폰 설정)에서 이 사이트의 위치 권한을 허용한 뒤 다시 시도해 주세요.';
    case 'UNAVAILABLE':
      return '현재 위치를 확인하지 못했습니다. 휴대폰의 위치 서비스가 켜져 있는지 확인하고, 창가나 실외 쪽에서 다시 시도해 주세요.';
    case 'TIMEOUT':
      return '위치 측정 시간이 초과되었습니다. 잠시 후 다시 시도하고, 계속되면 창가로 이동해 주세요.';
    default:
      return '위치(GPS) 정보를 받지 못했습니다. 위치 권한과 위치 서비스를 확인한 뒤 다시 시도해 주세요.';
  }
}

function toKind(error: unknown): GeoFailureKind {
  const code = (error as { code?: number } | null)?.code;
  if (code === 1) return 'PERMISSION_DENIED';
  if (code === 2) return 'UNAVAILABLE';
  if (code === 3) return 'TIMEOUT';
  return 'UNKNOWN';
}

function requestPosition(geo: GeolocationLike, options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => geo.getCurrentPosition(resolve, reject, options));
}

/**
 * 고정밀 → (시간 초과·신호 없음이면) 저정밀 순서로 위치를 얻는다.
 * 권한 거부는 재시도해도 같으므로 바로 실패시킨다.
 */
export async function acquirePosition(
  geo: GeolocationLike | undefined = typeof navigator === 'undefined' ? undefined : navigator.geolocation
): Promise<AcquiredPosition> {
  if (!geo) throw new GeoAcquireError('UNSUPPORTED');

  const toResult = (position: GeolocationPosition, usedFallback: boolean): AcquiredPosition => ({
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracyMeters:
      typeof position.coords.accuracy === 'number' && Number.isFinite(position.coords.accuracy)
        ? Math.round(position.coords.accuracy)
        : undefined,
    usedFallback,
  });

  try {
    return toResult(
      await requestPosition(geo, { enableHighAccuracy: true, timeout: HIGH_ACCURACY_TIMEOUT_MS, maximumAge: 0 }),
      false
    );
  } catch (firstError) {
    const kind = toKind(firstError);
    if (kind === 'PERMISSION_DENIED') throw new GeoAcquireError(kind);
    try {
      return toResult(
        await requestPosition(geo, {
          enableHighAccuracy: false,
          timeout: FALLBACK_TIMEOUT_MS,
          maximumAge: FALLBACK_MAX_AGE_MS,
        }),
        true
      );
    } catch (secondError) {
      throw new GeoAcquireError(toKind(secondError) === 'UNKNOWN' ? kind : toKind(secondError));
    }
  }
}

export type CameraFailureKind = 'UNSUPPORTED' | 'PERMISSION_DENIED' | 'NO_CAMERA' | 'IN_USE' | 'UNKNOWN';

export function classifyCameraError(error: unknown, hasMediaDevices: boolean): CameraFailureKind {
  if (!hasMediaDevices) return 'UNSUPPORTED';
  const name = (error as { name?: string } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return 'PERMISSION_DENIED';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return 'NO_CAMERA';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'IN_USE';
  return 'UNKNOWN';
}

export function describeCameraFailure(kind: CameraFailureKind): string {
  switch (kind) {
    case 'UNSUPPORTED':
      return '이 브라우저에서는 카메라를 사용할 수 없습니다. 기본 브라우저(사파리/크롬)로 열거나, 아래 [현장 PIN 번호]으로 출석해 주세요.';
    case 'PERMISSION_DENIED':
      return '카메라 권한이 꺼져 있습니다. 브라우저(또는 휴대폰 설정)에서 이 사이트의 카메라 권한을 허용하거나, [현장 PIN 번호]으로 출석해 주세요.';
    case 'NO_CAMERA':
      return '사용할 수 있는 카메라를 찾지 못했습니다. [현장 PIN 번호]으로 출석해 주세요.';
    case 'IN_USE':
      return '다른 앱이 카메라를 사용 중입니다. 해당 앱을 닫고 다시 열거나, [현장 PIN 번호]으로 출석해 주세요.';
    default:
      return '카메라를 실행하지 못했습니다. 다시 시도하거나 [현장 PIN 번호]으로 출석해 주세요.';
  }
}

/** 위치 측정 오차를 거리 안내 문구 뒤에 붙일 때 쓴다. 오차를 모르면 빈 문자열. */
export function formatAccuracySuffix(accuracyMeters: number | undefined): string {
  return accuracyMeters === undefined ? '' : ` (측정 오차 약 ±${accuracyMeters}m)`;
}
