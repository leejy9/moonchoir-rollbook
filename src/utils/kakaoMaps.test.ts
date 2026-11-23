import { describe, expect, it } from 'vitest';
import { KakaoLoadError, buildKakaoMapLink, describeKakaoLoadError } from './kakaoMaps';

describe('describeKakaoLoadError', () => {
  it('스크립트 자체를 못 받은 경우 차단·네트워크 안내와 함께, 카카오 거절(HTTP 오류)일 때의 확인 사항도 안내', () => {
    const message = describeKakaoLoadError(new KakaoLoadError('SCRIPT_BLOCKED'));
    expect(message).toContain('광고');
    expect(message).toContain('인터넷 연결');
    expect(message).toContain('웹 도메인');
    expect(message).toContain('카카오맵');
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

describe('buildKakaoMapLink Pure Function', () => {
  it('좌표가 둘 다 유한한 숫자면 길찾기 링크(link/to)를 생성한다', () => {
    const link = buildKakaoMapLink({
      name: '문콰이어 연습실',
      lat: 37.5665,
      lon: 126.978,
    });
    expect(link).toBe(
      `https://map.kakao.com/link/to/${encodeURIComponent('문콰이어 연습실')},37.5665,126.978`
    );
  });

  it('좌표가 없거나(null/undefined/NaN/Infinity) 유효하지 않으면 검색 링크(link/search)를 생성한다', () => {
    expect(buildKakaoMapLink({ name: '강남 연습실' })).toBe(
      `https://map.kakao.com/link/search/${encodeURIComponent('강남 연습실')}`
    );
    expect(buildKakaoMapLink({ name: '홍대 합주실', lat: null, lon: undefined })).toBe(
      `https://map.kakao.com/link/search/${encodeURIComponent('홍대 합주실')}`
    );
    expect(buildKakaoMapLink({ name: '합정 연습실', lat: NaN, lon: 126.9 })).toBe(
      `https://map.kakao.com/link/search/${encodeURIComponent('합정 연습실')}`
    );
    expect(buildKakaoMapLink({ name: '신촌 연습실', lat: 37.5, lon: Infinity })).toBe(
      `https://map.kakao.com/link/search/${encodeURIComponent('신촌 연습실')}`
    );
  });

  it('이름이 비어있거나 공백뿐이면 null을 반환한다', () => {
    expect(buildKakaoMapLink({ name: '', lat: 37.5, lon: 127.0 })).toBeNull();
    expect(buildKakaoMapLink({ name: '   ', lat: 37.5, lon: 127.0 })).toBeNull();
    expect(buildKakaoMapLink({ name: undefined })).toBeNull();
    expect(buildKakaoMapLink({ name: null })).toBeNull();
  });

  it('한글, 공백, 특수문자가 포함된 장소명을 올바르게 URL 인코딩한다', () => {
    const link = buildKakaoMapLink({
      name: '문콰이어 & 스튜디오 #1 (3층)',
      lat: 37.5,
      lon: 127.0,
    });
    expect(link).toBe(
      `https://map.kakao.com/link/to/${encodeURIComponent('문콰이어 & 스튜디오 #1 (3층)')},37.5,127`
    );
  });
});

