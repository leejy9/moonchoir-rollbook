import { describe, it, expect, vi } from 'vitest';
import {
  GeoAcquireError,
  acquirePosition,
  classifyCameraError,
  describeCameraFailure,
  formatAccuracySuffix,
} from './geoPosition';

function position(accuracy?: number): GeolocationPosition {
  return {
    coords: { latitude: 37.5, longitude: 127.0, accuracy },
  } as unknown as GeolocationPosition;
}

function geoError(code: number): GeolocationPositionError {
  return { code } as GeolocationPositionError;
}

describe('acquirePosition', () => {
  it('고정밀 측정이 성공하면 오차 반경과 함께 돌려준다', async () => {
    const getCurrentPosition = vi.fn(
      (success: PositionCallback, _error?: PositionErrorCallback, _options?: PositionOptions) => success(position(12.4))
    );
    const result = await acquirePosition({ getCurrentPosition });

    expect(result).toEqual({ latitude: 37.5, longitude: 127.0, accuracyMeters: 12, usedFallback: false });
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(getCurrentPosition.mock.calls[0][2]).toMatchObject({ enableHighAccuracy: true });
  });

  it('고정밀이 시간 초과되면 저정밀로 한 번 더 시도한다', async () => {
    const getCurrentPosition = vi
      .fn()
      .mockImplementationOnce((_s: PositionCallback, error: PositionErrorCallback) => error(geoError(3)))
      .mockImplementationOnce((success: PositionCallback) => success(position(80)));

    const result = await acquirePosition({ getCurrentPosition });

    expect(result.usedFallback).toBe(true);
    expect(result.accuracyMeters).toBe(80);
    expect(getCurrentPosition.mock.calls[1][2]).toMatchObject({ enableHighAccuracy: false });
  });

  it('권한 거부는 재시도하지 않고 바로 실패한다', async () => {
    const getCurrentPosition = vi.fn((_s: PositionCallback, error: PositionErrorCallback) => error(geoError(1)));

    await expect(acquirePosition({ getCurrentPosition })).rejects.toMatchObject({ kind: 'PERMISSION_DENIED' });
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('두 번 모두 실패하면 마지막 원인으로 실패한다', async () => {
    const getCurrentPosition = vi
      .fn()
      .mockImplementationOnce((_s: PositionCallback, error: PositionErrorCallback) => error(geoError(3)))
      .mockImplementationOnce((_s: PositionCallback, error: PositionErrorCallback) => error(geoError(2)));

    const error = await acquirePosition({ getCurrentPosition }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GeoAcquireError);
    expect((error as GeoAcquireError).kind).toBe('UNAVAILABLE');
  });

  it('위치 기능이 없으면 미지원으로 실패한다', async () => {
    await expect(acquirePosition(undefined)).rejects.toMatchObject({ kind: 'UNSUPPORTED' });
  });

  it('오차 정보가 없으면 accuracyMeters는 비어 있다', async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => success(position(undefined)));
    const result = await acquirePosition({ getCurrentPosition });
    expect(result.accuracyMeters).toBeUndefined();
  });
});

describe('classifyCameraError', () => {
  it('mediaDevices가 없으면 미지원', () => {
    expect(classifyCameraError(new Error('x'), false)).toBe('UNSUPPORTED');
  });

  it('오류 이름별로 원인을 구분한다', () => {
    expect(classifyCameraError({ name: 'NotAllowedError' }, true)).toBe('PERMISSION_DENIED');
    expect(classifyCameraError({ name: 'NotFoundError' }, true)).toBe('NO_CAMERA');
    expect(classifyCameraError({ name: 'NotReadableError' }, true)).toBe('IN_USE');
    expect(classifyCameraError({ name: 'Whatever' }, true)).toBe('UNKNOWN');
  });

  it('모든 원인에 PIN 안내가 포함된다(권한·미지원·사용 중·카메라 없음·알 수 없음)', () => {
    for (const kind of ['UNSUPPORTED', 'PERMISSION_DENIED', 'NO_CAMERA', 'IN_USE', 'UNKNOWN'] as const) {
      expect(describeCameraFailure(kind)).toContain('PIN');
    }
  });
});

describe('formatAccuracySuffix', () => {
  it('오차가 있으면 문구를, 없으면 빈 문자열을 돌려준다', () => {
    expect(formatAccuracySuffix(35)).toBe(' (측정 오차 약 ±35m)');
    expect(formatAccuracySuffix(undefined)).toBe('');
  });
});
