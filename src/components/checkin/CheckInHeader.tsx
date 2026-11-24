import React from 'react';
import type { Schedule } from '../../types/rollbook';
import { IconClose, IconKeypad, IconQrScan } from '../Icons';
import { formatCardDateLine } from '../../utils/homeCardText';

export interface CheckInHeaderProps {
  schedule: Schedule;
  currentName: string;
  currentPart: string;
  activeTab: 'QR' | 'PIN';
  onSelectTab: (tab: 'QR' | 'PIN') => void;
  onClose: () => void;
  isProcessing: boolean;
  closeButtonRef?: React.RefObject<HTMLButtonElement | null>;
}

export const CheckInHeader: React.FC<CheckInHeaderProps> = ({
  schedule,
  currentName,
  currentPart,
  activeTab,
  onSelectTab,
  onClose,
  isProcessing,
  closeButtonRef,
}) => {
  const dateLine = formatCardDateLine(schedule);
  const venue = schedule.locationName?.trim() || '장소 미정';

  return (
    <div className="ci-header">
      <div className="ci-header-top">
        <h2 className="ci-title">출석 인증</h2>
        <button
          ref={closeButtonRef}
          type="button"
          className="ci-close-btn"
          aria-label="닫기"
          disabled={isProcessing}
          onClick={onClose}
        >
          <IconClose size={22} />
        </button>
      </div>

      <div className="ci-schedule-summary" aria-label="인증할 일정">
        <div className="ci-schedule-row-main">
          <span className="ci-schedule-title">{schedule.title}</span>
          <span className="ci-member-badge">
            {currentName} · {currentPart}
          </span>
        </div>
        <div className="ci-schedule-sub">
          {dateLine} · {venue}
        </div>
      </div>

      <div className="ci-tabs" role="tablist" aria-label="인증 방법">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'QR'}
          className={`ci-tab-btn ${activeTab === 'QR' ? 'is-active' : ''}`}
          disabled={isProcessing}
          onClick={() => onSelectTab('QR')}
        >
          <IconQrScan size={18} />
          <span>QR 스캔</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'PIN'}
          className={`ci-tab-btn ${activeTab === 'PIN' ? 'is-active' : ''}`}
          disabled={isProcessing}
          onClick={() => onSelectTab('PIN')}
        >
          <IconKeypad size={18} />
          <span>현장 PIN</span>
        </button>
      </div>
    </div>
  );
};
