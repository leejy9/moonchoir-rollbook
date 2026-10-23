import React from 'react';

export interface ManualOverrideModalProps {
  overrideTarget: { id: string; name: string; part: string } | null;
  overrideReason: string;
  setOverrideReason: (reason: string) => void;
  /** 도착 시각(HH:mm). 비우면 기존처럼 입력한 시점이 기록된다. */
  arrivalTime?: string;
  setArrivalTime?: (time: string) => void;
  arrivalError?: string;
  /** 지각 기준 시각 안내용(HH:mm) */
  lateThresholdTime?: string;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export const ManualOverrideModal: React.FC<ManualOverrideModalProps> = ({
  overrideTarget,
  overrideReason,
  setOverrideReason,
  arrivalTime = '',
  setArrivalTime,
  arrivalError,
  lateThresholdTime,
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

          {setArrivalTime && (
            <>
              <label className="form-label" htmlFor="override-arrival-time">
                도착 시각 (선택)
              </label>
              <input
                id="override-arrival-time"
                type="time"
                className="input-text"
                value={arrivalTime}
                onChange={(e) => setArrivalTime(e.target.value)}
                style={{ minHeight: '44px', fontSize: '16px' }}
              />
              <p className="modal-desc" style={{ margin: 0 }}>
                비우면 입력한 지금 시각으로 기록됩니다.
                {lateThresholdTime ? ` 지각 기준은 ${lateThresholdTime} 이후이며, 이 시각을 넘기면 지각으로 계산됩니다.` : ''}
              </p>
              {arrivalError && (
                <p style={{ margin: 0, color: '#dc2626', fontSize: '13px', fontWeight: 700 }}>{arrivalError}</p>
              )}
            </>
          )}

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
