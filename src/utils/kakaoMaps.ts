// 기본값: 카카오 개발자 콘솔의 JavaScript 키 `moonchoir_rollbook`(JS SDK 도메인 등록 키).
// 2026-10-22 이전에 쓰던 `b561a814…`는 다른 앱의 키라 이 사이트에서 403으로 거절됨(docs/tasks.md Task 83).
export const KAKAO_APP_KEY =
  import.meta.env.VITE_KAKAO_MAP_API_KEY || '1465ed6063afca1d3ea91711cbdeb84a';

export type KakaoLoadErrorCode =
  | 'SCRIPT_BLOCKED'
  | 'SDK_UNAVAILABLE'
  | 'SERVICES_MISSING'
  | 'TIMEOUT';

export class KakaoLoadError extends Error {
  public readonly code: KakaoLoadErrorCode;

  constructor(code: KakaoLoadErrorCode) {
    super(code);
    this.name = 'KakaoLoadError';
    this.code = code;
  }
}

/** 사용자에게 보여줄 원인 안내 문구. */
export function describeKakaoLoadError(error: unknown): string {
  const code = error instanceof KakaoLoadError ? error.code : undefined;
  if (code === 'SCRIPT_BLOCKED') {
    // 스크립트 로드 실패(error 이벤트)는 네트워크·광고 차단뿐 아니라 카카오가 키/도메인을 거절해 HTTP 오류를 돌려준 경우에도 발생한다.
    return '카카오 지도 파일을 불러오지 못했습니다. 광고·추적 차단 기능과 인터넷 연결을 확인해 주세요. 계속되면 카카오 개발자 콘솔에서 이 사이트 주소(웹 도메인) 등록과 [카카오맵] 사용 설정을 확인해 주세요.';
  }
  return '카카오 지도 서비스 인증에 실패했습니다. 카카오 개발자 콘솔에서 이 사이트 주소(웹 도메인) 등록과 [카카오맵] 사용 설정을 확인해 주세요.';
}

const LOAD_TIMEOUT_MS = 10_000;
const SCRIPT_ID = 'kakao-maps-sdk-script';

interface KakaoWindow {
  kakao?: { maps?: { load?: (callback: () => void) => void; services?: unknown } };
}

let loadPromise: Promise<void> | null = null;

/**
 * 카카오 지도 SDK(주소 → 좌표 변환용 services 라이브러리)를 한 번만 불러온다.
 * - 이미 불러온 스크립트나 다시 열린 팝업에서도 services 초기화(`maps.load`)를 빠뜨리지 않는다.
 * - 실패 원인을 구분해 던지고, 다음 호출에서 다시 시도할 수 있게 캐시를 비운다.
 */
export function loadKakaoServices(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    const win = window as unknown as KakaoWindow;
    const timer = window.setTimeout(() => reject(new KakaoLoadError('TIMEOUT')), LOAD_TIMEOUT_MS);
    const done = (fn: () => void) => {
      window.clearTimeout(timer);
      fn();
    };

    const initServices = () => {
      const maps = win.kakao?.maps;
      if (!maps?.load) {
        done(() => reject(new KakaoLoadError('SDK_UNAVAILABLE')));
        return;
      }
      maps.load(() => {
        if (win.kakao?.maps?.services) done(resolve);
        else done(() => reject(new KakaoLoadError('SERVICES_MISSING')));
      });
    };

    if (win.kakao?.maps?.services) {
      done(resolve);
      return;
    }

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing && win.kakao?.maps) {
      // 스크립트는 이미 로드됐지만 services 초기화가 안 된 상태(팝업을 닫았다 다시 연 경우)
      initServices();
      return;
    }

    const script = existing ?? document.createElement('script');
    script.addEventListener('load', initServices, { once: true });
    script.addEventListener('error', () => done(() => reject(new KakaoLoadError('SCRIPT_BLOCKED'))), {
      once: true,
    });
    if (!existing) {
      script.id = SCRIPT_ID;
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_APP_KEY}&libraries=services&autoload=false`;
      document.head.appendChild(script);
    }
  }).catch((error) => {
    loadPromise = null;
    document.getElementById(SCRIPT_ID)?.remove();
    throw error;
  });

  return loadPromise;
}

export interface BuildKakaoMapLinkInput {
  /** 저장된 도로명 주소. 있으면 이 주소로 지도를 연다 */
  address?: string | null;
  name?: string | null;
  lat?: number | null;
  lon?: number | null;
}

/**
 * 카카오맵 웹 링크를 생성합니다.
 * - 도로명 주소가 있으면 https://map.kakao.com/link/search/{address} (주소 검색)
 * - 좌표가 둘 다 유한한 숫자면 https://map.kakao.com/link/to/{name},{lat},{lon}
 * - 좌표가 없거나 유효하지 않으면 https://map.kakao.com/link/search/{name}
 * - 주소·이름이 모두 비어 있으면 null
 */
export function buildKakaoMapLink(input: BuildKakaoMapLinkInput): string | null {
  const address = input.address?.trim();
  if (address) {
    return `https://map.kakao.com/link/search/${encodeURIComponent(address)}`;
  }

  const trimmed = input.name?.trim();
  if (!trimmed) return null;

  const { lat, lon } = input;
  const hasValidCoords =
    typeof lat === 'number' &&
    Number.isFinite(lat) &&
    typeof lon === 'number' &&
    Number.isFinite(lon);

  if (hasValidCoords) {
    return `https://map.kakao.com/link/to/${encodeURIComponent(trimmed)},${lat},${lon}`;
  }
  return `https://map.kakao.com/link/search/${encodeURIComponent(trimmed)}`;
}


/**
 * 일정에 연결된 장소 프리셋의 도로명 주소를 찾는다. 장소 id가 같거나 이름이 정확히 같은 프리셋만 쓰고,
 * 맞는 프리셋이 없으면 엉뚱한 기본 장소의 주소를 쓰지 않도록 undefined를 돌려준다.
 */
export function findScheduleAddress(
  schedule: { locationId?: string; locationName?: string },
  presets: ReadonlyArray<{ id: string; name: string; address?: string }>
): string | undefined {
  const name = schedule.locationName?.trim();
  const matched =
    (schedule.locationId ? presets.find((p) => p.id === schedule.locationId) : undefined) ||
    (name ? presets.find((p) => p.name.trim() === name) : undefined);
  return matched?.address?.trim() || undefined;
}
