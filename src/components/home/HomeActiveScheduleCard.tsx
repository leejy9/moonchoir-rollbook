import React from 'react';
import type { Schedule } from '../../types/rollbook';
import type { TodayCtaState } from '../../utils/todayCta';
import { sheetsService } from '../../services/sheets';
import { buildKakaoMapLink, findScheduleAddress } from '../../utils/kakaoMaps';
import { IconClock, IconLocation, IconQrScan, IconVote } from '../Icons';

export interface HomeActiveScheduleCardProps {
  schedule: Schedule;
  schedulesCount: number;
  scheduleIndex: number;
  todayStr: string;
  isToday: boolean;
  dDay?: number;
  isRequired: boolean;
  cta: TodayCtaState;
  checkedInCount?: number;
  checkedInTimeStr?: string;
  onPrevSchedule?: () => void;
  onNextSchedule?: () => void;
  onOpenQRScanner: (scheduleId: string) => void;
  onOpenRSVP: (schedule: Schedule) => void;
  onOpenDetail?: (schedule: Schedule) => void;
}

export const HomeActiveScheduleCard: React.FC<HomeActiveScheduleCardProps> = ({
  schedule,
  schedulesCount,
  scheduleIndex,
  isToday,
  dDay,
  isRequired,
  cta,
  checkedInCount,
  checkedInTimeStr,
  onPrevSchedule,
  onNextSchedule,
  onOpenQRScanner,
  onOpenRSVP,
  onOpenDetail,
}) => {
  const kakaoMapLink = buildKakaoMapLink({
    address: findScheduleAddress(schedule, sheetsService.getLocationPresets()),
    name: schedule.locationName,
    lat: schedule.targetLat,
    lon: schedule.targetLon,
  });

  return (
    <section className="active-schedule-card">
      {/* Multi-Schedule Carousel Switcher (Rendered only when 2+ schedules exist) */}
      {schedulesCount > 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '8px 12px',
          }}
        >
          <button
            type="button"
            onClick={onPrevSchedule}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              minWidth: '44px',
              minHeight: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 700,
              color: 'var(--text-sub)',
            }}
            title="이전 일정 보기"
            aria-label="이전 일정 보기"
          >
            ◀
          </button>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>
              {isToday ? '오늘' : schedule.date} 일정 {scheduleIndex + 1}/{schedulesCount}
              <span style={{ color: 'var(--brand-lavender-text)', marginLeft: '6px' }}>({schedule.startTime})</span>
            </span>
            {/* Dot Indicators (Decorative aria-hidden) */}
            <div style={{ display: 'flex', gap: '5px' }} aria-hidden="true">
              {Array.from({ length: schedulesCount }).map((_, i) => (
                <span
                  key={i}
                  style={{
                    width: i === scheduleIndex ? '16px' : '6px',
                    height: '6px',
                    borderRadius: '3px',
                    background: i === scheduleIndex ? 'var(--brand-primary)' : 'var(--border-subtle)',
                    transition: 'all 0.2s ease',
                  }}
                />
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={onNextSchedule}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              minWidth: '44px',
              minHeight: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 700,
              color: 'var(--text-sub)',
            }}
            title="다음 일정 보기"
            aria-label="다음 일정 보기"
          >
            ▶
          </button>
        </div>
      )}

      {/* Card Header: Category Badge + Requirement Badge + Date Badge */}
      <div className="schedule-card-header">
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="schedule-category-badge">{schedule.category}</span>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: isRequired ? 'var(--brand-lavender-text)' : 'var(--status-success)',
              background: isRequired ? 'var(--brand-primary-light)' : 'var(--status-success-light)',
              border: `1px solid ${isRequired ? 'var(--brand-primary)' : 'var(--status-success)'}`,
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
            }}
          >
            {isRequired ? '필참' : '자율 참여'}
          </span>
          <span className={`schedule-date-badge ${isToday ? 'is-today' : ''}`}>
            {dDay !== undefined && dDay > 0
              ? `D-${dDay}`
              : isToday
              ? '오늘 연습'
              : schedule.date}
          </span>
        </div>
      </div>

      {/* Schedule Title */}
      <h2 className="schedule-card-title">{schedule.title}</h2>

      {/* Info: Time & Location with Kakao Maps Link */}
      <div className="schedule-info-grid">
        <div className="info-item">
          <span className="info-icon" aria-hidden="true">
            <IconClock size={16} />
          </span>
          <span className="info-text">
            {schedule.startTime} ~ {schedule.endTime}
          </span>
        </div>
        <div className="info-item">
          <span className="info-icon" aria-hidden="true">
            <IconLocation size={16} />
          </span>
          <span className="info-text">
            {kakaoMapLink ? (
              <a
                href={kakaoMapLink}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: 'var(--brand-lavender-text)',
                  textDecoration: 'underline',
                  wordBreak: 'break-all',
                }}
              >
                {schedule.locationName}
              </a>
            ) : (
              schedule.locationName || '장소 미정'
            )}
          </span>
        </div>
      </div>

      {/* Clamped Description (max 2 lines) */}
      {schedule.description && (
        <p
          className="schedule-desc-box schedule-desc-clamped"
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            margin: '0',
          }}
        >
          {schedule.description}
        </p>
      )}

      {/* Attendance Count Line (rendered when check-in window opens) */}
      {checkedInCount !== undefined && (
        <div
          className="checked-in-summary"
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text-sub)',
            padding: '2px 0',
          }}
        >
          현재 {checkedInCount}명 출석{checkedInTimeStr ? ` (${checkedInTimeStr} 기준)` : ''}
        </div>
      )}

      {/* CTA Section */}
      <div className="action-buttons-stack">
        {cta.isButton ? (
          cta.kind === 'CHECKIN_OPEN' ? (
            <button
              type="button"
              className="btn-qr-scan-primary"
              style={{ minHeight: '44px' }}
              onClick={() => onOpenQRScanner(schedule.id)}
            >
              <IconQrScan size={20} className="btn-icon" />
              <div className="btn-text-block">
                <span className="btn-main-label">{cta.label}</span>
              </div>
            </button>
          ) : cta.kind === 'RSVP_NEW' || cta.kind === 'RSVP_EDIT' ? (
            <button
              type="button"
              className="btn-rsvp-primary"
              style={{ minHeight: '44px' }}
              onClick={() => onOpenRSVP(schedule)}
            >
              <IconVote size={20} className="btn-icon" />
              <div className="btn-text-block">
                <span className="btn-main-label">{cta.label}</span>
              </div>
            </button>
          ) : (
            /* OFFLINE */
            <button
              type="button"
              className="btn-qr-scan-primary"
              style={{
                minHeight: '44px',
                opacity: 0.6,
                cursor: 'not-allowed',
                background: 'var(--bg-subtle)',
                color: 'var(--text-muted)',
              }}
              disabled
            >
              <span className="btn-main-label">{cta.label}</span>
            </button>
          )
        ) : (
          /* Non-button Status Text: ATTENDED, LATE, MANUAL_OK, MANUAL_ABSENT, EXCUSED, CLOSED_ABSENT, CLOSED_EXEMPT, CANCELLED */
          <div
            className={`my-status-banner ${
              cta.kind === 'ATTENDED' || cta.kind === 'LATE' || cta.kind === 'MANUAL_OK'
                ? 'checked-in'
                : 'absent'
            }`}
            style={{ minHeight: '44px' }}
          >
            <span
              className={`status-indicator-dot ${
                cta.kind === 'ATTENDED' || cta.kind === 'MANUAL_OK'
                  ? 'checked'
                  : cta.kind === 'LATE'
                  ? 'late'
                  : 'absent'
              }`}
            />
            <div>
              <strong>{cta.label}</strong>
            </div>
          </div>
        )}
      </div>

      {/* Detail View Button */}
      <button
        type="button"
        className="btn-detail-view"
        style={{
          minHeight: '44px',
          width: '100%',
          padding: '10px 14px',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)',
          background: 'var(--bg-subtle)',
          color: 'var(--text-main)',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
          textAlign: 'center',
          boxSizing: 'border-box',
        }}
        onClick={() => onOpenDetail?.(schedule)}
      >
        상세 보기
      </button>
    </section>
  );
};
