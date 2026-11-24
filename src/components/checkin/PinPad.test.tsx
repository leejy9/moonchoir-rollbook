import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { PinPad } from './PinPad';

describe('PinPad Component (V3-23 §3 R4)', () => {
  it('기본 렌더링: 4자리 슬롯과 숫자 키패드 확인', () => {
    const html = renderToString(
      <PinPad
        pin="12"
        pinError=""
        isProcessing={false}
        isActive={true}
        geoStatusKind="idle"
        onKey={() => {}}
        onReset={() => {}}
        onSubmit={() => {}}
      />
    );

    expect(html).toContain('현장에 안내된 4자리 번호를 입력해 주세요.');
    expect(html).toContain('PIN 입력칸');
    expect(html).toContain('2자리 입력됨');
    expect(html).toContain('출석하기');
    expect(html).toContain('출석할 때 위치를 확인해요');
    // slots
    expect(html).toContain('ci-pin-dot');
    expect(html).toContain('ci-pin-cursor');
  });

  it('WRONG 상태 렌더링: 오류 안내 문구와 흔들림 클래스, 다시 입력 버튼', () => {
    const html = renderToString(
      <PinPad
        pin="1234"
        pinError="현장 PIN 번호가 일치하지 않습니다."
        isProcessing={false}
        isActive={true}
        geoStatusKind="idle"
        onKey={() => {}}
        onReset={() => {}}
        onSubmit={() => {}}
      />
    );

    expect(html).toContain('PIN이 맞지 않아요. 현장 안내의 번호를 다시 확인해 주세요.');
    expect(html).toContain('is-wrong');
    expect(html).toContain('다시 입력해 출석하기');
  });

  it('LOCKED 상태 렌더링: 서버 메시지 표시, 버튼은 일반 출석하기', () => {
    const html = renderToString(
      <PinPad
        pin="1234"
        pinError="시도 횟수가 너무 많습니다. QR로 출석하거나 15분 후 다시 시도해 주세요."
        isProcessing={false}
        isActive={true}
        geoStatusKind="idle"
        onKey={() => {}}
        onReset={() => {}}
        onSubmit={() => {}}
      />
    );

    expect(html).toContain('시도 횟수가 너무 많습니다. QR로 출석하거나 15분 후 다시 시도해 주세요.');
    expect(html).not.toContain('is-wrong');
    expect(html).toContain('출석하기');
  });

  it('처리 중 렌더링: 확인 중… 버튼 문구', () => {
    const html = renderToString(
      <PinPad
        pin="1234"
        pinError=""
        isProcessing={true}
        isActive={true}
        geoStatusKind="measuring"
        onKey={() => {}}
        onReset={() => {}}
        onSubmit={() => {}}
      />
    );

    expect(html).toContain('확인 중…');
    expect(html).toContain('위치 확인 중…');
  });
});
