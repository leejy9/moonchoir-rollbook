import React from 'react';
import type { Schedule } from '../../types/rollbook';
import type { NavAction } from '../../utils/route';
import { isRsvpOpenForSchedule } from '../../utils/timeWindow';

export interface HomeUpcomingSectionProps {
  schedules: Schedule[];
  currentNow: Date;
  onNavigate: (action: NavAction) => void;
  onOpenRSVP: (schedule: Schedule) => void;
}

export const HomeUpcomingSection: React.FC<HomeUpcomingSectionProps> = ({
  schedules,
  currentNow,
  onNavigate,
  onOpenRSVP,
}) => {
  return (
    <section className="home-upcoming-section" aria-label="다가오는 일정">
      <div className="home-upcoming-header">
        <h3 className="home-upcoming-title">다가오는 일정</h3>
        <span className="home-upcoming-badge">최대 5개 표시</span>
      </div>

      {schedules.length === 0 ? (
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0', margin: 0 }}>
          예정된 일정이 없습니다.
        </p>
      ) : (
        <div className="home-upcoming-list">
          {schedules.map((sch) => {
            const rsvpOpen = isRsvpOpenForSchedule(sch, currentNow);
            return (
              <div
                key={sch.id}
                className="home-upcoming-item"
                onClick={() =>
                  onNavigate({
                    type: 'OPEN',
                    overlay: { kind: 'scheduleSheet', date: sch.date, scheduleId: sch.id },
                  })
                }
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="schedule-category-badge" style={{ fontSize: '10px', padding: '1px 6px' }}>
                      {sch.category}
                    </span>
                    <strong style={{ fontSize: '14px', color: 'var(--text-main)' }}>
                      {sch.title}
                    </strong>
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text-sub)' }}>
                    {sch.date} {sch.startTime} ~ {sch.endTime} · {sch.locationName || '장소 미정'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {rsvpOpen ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenRSVP(sch);
                      }}
                      style={{
                        minWidth: '44px',
                        minHeight: '44px',
                        padding: '6px 12px',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--brand-primary)',
                        color: 'var(--text-white)',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: 'none',
                      }}
                    >
                      투표
                    </button>
                  ) : (
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        color: 'var(--text-muted)',
                        padding: '6px 8px',
                      }}
                    >
                      투표 마감
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
