import { describe, expect, it } from 'vitest';
import { nextPinState } from './pinPad';

describe('nextPinState (V3-23 §3 R4)', () => {
  it('숫자 키 입력 시 한 칸씩 입력', () => {
    let s = nextPinState({ pin: '' }, '1');
    expect(s).toEqual({ pin: '1', errorState: undefined });
    s = nextPinState(s, '2');
    expect(s).toEqual({ pin: '12', errorState: undefined });
    s = nextPinState(s, '3');
    expect(s).toEqual({ pin: '123', errorState: undefined });
    s = nextPinState(s, '4');
    expect(s).toEqual({ pin: '1234', errorState: undefined });
  });

  it('4자리가 찬 상태에서 추가 숫자 입력은 무시', () => {
    const s = nextPinState({ pin: '1234' }, '5');
    expect(s).toEqual({ pin: '1234' });
  });

  it('숫자가 아닌 키는 무시', () => {
    expect(nextPinState({ pin: '12' }, 'a')).toEqual({ pin: '12' });
    expect(nextPinState({ pin: '12' }, 'Enter')).toEqual({ pin: '12' });
    expect(nextPinState({ pin: '12' }, ' ')).toEqual({ pin: '12' });
  });

  it('일반 상태에서 Backspace 시 한 자리 삭제', () => {
    expect(nextPinState({ pin: '1234' }, 'Backspace')).toEqual({ pin: '123', errorState: undefined });
    expect(nextPinState({ pin: '1' }, 'Backspace')).toEqual({ pin: '', errorState: undefined });
    expect(nextPinState({ pin: '' }, 'Backspace')).toEqual({ pin: '', errorState: undefined });
  });

  it('WRONG 상태에서 숫자 키 입력 시 입력을 비우고 그 숫자부터 다시 시작', () => {
    const s = nextPinState({ pin: '1234', errorState: 'WRONG' }, '3');
    expect(s).toEqual({ pin: '3', errorState: null });
  });

  it('WRONG 상태에서 Backspace 시 오류 사라짐 및 입력 비움', () => {
    const s = nextPinState({ pin: '1234', errorState: 'WRONG' }, 'Backspace');
    expect(s).toEqual({ pin: '', errorState: null });
  });

  it('LOCKED 상태에서 Backspace 시 1자리만 지우고 오류 상태 유지', () => {
    const s = nextPinState({ pin: '1234', errorState: 'LOCKED' }, 'Backspace');
    expect(s).toEqual({ pin: '123', errorState: 'LOCKED' });
  });

  it('LOCKED 상태에서 4자리 찬 채로 숫자 누르면 무시', () => {
    const s = nextPinState({ pin: '1234', errorState: 'LOCKED' }, '5');
    expect(s).toEqual({ pin: '1234', errorState: 'LOCKED' });
  });

  it('OTHER 상태에서 4자리 찬 채로 숫자 누르면 무시', () => {
    const s = nextPinState({ pin: '1234', errorState: 'OTHER' }, '5');
    expect(s).toEqual({ pin: '1234', errorState: 'OTHER' });
  });
});
