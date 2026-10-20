import React from 'react';
import type {
  AttendanceReconciliation,
  Member,
  RSVPVote,
  RawAttendanceLog,
  Schedule,
} from '../../types/rollbook';
import type { CheckInWindowState } from '../../utils/timeWindow';
import { IconClock, IconLocation, IconQrScan, IconVote } from '../Icons';
import { LiquidGauge } from '../LiquidGauge';
import { HomeRsvpTallySection } from './HomeRsvpTallySection';

interface HomeActiveScheduleCardProps {
  activeSchedule: Schedule;
  activeDateSchedules: Schedule[];
  activeScheduleIndex: number;
  todayStr: string;
  selectedDateStr: string;
  homeViewTab: 'CALENDAR' | 'LIST';
  isTargetMember: boolean;
  attendRate: number;
  isActuallyAttended: boolean;
  isManuallyAbsent: boolean;
  myReconciliation: AttendanceReconciliation | null;
  myLog?: RawAttendanceLog;
  myVote?: RSVPVote;
  windowState: CheckInWindowState | null;
  mandatoryAttendees: RSVPVote[];
  mandatoryAbsentees: RSVPVote[];
  voluntaryAttendees: RSVPVote[];
  unvotedMembers: Member[];
  totalTargetCount: number;
  isRosterOpen: boolean;
  onToggleRoster: () => void;
  onPrevSchedule: () => void;
  onNextSchedule: () => void;
  onSelectScheduleId: (scheduleId: string) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onOpenQRScanner: (schedule?: Schedule) => void;
  onOpenRSVP: (schedule: Schedule) => void;
}

export const HomeActiveScheduleCard: React.FC<HomeActiveScheduleCardProps> = ({
  activeSchedule,
  activeDateSchedules,
  activeScheduleIndex,
  todayStr,
  selectedDateStr,
  homeViewTab,
  isTargetMember,
  attendRate,
  isActuallyAttended,
  isManuallyAbsent,
  myReconciliation,
  myLog,
  myVote,
  windowState,
  mandatoryAttendees,
  mandatoryAbsentees,
  voluntaryAttendees,
  unvotedMembers,
  totalTargetCount,
  isRosterOpen,
  onToggleRoster,
  onPrevSchedule,
  onNextSchedule,
  onSelectScheduleId,
  onTouchStart,
  onTouchEnd,
  onOpenQRScanner,
  onOpenRSVP,
}) => {
  return (
    <section
      className="active-schedule-card"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Multi-Schedule Carousel Switcher (Rendered only when 2+ schedules exist) */}
      {activeDateSchedules.length > 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '10px',
            padding: '6px 12px',
            marginBottom: '14px',
          }}
        >
          <button
            type="button"
            onClick={onPrevSchedule}
            style={{
              background: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 800,
              color: '#475569',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            }}
            title="이전 일정 보기"
            aria-label="이전 일정 보기"
          >
            ◀
          </button>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#1E293B' }}>
              {activeSchedule.date === todayStr ? '오늘' : activeSchedule.date} 일정 {activeScheduleIndex + 1}/
              {activeDateSchedules.length}
              <span style={{ color: '#4F46E5', marginLeft: '6px' }}>({activeSchedule.startTime})</span>
            </span>
            {/* Dot Indicators */}
            <div style={{ display: 'flex', gap: '5px' }}>
              {activeDateSchedules.map((sch, i) => (
                <span
                  key={sch.id}
                  onClick={() => onSelectScheduleId(sch.id)}
                  style={{
                    width: i === activeScheduleIndex ? '16px' : '6px',
                    height: '6px',
                    borderRadius: '3px',
                    background: i === activeScheduleIndex ? '#4F46E5' : '#CBD5E1',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  title={`${sch.title} (${sch.startTime})`}
                />
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={onNextSchedule}
            style={{
              background: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 800,
              color: '#475569',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            }}
            title="다음 일정 보기"
            aria-label="다음 일정 보기"
          >
            ▶
          </button>
        </div>
      )}

      <div
        className="schedule-card-header"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="schedule-category-badge">{activeSchedule.category}</span>
          {!isTargetMember && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#047857',
                background: '#ECFDF5',
                border: '1px solid #A7F3D0',
                padding: '2px 8px',
                borderRadius: '999px',
              }}
            >
              🌿 자율 참여 연습
            </span>
          )}
          <span className={`schedule-date-badge ${activeSchedule.date === todayStr ? 'is-today' : ''}`}>
            {activeSchedule.date === todayStr ? '오늘 연습' : activeSchedule.date}
          </span>
          {homeViewTab === 'CALENDAR' && activeSchedule.date === selectedDateStr && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#4f46e5',
                background: '#e0e7ff',
                padding: '2px 8px',
                borderRadius: '999px',
              }}
            >
              선택한 날짜
            </span>
          )}
        </div>
        {/* Cute Liquid Wave Gauge (MYTURN Style) */}
        <LiquidGauge percentage={attendRate} size={44} subText="투표율" />
      </div>

      <h2 className="schedule-card-title">{activeSchedule.title}</h2>

      <div className="schedule-info-grid">
        <div className="info-item">
          <span className="info-icon" aria-hidden="true">
            <IconClock size={16} />
          </span>
          <span className="info-text">
            {activeSchedule.startTime} ~ {activeSchedule.endTime}
          </span>
        </div>
        <div className="info-item">
          <span className="info-icon" aria-hidden="true">
            <IconLocation size={16} />
          </span>
          <span className="info-text">{activeSchedule.locationName}</span>
        </div>
      </div>

      {activeSchedule.description && <p className="schedule-desc-box">{activeSchedule.description}</p>}

      {/* Non-target member gentle notice banner */}
      {!isTargetMember && (
        <div
          style={{
            background: '#F0FDF4',
            border: '1px solid #BBF7D0',
            borderRadius: '8px',
            padding: '10px 14px',
            margin: '12px 0 4px',
            fontSize: '12.5px',
            color: '#166534',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '16px' }}>🌿</span>
          <div>
            <strong>공식 필참 일정이 아닙니다.</strong>
            <p style={{ margin: '2px 0 0', fontSize: '11.5px', color: '#15803D' }}>
              참관이나 개인 연습으로 자유롭게 참여하실 수 있습니다.
            </p>
          </div>
        </div>
      )}

      {/* User's Check-in & RSVP Status Banner */}
      {isActuallyAttended ? (
        <div className={`my-status-banner checked-in ${myReconciliation?.finalStatus === '지각' ? 'late' : ''}`}>
          <span className={`status-indicator-dot ${myReconciliation?.finalStatus === '지각' ? 'late' : 'checked'}`} />
          <div>
            <strong>
              {myReconciliation?.finalStatus === '지각' ? '오늘 출석 (지각)' : '오늘 출석 체크 완료'}
            </strong>
            <p className="banner-subtext">
              인증 시각:{' '}
              {myReconciliation?.checkInTime
                ? myReconciliation.checkInTime.includes('T')
                  ? myReconciliation.checkInTime.slice(11, 16)
                  : myReconciliation.checkInTime.slice(0, 5)
                : myLog
                ? myLog.timestamp.includes('T')
                  ? myLog.timestamp.slice(11, 16)
                  : myLog.timestamp.slice(0, 5)
                : ''}{' '}
              ·{' '}
              {myReconciliation?.authMethod === 'MANUAL_BY_ADMIN'
                ? myReconciliation.adminNote || '관리자 수동 인정'
                : myReconciliation?.isVerifiedLocation
                ? '연습실 위치 확인됨'
                : 'GPS 오차 범위'}
            </p>
          </div>
        </div>
      ) : isManuallyAbsent ? (
        <div className="my-status-banner absent" style={{ background: '#fef2f2', borderColor: '#fca5a5' }}>
          <span className="status-indicator-dot absent" />
          <div>
            <strong style={{ color: '#b91c1c' }}>관리자 확인: 결석 처리</strong>
            <p className="banner-subtext" style={{ color: '#ef4444' }}>
              {myReconciliation?.adminNote || '관리자에 의해 결석으로 처리되었습니다.'}
            </p>
          </div>
        </div>
      ) : windowState?.status === 'WINDOW_CLOSED' &&
        myReconciliation?.finalStatus === '결석' &&
        isTargetMember ? (
        <div className="my-status-banner absent" style={{ background: '#f8fafc', borderColor: '#cbd5e1' }}>
          <span className="status-indicator-dot" style={{ background: '#94a3b8' }} />
          <div>
            <strong style={{ color: '#475569' }}>출석 마감: 미출석 (일반 결석)</strong>
            <p className="banner-subtext" style={{ color: '#64748b' }}>
              공식 출석 시간이 종료되어 미출석으로 기록되었습니다.
            </p>
          </div>
        </div>
      ) : myVote ? (
        <div className={`my-status-banner voted ${myVote.status.toLowerCase()}`}>
          <span className={`status-indicator-dot ${myVote.status === 'ATTEND' ? 'attend' : 'absent'}`} />
          <div>
            <strong>사전 투표: {myVote.status === 'ATTEND' ? '참석 예정' : '불참'}</strong>
            {myVote.reason && <p className="banner-subtext">사유: {myVote.reason}</p>}
          </div>
        </div>
      ) : null}

      {/* Action Buttons: Time Window Driven */}
      <div className="action-buttons-stack">
        {windowState?.isOpen ? (
          <>
            <button
              type="button"
              className="btn-qr-scan-primary"
              onClick={() => onOpenQRScanner(activeSchedule)}
            >
              <IconQrScan size={22} className="btn-icon" />
              <div className="btn-text-block">
                <span className="btn-main-label">
                  {isActuallyAttended
                    ? '다시 출석 체크하기'
                    : !isTargetMember
                    ? '개인 연습으로 출석 체크'
                    : 'QR 출석 체크'}
                </span>
                <span className="btn-sub-label">
                  {!isTargetMember
                    ? '자유 연습/참관으로 출석 기록을 남깁니다'
                    : '연습실 종이 QR 코드를 스캔하세요'}
                </span>
              </div>
            </button>

            <div className="qr-locked-card" style={{ padding: '10px 14px', background: '#F8FAFC' }}>
              <div className="qr-locked-info">
                <span className="qr-lock-icon">🔒</span>
                <div>
                  <div className="qr-locked-title">사전 참석 투표 마감 (연습 1시간 전 마감)</div>
                  <div className="qr-locked-desc">
                    {myVote
                      ? `사전 투표 응답: ${
                          myVote.status === 'ATTEND' ? '참석 예정' : `불참 (${myVote.reason || '사유 미기재'})`
                        }`
                      : '현재는 현장 QR/PIN 출석 체크 시간입니다.'}
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : windowState?.status === 'WINDOW_CLOSED' ? (
          /* Concluded Schedule: Closed State */
          <div className="qr-locked-card window-closed" style={{ borderLeft: '4px solid #94A3B8' }}>
            <div className="qr-locked-info">
              <span className="qr-lock-icon">🏁</span>
              <div>
                <div className="qr-locked-title">출석 마감 ({activeSchedule.date} 일정 종료)</div>
                <div className="qr-locked-desc">
                  {isActuallyAttended && myReconciliation?.checkInTime
                    ? `출석 완료 (${
                        myReconciliation.checkInTime.includes('T')
                          ? myReconciliation.checkInTime.slice(11, 16)
                          : myReconciliation.checkInTime.slice(0, 5)
                      }) · 정상 반영되었습니다.`
                    : isManuallyAbsent
                    ? `관리자에 의해 결석 처리되었습니다 (${myReconciliation?.adminNote || '관리자 결석'}).`
                    : myReconciliation?.finalStatus === '사유결석'
                    ? `사전 불참 사유가 등록되어 사유결석 처리되었습니다 (${
                        myReconciliation?.rsvpReason || '사유 불참'
                      }).`
                    : !isTargetMember
                    ? '공식 필참 대상이 아니므로 출결 통계 모수에서 제외되었습니다 (미참).'
                    : '금일 연습의 공식 출석 체크가 마감되었습니다 (미출석).'}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Default Primary Action: RSVP Pre-voting */}
            <button
              type="button"
              className="btn-rsvp-primary"
              onClick={() => onOpenRSVP(activeSchedule)}
            >
              <IconVote size={22} className="btn-icon" />
              <div className="btn-text-block">
                <span className="btn-main-label">
                  {!isTargetMember
                    ? myVote
                      ? '개인 연습 참여 여부 수정'
                      : '개인 연습으로 참여 투표'
                    : myVote
                    ? '사전 참석/불참 투표 수정'
                    : '사전 참석/불참 투표하기'}
                </span>
                <span className="btn-sub-label">
                  {myVote
                    ? `현재 선택: ${myVote.status === 'ATTEND' ? '참석 예정' : '불참'}`
                    : !isTargetMember
                    ? '자유 연습/참관 참여 여부를 알려주세요'
                    : '연습 참석 여부를 미리 알려주세요'}
                </span>
              </div>
            </button>

            {/* Subordinate Locked QR Check-in Notice */}
            <div className="qr-locked-card">
              <div className="qr-locked-info">
                <span className="qr-lock-icon">🔒</span>
                <div>
                  <div className="qr-locked-title">현장 QR 출석 ({windowState?.badgeLabel})</div>
                  <div className="qr-locked-desc">{windowState?.message}</div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Realtime Attendance / RSVP Tally Bar */}
      <HomeRsvpTallySection
        mandatoryAttendees={mandatoryAttendees}
        mandatoryAbsentees={mandatoryAbsentees}
        voluntaryAttendees={voluntaryAttendees}
        unvotedMembers={unvotedMembers}
        totalTargetCount={totalTargetCount}
        isRosterOpen={isRosterOpen}
        onToggleRoster={onToggleRoster}
      />
    </section>
  );
};
