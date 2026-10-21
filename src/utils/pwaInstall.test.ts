import { describe, expect, it } from 'vitest';
import { buildKakaoExternalBrowserUrl, detectInstallEnvironment } from './pwaInstall';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const IPHONE_KAKAO =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.0';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const ANDROID_KAKAO = `${ANDROID_CHROME} KAKAOTALK/10.8.0`;
const DESKTOP_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

describe('detectInstallEnvironment', () => {
  it('이미 설치된 앱(standalone)은 어떤 UA여도 STANDALONE', () => {
    expect(detectInstallEnvironment(IPHONE_SAFARI, true)).toBe('STANDALONE');
    expect(detectInstallEnvironment(ANDROID_KAKAO, true)).toBe('STANDALONE');
  });

  it('카카오톡 인앱 브라우저는 iOS/Android 모두 KAKAO_INAPP', () => {
    expect(detectInstallEnvironment(IPHONE_KAKAO, false)).toBe('KAKAO_INAPP');
    expect(detectInstallEnvironment(ANDROID_KAKAO, false)).toBe('KAKAO_INAPP');
  });

  it('일반 브라우저는 플랫폼별로 구분한다', () => {
    expect(detectInstallEnvironment(IPHONE_SAFARI, false)).toBe('IOS');
    expect(detectInstallEnvironment(ANDROID_CHROME, false)).toBe('ANDROID');
    expect(detectInstallEnvironment(DESKTOP_CHROME, false)).toBe('OTHER');
  });
});

describe('buildKakaoExternalBrowserUrl', () => {
  it('현재 주소를 인코딩해 카카오톡 외부 브라우저 스킴으로 만든다', () => {
    expect(buildKakaoExternalBrowserUrl('https://example.github.io/app/?a=1&b=2')).toBe(
      'kakaotalk://web/openExternal?url=https%3A%2F%2Fexample.github.io%2Fapp%2F%3Fa%3D1%26b%3D2'
    );
  });
});
