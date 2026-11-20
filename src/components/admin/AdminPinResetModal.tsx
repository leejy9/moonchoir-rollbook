import React, { useState } from 'react';
import { sheetsService } from '../../services/sheets';

interface AdminPinResetModalProps {
  onClose: () => void;
  onSuccess?: () => void;
}

export const AdminPinResetModal: React.FC<AdminPinResetModalProps> = ({
  onClose,
  onSuccess,
}) => {
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const trimmedCurrent = currentPin.trim();
    const trimmedNew = newPin.trim();
    const trimmedConfirm = confirmPin.trim();

    if (!trimmedCurrent) {
      setErrorMsg('현재 관리자 마스터 PIN을 입력해주세요.');
      return;
    }
    if (!trimmedNew) {
      setErrorMsg('새로운 관리자 PIN을 입력해주세요.');
      return;
    }
    if (trimmedNew.length < 6 || trimmedNew.length > 8) {
      setErrorMsg('새로운 PIN은 6~8자리여야 합니다.');
      return;
    }
    if (!/^\d+$/.test(trimmedNew)) {
      setErrorMsg('PIN은 숫자만 입력 가능합니다.');
      return;
    }
    if (trimmedNew !== trimmedConfirm) {
      setErrorMsg('새로운 PIN과 확인 번호가 일치하지 않습니다.');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. 현재 PIN 검증
      await sheetsService.verifyAdminPin(trimmedCurrent);

      // 2. 새 PIN 저장 (Supabase app_secrets 및 구글 시트에 안전 저장)
      await sheetsService.saveConfigConfirmed({ adminPin: trimmedNew });

      setSuccessMsg('관리자 마스터 PIN이 성공적으로 변경되었습니다!');
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1500);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'PIN 변경 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 10000 }}>
      <div className="modal-card" style={{ maxWidth: '380px' }}>
        <div className="modal-header">
          <div className="modal-badge" style={{ background: '#EEF2FF', color: '#4F46E5' }}>
            보안 이스터에그
          </div>
          <h2 className="modal-title" style={{ fontSize: '18px', marginTop: '6px' }}>
            관리자 마스터 PIN 재설정
          </h2>
          <p className="modal-desc" style={{ fontSize: '13px' }}>
            기존 마스터 PIN을 인증한 후 안전하게 새로운 관리자 PIN을 등록할 수 있습니다.
          </p>
        </div>

        {errorMsg && <div className="error-banner">{errorMsg}</div>}
        {successMsg && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              background: '#ECFDF5',
              border: '1px solid #A7F3D0',
              color: '#065F46',
              fontSize: '13px',
              fontWeight: 600,
              marginBottom: '12px',
            }}
          >
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="form-stack">
          <div>
            <label className="form-label" htmlFor="reset-curr-pin">
              현재 관리자 마스터 PIN
            </label>
            <input
              id="reset-curr-pin"
              type="password"
              inputMode="numeric"
              maxLength={8}
              className="input-text"
              placeholder="현재 PIN 입력"
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="form-label" htmlFor="reset-new-pin">
              새로운 관리자 PIN (6~8자리 숫자)
            </label>
            <input
              id="reset-new-pin"
              type="password"
              inputMode="numeric"
              maxLength={8}
              className="input-text"
              placeholder="새 PIN 입력"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="form-label" htmlFor="reset-confirm-pin">
              새로운 관리자 PIN 확인
            </label>
            <input
              id="reset-confirm-pin"
              type="password"
              inputMode="numeric"
              maxLength={8}
              className="input-text"
              placeholder="새 PIN 다시 입력"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button
              type="submit"
              className="btn-primary-large"
              style={{ flex: 1, minHeight: '44px' }}
              disabled={isSubmitting}
            >
              {isSubmitting ? '인증 및 저장 중...' : 'PIN 변경 완료'}
            </button>
            <button
              type="button"
              className="btn-secondary-cancel"
              style={{ minHeight: '44px' }}
              onClick={onClose}
              disabled={isSubmitting}
            >
              취소
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
