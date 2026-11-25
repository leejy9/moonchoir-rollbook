/**
 * 단원 인적사항 저장 시 연락처 확정 규칙.
 *
 * 관리자 모달은 두 가지 경우를 모두 받아야 한다.
 * 1. 전체 번호를 입력한 경우 → 10~11자리 휴대폰 번호만 허용.
 * 2. 레거시 단원처럼 전체 번호 없이 뒷자리 4자리만 있는 경우 → 번호를 건드리지
 *    않았다면 기존 뒷자리를 그대로 보존하고 저장을 허용한다. 파트·상태만 바꾸려는
 *    관리자가 전화번호 때문에 막히면 안 된다.
 *
 * 두 경우 모두에 해당하지 않으면(번호도 뒷자리도 없음) 전체 번호를 요구한다.
 */
export interface PhoneResolution {
  ok: boolean;
  /** 저장할 전체 번호(정규화된 하이픈 형식). ok가 false면 의미 없음. */
  phone: string;
  /** 저장할 뒷자리 4자리. */
  phoneLast4: string;
  /** ok가 false일 때 화면에 보여줄 안내. */
  error?: string;
}

/** 010-1234-5678 형태로 맞춘다. 최대 11자리까지만 남긴다. */
export function formatPhoneNumber(val: string): string {
  const digits = val.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

const PHONE_FORMAT_ERROR =
  '연락처는 전체 휴대폰 번호(10~11자리, 예: 010-1234-5678)를 정확히 입력해주세요.';

/**
 * @param inputPhone 폼에 입력된 전체 번호 (없으면 빈 문자열)
 * @param initialPhoneLast4 열 때 불러온 기존 뒷자리 4자리 (없으면 빈 문자열)
 */
export function resolvePhoneForSubmit(
  inputPhone: string,
  initialPhoneLast4: string
): PhoneResolution {
  const inputDigits = String(inputPhone || '').replace(/\D/g, '');
  const preservedLast4 = String(initialPhoneLast4 || '').replace(/\D/g, '').slice(-4);

  // 1. 전체 번호를 새로 입력했다: 형식을 검사한다.
  if (inputDigits !== '') {
    if (inputDigits.length < 10 || inputDigits.length > 11) {
      return { ok: false, phone: '', phoneLast4: '', error: PHONE_FORMAT_ERROR };
    }
    return {
      ok: true,
      phone: formatPhoneNumber(inputDigits),
      phoneLast4: inputDigits.slice(-4),
    };
  }

  // 2. 번호를 입력하지 않았다: 기존 뒷자리가 있으면 그대로 보존한다.
  if (preservedLast4.length === 4) {
    return { ok: true, phone: '', phoneLast4: preservedLast4 };
  }

  // 3. 둘 다 없다: 전체 번호를 받아야 한다.
  return { ok: false, phone: '', phoneLast4: '', error: PHONE_FORMAT_ERROR };
}
