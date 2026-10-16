import React, { useState } from 'react';
import { setAdminLoggedIn, validateAdminPin } from '../services/auth';

interface AdminPinModalProps {
  onSuccess: () => void;
  onClose: () => void;
}

export const AdminPinModal: React.FC<AdminPinModalProps> = ({ onSuccess, onClose }) => {
  const [pin, setPin] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (validateAdminPin(pin)) {
      setAdminLoggedIn(true);
      onSuccess();
    } else {
      setErrorMsg('관리자 PIN 번호가 일치하지 않습니다. (기본: 1234)');
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
            autoFocus
          />

          <div className="modal-button-group">
            <button type="submit" className="btn-primary-large">
              관리자 모드 진입
            </button>
            <button type="button" className="btn-secondary-cancel" onClick={onClose}>
              취소
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
