import React from 'react';
import type { RSVPVote, Schedule } from '../../types/rollbook';
import { getWeekdayOfDate } from '../../utils/date';
import { upcomingStatusLabel } from '../../utils/homeCards';
import type { NavAction } from '../../utils/route';
import { isRsvpOpenForSchedule } from '../../utils/timeWindow';
import { IconChat } from '../Icons';

export interface HomeUpcomingSectionProps {
  schedules: Schedule[];
  currentNow: Date;
  todayStr: string;
  myVoteBySchedule: ReadonlyMap<string, RSVPVote>;
  commentCounts: ReadonlyMap<string, number>;
  onNavigate: (action: NavAction) => void;
}

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

function dayLabel(date: string, todayStr: string): string {
  const [, m, d] = date.split('-').map(Number);
  return date.slice(0, 7) === todayStr.slice(0, 7) ? String(d) : `${m}/${d}`;
}

export const HomeUpcomingSection: React.FC<HomeUpcomingSectionProps> = ({
  schedules,
  currentNow,
  todayStr,
  myVoteBySchedule,
  commentCounts,
  onNavigate,
}) => {
  return (
    <section className="home-upcoming-section" aria-label="다가오는 일정">
      <h2 className="home-upcoming-title">다가오는 일정</h2>

      {schedules.length === 0 ? (
        <p className="home-upcoming-empty">예정된 일정이 없습니다.</p>
      ) : (
        <div className="home-upcoming-list">
          {schedules.map((sch) => {
            const status = upcomingStatusLabel(
              myVoteBySchedule.get(sch.id),
              isRsvpOpenForSchedule(sch, currentNow)
            );
            const weekday = getWeekdayOfDate(sch.date);
            const commentCount = commentCounts.get(sch.id) ?? 0;
            return (
              <button
                key={sch.id}
                type="button"
                className="home-upcoming-row"
                onClick={() =>
                  onNavigate({
                    type: 'OPEN',
                    overlay: { kind: 'scheduleSheet', date: sch.date, scheduleId: sch.id },
                  })
                }
              >
                <span className="home-upcoming-date">
                  <span className={`home-upcoming-weekday${weekday === 0 ? ' is-sun' : weekday === 6 ? ' is-sat' : ''}`}>
                    {WEEKDAY_KO[weekday]}
                  </span>
                  <span className="home-upcoming-day">{dayLabel(sch.date, todayStr)}</span>
                </span>
                <span className="home-upcoming-main">
                  <span className="home-upcoming-name">{sch.title}</span>
                  <span className="home-upcoming-sub">
                    {sch.startTime} · {sch.locationName || '장소 미정'}
                  </span>
                </span>
                {commentCount > 0 && (
                  <span className="home-upcoming-comments">
                    <IconChat size={14} aria-hidden="true" />
                    {commentCount}
                  </span>
                )}
                {status && <span className={`home-upcoming-status is-${status.tone}`}>{status.text}</span>}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
};
