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
