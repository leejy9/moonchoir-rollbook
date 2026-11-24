import React from 'react';
import type { RawAttendanceLog } from '../../types/rollbook';
import { IconClose, IconLocationOff, IconSync } from '../Icons';
import {
  buildFailureView,
  type CheckInFailureKind,
  type FailureViewContext,
} from '../../utils/checkinMessages';
import { getKSTClock } from '../../utils/date';
import { buildKakaoExternalBrowserUrl } from '../../utils/pwaInstall';

export interface CheckInSuccessViewProps {
  type: 'SUCCESS';
  savedLog: RawAttendanceLog;
  currentName: string;
  successInfo: {
    scheduleTitle: string;
    locationName: string;
  };
  onClose: () => void;
}

export interface CheckInFailureViewProps {
  type: 'FAILURE';
  kind: CheckInFailureKind;
  detail: string;
  context?: FailureViewContext;
  onRetry: () => void;
  onClose: () => void;
  needsExternalBrowserHint?: boolean;
  isKakaoInApp?: boolean;
}

export type CheckInResultProps = CheckInSuccessViewProps | CheckInFailureViewProps;

export const CheckInResult: React.FC<CheckInResultProps> = (props) => {
  if (props.type === 'SUCCESS') {
    const { savedLog, currentName, successInfo, onClose } = props;
    const timeStr = getKSTClock(savedLog.timestamp);

    return (
      <div className="ci-result">
        <div className="ci-result-header">
          <button
            type="button"
            className="ci-close-btn"
            aria-label="닫기"
            onClick={onClose}
          >
            <IconClose size={22} />
          </button>
        </div>

        <div className="ci-result-content">
          <div className="ci-result-icon-circle is-success" aria-hidden="true">
            <svg
              className="ci-check-svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path
                className="ci-check-path"
                pathLength="1"
                d="M20 6L9 17L4 12"
              />
            </svg>
          </div>

          <h2 className="ci-result-title">출석했어요</h2>
          <p className="ci-result-body">
            {`${currentName} 단원님, ${timeStr}에 출석 처리됐어요.`}
          </p>

          <div className="ci-details-list" aria-label="출석 내용">
            <div className="ci-detail-row">
              <span className="ci-detail-label">일정</span>
              <span className="ci-detail-value">{successInfo.scheduleTitle}</span>
            </div>
            <div className="ci-detail-row">
              <span className="ci-detail-label">장소</span>
              <span className="ci-detail-value">{successInfo.locationName}</span>
            </div>
            <div className="ci-detail-row">
              <span className="ci-detail-label">출석 시각</span>
              <span className="ci-detail-value">{timeStr}</span>
            </div>
          </div>

          <div className="ci-result-actions">
            <button
              type="button"
              className="ci-primary-btn"
              onClick={onClose}
            >
              확인
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Failure
  const {
    kind,
    detail,
    context,
    onRetry,
    onClose,
    needsExternalBrowserHint,
    isKakaoInApp,
  } = props;
  const failureView = buildFailureView(kind, detail, context);

  return (
    <div className="ci-result">
      <div className="ci-result-header">
        <button
          type="button"
          className="ci-close-btn"
          aria-label="닫기"
          onClick={onClose}
        >
          <IconClose size={22} />
        </button>
      </div>

      <div className="ci-result-content">
        <div className="ci-result-icon-circle is-fail" aria-hidden="true">
          {kind === 'SAVE_FAILED' ? (
            <IconSync size={36} className="ci-fail-icon" />
          ) : (
            <IconLocationOff size={36} className="ci-fail-icon" />
          )}
        </div>

        <h2 className="ci-result-title">{failureView.title}</h2>
        <p className="ci-result-body">{failureView.body}</p>

        <ul className="ci-tips-list" aria-label="확인할 것">
          {failureView.tips.map((tip, idx) => (
            <li key={idx} className="ci-tip-item">
              <span className="ci-tip-bullet">{idx + 1}.</span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>

        {isKakaoInApp && needsExternalBrowserHint && typeof window !== 'undefined' && (
          <a
            href={buildKakaoExternalBrowserUrl(window.location.href)}
            className="ci-external-browser-link"
            target="_blank"
            rel="noreferrer noopener"
            style={{ marginBottom: '16px' }}
          >
            기본 브라우저로 열기
          </a>
        )}

        <div className="ci-result-actions">
          <button
            type="button"
            className="ci-primary-btn"
            onClick={onRetry}
          >
            다시 확인하기
          </button>
          <button
            type="button"
            className="ci-secondary-btn"
            onClick={onClose}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
