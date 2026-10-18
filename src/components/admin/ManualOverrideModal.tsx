import React from 'react';

export interface ManualOverrideModalProps {
  overrideTarget: { id: string; name: string; part: string } | null;
  overrideReason: string;
  setOverrideReason: (reason: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export const ManualOverrideModal: React.FC<ManualOverrideModalProps> = ({
  overrideTarget,
  overrideReason,
  setOverrideReason,
  onSubmit,
  onClose,
}) => {
  if (!overrideTarget) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="modal-header">
          <div className="modal-badge">감사 로그 보존형 수동 보정</div>
          <h2 className="modal-title">{overrideTarget.name} 님 출석 인정</h2>
          <p className="modal-desc">
            단원의 원천 출결 데이터를 덮어쓰지 않고, <code>[MANUAL_BY_ADMIN]</code> 감사 로그를 추가하여 출석으로 인정합니다.
          </p>
        </div>

        <form onSubmit={onSubmit} className="form-stack">
          <label className="form-label" htmlFor="override-reason">
            수동 인정 사유
          </label>
          <input
            id="override-reason"
            type="text"
            className="input-text"
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            placeholder="예: 배터리 방전 확인, 지하 연습실 GPS 오차"
            required
            autoFocus
          />

          <div className="modal-button-group">
            <button type="submit" className="btn-primary-large">
              출석 인정 확정
            </button>
            <button
              type="button"
              className="btn-secondary-cancel"
              onClick={onClose}
            >
              취소
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
