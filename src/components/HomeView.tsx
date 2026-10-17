import React, { useEffect, useMemo, useState } from 'react';
import { sheetsService } from '../services/sheets';
import type { BoundDeviceProfile, Schedule } from '../types/rollbook';
import { getCalendarGrid } from '../utils/calendar';
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
  onOpenQRScanner: (schedule?: Schedule) => void;
  onOpenRSVP: (schedule: Schedule) => void;
  onOpenAdmin: () => void;
  onChangeProfile?: () => void;
  onOpenProfilePortal?: () => void;
  onViewCalendar?: () => void;
  refreshTrigger: number;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function getCategoryDotClass(category: string): string {
  if (category.includes('연주') || category.includes('공연') || category.includes('콘서트')) {
    return 'dot-concert';
  }
  if (
    category.includes('행사') ||
    category.includes('합숙') ||
    category.includes('이벤트') ||
    category.includes('MT') ||
    category.includes('기타')
  ) {
    return 'dot-event';
  }
  return 'dot-practice';
}

const getTodayDateString = () => new Date().toISOString().slice(0, 10);

export const HomeView: React.FC<HomeViewProps> = ({
  profile,
  onOpenQRScanner,
  onOpenRSVP,
  onOpenAdmin,
  onChangeProfile,
  onOpenProfilePortal,
  onViewCalendar,
  refreshTrigger: _refreshTrigger,
}) => {
  const [homeViewTab, setHomeViewTab] = useState<'CALENDAR' | 'LIST'>('CALENDAR');

  const [todayStr] = useState(getTodayDateString);
  const [currentNow, setCurrentNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentNow(new Date());
    }, 10000); // 10s tick for smooth, real-time window transition
    return () => clearInterval(timer);
  }, []);

  // Month navigation state (default to current year/month)
  const [currentYear, setCurrentYear] = useState(() => parseInt(todayStr.slice(0, 4), 10));
  const [currentMonthIndex, setCurrentMonthIndex] = useState(() => parseInt(todayStr.slice(5, 7), 10) - 1);
  const [selectedDateStr, setSelectedDateStr] = useState<string>(todayStr);

  const schedules = sheetsService.getSchedules();
  const members = sheetsService.getMembers().filter((m) => m.status === 'ACTIVE');
  const allLogs = sheetsService.getLogs();

  // Map user's attended schedules
  const myLogsByScheduleId = useMemo(() => {
    const map = new Map<string, boolean>();
    allLogs
      .filter((l) => l.memberId === profile.memberId)
      .forEach((l) => {
        map.set(l.scheduleId, true);
        const matching = schedules.find(
          (s) => s.id === l.scheduleId || (l.scheduleId && s.id.startsWith(l.scheduleId)) || (l.timestamp && l.timestamp.startsWith(s.date))
        );
        if (matching) {
          map.set(matching.id, true);
        }
      });
    return map;
  }, [allLogs, profile.memberId, schedules]);

  // Map schedules by date string
  const schedulesByDate = useMemo(() => {
    const map = new Map<string, Schedule[]>();
    schedules.forEach((s) => {
      const list = map.get(s.date) || [];
      list.push(s);
      map.set(s.date, list);
    });
    return map;
  }, [schedules]);

  // Calendar grid calculation
  const calendarDays = useMemo(() => {
    return getCalendarGrid(currentYear, currentMonthIndex);
  }, [currentYear, currentMonthIndex]);

  const handlePrevMonth = () => {
    if (currentMonthIndex === 0) {
      setCurrentMonthIndex(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonthIndex((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonthIndex === 11) {
      setCurrentMonthIndex(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonthIndex((m) => m + 1);
    }
  };

  // Determine active schedule
  const activeSchedule: Schedule | undefined = useMemo(() => {
    const list = schedulesByDate.get(selectedDateStr) || [];
    // 1. If in Calendar tab and user selected a date that has a schedule
    if (homeViewTab === 'CALENDAR' && list.length > 0) {
      return list[0];
    }
    // 2. Otherwise today's schedule or next upcoming
    return (
      schedules.find((s) => s.date === todayStr) ||
      schedules.find((s) => s.date >= todayStr) ||
      schedules[0]
    );
  }, [homeViewTab, schedulesByDate, selectedDateStr, schedules, todayStr]);

  const windowState = activeSchedule
    ? getCheckInWindowState(activeSchedule, currentNow)
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

  // Upcoming future schedules (from today onwards)
  const upcomingSchedules = useMemo(() => {
    return schedules
      .filter((s) => s.date >= todayStr && !s.isArchived)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [schedules, todayStr]);

  const handleProfileClick = () => {
    if (onOpenProfilePortal) {
      onOpenProfilePortal();
    } else if (onChangeProfile) {
      onChangeProfile();
    }
  };

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
            onClick={handleProfileClick}
            title="프로필 및 출결 현황"
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

      {/* View Switcher Tabs: 캘린더 일체형 뷰 vs 리스트 뷰 */}
      <div
        style={{
          display: 'flex',
          background: '#f1f5f9',
          padding: '4px',
          borderRadius: '12px',
          margin: '0 0 16px',
          gap: '4px',
        }}
      >
        <button
          type="button"
          onClick={() => setHomeViewTab('CALENDAR')}
          style={{
            flex: 1,
            minHeight: '44px',
            border: 'none',
            borderRadius: '8px',
            fontSize: '0.9rem',
            fontWeight: 700,
            cursor: 'pointer',
            background: homeViewTab === 'CALENDAR' ? '#ffffff' : 'transparent',
            color: homeViewTab === 'CALENDAR' ? '#1e293b' : '#64748b',
            boxShadow: homeViewTab === 'CALENDAR' ? '0 2px 4px rgba(0,0,0,0.06)' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            transition: 'all 0.15s ease',
          }}
        >
          <IconCalendar size={16} />
          <span>월간 캘린더</span>
        </button>

        <button
          type="button"
          onClick={() => setHomeViewTab('LIST')}
          style={{
            flex: 1,
            minHeight: '44px',
            border: 'none',
            borderRadius: '8px',
            fontSize: '0.9rem',
            fontWeight: 700,
            cursor: 'pointer',
            background: homeViewTab === 'LIST' ? '#ffffff' : 'transparent',
            color: homeViewTab === 'LIST' ? '#1e293b' : '#64748b',
            boxShadow: homeViewTab === 'LIST' ? '0 2px 4px rgba(0,0,0,0.06)' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            transition: 'all 0.15s ease',
          }}
        >
          <span>📋 오늘 & 다가오는 연습</span>
        </button>
      </div>

      {/* Embedded Monthly Interactive Calendar (When in CALENDAR tab) */}
      {homeViewTab === 'CALENDAR' && (
        <section
          className="integrated-calendar-card"
          style={{
            background: '#ffffff',
            borderRadius: '16px',
            padding: '16px',
            border: '1px solid #e2e8f0',
            marginBottom: '16px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
          }}
        >
          {/* Calendar Header Month Switcher */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>
                {currentYear}년 {currentMonthIndex + 1}월
              </h2>
              {selectedDateStr !== todayStr && (
                <button
                  type="button"
                  onClick={() => {
                    const todayYear = parseInt(todayStr.slice(0, 4), 10);
                    const todayMonth = parseInt(todayStr.slice(5, 7), 10) - 1;
                    setCurrentYear(todayYear);
                    setCurrentMonthIndex(todayMonth);
                    setSelectedDateStr(todayStr);
                  }}
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '999px',
                    background: '#e0e7ff',
                    color: '#4338ca',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  오늘
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                type="button"
                onClick={handlePrevMonth}
                aria-label="이전 달"
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                }}
              >
                ◀
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                aria-label="다음 달"
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                }}
              >
                ▶
              </button>
            </div>
          </div>

          {/* Weekday Row */}
          <div className="calendar-grid-weekdays">
            {WEEKDAYS.map((wd, idx) => (
              <span
                key={wd}
                className={`weekday-header ${idx === 0 ? 'sun' : idx === 6 ? 'sat' : ''}`}
              >
                {wd}
              </span>
            ))}
          </div>

          {/* Calendar Grid Cells */}
          <div className="calendar-grid-cells">
            {calendarDays.map((day) => {
              const daySchedules = schedulesByDate.get(day.dateStr) || [];
              const isSelected = day.dateStr === selectedDateStr;
              const isToday = day.dateStr === todayStr;
              const hasCheckIn = daySchedules.some((s) => myLogsByScheduleId.has(s.id));

              return (
                <div
                  key={day.dateStr}
                  className={`calendar-cell ${day.isCurrentMonth ? '' : 'dimmed'} ${
                    isToday ? 'today' : ''
                  } ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedDateStr(day.dateStr)}
                  role="button"
                  tabIndex={0}
                  aria-label={`${day.dateStr} 일정 선택`}
                >
                  <span className="cell-day-num">{day.dayNumber}</span>

                  {/* Attendance check or rehearsal dots */}
                  {daySchedules.length > 0 && (
                    <div className="cell-dots-row">
                      {hasCheckIn ? (
                        <span
                          style={{
                            fontSize: '9px',
                            fontWeight: 800,
                            color: isSelected ? '#ffffff' : '#10b981',
                            lineHeight: 1,
                          }}
                          title="출석 완료"
                        >
                          ✓
                        </span>
                      ) : (
                        daySchedules.slice(0, 3).map((sch) => (
                          <span
                            key={sch.id}
                            className={`schedule-dot ${getCategoryDotClass(sch.category)}`}
                          />
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              fontSize: '0.75rem',
              color: '#64748b',
              marginTop: '12px',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1' }} /> 정기연습
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} /> 연주/행사
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <strong style={{ color: '#10b981' }}>✓</strong> 내 출석 완료
            </span>
          </div>
        </section>
      )}

      {/* Main Active / Selected Rehearsal Card */}
      {activeSchedule ? (
        <section className="active-schedule-card">
          <div className="schedule-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="schedule-category-badge">{activeSchedule.category}</span>
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
                  인증 시각:{' '}
                  {myLog.timestamp.includes('T')
                    ? myLog.timestamp.slice(11, 16)
                    : myLog.timestamp.slice(0, 5)}{' '}
                  ·{' '}
                  {myLog.authMethod === 'MANUAL_BY_ADMIN'
                    ? '관리자 수동 인정'
                    : myLog.isVerifiedLocation
                    ? '연습실 위치 확인됨'
                    : 'GPS 오차 범위'}
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
            ) : windowState?.status === 'WINDOW_CLOSED' ? (
              /* Concluded Schedule: Closed State */
              <div className="qr-locked-card window-closed" style={{ borderLeft: '4px solid #94A3B8' }}>
                <div className="qr-locked-info">
                  <span className="qr-lock-icon">🏁</span>
                  <div>
                    <div className="qr-locked-title">출석 마감 ({activeSchedule.date} 일정 종료)</div>
                    <div className="qr-locked-desc">
                      {myLog
                        ? `출석 완료 (${myLog.timestamp.includes('T') ? myLog.timestamp.slice(11, 16) : myLog.timestamp.slice(0, 5)}) · 정상 반영되었습니다.`
                        : '금일 연습의 공식 출석 체크가 마감되었습니다.'}
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
        <div className="no-schedule-box" style={{ background: '#ffffff', padding: '30px 20px', borderRadius: '16px', textAlign: 'center', border: '1px solid #e2e8f0', margin: '0 0 16px' }}>
          <p style={{ margin: '0 0 10px', color: '#64748b', fontSize: '0.95rem' }}>
            선택한 날짜({selectedDateStr})에는 연습 일정이 없습니다.
          </p>
          <button
            type="button"
            onClick={() => setSelectedDateStr(todayStr)}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              background: '#4f46e5',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem',
            }}
          >
            오늘 일정으로 이동
          </button>
        </div>
      )}

      {/* Upcoming Schedules List */}
      <section className="month-overview-card" style={{ marginTop: '16px' }}>
        <div className="section-title-row">
          <div>
            <h3 className="section-title">다가오는 연습 일정</h3>
            <p className="section-subtitle">오늘 이후 예정된 연습 모음</p>
          </div>
          {onViewCalendar && (
            <button type="button" className="btn-calendar-link" onClick={onViewCalendar}>
              <IconCalendar size={15} />
              <span>전체 캘린더</span>
            </button>
          )}
        </div>

        <div className="schedules-preview-list compact">
          {upcomingSchedules.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
              예정된 다음 연습 일정이 없습니다.
            </div>
          ) : (
            upcomingSchedules.slice(0, 5).map((s) => {
              const votes = sheetsService.getRSVPVotes(s.id);
              const count = votes.filter((v) => v.status === 'ATTEND').length;
              const rate = members.length > 0 ? Math.round((count / members.length) * 100) : 0;
              const isSelected = s.date === selectedDateStr;

              return (
                <div
                  key={s.id}
                  className="schedule-preview-item compact"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    borderRadius: '10px',
                    border: isSelected ? '1.5px solid #4f46e5' : '1px solid #f1f5f9',
                    background: isSelected ? '#f5f3ff' : '#ffffff',
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => {
                    setSelectedDateStr(s.date);
                    setHomeViewTab('CALENDAR');
                  }}
                >
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
            })
          )}
        </div>
      </section>
    </div>
  );
};
export default HomeView;
