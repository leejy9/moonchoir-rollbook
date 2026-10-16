import React, { useMemo, useState } from 'react';
import { sheetsService } from '../services/sheets';
import type { BoundDeviceProfile, Schedule } from '../types/rollbook';
import { getCalendarGrid } from '../utils/calendar';
import {
  IconCalendar,
  IconClock,
  IconLocation,
  IconVote,
} from './Icons';
import { LiquidGauge } from './LiquidGauge';

interface CalendarViewProps {
  profile: BoundDeviceProfile;
  onOpenRSVP: (schedule: Schedule) => void;
  onBackToHome: () => void;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function getCategoryDotClass(category: string): string {
  if (category.includes('연주') || category.includes('공연') || category.includes('콘서트')) {
    return 'dot-concert'; // Red
  }
  if (
    category.includes('행사') ||
    category.includes('합숙') ||
    category.includes('이벤트') ||
    category.includes('MT') ||
    category.includes('기타')
  ) {
    return 'dot-event'; // Green / Lime
  }
  return 'dot-practice'; // Violet (정기연습, 추가연습 등)
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  profile,
  onOpenRSVP,
  onBackToHome,
}) => {
  // Use today's initial date as starting month (Oct 2026 in project context)
  const [currentYear, setCurrentYear] = useState(2026);
  const [currentMonthIndex, setCurrentMonthIndex] = useState(9); // 0-indexed: 9 = October
  const [selectedDateStr, setSelectedDateStr] = useState<string>('2026-10-15');

  const schedules = sheetsService.getSchedules();

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

  const calendarDays = useMemo(() => {
    return getCalendarGrid(currentYear, currentMonthIndex);
  }, [currentYear, currentMonthIndex]);

  // Selected date's schedules
  const selectedSchedules = schedulesByDate.get(selectedDateStr) || [];

  // All schedules in currently viewed month
  const monthPrefix = `${currentYear}-${String(currentMonthIndex + 1).padStart(2, '0')}`;
  const currentMonthSchedules = schedules.filter((s) => s.date.startsWith(monthPrefix));

  return (
    <div className="calendar-page-container">
      {/* Top Navigation Bar */}
      <div className="page-nav-bar">
        <button type="button" className="btn-nav-back" onClick={onBackToHome}>
          ← 홈으로
        </button>
        <span className="page-nav-title">합창단 캘린더</span>
        <div style={{ width: 44 }} />
      </div>

      {/* Month Switcher & Dot Legend */}
      <div className="calendar-header-bar" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' }}>
        <div className="calendar-month-controller">
          <button type="button" className="month-arrow-btn" onClick={handlePrevMonth} aria-label="이전 달">
            ‹
          </button>
          <h2 className="current-month-heading">
            {currentYear}년 {currentMonthIndex + 1}월
          </h2>
          <button type="button" className="month-arrow-btn" onClick={handleNextMonth} aria-label="다음 달">
            ›
          </button>
        </div>

        {/* Category Legend Bar */}
        <div className="calendar-legend-chips" style={{ display: 'flex', justifyContent: 'center', gap: '12px', fontSize: '11px', color: '#6b7684' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span className="schedule-dot dot-practice" style={{ display: 'inline-block', width: 6, height: 6 }} /> 연습
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span className="schedule-dot dot-concert" style={{ display: 'inline-block', width: 6, height: 6 }} /> 연주
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span className="schedule-dot dot-event" style={{ display: 'inline-block', width: 6, height: 6 }} /> 행사/기타
          </span>
        </div>
      </div>

      {/* Weekday Labels Row */}
      <div className="calendar-grid-weekdays">
        {WEEKDAYS.map((wd, i) => (
          <div
            key={wd}
            className={`weekday-header ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}`}
          >
            {wd}
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div className="calendar-grid-cells">
        {calendarDays.map((day) => {
          const daySchedules = schedulesByDate.get(day.dateStr) || [];
          const hasSchedules = daySchedules.length > 0;
          const isSelected = day.dateStr === selectedDateStr;

          return (
            <button
              key={day.dateStr}
              type="button"
              className={`calendar-cell ${!day.isCurrentMonth ? 'dimmed' : ''} ${
                day.isToday ? 'today' : ''
              } ${isSelected ? 'selected' : ''}`}
              onClick={() => setSelectedDateStr(day.dateStr)}
            >
              <span className="cell-day-num">{day.dayNumber}</span>
              {hasSchedules && (
                <div className="cell-dots-row">
                  {daySchedules.map((s) => (
                    <span
                      key={s.id}
                      className={`schedule-dot ${getCategoryDotClass(s.category)}`}
                      title={`${s.category}: ${s.title}`}
                    />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected Day Event Details */}
      <div className="selected-date-section">
        <div className="selected-date-header">
          <IconCalendar size={18} className="selected-date-icon" />
          <h3 className="selected-date-title">{selectedDateStr} 일정</h3>
        </div>

        {selectedSchedules.length > 0 ? (
          <div className="selected-schedules-list">
            {selectedSchedules.map((sch) => {
              const members = sheetsService.getMembers();
              const rsvps = sheetsService.getRSVPVotes(sch.id);
              const myVote = rsvps.find((v) => v.memberId === profile.memberId);
              const attendeesCount = rsvps.filter((v) => v.status === 'ATTEND').length;
              const absenteesCount = rsvps.filter((v) => v.status === 'ABSENT').length;
              const rate = members.length > 0 ? Math.round((attendeesCount / members.length) * 100) : 0;

              return (
                <div key={sch.id} className="selected-schedule-item-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <div className="item-card-top">
                        <span className="schedule-category-badge">{sch.category}</span>
                        <span className="item-time-badge">
                          <IconClock size={13} />
                          <span>{sch.startTime} ~ {sch.endTime}</span>
                        </span>
                      </div>

                      <h4 className="item-card-title">{sch.title}</h4>
                      <div className="item-card-loc">
                        <IconLocation size={14} />
                        <span>{sch.locationName}</span>
                      </div>
                      {sch.description && (
                        <p className="item-card-desc">{sch.description}</p>
                      )}
                    </div>

                    {/* Cute Liquid Wave Gauge (MYTURN Style Energy Fill) */}
                    <LiquidGauge percentage={rate} size={48} subText="참석률" />
                  </div>

                  <div className="item-rsvp-row" style={{ marginTop: '12px' }}>
                    <span className="rsvp-stat-pill">
                      참석 {attendeesCount}명 · 불참 {absenteesCount}명
                    </span>

                    <button
                      type="button"
                      className="btn-rsvp-action"
                      onClick={() => onOpenRSVP(sch)}
                    >
                      <IconVote size={14} />
                      <span>
                        {myVote
                          ? `내 투표: ${myVote.status === 'ATTEND' ? '참석' : '불참'} (수정)`
                          : '사전 투표하기'}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-day-box">
            <p>이 날짜에는 등록된 일정이 없습니다.</p>
          </div>
        )}
      </div>

      {/* Chronological List of All Events This Month (Subordinate, compact) */}
      <div className="month-all-events-section compact" style={{ marginTop: '16px', opacity: 0.9 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#6b7684' }}>
            {currentMonthIndex + 1}월 전체 일정 요약 ({currentMonthSchedules.length}건)
          </h4>
        </div>

        <div className="month-events-feed compact" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {currentMonthSchedules.map((sch) => {
            const members = sheetsService.getMembers();
            const rsvps = sheetsService.getRSVPVotes(sch.id);
            const myVote = rsvps.find((v) => v.memberId === profile.memberId);
            const attendeesCount = rsvps.filter((v) => v.status === 'ATTEND').length;
            const rate = members.length > 0 ? Math.round((attendeesCount / members.length) * 100) : 0;
            const isSelected = sch.date === selectedDateStr;

            return (
              <div
                key={sch.id}
                className={`month-feed-item compact ${isSelected ? 'active-highlight' : ''}`}
                onClick={() => setSelectedDateStr(sch.date)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  background: isSelected ? 'rgba(74, 68, 138, 0.08)' : '#fff',
                  border: isSelected ? '1px solid var(--brand-accent)' : '1px solid #f2f4f6',
                  cursor: 'pointer',
                }}
              >
                <div className="feed-date-column" style={{ minWidth: '32px', textAlign: 'center' }}>
                  <span className="feed-date-day" style={{ fontSize: '13px', fontWeight: 700, display: 'block' }}>
                    {sch.date.slice(8, 10)}
                  </span>
                  <span className="feed-date-month" style={{ fontSize: '9px', color: '#8b95a1' }}>
                    {sch.date.slice(5, 7)}월
                  </span>
                </div>

                <div className="feed-content-column" style={{ flex: 1, minWidth: 0 }}>
                  <div className="feed-title-row" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="feed-title" style={{ fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {sch.title}
                    </span>
                    <span className="schedule-category-badge" style={{ fontSize: '9px', padding: '1px 5px' }}>
                      {sch.category}
                    </span>
                  </div>
                  <div className="feed-meta-row" style={{ fontSize: '11px', color: '#8b95a1', marginTop: '1px' }}>
                    <span>{sch.startTime}~{sch.endTime}</span>
                    <span className="meta-divider">·</span>
                    <span>{sch.locationName}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <LiquidGauge percentage={rate} size={28} />

                  <div className="feed-vote-status">
                    {myVote ? (
                      <span className={`my-vote-badge ${myVote.status.toLowerCase()}`} style={{ fontSize: '10px', padding: '2px 6px' }}>
                        {myVote.status === 'ATTEND' ? '참석' : '불참'}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="btn-feed-vote"
                        style={{ fontSize: '11px', padding: '3px 8px' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenRSVP(sch);
                        }}
                      >
                        투표
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
