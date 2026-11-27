import { describe, expect, it } from 'vitest';
import {
  buildFailureView,
  classifyPinError,
  formatDistance,
  geoStatusLabel,
} from './checkinMessages';

describe('checkinMessages (V3-23 §3 R2·R4·R5)', () => {
  describe('classifyPinError', () => {
    it('일치하지 않습니다 -> WRONG', () => {
      expect(classifyPinError('현장 PIN 번호가 일치하지 않습니다.')).toBe('WRONG');
      expect(classifyPinError('현장 출석 PIN 번호가 일치하지 않습니다.')).toBe('WRONG');
      expect(classifyPinError('현장 PIN이 변경되었거나 일치하지 않습니다.')).toBe('WRONG');
    });

    it('시도 횟수가 너무 많습니다 -> LOCKED', () => {
      expect(
        classifyPinError('시도 횟수가 너무 많습니다. QR로 출석하거나 15분 후 다시 시도해 주세요.')
      ).toBe('LOCKED');
    });

    it('그 외 서버/네트워크 오류 -> OTHER', () => {
      expect(classifyPinError('현장 인증 PIN이 설정되지 않았습니다.')).toBe('OTHER');
      expect(classifyPinError('서버에 연결할 수 없어요')).toBe('OTHER');
      expect(classifyPinError('Supabase 통신 오류 (HTTP 500)')).toBe('OTHER');
    });
  });

  describe('formatDistance', () => {
    it('1000m 미만은 m 단위로 표기', () => {
      expect(formatDistance(999)).toBe('999m');
      expect(formatDistance(220)).toBe('220m');
      expect(formatDistance(0)).toBe('0m');
    });

    it('1000m 이상은 km(소수점 1자리)로 표기', () => {
      expect(formatDistance(1000)).toBe('1.0km');
      expect(formatDistance(1530)).toBe('1.5km');
      expect(formatDistance(2000)).toBe('2.0km');
    });
  });

  describe('geoStatusLabel', () => {
    it('idle: 열자마자 / 다시 확인하기', () => {
      expect(geoStatusLabel('idle')).toBe('출석할 때 위치를 확인해요');
    });

    it('measuring: 위치 확인 중…', () => {
      expect(geoStatusLabel('measuring')).toBe('위치 확인 중…');
    });

    it('ok: 위치 확인됨 + 오차 꼬리', () => {
      expect(geoStatusLabel('ok', 25)).toBe('위치 확인됨 (측정 오차 약 ±25m)');
      expect(geoStatusLabel('ok')).toBe('위치 확인됨');
    });

    it('ok_low: 위치 확인됨 · 정확도 낮음 + 오차 꼬리', () => {
      expect(geoStatusLabel('ok_low', 80)).toBe('위치 확인됨 · 정확도 낮음 (측정 오차 약 ±80m)');
      expect(geoStatusLabel('ok_low')).toBe('위치 확인됨 · 정확도 낮음');
    });

    it('bypass_measured: 위치 확인됨 (비상 면제)', () => {
      expect(geoStatusLabel('bypass_measured')).toBe('위치 확인됨 (비상 면제)');
    });

    it('bypass_skipped: 위치 확인 생략 (비상 면제)', () => {
      expect(geoStatusLabel('bypass_skipped')).toBe('위치 확인 생략 (비상 면제)');
    });
  });

  describe('buildFailureView', () => {
    it('GEO_FAILED: 위치 획득 실패', () => {
      const view = buildFailureView('GEO_FAILED', '위치 권한이 꺼져 있습니다.');
      expect(view.title).toBe('위치를 확인하지 못했어요');
      expect(view.body).toBe('연습실 안에서 위치 사용을 허용했는지 확인하고 다시 시도해 주세요.');
      expect(view.tips).toEqual([
        '위치 권한이 꺼져 있습니다.',
        '계속 안 되면 운영진에게 알려 주세요.',
      ]);
    });

    it('OUT_OF_RANGE: 반경 밖 (거리 1530m, 오차 30m, 반경 150m)', () => {
      const view = buildFailureView('OUT_OF_RANGE', '', {
        locationName: '제1연습실',
        distanceMeters: 1530,
        radiusMeters: 150,
        accuracyMeters: 30,
      });
      expect(view.title).toBe('연습실 밖에서는 출석할 수 없어요');
      expect(view.body).toBe(
        '제1연습실에서 1.5km 떨어져 있어요 (측정 오차 약 ±30m). 연습실에 도착한 뒤 다시 시도해 주세요.'
      );
      expect(view.tips).toEqual([
        '출석 인정 반경은 150m예요.',
        '계속 안 되면 운영진에게 알려 주세요.',
      ]);
    });

    it('OUT_OF_RANGE: 오차 모름 (거리 220m)', () => {
      const view = buildFailureView('OUT_OF_RANGE', '', {
        locationName: '제1연습실',
        distanceMeters: 220,
        radiusMeters: 100,
      });
      expect(view.title).toBe('연습실 밖에서는 출석할 수 없어요');
      expect(view.body).toBe(
        '제1연습실에서 220m 떨어져 있어요. 연습실에 도착한 뒤 다시 시도해 주세요.'
      );
      expect(view.tips).toEqual([
        '출석 인정 반경은 100m예요.',
        '계속 안 되면 운영진에게 알려 주세요.',
      ]);
    });

    it('SAVE_FAILED: 저장 실패', () => {
      const view = buildFailureView('SAVE_FAILED', '서버 점검 중입니다.');
      expect(view.title).toBe('출석을 저장하지 못했어요');
      expect(view.body).toBe('서버 점검 중입니다.');
      expect(view.tips).toEqual(['인터넷 연결을 확인하고 다시 시도해 주세요.']);
    });
  });
});
