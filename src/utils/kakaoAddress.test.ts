import { describe, expect, it } from 'vitest';
import {
  geocodeAddress,
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
