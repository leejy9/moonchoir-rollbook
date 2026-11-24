import React from 'react';
import type { Schedule } from '../../types/rollbook';
import type { TodayCtaState } from '../../utils/todayCta';
import { sheetsService } from '../../services/sheets';
import {
  cardCornerLabel,
  commentRowAriaLabel,
  formatCardDateLine,
  lastCommentText,
} from '../../utils/homeCardText';
import { buildKakaoMapLink, findScheduleAddress } from '../../utils/kakaoMaps';
import { IconChat, IconChevronRight, IconClock, IconLocation, IconQrScan, IconVote } from '../Icons';

export interface HomeCardComments {
  count: number;
  last?: { part: string; memberName: string; text: string };
  hasNew: boolean;
}

export interface HomeActiveScheduleCardProps {
  schedule: Schedule;
  isToday: boolean;
  dDay?: number;
  isRequired: boolean;
  cta: TodayCtaState;
  checkedInCount?: number;
  checkedInTimeStr?: string;
  comments: HomeCardComments;
  onOpenQRScanner: (scheduleId: string) => void;
  onOpenRSVP: (schedule: Schedule) => void;
  onOpenDetail?: (schedule: Schedule) => void;
}

export const HomeActiveScheduleCard: React.FC<HomeActiveScheduleCardProps> = ({
  schedule,
  isToday,
  dDay,
  isRequired,
  cta,
  checkedInCount,
  checkedInTimeStr,
  comments,
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
  const corner = cardCornerLabel(isToday, dDay, cta.kind);

  return (
    <section className="active-schedule-card home-card">
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
        </div>
        {corner && <span className={`home-card-corner is-${corner.tone}`}>{corner.text}</span>}
      </div>

      <h2 className="schedule-card-title">{schedule.title}</h2>

      <div className="schedule-info-grid">
        <div className="info-item">
          <span className="info-icon" aria-hidden="true">
            <IconClock size={16} />
          </span>
          <span className="info-text">{formatCardDateLine(schedule)}</span>
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

      {checkedInCount !== undefined && (
        <div className="checked-in-summary home-card-summary">
          현재 {checkedInCount}명 출석{checkedInTimeStr ? ` (${checkedInTimeStr} 기준)` : ''}
        </div>
      )}

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

      <button
        type="button"
        className="home-card-comment-row"
        aria-label={commentRowAriaLabel(comments.count, comments.hasNew)}
        onClick={() => onOpenDetail?.(schedule)}
      >
        <IconChat size={18} aria-hidden="true" />
        {comments.count > 0 ? (
          <>
            <span className="home-card-comment-count">{comments.count}</span>
            {comments.hasNew && <span className="home-card-comment-dot" />}
            {comments.last && (
              <span className="home-card-comment-text">{lastCommentText(comments.last)}</span>
            )}
          </>
        ) : (
          <span className="home-card-comment-text is-empty">첫 댓글을 남겨 보세요</span>
        )}
        <IconChevronRight size={20} aria-hidden="true" />
      </button>
    </section>
  );
};
