import React from 'react';
import type { CalendarDay } from '../../utils/calendar';
import type { Schedule } from '../../types/rollbook';
import { getKSTDateString } from '../../utils/date';

export interface AdminCalendarViewProps {
  adminCalYear: number;
  adminCalMonth: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  calendarGrid: CalendarDay[];
  schedulesByDate: Map<string, Schedule[]>;
  activeSchedulesByDate: Map<string, Schedule[]>;
  selectedDate: string;
  onSelectDate: (dateStr: string) => void;
  showCancelledSchedules: boolean;
  onToggleShowCancelled: () => void;
  schedulesOnSelectedDate: Schedule[];
  editingScheduleId?: string | null;
  onSelectScheduleForEdit: (schedule: Schedule) => void;
  onQuickNewSchedule: () => void;
  onRestoreSchedule?: (id: string, title: string) => void;
  onDeleteScheduleSingle?: (id: string, title: string, permanent: boolean) => void;
  onToggleArchiveSchedule?: (id: string, archive: boolean) => void;
  onCloneSchedule?: (schedule: Schedule) => void;
  onDeleteSchedule?: (id: string, title: string) => void;
}

export const AdminCalendarView: React.FC<AdminCalendarViewProps> = ({
  adminCalYear,
  adminCalMonth,
  onPrevMonth,
  onNextMonth,
  calendarGrid,
  schedulesByDate,
  activeSchedulesByDate,
  selectedDate,
  onSelectDate,
  showCancelledSchedules,
  onToggleShowCancelled,
  schedulesOnSelectedDate,
  editingScheduleId,
  onSelectScheduleForEdit,
  onQuickNewSchedule,
  onRestoreSchedule,
  onDeleteScheduleSingle,
  onToggleArchiveSchedule,
  onCloneSchedule,
  onDeleteSchedule,
}) => {
  const todayStr = getKSTDateString();

  return (
    <div className="admin-calendar-view-root">
      {/* Calendar Header with Month Switcher */}
      <div className="admin-cal-header-row">
        <h2 className="section-title" style={{ margin: 0 }}>
          캘린더
        </h2>
        <div className="month-switcher-compact">
          <button
            type="button"
            className="month-arrow-btn"
            onClick={onPrevMonth}
            aria-label="이전 달"
          >
            ◀
          </button>
          <span className="current-month-label">
            {adminCalYear}년 {adminCalMonth + 1}월
          </span>
          <button
            type="button"
            className="month-arrow-btn"
            onClick={onNextMonth}
            aria-label="다음 달"
          >
            ▶
          </button>
        </div>
      </div>

      {/* 7-Col Calendar Grid */}
      <div className="admin-cal-wrap" style={{ marginTop: '14px' }}>
        <div className="calendar-grid-weekdays">
          <span className="weekday-header sun">일</span>
          <span className="weekday-header">월</span>
          <span className="weekday-header">화</span>
          <span className="weekday-header">수</span>
          <span className="weekday-header">목</span>
          <span className="weekday-header">금</span>
          <span className="weekday-header sat">토</span>
        </div>

        <div className="calendar-grid-cells">
          {calendarGrid.map((day) => {
            const daySchedules = (showCancelledSchedules ? schedulesByDate : activeSchedulesByDate).get(day.dateStr) || [];
            const isSelected = day.dateStr === selectedDate;

            return (
              <div
                key={day.dateStr}
                data-testid={`calendar-cell-${day.dateStr}`}
                className={`calendar-cell ${!day.isCurrentMonth ? 'dimmed' : ''} ${day.isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelectDate(day.dateStr)}
                title={daySchedules.length > 0 ? `${day.dateStr} (${daySchedules.length}건)` : day.dateStr}
              >
                <span className="cell-day-num">{day.dayNumber}</span>
                {daySchedules.length > 0 && (
                  <div className="cell-dots-row">
                    {daySchedules.slice(0, 3).map((s) => (
                      <span
                        key={s.id}
                        className={`schedule-dot cat-${s.category}`}
                        style={s.isCancelled ? { opacity: 0.35, textDecoration: 'line-through' } : {}}
                        title={s.isCancelled ? `[취소됨] ${s.title}` : s.title}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Date Schedule List */}
      <div className="selected-date-schedules-box" style={{ marginTop: '18px' }}>
        <div
          className="box-header-row"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#191f28' }}>
              {selectedDate} ({schedulesOnSelectedDate.length}건)
            </h4>
            <button
              type="button"
              onClick={onToggleShowCancelled}
              style={{
                background: showCancelledSchedules ? '#FEF2F2' : '#F8FAFC',
                color: showCancelledSchedules ? '#DC2626' : '#64748B',
                border: `1px solid ${showCancelledSchedules ? '#FECACA' : '#CBD5E1'}`,
                borderRadius: '6px',
                padding: '3px 8px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {showCancelledSchedules ? '취소 일정 숨김' : '취소 일정 보기'}
            </button>
          </div>
          <button
            type="button"
            className="btn-quick-new-sch"
            onClick={onQuickNewSchedule}
            style={{ whiteSpace: 'nowrap' }}
          >
            + 일정 추가
          </button>
        </div>

        {schedulesOnSelectedDate.length > 0 ? (
          <div className="admin-selected-sch-list" style={{ marginTop: '10px' }}>
            {schedulesOnSelectedDate.map((sch) => {
              const isSelectedForEdit = editingScheduleId === sch.id;
              return (
                <div
                  key={sch.id}
                  data-testid={`sch-item-${sch.id}`}
                  className="admin-sch-item-card"
                  onClick={() => onSelectScheduleForEdit(sch)}
                  style={{
                    cursor: 'pointer',
                    border: isSelectedForEdit
                      ? '1.5px solid #6366F1'
                      : sch.isCancelled
                      ? '1px dashed #FDA4AF'
                      : '1px solid #E2E8F0',
                    background: isSelectedForEdit
                      ? '#EEF2FF'
                      : sch.isCancelled
                      ? '#FFF1F2'
                      : '#FFFFFF',
                    boxShadow: isSelectedForEdit ? '0 0 0 2px rgba(99, 102, 241, 0.2)' : 'none',
                    opacity: sch.isCancelled ? 0.75 : 1,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div className="sch-item-info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      {sch.isCancelled && (
                        <span
                          style={{
                            fontSize: '11px',
                            color: '#BE123C',
                            background: '#FFE4E6',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            fontWeight: 700,
                          }}
                        >
                          취소됨
                        </span>
                      )}
                      <span className="schedule-category-badge">{sch.category}</span>
                      <strong
                        style={{
                          fontSize: '14px',
                          color: sch.isCancelled ? '#9F1239' : '#191f28',
                          textDecoration: sch.isCancelled ? 'line-through' : 'none',
                        }}
                      >
                        {sch.title}
                      </strong>
                    </div>
                    <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#6b7684' }}>
                      {sch.startTime} ~ {sch.endTime} · {sch.locationName}
                    </p>
                    {sch.description && (
                      <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#8b95a1' }}>
                        {sch.description}
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                    {sch.isCancelled ? (
                      <>
                        {onRestoreSchedule && (
                          <button
                            type="button"
                            onClick={() => onRestoreSchedule(sch.id, sch.title)}
                            style={{
                              background: '#ECFDF5',
                              color: '#059669',
                              border: '1px solid #A7F3D0',
                              borderRadius: '6px',
                              padding: '4px 8px',
                              fontSize: '12px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            복원
                          </button>
                        )}
                        {onDeleteScheduleSingle && (
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                confirm(
                                  `'${sch.title}' 일정을 영구 삭제하시겠습니까? (복구 불가)`
                                )
                              ) {
                                onDeleteScheduleSingle(sch.id, sch.title, true);
                              }
                            }}
                            style={{
                              background: '#FEF2F2',
                              color: '#DC2626',
                              border: '1px solid #FECACA',
                              borderRadius: '6px',
                              padding: '4px 8px',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            영구삭제
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        {onToggleArchiveSchedule && (
                          <button
                            type="button"
                            onClick={() => onToggleArchiveSchedule(sch.id, !sch.isArchived)}
                            style={{
                              background: sch.isArchived ? '#EDE9FE' : '#F1F5F9',
                              color: sch.isArchived ? '#6D28D9' : '#475569',
                              border: `1px solid ${sch.isArchived ? '#C4B5FD' : '#CBD5E1'}`,
                              borderRadius: '6px',
                              padding: '4px 8px',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {sch.isArchived ? '복원' : '보관'}
                          </button>
                        )}
                        {onCloneSchedule && (
                          <button
                            type="button"
                            className="btn-edit-sch-mini"
                            onClick={() => onCloneSchedule(sch)}
                            style={{
                              background: sch.date < todayStr ? '#ECFDF5' : '#F8FAFC',
                              color: sch.date < todayStr ? '#059669' : '#475569',
                              border: `1px solid ${sch.date < todayStr ? '#A7F3D0' : '#CBD5E1'}`,
                              borderRadius: '6px',
                              padding: '4px 8px',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            복제
                          </button>
                        )}
                        {onDeleteSchedule && (
                          <button
                            type="button"
                            className="btn-delete-sch-mini"
                            onClick={() => onDeleteSchedule(sch.id, sch.title)}
                          >
                            삭제
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="empty-subtext" style={{ padding: '16px 0', textAlign: 'center', margin: 0 }}>
            등록된 일정이 없습니다.
          </p>
        )}
      </div>
    </div>
  );
};
