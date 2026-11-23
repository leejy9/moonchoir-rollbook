import React, { useMemo, useState } from 'react';
import type { MemberScheduleRecord } from '../../utils/memberRecords';
import {
  type AttendancePeriod,
  classifyAttendanceStatus,
  filterRecordsByPeriod,
} from '../../utils/memberProgress';
import { formatRecordDate, getKSTDateString } from '../../utils/date';

export interface SelectedScheduleFilter {
  itemLabel: string;
  scheduleIds: string[];
}

export interface AttendanceRecordSheetProps {
  records: MemberScheduleRecord[];
  onClose: () => void;
  initialFilter?: 'ATTENDED' | 'LATE' | 'EXCUSED' | 'ABSENT' | null;
  selectedScheduleFilter?: SelectedScheduleFilter | null;
}

export const AttendanceRecordSheet: React.FC<AttendanceRecordSheetProps> = ({
  records,
  onClose,
  initialFilter = null,
  selectedScheduleFilter = null,
}) => {
  const [activeCategory, setActiveCategory] = useState<
    'ATTENDED' | 'LATE' | 'EXCUSED' | 'ABSENT' | null
  >(initialFilter);
  const [scheduleFilter, setScheduleFilter] = useState<SelectedScheduleFilter | null>(
    selectedScheduleFilter
  );
  const [period, setPeriod] = useState<AttendancePeriod>('3M');

  const todayStr = useMemo(() => getKSTDateString(), []);

  // Filter records by selected schedule filter or period
  const periodRecords = useMemo(() => {
    if (scheduleFilter) {
      const allowed = new Set(scheduleFilter.scheduleIds);
      return records.filter((r) => allowed.has(r.schedule.id));
    }
    return filterRecordsByPeriod(records, period, todayStr);
  }, [records, scheduleFilter, period, todayStr]);

  // Compute counts for the 4 status toggles based on current period
  const statusCounts = useMemo(() => {
    let attended = 0;
    let late = 0;
    let excused = 0;
    let absent = 0;

    for (const r of periodRecords) {
      const cat = classifyAttendanceStatus(r.finalStatus);
      if (cat === 'ATTENDED') attended += 1;
      else if (cat === 'LATE') late += 1;
      else if (cat === 'EXCUSED') excused += 1;
      else if (cat === 'ABSENT') absent += 1;
    }

    return { attended, late, excused, absent };
  }, [periodRecords]);

  // Filter records by active status toggle if selected
  const displayedRecords = useMemo(() => {
    if (!activeCategory) return periodRecords;
    return periodRecords.filter((r) => classifyAttendanceStatus(r.finalStatus) === activeCategory);
  }, [periodRecords, activeCategory]);

  const handleToggleCategory = (category: 'ATTENDED' | 'LATE' | 'EXCUSED' | 'ABSENT') => {
    setActiveCategory((prev) => (prev === category ? null : category));
  };

  return (
    <div
      className="profile-sheet-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="attendance-record-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="profile-sheet-content">
        <div className="profile-sheet-header">
          <h2 id="attendance-record-title" className="profile-sheet-title">
            출석 기록
          </h2>
          <button
            type="button"
            className="profile-sheet-close-btn"
            onClick={onClose}
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        {/* Selected schedule filter chip (from passion temperature sheet) */}
        {scheduleFilter && (
          <div className="attendance-selected-filter-chip-row">
            <span className="attendance-selected-filter-chip">
              {scheduleFilter.itemLabel}
              <button
                type="button"
                className="attendance-selected-filter-clear-btn"
                onClick={() => setScheduleFilter(null)}
                aria-label={`${scheduleFilter.itemLabel} 필터 해제`}
              >
                ×
              </button>
            </span>
          </div>
        )}

        {/* 4 Status Toggle Cards */}
        <div className="attendance-status-toggles">
          <button
            type="button"
            className={`attendance-status-btn ${activeCategory === 'ATTENDED' ? 'active' : ''}`}
            onClick={() => handleToggleCategory('ATTENDED')}
            aria-pressed={activeCategory === 'ATTENDED'}
          >
            <span className="attendance-status-btn-count">{statusCounts.attended}</span>
            <span className="attendance-status-btn-label">출석</span>
          </button>

          <button
            type="button"
            className={`attendance-status-btn ${activeCategory === 'LATE' ? 'active' : ''}`}
            onClick={() => handleToggleCategory('LATE')}
            aria-pressed={activeCategory === 'LATE'}
          >
            <span className="attendance-status-btn-count">{statusCounts.late}</span>
            <span className="attendance-status-btn-label">지각</span>
          </button>

          <button
            type="button"
            className={`attendance-status-btn ${activeCategory === 'EXCUSED' ? 'active' : ''}`}
            onClick={() => handleToggleCategory('EXCUSED')}
            aria-pressed={activeCategory === 'EXCUSED'}
          >
            <span className="attendance-status-btn-count">{statusCounts.excused}</span>
            <span className="attendance-status-btn-label">사유 결석</span>
          </button>

          <button
            type="button"
            className={`attendance-status-btn ${activeCategory === 'ABSENT' ? 'active' : ''}`}
            onClick={() => handleToggleCategory('ABSENT')}
            aria-pressed={activeCategory === 'ABSENT'}
          >
            <span className="attendance-status-btn-count">{statusCounts.absent}</span>
            <span className="attendance-status-btn-label">결석</span>
          </button>
        </div>

        {/* Period Chips */}
        <div className="attendance-period-chips">
          <button
            type="button"
            className={`attendance-period-chip ${!scheduleFilter && period === '3M' ? 'active' : ''}`}
            onClick={() => !scheduleFilter && setPeriod('3M')}
            disabled={Boolean(scheduleFilter)}
          >
            최근 3개월
          </button>
          <button
            type="button"
            className={`attendance-period-chip ${!scheduleFilter && period === 'YEAR' ? 'active' : ''}`}
            onClick={() => !scheduleFilter && setPeriod('YEAR')}
            disabled={Boolean(scheduleFilter)}
          >
            올해
          </button>
          <button
            type="button"
            className={`attendance-period-chip ${scheduleFilter || period === 'ALL' ? 'active' : ''}`}
            onClick={() => !scheduleFilter && setPeriod('ALL')}
            disabled={Boolean(scheduleFilter)}
          >
            전체
          </button>
        </div>

        {/* Attendance Records List */}
        <div className="attendance-records-list">
          {displayedRecords.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
              이 기간에는 없어요
            </div>
          ) : (
            displayedRecords.map((r) => {
              const statusClass =
                r.finalStatus === '출석' || r.finalStatus === '수동인정'
                  ? 'status-attended'
                  : r.finalStatus === '지각'
                  ? 'status-late'
                  : r.finalStatus === '사유결석'
                  ? 'status-excused'
                  : 'status-absent';

              const subText =
                r.finalStatus === '지각'
                  ? `시작 ${r.schedule?.startTime || ''}`
                  : r.voteStatus === 'ATTEND'
                  ? '투표 참석'
                  : r.voteStatus === 'ABSENT'
                  ? `투표 불참${r.voteReason ? ` · ${r.voteReason}` : ''}`
                  : '미투표';

              return (
                <div key={r.schedule.id} className="attendance-record-item">
                  <div className="attendance-record-left">
                    <div className="attendance-record-header-line">
                      <span className="attendance-record-date">{formatRecordDate(r.date)}</span>
                      <span className="attendance-record-title">{r.title}</span>
                    </div>
                    <span className="attendance-record-sub">{subText}</span>
                  </div>

                  <div className="attendance-record-right">
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        padding: '4px 8px',
                        borderRadius: '6px',
                        background:
                          statusClass === 'status-attended'
                            ? 'var(--brand-lavender-tint)'
                            : statusClass === 'status-late'
                            ? 'var(--brand-apricot-tint)'
                            : 'var(--border-subtle)',
                        color:
                          statusClass === 'status-attended'
                            ? 'var(--brand-lavender-text)'
                            : statusClass === 'status-late'
                            ? 'var(--brand-apricot-text)'
                            : 'var(--text-sub)',
                      }}
                    >
                      {r.finalStatus}
                    </span>
                    {r.checkInTime ? (
                      <span className="attendance-record-checkin">{r.checkInTime}</span>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
