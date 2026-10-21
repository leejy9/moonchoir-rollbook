import { describe, expect, it } from 'vitest';
import { KakaoLoadError, describeKakaoLoadError } from './kakaoMaps';

describe('describeKakaoLoadError', () => {
  it('스크립트 자체를 못 받은 경우 네트워크/차단 안내', () => {
    expect(describeKakaoLoadError(new KakaoLoadError('SCRIPT_BLOCKED'))).toContain('인터넷 연결');
  });

  it('스크립트는 받았지만 초기화되지 않은 경우(인증 실패 의심) 카카오 개발자 콘솔 안내', () => {
    for (const code of ['SDK_UNAVAILABLE', 'SERVICES_MISSING', 'TIMEOUT'] as const) {
      const message = describeKakaoLoadError(new KakaoLoadError(code));
      expect(message).toContain('웹 도메인');
      expect(message).toContain('카카오맵');
    }
  });

  it('알 수 없는 오류도 인증 안내로 처리', () => {
    expect(describeKakaoLoadError(new Error('x'))).toContain('인증에 실패');
  });
});
