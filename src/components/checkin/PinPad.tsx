import React, { useCallback, useEffect, useRef } from 'react';
import { IconBackspace } from '../Icons';
import { GeoStatusLine } from './GeoStatusLine';
import {
  classifyPinError,
  type GeoStatusKind,
  type PinErrorClassification,
} from '../../utils/checkinMessages';

export interface PinPadProps {
  pin: string;
  pinError: string;
  isProcessing: boolean;
  isActive: boolean;
  geoStatusKind: GeoStatusKind;
  geoAccuracyMeters?: number;
  onKey: (key: string) => void;
  onReset: () => void;
  onSubmit: (pin: string) => Promise<void> | void;
}

export const PinPad: React.FC<PinPadProps> = ({
  pin,
  pinError,
  isProcessing,
  isActive,
  geoStatusKind,
  geoAccuracyMeters,
  onKey,
  onReset,
  onSubmit,
}) => {
  const isSubmittingRef = useRef(false);

  const errorKind: PinErrorClassification | null = pinError
    ? classifyPinError(pinError)
    : null;

  const handleSubmit = useCallback(async () => {
    if (isSubmittingRef.current || isProcessing) return;
    if (pin.length !== 4) return;
    isSubmittingRef.current = true;
    try {
      await onSubmit(pin);
    } finally {
      isSubmittingRef.current = false;
    }
  }, [isProcessing, pin, onSubmit]);

  // Keyboard support (V3-23 §3 R4)
  useEffect(() => {
    if (!isActive || isProcessing) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;

      const target = e.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName;
        if (
          tagName === 'INPUT' ||
          tagName === 'TEXTAREA' ||
          tagName === 'BUTTON' ||
          target.isContentEditable
        ) {
          return;
        }
      }

      if (e.key === 'Enter') {
        if (errorKind === 'WRONG') {
          e.preventDefault();
          onReset();
          return;
        }
        if (pin.length === 4) {
          e.preventDefault();
          handleSubmit();
        }
        return;
      }

      if (/^[0-9]$/.test(e.key) || e.key === 'Backspace') {
        e.preventDefault();
        onKey(e.key);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isActive, isProcessing, pin, errorKind, onKey, onReset, handleSubmit]);

  const alertMessage =
    errorKind === 'WRONG'
      ? 'PIN이 맞지 않아요. 현장 안내의 번호를 다시 확인해 주세요.'
      : pinError;

  return (
    <div className="ci-pin-panel">
      {errorKind ? (
        <div className="ci-pin-alert" role="alert">
          {alertMessage}
        </div>
      ) : (
        <p className="ci-pin-guide">현장에 안내된 4자리 번호를 입력해 주세요.</p>
      )}

      <div
        className="ci-pin-slots"
        aria-label="PIN 입력칸"
        aria-live="polite"
      >
        <span className="sr-only">{`${pin.length}자리 입력됨`}</span>
        {[0, 1, 2, 3].map((idx) => {
          const isFilled = idx < pin.length;
          const isCursor = idx === pin.length && errorKind !== 'WRONG';
          const isWrong = errorKind === 'WRONG';

          let slotClass = 'ci-pin-slot';
          if (isWrong) slotClass += ' is-wrong';
          else if (isCursor) slotClass += ' is-active';

          return (
            <div key={idx} className={slotClass}>
              {isFilled ? (
                <span className="ci-pin-dot" />
              ) : isCursor ? (
                <span className="ci-pin-cursor" />
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="ci-keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
          <button
            key={digit}
            type="button"
            className="ci-key-btn"
            disabled={isProcessing}
            onClick={() => onKey(digit)}
          >
            {digit}
          </button>
        ))}
        <span className="ci-key-empty" aria-hidden="true" />
        <button
          type="button"
          className="ci-key-btn"
          disabled={isProcessing}
          onClick={() => onKey('0')}
        >
          0
        </button>
        <button
          type="button"
          className="ci-key-btn"
          aria-label="지우기"
          disabled={isProcessing}
          onClick={() => onKey('Backspace')}
        >
          <IconBackspace size={24} />
        </button>
      </div>

      {errorKind === 'WRONG' ? (
        <button
          type="button"
          className="ci-submit-btn"
          onClick={onReset}
        >
          다시 입력해 출석하기
        </button>
      ) : (
        <button
          type="button"
          className="ci-submit-btn"
          disabled={pin.length !== 4 || isProcessing}
          onClick={handleSubmit}
        >
          {isProcessing ? '확인 중…' : '출석하기'}
        </button>
      )}

      <GeoStatusLine kind={geoStatusKind} accuracyMeters={geoAccuracyMeters} />
    </div>
  );
};
