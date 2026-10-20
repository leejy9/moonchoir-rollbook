import React, { useState } from 'react';
import { setAdminLoggedIn } from '../services/auth';
import { sheetsService } from '../services/sheets';

interface AdminPinModalProps {
  onSuccess: () => void;
  onClose: () => void;
}

export const AdminPinModal: React.FC<AdminPinModalProps> = ({ onSuccess, onClose }) => {
  const [pin, setPin] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isChecking, setIsChecking] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    setIsChecking(true);
    try {
      await sheetsService.verifyAdminPin(pin);
      setAdminLoggedIn(true);
      onSuccess();
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : '관리자 PIN을 확인할 수 없습니다. 연결 상태를 확인해주세요.'
      );
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="modal-header">
          <div className="modal-badge">관리자 전용</div>
          <h2 className="modal-title">관리자 인증</h2>
          <p className="modal-desc">
            출결 통계 대시보드, 감사 로그 조회, 일정 등록을 위해 관리자 마스터 PIN을 입력하세요.
          </p>
        </div>

        {errorMsg && <div className="error-banner">{errorMsg}</div>}

        <form onSubmit={handleSubmit} className="form-stack">
          <label className="form-label" htmlFor="admin-pin-input">
            관리자 마스터 PIN
          </label>
          <input
            id="admin-pin-input"
            type="password"
            inputMode="numeric"
            maxLength={8}
            className="input-text"
            placeholder="기본 비밀번호: 1234"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            disabled={isChecking}
            autoFocus
          />

          <div className="modal-button-group">
            <button type="submit" className="btn-primary-large" disabled={isChecking}>
              {isChecking ? '최신 설정 확인 중...' : '관리자 모드 진입'}
            </button>
            <button type="button" className="btn-secondary-cancel" onClick={onClose} disabled={isChecking}>
              취소
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
