import React from 'react';
import type { Member, RSVPVote } from '../../types/rollbook';

interface HomeRsvpTallySectionProps {
  mandatoryAttendees: RSVPVote[];
  onSiteAttendees: Member[];
  mandatoryAbsentees: RSVPVote[];
  voluntaryAttendees: RSVPVote[];
  unvotedMembers: Member[];
  totalTargetCount: number;
  isRosterOpen: boolean;
  onToggleRoster: () => void;
}

export const HomeRsvpTallySection: React.FC<HomeRsvpTallySectionProps> = ({
  mandatoryAttendees,
  onSiteAttendees,
  mandatoryAbsentees,
  voluntaryAttendees,
  unvotedMembers,
  totalTargetCount,
  isRosterOpen,
  onToggleRoster,
}) => {
  const attendTotal = mandatoryAttendees.length + onSiteAttendees.length;
  const attendBreakdown = onSiteAttendees.length > 0 ? ` (투표 ${mandatoryAttendees.length} · 현장 ${onSiteAttendees.length})` : '';

  return (
    <div className="tally-section">
      <div className="tally-header">
        <h3 className="tally-title">사전 참석 투표 현황</h3>
        <span className="tally-total">
          {attendTotal + mandatoryAbsentees.length}명 응답·출석 / 총 {totalTargetCount}명
          {voluntaryAttendees.length > 0 && ` (🌿 자율 ${voluntaryAttendees.length}명)`}
        </span>
      </div>

      <div className="tally-bar">
        <div
          className="tally-bar-segment attend"
          style={{ width: `${(attendTotal / Math.max(totalTargetCount, 1)) * 100}%` }}
          title={`필수 참석 ${attendTotal}명${attendBreakdown}`}
        />
        <div
          className="tally-bar-segment absent"
          style={{ width: `${(mandatoryAbsentees.length / Math.max(totalTargetCount, 1)) * 100}%` }}
          title={`불참 ${mandatoryAbsentees.length}명`}
        />
      </div>

      <div className="tally-stat-chips">
        <span className="stat-chip attend">
          <span className="chip-dot attend" /> 참석 {attendTotal}
        </span>
        <span className="stat-chip absent">
          <span className="chip-dot absent" /> 불참 {mandatoryAbsentees.length}
        </span>
        <span className="stat-chip unvoted">
          <span className="chip-dot unvoted" /> 미응답 {unvotedMembers.length}
        </span>
        {voluntaryAttendees.length > 0 && (
          <span
            className="stat-chip"
            style={{ background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0' }}
          >
            <span className="chip-dot" style={{ background: '#10B981' }} /> 🌿 자율참관{' '}
            {voluntaryAttendees.length}
          </span>
        )}
      </div>

      {/* Clean, Subtle Roster Disclosure Toggle */}
      <div style={{ marginTop: '14px' }}>
        <button
          type="button"
          onClick={onToggleRoster}
          style={{
            width: '100%',
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: isRosterOpen ? '8px 8px 0 0' : '8px',
            padding: '9px 12px',
            fontSize: '12px',
            fontWeight: 600,
            color: '#475569',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            transition: 'background 0.15s ease',
          }}
        >
          <span>
            👥 단원 투표 명단 (참석 {attendTotal}{attendBreakdown} · 불참 {mandatoryAbsentees.length} · 미응답{' '}
            {unvotedMembers.length}
            {voluntaryAttendees.length > 0 ? ` · 🌿 자율 ${voluntaryAttendees.length}` : ''})
          </span>
          <span style={{ fontSize: '11px', color: '#94A3B8' }}>
            {isRosterOpen ? '▲ 명단 접기' : '▼ 명단 펼치기'}
          </span>
        </button>

        {isRosterOpen && (
          <div
            style={{
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderTop: 'none',
              borderRadius: '0 0 8px 8px',
              padding: '12px 14px',
              fontSize: '12px',
              color: '#334155',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            {/* Mandatory Attendees */}
            <div>
              <span style={{ fontWeight: 700, color: '#059669', display: 'block', marginBottom: '4px' }}>
                ✓ 참석 ({attendTotal}명)
              </span>
              {attendTotal > 0 ? (
                <span style={{ color: '#475569', lineHeight: 1.6 }}>
                  {mandatoryAttendees.map((a) => a.memberName).join(', ')}
                  {mandatoryAttendees.length > 0 && onSiteAttendees.length > 0 ? ', ' : ''}
                  {onSiteAttendees.map((m) => `${m.name}(현장)`).join(', ')}
                </span>
              ) : (
                <span style={{ color: '#94A3B8' }}>아직 참석 투표한 필수 대상 단원이 없습니다.</span>
              )}
            </div>

            {/* Voluntary / Guest Attendees */}
            {voluntaryAttendees.length > 0 && (
              <div
                style={{
                  background: '#F0FDF4',
                  border: '1px solid #BBF7D0',
                  borderRadius: '6px',
                  padding: '8px 10px',
                }}
              >
                <span style={{ fontWeight: 700, color: '#047857', display: 'block', marginBottom: '4px' }}>
                  🌿 자율 참여 / 참관 ({voluntaryAttendees.length}명)
                </span>
                <span style={{ color: '#166534', lineHeight: 1.6 }}>
                  {voluntaryAttendees.map((a) => a.memberName).join(', ')}
                </span>
              </div>
            )}

            {/* Absentees */}
            {mandatoryAbsentees.length > 0 && (
              <div>
                <span style={{ fontWeight: 700, color: '#DC2626', display: 'block', marginBottom: '4px' }}>
                  ✕ 불참 ({mandatoryAbsentees.length}명)
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {mandatoryAbsentees.map((ab) => (
                    <span key={ab.id} style={{ color: '#475569', lineHeight: 1.5 }}>
                      <strong>{ab.memberName}</strong>
                      {ab.reason ? ` (${ab.reason})` : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Unvoted */}
            <div>
              <span style={{ fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '4px' }}>
                ⏳ 미응답 ({unvotedMembers.length}명)
              </span>
              {unvotedMembers.length > 0 ? (
                <span style={{ color: '#64748B', lineHeight: 1.6 }}>
                  {unvotedMembers.map((m) => m.name).join(', ')}
                </span>
              ) : (
                <span style={{ color: '#059669' }}>모든 필수 대상 단원이 응답을 완료했습니다! 🎉</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
