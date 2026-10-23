import { describe, expect, it } from 'vitest';
import {
  geocodeAddress,
  normalizePlaceItem,
  searchPlacesByKeyword,
  type KakaoPlaceItem,
  type KakaoPlacesLike,
  resolveRoadAddressCoordinates,
  type KakaoGeocoderLike,
  type KakaoGeocoderResult,
} from './kakaoAddress';

describe('resolveRoadAddressCoordinates', () => {
  it('prefers road address coordinates over parcel coordinates', () => {
    expect(
      resolveRoadAddressCoordinates({
        x: '126.9000000',
        y: '37.5000000',
        address: { x: '126.9000000', y: '37.5000000' },
        road_address: { x: '126.9012345', y: '37.5012345' },
      })
    ).toEqual({ latitude: 37.501235, longitude: 126.901235 });
  });

  it('falls back to the returned address coordinates when road coordinates are absent', () => {
    expect(
      resolveRoadAddressCoordinates({
        x: '126.9',
        y: '37.5',
        address: { x: '126.9', y: '37.5' },
      })
    ).toEqual({ latitude: 37.5, longitude: 126.9 });
  });

  it('rejects invalid coordinates', () => {
    expect(
      resolveRoadAddressCoordinates({
        x: 'not-a-coordinate',
        y: '37.5',
      })
    ).toBeNull();

    expect(resolveRoadAddressCoordinates({ x: '126.9', y: '95' })).toBeNull();
  });
});

describe('geocodeAddress', () => {
  const resultAt = (x: string, y: string): KakaoGeocoderResult => ({ x, y, road_address: { x, y } });

  const fakeGeocoder = (responses: Array<{ status: string; results: KakaoGeocoderResult[] | null }>) => {
    const calls: Array<Record<string, unknown> | undefined> = [];
    const geocoder: KakaoGeocoderLike = {
      addressSearch: (_address, callback, options) => {
        calls.push(options);
        const next = responses[calls.length - 1] ?? { status: 'ERROR', results: null };
        callback(next.results as KakaoGeocoderResult[], next.status);
      },
    };
    return { geocoder, calls };
  };

  it('정확히 일치하는 검색(소문자 exact)이 성공하면 한 번만 요청한다', async () => {
    const { geocoder, calls } = fakeGeocoder([{ status: 'OK', results: [resultAt('126.6', '37.4')] }]);
    const outcome = await geocodeAddress(geocoder, '인천 연수구 한나루로158번길 17', 'OK');

    expect(calls).toEqual([{ analyze_type: 'exact' }]);
    expect(outcome.status).toBe('OK');
    expect(outcome.usedSimilarMatch).toBe(false);
    expect(outcome.results).toHaveLength(1);
  });

  it('정확 검색이 오류이면 기본(비슷한 주소) 검색으로 다시 시도하고 그 사실을 표시한다', async () => {
    const { geocoder, calls } = fakeGeocoder([
      { status: 'ERROR', results: null },
      { status: 'OK', results: [resultAt('126.6', '37.4')] },
    ]);
    const outcome = await geocodeAddress(geocoder, '주소', 'OK');

    expect(calls).toEqual([{ analyze_type: 'exact' }, undefined]);
    expect(outcome.usedSimilarMatch).toBe(true);
    expect(outcome.results).toHaveLength(1);
  });

  it('OK여도 결과가 비어 있으면 다시 시도한다', async () => {
    const { geocoder, calls } = fakeGeocoder([
      { status: 'OK', results: [] },
      { status: 'OK', results: [resultAt('126.6', '37.4')] },
    ]);
    const outcome = await geocodeAddress(geocoder, '주소', 'OK');

    expect(calls).toHaveLength(2);
    expect(outcome.usedSimilarMatch).toBe(true);
  });

  it('두 번 모두 실패하면 마지막 응답 상태를 돌려줘 화면에 원인을 보여줄 수 있다', async () => {
    const zero = fakeGeocoder([
      { status: 'ZERO_RESULT', results: [] },
      { status: 'ZERO_RESULT', results: [] },
    ]);
    const zeroOutcome = await geocodeAddress(zero.geocoder, '주소', 'OK');
    expect(zeroOutcome.status).toBe('ZERO_RESULT');
    expect(zeroOutcome.results).toEqual([]);
    expect(zeroOutcome.usedSimilarMatch).toBe(false);

    const error = fakeGeocoder([
      { status: 'ERROR', results: null },
      { status: 'ERROR', results: null },
    ]);
    const errorOutcome = await geocodeAddress(error.geocoder, '주소', 'OK');
    expect(errorOutcome.status).toBe('ERROR');
    expect(errorOutcome.results).toEqual([]);
  });
});

describe('normalizePlaceItem', () => {
  it('도로명주소가 있으면 도로명주소를, 없으면 지번주소를 쓴다', () => {
    const withRoad = normalizePlaceItem(
      { id: '1', place_name: '서해문화회관', road_address_name: '인천 연수구 한나루로158번길 31', address_name: '인천 연수구 동춘동 1', x: '126.6', y: '37.4' },
      0
    );
    expect(withRoad?.address).toBe('인천 연수구 한나루로158번길 31');
    expect(withRoad).toMatchObject({ name: '서해문화회관', latitude: 37.4, longitude: 126.6 });

    const parcelOnly = normalizePlaceItem({ place_name: '공원', address_name: '서울 중구 명동 1', x: '126.98', y: '37.56' }, 1);
    expect(parcelOnly?.address).toBe('서울 중구 명동 1');
  });

  it('좌표가 없거나 올바르지 않은 항목은 제외한다', () => {
    expect(normalizePlaceItem({ place_name: '좌표 없음' }, 0)).toBeNull();
    expect(normalizePlaceItem({ place_name: '범위 밖', x: '126.9', y: '95' }, 0)).toBeNull();
  });
});

describe('searchPlacesByKeyword', () => {
  const place = (name: string, x = '126.6', y = '37.4'): KakaoPlaceItem => ({
    id: name,
    place_name: name,
    road_address_name: `${name} 도로명`,
    x,
    y,
  });

  const fakeServices = (placeResponse: { status: string; items: KakaoPlaceItem[] | null }, geoResponses: Array<{ status: string; results: KakaoGeocoderResult[] | null }> = []) => {
    const places: KakaoPlacesLike = {
      keywordSearch: (_keyword, callback) => callback(placeResponse.items as KakaoPlaceItem[], placeResponse.status),
    };
    let geoCalls = 0;
    const geocoder: KakaoGeocoderLike = {
      addressSearch: (_address, callback) => {
        const next = geoResponses[geoCalls++] ?? { status: 'ZERO_RESULT', results: [] };
        callback(next.results as KakaoGeocoderResult[], next.status);
      },
    };
    return { places, geocoder, geoCallCount: () => geoCalls };
  };

  it('장소 검색 결과가 있으면 주소 변환 없이 목록을 돌려준다', async () => {
    const services = fakeServices({ status: 'OK', items: [place('예술의전당'), place('서해문화회관')] });
    const outcome = await searchPlacesByKeyword(services, ' 예술의전당 ', 'OK');

    expect(outcome.results.map((r) => r.name)).toEqual(['예술의전당', '서해문화회관']);
    expect(outcome.fromAddressLookup).toBe(false);
    expect(services.geoCallCount()).toBe(0);
  });

  it('결과는 최대 개수까지만 보여준다', async () => {
    const items = Array.from({ length: 12 }, (_, i) => place(`장소${i}`));
    const outcome = await searchPlacesByKeyword(fakeServices({ status: 'OK', items }), '장소', 'OK', 5);
    expect(outcome.results).toHaveLength(5);
  });

  it('장소 결과가 없으면 입력한 글자를 주소로 보고 좌표를 찾는다', async () => {
    const services = fakeServices(
      { status: 'ZERO_RESULT', items: [] },
      [{ status: 'OK', results: [{ x: '126.6', y: '37.4', road_address: { x: '126.6', y: '37.4', address_name: '인천 연수구 한나루로158번길 31' } }] }]
    );
    const outcome = await searchPlacesByKeyword(services, '인천 연수구 한나루로158번길 31', 'OK');

    expect(outcome.fromAddressLookup).toBe(true);
    expect(outcome.results).toHaveLength(1);
    expect(outcome.results[0]).toMatchObject({ address: '인천 연수구 한나루로158번길 31', latitude: 37.4, longitude: 126.6 });
  });

  it('둘 다 결과가 없으면 빈 목록과 카카오 응답 상태를 돌려준다', async () => {
    const outcome = await searchPlacesByKeyword(fakeServices({ status: 'ZERO_RESULT', items: [] }), '없는곳', 'OK');
    expect(outcome.results).toEqual([]);
    expect(outcome.status).toBe('ZERO_RESULT');
  });

  it('장소 검색이 오류여도 주소 변환으로 이어서 찾고, 둘 다 오류면 오류 상태를 보여준다', async () => {
    const failed = await searchPlacesByKeyword(
      fakeServices({ status: 'ERROR', items: null }, [{ status: 'ERROR', results: null }, { status: 'ERROR', results: null }]),
      '검색어',
      'OK'
    );
    expect(failed.results).toEqual([]);
    expect(failed.status).toBe('ERROR');
  });
});
