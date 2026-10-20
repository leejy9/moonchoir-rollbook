import React from 'react';
import { sheetsService } from '../../services/sheets';
import type { Member, Schedule } from '../../types/rollbook';
import { isMemberRequiredForSchedule } from '../../utils/attendanceStats';
import { IconCalendar } from '../Icons';
import { LiquidGauge } from '../LiquidGauge';

interface HomeUpcomingListSectionProps {
  upcomingSchedules: Schedule[];
  members: Member[];
  canonicalMemberIdMap: Map<string, string>;
  selectedDateStr: string;
  onViewCalendar?: () => void;
  onSelectSchedule: (schedule: Schedule) => void;
}

export const HomeUpcomingListSection: React.FC<HomeUpcomingListSectionProps> = ({
  upcomingSchedules,
  members,
  canonicalMemberIdMap,
  selectedDateStr,
  onViewCalendar,
  onSelectSchedule,
}) => {
  return (
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
            const targetForSch = members.filter((m) => isMemberRequiredForSchedule(m, s.date, s));
            const targetIdSet = new Set(targetForSch.map((tm) => tm.id));
            const votes = sheetsService.getRSVPVotes(s.id);
            const attendedTargetIds = new Set(
              votes
                .filter((v) => v.status === 'ATTEND')
                .map((v) => canonicalMemberIdMap.get(v.memberId) || v.memberId)
                .filter((cid) => targetIdSet.has(cid))
            );
            const count = attendedTargetIds.size;
            const totalCount = targetForSch.length;
            const rate =
              totalCount > 0
                ? Math.round((count / totalCount) * 100)
                : votes.some((v) => v.status === 'ATTEND')
                ? 100
                : 0;
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
                onClick={() => onSelectSchedule(s)}
              >
                <div className="preview-date-box" style={{ width: '38px', minWidth: '38px', height: '38px' }}>
                  <span className="preview-month" style={{ fontSize: '9px' }}>
                    {s.date.slice(5, 7)}월
                  </span>
                  <span className="preview-day" style={{ fontSize: '14px' }}>
                    {s.date.slice(8, 10)}
                  </span>
                </div>
                <div className="preview-content" style={{ flex: 1, minWidth: 0 }}>
                  <div className="preview-title-row" style={{ gap: '6px' }}>
                    <span className="preview-title" style={{ fontSize: '13px', fontWeight: 600 }}>
                      {s.title}
                    </span>
                    <span className="schedule-category-badge" style={{ fontSize: '10px', padding: '1px 6px' }}>
                      {s.category}
                    </span>
                  </div>
                  <div className="preview-meta" style={{ fontSize: '11px', color: '#8b95a1', marginTop: '2px' }}>
                    <span>
                      {s.startTime}~{s.endTime}
                    </span>
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
  );
};
