import type { PinErrorClassification } from './checkinMessages';

export interface PinPadState {
  pin: string;
  errorState?: PinErrorClassification | null;
}

/**
 * PIN 패드 입력 계산 순수 함수 (V3-23 §3 R4).
 * - 숫자 키('0'~'9'), Backspace 지원
 * - 4자리 초과 무시, 숫자가 아닌 키 무시
 * - WRONG 상태: 숫자 입력 시 입력을 비우고 그 숫자부터 다시 시작, Backspace 입력 시 입력을 비우고 오류도 비움
 * - LOCKED / OTHER 상태: 4자리가 찬 채로 숫자 누르면 무시, Backspace는 1자리 지움 (오류 상태 유지)
 * - 일반 상태: 4자리 미만일 때 숫자 추가, Backspace 시 1자리 지움
 */
export function nextPinState(state: PinPadState, key: string): PinPadState {
  if (key === 'Backspace') {
    if (state.errorState === 'WRONG') {
      return { pin: '', errorState: null };
    }
    return {
      pin: state.pin.slice(0, -1),
      errorState: state.errorState,
    };
  }

  if (/^[0-9]$/.test(key)) {
    if (state.errorState === 'WRONG') {
      return { pin: key, errorState: null };
    }
    if (state.pin.length >= 4) {
      return state;
    }
    return {
      pin: state.pin + key,
      errorState: state.errorState,
    };
  }

  return state;
}
