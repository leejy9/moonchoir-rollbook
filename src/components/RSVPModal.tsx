import React, { useState } from 'react';
import { sheetsService } from '../services/sheets';
import type { BoundDeviceProfile, RSVPStatus, RSVPVote, Schedule } from '../types/rollbook';
import { getKSTTimestampString } from '../utils/date';
import { isRsvpOpenForSchedule } from '../utils/timeWindow';

interface RSVPModalProps {
  schedule: Schedule;
  profile: BoundDeviceProfile;
  currentVote?: RSVPVote;
  onClose: () => void;
  onSuccess: (vote?: RSVPVote) => void;
}

const COMMON_REASONS = ['회사 야근', '가족 행사/경조사', '건강/감기 몸살', '지방 출장', '개인 사정'];

export const RSVPModal: React.FC<RSVPModalProps> = ({
  schedule,
  profile,
  currentVote,
  onClose,
  onSuccess,
}) => {
  const [status, setStatus] = useState<RSVPStatus>(currentVote?.status || 'ATTEND');
  const [reason, setReason] = useState<string>(currentVote?.reason || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCancelVote = async () => {
    if (!currentVote) return;
    if (!isRsvpOpenForSchedule(schedule)) {
      alert('연습 시작 1시간 전부터는 사전 투표를 변경하거나 취소할 수 없습니다.');
      onClose();
      return;
    }
    setIsSubmitting(true);
    await sheetsService.cancelRSVP(schedule.id, profile.memberId);
    setIsSubmitting(false);
    onSuccess();
  };

  const currentMember = sheetsService.getMembers().find((m) => m.id === profile.memberId);
  const currentPart = currentMember?.part || profile.part;
  const currentName = currentMember?.name || profile.name;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isRsvpOpenForSchedule(schedule)) {
      alert('연습 시작 1시간 전부터는 사전 투표를 변경할 수 없습니다.');
      onClose();
      return;
    }
    setIsSubmitting(true);

    const vote: RSVPVote = {
      id: currentVote?.id || `vote_${Date.now()}`,
      scheduleId: schedule.id,
      memberId: profile.memberId,
      memberName: currentName,
      part: currentPart,
      status,
      reason: status === 'ABSENT' ? reason.trim() : undefined,
      timestamp: getKSTTimestampString(),
    };

    await sheetsService.submitRSVP(vote);
    setIsSubmitting(false);
    onSuccess(vote);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="modal-header">
          <div className="modal-badge">사전 참석 투표</div>
          <h2 className="modal-title">{schedule.title}</h2>
          <p className="modal-desc">
            일시: {schedule.date} ({schedule.startTime}~{schedule.endTime})<br />
            장소: {schedule.locationName}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="form-stack">
          <div className="selected-card">
            <span className={`part-badge part-${currentPart}`}>{currentPart}</span>
            <span className="selected-name">{currentName} 님의 투표</span>
          </div>

          <div className="rsvp-toggle-grid">
            <button
              type="button"
              className={`rsvp-choice-btn attend ${status === 'ATTEND' ? 'active' : ''}`}
              onClick={() => setStatus('ATTEND')}
            >
              <span className="rsvp-icon">🟢</span>
              <span className="rsvp-title">참석합니다</span>
            </button>

            <button
              type="button"
              className={`rsvp-choice-btn absent ${status === 'ABSENT' ? 'active' : ''}`}
              onClick={() => setStatus('ABSENT')}
            >
              <span className="rsvp-icon">🔴</span>
              <span className="rsvp-title">불참합니다</span>
            </button>
          </div>

          {status === 'ABSENT' && (
            <div className="absent-reason-block">
              <label className="form-label" htmlFor="rsvp-reason">불참 사유</label>

              <div className="reason-chips-row">
                {COMMON_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`filter-chip ${reason === r ? 'active' : ''}`}
                    onClick={() => setReason(r)}
                  >
                    {r}
                  </button>
                ))}
              </div>

              <input
                id="rsvp-reason"
                type="text"
                className="input-text"
                placeholder="사유 직접 입력"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </div>
          )}

          <div className="rsvp-modal-actions" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn-secondary-cancel"
                style={{ flex: 1, minHeight: '44px', padding: '0 12px', fontSize: '14px', borderRadius: '10px' }}
                onClick={onClose}
                disabled={isSubmitting}
              >
                닫기
              </button>
              <button
                type="submit"
                className="btn-primary-large"
                style={{ flex: 2, minHeight: '44px', fontSize: '14px', borderRadius: '10px' }}
                disabled={isSubmitting}
              >
                {isSubmitting ? '저장 중...' : '투표 제출'}
              </button>
            </div>

            {currentVote && (
              <button
                type="button"
                className="btn-danger-outline"
                style={{
                  width: '100%',
                  minHeight: '38px',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: '1px solid #ff4d4f',
                  background: '#fff',
                  color: '#ff4d4f',
                  fontWeight: 600,
                  fontSize: '12px',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
                onClick={handleCancelVote}
                disabled={isSubmitting}
              >
                투표 취소
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
