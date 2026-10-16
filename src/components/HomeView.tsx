import React, { useState } from 'react';
import { sheetsService } from '../services/sheets';
import type { BoundDeviceProfile, Schedule } from '../types/rollbook';
import { getCheckInWindowState } from '../utils/timeWindow';
import {
  IconCalendar,
  IconClock,
  IconLocation,
  IconQrScan,
  IconSettings,
  IconVote,
} from './Icons';
import { LiquidGauge } from './LiquidGauge';
import moonchoirLogo from '../assets/moonchoir-logo.png';

interface HomeViewProps {
  profile: BoundDeviceProfile;
  onOpenQRScanner: () => void;
  onOpenRSVP: (schedule: Schedule) => void;
  onOpenAdmin: () => void;
  onChangeProfile: () => void;
  onViewCalendar: () => void;
  refreshTrigger: number;
}

export const HomeView: React.FC<HomeViewProps> = ({
  profile,
  onOpenQRScanner,
  onOpenRSVP,
  onOpenAdmin,
  onChangeProfile,
  onViewCalendar,
  refreshTrigger: _refreshTrigger,
}) => {
  const [testWindowBypass, setTestWindowBypass] = useState(false);
  const schedules = sheetsService.getSchedules();
  const members = sheetsService.getMembers().filter((m) => m.status === 'ACTIVE');

  // Find today's or closest upcoming rehearsal
  const [currentNow] = useState(() => new Date());
  const todayStr = currentNow.toISOString().slice(0, 10);

  // Find exact today schedule, or the first schedule today or in the future
  const activeSchedule =
    schedules.find((s) => s.date === todayStr) ||
    schedules.find((s) => s.date >= todayStr) ||
    schedules[0];

  const windowState = activeSchedule
    ? getCheckInWindowState(activeSchedule, currentNow, testWindowBypass)
    : null;

  const rsvpVotes = activeSchedule ? sheetsService.getRSVPVotes(activeSchedule.id) : [];
  const logs = activeSchedule ? sheetsService.getLogs(activeSchedule.id) : [];

  // Current user's status for this active schedule
  const myVote = rsvpVotes.find((v) => v.memberId === profile.memberId);
  const myLog = logs.find((l) => l.memberId === profile.memberId);

  // Grouped RSVP lists
  const attendees = rsvpVotes.filter((v) => v.status === 'ATTEND');
  const absentees = rsvpVotes.filter((v) => v.status === 'ABSENT');

  const votedMemberIds = new Set(rsvpVotes.map((v) => v.memberId));
  const unvotedMembers = members.filter((m) => !votedMemberIds.has(m.id));

  const attendRate = members.length > 0 ? Math.round((attendees.length / members.length) * 100) : 0;

  return (
    <div className="home-container">
      {/* Top Header */}
      <header className="home-header">
        <div className="header-brand">
          <img
            src={moonchoirLogo}
            alt="Moonchoir"
            className="brand-logo-img"
            style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover' }}
          />
          <div>
            <h1 className="brand-title">문콰이어 출석부</h1>
            <p className="brand-subtitle">MOONCHOIR ATTENDANCE</p>
          </div>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="profile-pill-btn"
            onClick={onChangeProfile}
            title="기기 바인딩 프로필 변경"
          >
            <span className={`part-badge part-${profile.part}`}>{profile.part}</span>
            <span className="profile-name">{profile.name}</span>
          </button>

          <button
            type="button"
            className="admin-icon-btn"
            onClick={onOpenAdmin}
            title="관리자 모드"
            aria-label="관리자 모드"
          >
            <IconSettings size={18} />
          </button>
        </div>
      </header>

      {/* Main Active Rehearsal Card */}
      {activeSchedule ? (
        <section className="active-schedule-card">
          <div className="schedule-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <span className="schedule-category-badge">{activeSchedule.category}</span>
              <span className={`schedule-date-badge ${activeSchedule.date === todayStr ? 'is-today' : ''}`}>
                {activeSchedule.date === todayStr ? '오늘 연습' : activeSchedule.date}
              </span>
            </div>
            {/* Cute Liquid Wave Gauge (MYTURN Style) */}
            <LiquidGauge percentage={attendRate} size={44} subText="참석률" />
          </div>

          <h2 className="schedule-card-title">{activeSchedule.title}</h2>

          <div className="schedule-info-grid">
            <div className="info-item">
              <span className="info-icon" aria-hidden="true">
                <IconClock size={16} />
              </span>
              <span className="info-text">{activeSchedule.startTime} ~ {activeSchedule.endTime}</span>
            </div>
            <div className="info-item">
              <span className="info-icon" aria-hidden="true">
                <IconLocation size={16} />
              </span>
              <span className="info-text">{activeSchedule.locationName}</span>
            </div>
          </div>

          {activeSchedule.description && (
            <p className="schedule-desc-box">{activeSchedule.description}</p>
          )}

          {/* User's Check-in & RSVP Status Banner */}
          {myLog ? (
            <div className="my-status-banner checked-in">
              <span className="status-indicator-dot checked" />
              <div>
                <strong>오늘 출석 체크 완료</strong>
                <p className="banner-subtext">
                  인증 시각: {myLog.timestamp.slice(11, 16)} ·{' '}
                  {myLog.isVerifiedLocation ? '연습실 위치 확인됨' : 'GPS 오차 범위'}
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

          {/* Action Buttons: 2-Hour Time Window Driven */}
          <div className="action-buttons-stack">
            {windowState?.isOpen ? (
              <>
                <button
                  type="button"
                  className="btn-qr-scan-primary"
                  onClick={onOpenQRScanner}
                >
                  <IconQrScan size={22} className="btn-icon" />
                  <div className="btn-text-block">
                    <span className="btn-main-label">
                      {myLog ? '다시 출석 체크하기' : 'QR 출석 체크'}
                    </span>
                    <span className="btn-sub-label">연습실 종이 QR 코드를 스캔하세요</span>
                  </div>
                </button>

                <button
                  type="button"
                  className="btn-rsvp-secondary"
                  onClick={() => onOpenRSVP(activeSchedule)}
                >
                  <IconVote size={18} className="btn-icon" />
                  <span>{myVote ? '사전 참석/불참 투표 수정' : '사전 참석/불참 투표하기'}</span>
                </button>
              </>
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
                      {myVote ? '사전 참석/불참 투표 수정' : '사전 참석/불참 투표하기'}
                    </span>
                    <span className="btn-sub-label">
                      {myVote
                        ? `현재 선택: ${myVote.status === 'ATTEND' ? '참석 예정' : '불참'}`
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
                  <button
                    type="button"
                    className="btn-test-bypass"
                    onClick={() => setTestWindowBypass((b) => !b)}
                    title="개발/시뮬레이션 모드 전환"
                  >
                    {testWindowBypass ? '시뮬레이션 끄기' : '테스트 오픈'}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Realtime Attendance / RSVP Tally Bar */}
          <div className="tally-section">
            <div className="tally-header">
              <h3 className="tally-title">사전 참석 투표 현황</h3>
              <span className="tally-total">
                {rsvpVotes.length}명 참여 / 총 {members.length}명
              </span>
            </div>

            <div className="tally-bar">
              <div
                className="tally-bar-segment attend"
                style={{ width: `${(attendees.length / Math.max(members.length, 1)) * 100}%` }}
                title={`참석 ${attendees.length}명`}
              />
              <div
                className="tally-bar-segment absent"
                style={{ width: `${(absentees.length / Math.max(members.length, 1)) * 100}%` }}
                title={`불참 ${absentees.length}명`}
              />
            </div>

            <div className="tally-stat-chips">
              <span className="stat-chip attend">
                <span className="chip-dot attend" /> 참석 {attendees.length}
              </span>
              <span className="stat-chip absent">
                <span className="chip-dot absent" /> 불참 {absentees.length}
              </span>
              <span className="stat-chip unvoted">
                <span className="chip-dot unvoted" /> 미응답 {unvotedMembers.length}
              </span>
            </div>

            {/* List of Attendees */}
            <div className="tally-list-block">
              <div className="tally-sub-title">참석 예정 ({attendees.length}명)</div>
              {attendees.length > 0 ? (
                <div className="member-chips-wrap">
                  {attendees.map((a) => (
                    <span key={a.id} className="attendee-chip">
                      <span className={`mini-part-dot part-${a.part}`} />
                      {a.memberName}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="empty-subtext">아직 참석 투표자가 없습니다.</p>
              )}
            </div>

            {/* List of Absentees with Reasons */}
            {absentees.length > 0 && (
              <div className="tally-list-block">
                <div className="tally-sub-title">불참 사유 ({absentees.length}명)</div>
                <div className="absentee-reasons-list">
                  {absentees.map((ab) => (
                    <div key={ab.id} className="absentee-reason-item">
                      <span className="absentee-name">{ab.memberName}</span>
                      <span className="absentee-reason-text">"{ab.reason || '사유 미작성'}"</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      ) : (
        <div className="no-schedule-box">
          <p>등록된 일정이 없습니다.</p>
        </div>
      )}

      {/* Month Schedules Overview Preview */}
      <section className="month-overview-card">
        <div className="section-title-row">
          <div>
            <h3 className="section-title">이번 달 연습 일정</h3>
            <p className="section-subtitle">정기 연습 및 추가 일정</p>
          </div>
          <button type="button" className="btn-calendar-link" onClick={onViewCalendar}>
            <IconCalendar size={15} />
            <span>전체 캘린더</span>
          </button>
        </div>

        <div className="schedules-preview-list compact">
          {schedules.map((s) => {
            const votes = sheetsService.getRSVPVotes(s.id);
            const count = votes.filter((v) => v.status === 'ATTEND').length;
            const rate = members.length > 0 ? Math.round((count / members.length) * 100) : 0;
            return (
              <div key={s.id} className="schedule-preview-item compact" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px' }}>
                <div className="preview-date-box" style={{ width: '38px', minWidth: '38px', height: '38px' }}>
                  <span className="preview-month" style={{ fontSize: '9px' }}>{s.date.slice(5, 7)}월</span>
                  <span className="preview-day" style={{ fontSize: '14px' }}>{s.date.slice(8, 10)}</span>
                </div>
                <div className="preview-content" style={{ flex: 1, minWidth: 0 }}>
                  <div className="preview-title-row" style={{ gap: '6px' }}>
                    <span className="preview-title" style={{ fontSize: '13px', fontWeight: 600 }}>{s.title}</span>
                    <span className="schedule-category-badge" style={{ fontSize: '10px', padding: '1px 6px' }}>{s.category}</span>
                  </div>
                  <div className="preview-meta" style={{ fontSize: '11px', color: '#8b95a1', marginTop: '2px' }}>
                    <span>{s.startTime}~{s.endTime}</span>
                    <span className="meta-divider">·</span>
                    <span>{s.locationName}</span>
                  </div>
                </div>
                <LiquidGauge percentage={rate} size={32} />
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
