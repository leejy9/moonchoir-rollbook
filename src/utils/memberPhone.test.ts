import { describe, expect, it } from 'vitest';
import { formatPhoneNumber, resolvePhoneForSubmit } from './memberPhone';

describe('formatPhoneNumber', () => {
  it('숫자가 아닌 문자를 지우고 휴대폰 형식으로 묶는다', () => {
    expect(formatPhoneNumber('01012345678')).toBe('010-1234-5678');
    expect(formatPhoneNumber('010-1234-5678')).toBe('010-1234-5678');
    expect(formatPhoneNumber('010 1234 5678')).toBe('010-1234-5678');
  });

  it('11자리를 넘는 입력은 잘라낸다', () => {
    expect(formatPhoneNumber('010123456789999')).toBe('010-1234-5678');
  });
});

describe('resolvePhoneForSubmit — 레거시 단원 연락처 보존', () => {
  it('전체 번호 없이 뒷자리만 있는 단원은 번호를 비워도 저장을 허용하고 뒷자리를 보존한다', () => {
    // 과거 시트에서 넘어온 단원: phone = '', phoneLast4 = '1234'
    const result = resolvePhoneForSubmit('', '1234');

    expect(result.ok).toBe(true);
    expect(result.phoneLast4).toBe('1234');
    expect(result.phone).toBe('');
    expect(result.error).toBeUndefined();
  });

  it('전체 번호를 새로 입력하면 10~11자리를 검사하고 뒷자리를 다시 계산한다', () => {
    const result = resolvePhoneForSubmit('010-9876-5432', '1234');

    expect(result.ok).toBe(true);
    expect(result.phone).toBe('010-9876-5432');
    expect(result.phoneLast4).toBe('5432');
  });

  it('전체 번호도 기존 뒷자리도 없으면 전체 번호를 요구한다', () => {
    const result = resolvePhoneForSubmit('', '');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('전체 휴대폰 번호(10~11자리');
  });

  it('입력한 번호가 10자리보다 짧으면 오류를 낸다 (기존 뒷자리가 있어도 입력을 시작했으면 검사한다)', () => {
    const result = resolvePhoneForSubmit('010-123', '1234');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('전체 휴대폰 번호(10~11자리');
  });

  it('입력한 번호가 11자리를 넘어도 오류를 낸다', () => {
    const result = resolvePhoneForSubmit('010-1234-56789', '1234');

    expect(result.ok).toBe(false);
  });

  it('10자리 유선 형식도 허용한다 (10~11자리 규칙)', () => {
    const result = resolvePhoneForSubmit('0212345678', '');

    expect(result.ok).toBe(true);
    expect(result.phoneLast4).toBe('5678');
  });

  it('뒷자리 값이 4자리가 아니면 보존하지 않고 전체 번호를 요구한다', () => {
    const result = resolvePhoneForSubmit('', '12');

    expect(result.ok).toBe(false);
  });
});
