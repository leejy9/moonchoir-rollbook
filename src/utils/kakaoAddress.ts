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


/** 카카오 장소 검색(keywordSearch) 결과 한 건 */
export interface KakaoPlaceItem {
  id?: string;
  place_name?: string;
  address_name?: string;
  road_address_name?: string;
  category_group_name?: string;
  /** 경도 */
  x?: string;
  /** 위도 */
  y?: string;
}

export interface KakaoPlacesLike {
  keywordSearch: (
    keyword: string,
    callback: (results: KakaoPlaceItem[], status: string) => void,
    options?: Record<string, unknown>
  ) => void;
}

/** 검색 결과 목록에 보여줄 한 건 */
export interface PlaceSearchResult {
  key: string;
  name: string;
  /** 도로명주소가 있으면 도로명주소, 없으면 지번주소 */
  address: string;
  category?: string;
  latitude: number;
  longitude: number;
}

export interface PlaceSearchOutcome {
  /** 마지막으로 시도한 요청에 카카오가 돌려준 상태값(OK / ZERO_RESULT / ERROR 등) */
  status: string;
  results: PlaceSearchResult[];
  /** 장소명 검색 결과가 없어 입력한 글자를 주소로 보고 좌표를 찾은 경우 */
  fromAddressLookup: boolean;
}

/** 좌표가 없거나 올바르지 않은 항목은 목록에서 제외한다. */
export function normalizePlaceItem(item: KakaoPlaceItem, index: number): PlaceSearchResult | null {
  const coordinates = parseCoordinates(item.x, item.y);
  if (!coordinates) return null;
  const address = (item.road_address_name || item.address_name || '').trim();
  const name = (item.place_name || address).trim();
  if (!name) return null;
  return {
    key: item.id || `${name}_${index}`,
    name,
    address,
    category: item.category_group_name || undefined,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
  };
}

/**
 * 검색어(장소명·건물명·주소)로 장소 목록을 찾는다.
 * 장소 검색 결과가 없거나 오류이면 입력한 글자를 도로명·지번 주소로 보고 좌표를 한 번 더 찾는다.
 * 실패 원인(status)을 호출자가 화면에 보여줄 수 있도록 마지막 응답 상태를 돌려준다.
 */
export async function searchPlacesByKeyword(
  services: { places: KakaoPlacesLike; geocoder: KakaoGeocoderLike },
  keyword: string,
  okStatus: string,
  maxResults = 8
): Promise<PlaceSearchOutcome> {
  const query = keyword.trim();
  const places = await new Promise<{ status: string; items: KakaoPlaceItem[] }>((resolve) => {
    services.places.keywordSearch(query, (items, status) =>
      resolve({ status, items: Array.isArray(items) ? items : [] })
    );
  });

  const placeResults =
    places.status === okStatus
      ? places.items
          .map(normalizePlaceItem)
          .filter((r): r is PlaceSearchResult => r !== null)
          .slice(0, maxResults)
      : [];
  if (placeResults.length > 0) {
    return { status: places.status, results: placeResults, fromAddressLookup: false };
  }

  const lookup = await geocodeAddress(services.geocoder, query, okStatus);
  const addressResults =
    lookup.status === okStatus
      ? lookup.results
          .map((r, index) => {
            const coordinates = resolveRoadAddressCoordinates(r);
            if (!coordinates) return null;
            const address = (r.road_address?.address_name || r.address?.address_name || query).trim();
            return {
              key: `addr_${index}_${address}`,
              name: address,
              address,
              category: '주소',
              latitude: coordinates.latitude,
              longitude: coordinates.longitude,
            } as PlaceSearchResult;
          })
          .filter((r): r is PlaceSearchResult => r !== null)
          .slice(0, maxResults)
      : [];

  return {
    status: addressResults.length > 0 ? lookup.status : places.status !== okStatus ? places.status : lookup.status,
    results: addressResults,
    fromAddressLookup: addressResults.length > 0,
  };
}
