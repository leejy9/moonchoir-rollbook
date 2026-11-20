import React, { useState } from 'react';
import { setAdminLoggedIn, setSuperAdminLoggedIn } from '../services/auth';
import { sheetsService } from '../services/sheets';

interface AdminPinModalProps {
  isSuperAdminMode?: boolean;
  onSuccess: () => void;
  onClose: () => void;
}

export const AdminPinModal: React.FC<AdminPinModalProps> = ({
  isSuperAdminMode = false,
  onSuccess,
  onClose,
}) => {
  const [pin, setPin] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isChecking, setIsChecking] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    setIsChecking(true);
    try {
      if (isSuperAdminMode) {
        await sheetsService.verifySuperAdminPin(pin);
        setSuperAdminLoggedIn(true);
      } else {
        await sheetsService.verifyAdminPin(pin);
        setAdminLoggedIn(true);
      }
      onSuccess();
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : isSuperAdminMode
          ? '최고 관리자 PIN을 확인할 수 없습니다. 연결 상태를 확인해주세요.'
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
          <div
            className="modal-badge"
            style={{
              background: isSuperAdminMode ? '#1e293b' : undefined,
              color: isSuperAdminMode ? '#f8fafc' : undefined,
            }}
          >
            {isSuperAdminMode ? '최고 관리자' : '운영진 전용'}
          </div>
          <h2 className="modal-title">
            {isSuperAdminMode ? '최고 관리자 인증' : '운영진 관리자 인증'}
          </h2>
          <p className="modal-desc">
            {isSuperAdminMode
              ? '원천 감사 로그, 시트/클라우드 연동 제어, 시스템 보안 설정을 위해 최고 관리자 PIN을 입력하세요.'
              : '단원 명부 관리, 연습 일정 등록, 출결 통계 대시보드 접근을 위해 운영진 PIN을 입력하세요.'}
          </p>
        </div>

        {errorMsg && <div className="error-banner">{errorMsg}</div>}

        <form onSubmit={handleSubmit} className="form-stack">
          <label className="form-label" htmlFor="admin-pin-input">
            {isSuperAdminMode ? '최고 관리자 PIN' : '운영진 PIN'}
          </label>
          <input
            id="admin-pin-input"
            type="password"
            inputMode="numeric"
            maxLength={8}
            className="input-text"
            placeholder="PIN 번호를 입력하세요"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            disabled={isChecking}
            autoFocus
          />

          <div className="modal-button-group">
            <button
              type="submit"
              className="btn-primary-large"
              disabled={isChecking}
              style={{
                background: isSuperAdminMode ? '#1e293b' : undefined,
              }}
            >
              {isChecking
                ? '확인 중...'
                : isSuperAdminMode
                ? '최고 관리자 모드 진입'
                : '운영진 모드 진입'}
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
