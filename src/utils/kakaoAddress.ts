export interface KakaoGeocoderAddress {
  address_name?: string;
  x?: string;
  y?: string;
}

export interface KakaoGeocoderResult {
  x?: string;
  y?: string;
  address?: KakaoGeocoderAddress;
  road_address?: KakaoGeocoderAddress;
}

export interface ResolvedAddressCoordinates {
  latitude: number;
  longitude: number;
}

function parseCoordinates(
  x: string | undefined,
  y: string | undefined
): ResolvedAddressCoordinates | null {
  if (!x || !y) return null;
  const longitude = Number(x);
  const latitude = Number(y);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }
  return {
    latitude: Number(latitude.toFixed(6)),
    longitude: Number(longitude.toFixed(6)),
  };
}

export function resolveRoadAddressCoordinates(
  result: KakaoGeocoderResult
): ResolvedAddressCoordinates | null {
  return (
    parseCoordinates(result.road_address?.x, result.road_address?.y) ||
    parseCoordinates(result.x, result.y)
  );
}

export interface KakaoGeocoderLike {
  addressSearch: (
    address: string,
    callback: (results: KakaoGeocoderResult[], status: string) => void,
    options?: Record<string, unknown>
  ) => void;
}

export interface GeocodeOutcome {
  /** 마지막으로 시도한 요청에 카카오가 돌려준 상태값(OK / ZERO_RESULT / ERROR 등) */
  status: string;
  results: KakaoGeocoderResult[];
  /** 정확히 일치하는 주소가 없어 비슷한 주소 검색 결과를 쓴 경우 */
  usedSimilarMatch: boolean;
}

/**
 * 주소를 좌표로 바꾼다. 정확히 일치하는 검색(소문자 `exact`)을 먼저 시도하고,
 * 결과가 없거나 오류이면 기본(비슷한 주소) 검색으로 한 번 더 시도한다.
 * 옵션 값 하나가 거부돼도 변환이 통째로 실패하지 않게 하고, 실패 원인(status)을 호출자가 보여줄 수 있게 돌려준다.
 */
export async function geocodeAddress(
  geocoder: KakaoGeocoderLike,
  address: string,
  okStatus: string
): Promise<GeocodeOutcome> {
  const run = (options?: Record<string, unknown>) =>
    new Promise<{ status: string; results: KakaoGeocoderResult[] }>((resolve) => {
      geocoder.addressSearch(
        address,
        (results, status) => resolve({ status, results: Array.isArray(results) ? results : [] }),
        options
      );
    });

  const exact = await run({ analyze_type: 'exact' });
  if (exact.status === okStatus && exact.results.length > 0) {
    return { ...exact, usedSimilarMatch: false };
  }
  const similar = await run();
  return {
    ...similar,
    usedSimilarMatch: similar.status === okStatus && similar.results.length > 0,
  };
}

