import React from 'react';
import { RoundTimePicker } from '../RoundTimePicker';

export interface ManualOverrideModalProps {
  overrideTarget: { id: string; name: string; part: string } | null;
  overrideReason: string;
  setOverrideReason: (reason: string) => void;
  /** 도착 시각(HH:mm). 오늘 일정이면 지금 시각이 미리 채워진다. */
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
          {setArrivalTime && (
            <>
              <label className="form-label">도착 시각</label>
              <RoundTimePicker value={arrivalTime} onChange={setArrivalTime} />
              <p className="modal-desc" style={{ margin: 0 }}>
                {lateThresholdTime
                  ? `지각 기준은 ${lateThresholdTime} 이후이며, 이 시각을 넘기면 지각으로 계산됩니다.`
                  : '선택한 시각이 출석 시각으로 기록됩니다.'}
              </p>
              {arrivalError && (
                <p style={{ margin: 0, color: '#dc2626', fontSize: '13px', fontWeight: 700 }}>{arrivalError}</p>
              )}
            </>
          )}

          <label className="form-label" htmlFor="override-reason">
            사유 (선택)
          </label>
          <input
            id="override-reason"
            type="text"
            className="input-text"
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            placeholder="예: QR 인식 안 됨, 배터리 방전"
            style={{ minHeight: '44px', fontSize: '16px' }}
          />

          <div className="modal-button-group">
            <button type="submit" className="btn-primary-large">
              적용하기
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
