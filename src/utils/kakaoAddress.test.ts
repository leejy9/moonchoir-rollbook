import { describe, expect, it } from 'vitest';
import { resolveRoadAddressCoordinates } from './kakaoAddress';

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
