import React, { useState } from 'react';
import { sheetsService } from '../services/sheets';
import type {
  AttendanceStatus,
  Member,
  Schedule,
} from '../types/rollbook';
import { LiquidGauge } from './LiquidGauge';
import { formatMatrixHeaderDate, getKSTTimestampString } from '../utils/date';

interface AdminMatrixGridProps {
  members: Member[];
  schedules: Schedule[];
  onDataChanged: () => void;
  onSelectMember?: (member: Member) => void;
  onAddNewMember?: () => void;
}

interface CellPopoverTarget {
  member: Member;
  schedule: Schedule;
  currentStatus: AttendanceStatus;
  checkInTime?: string;
  rsvpReason?: string;
  x: number;
  y: number;
}

export const AdminMatrixGrid: React.FC<AdminMatrixGridProps> = ({
  members,
  schedules,
  onDataChanged,
  onSelectMember,
  onAddNewMember,
}) => {
  const [sortField, setSortField] = useState<'name' | 'part' | 'rate'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [popoverTarget, setPopoverTarget] = useState<CellPopoverTarget | null>(null);
  const [customNote, setCustomNote] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Pre-calculate reconciliations for all visible schedules
  const reconciliationsBySchedule = React.useMemo(() => {
    const map = new Map<string, ReturnType<typeof sheetsService.reconcileAttendance>>();
    schedules.forEach((s) => {
      map.set(s.id, sheetsService.reconcileAttendance(s.id));
    });
    return map;
  }, [schedules]);

  // Calculate cumulative stats for each member across filtered schedules
  const memberStats = React.useMemo(() => {
    const map = new Map<
      string,
      { attended: number; late: number; excused: number; absent: number; rate: number }
    >();

    members.forEach((m) => {
      let attended = 0;
      let late = 0;
      let excused = 0;
      let absent = 0;

      schedules.forEach((s) => {
        const recList = reconciliationsBySchedule.get(s.id) || [];
        const item = recList.find((r) => r.memberId === m.id);
        const status = item?.finalStatus || '결석';

        if (status === '출석' || status === '수동인정') {
          attended += 1;
        } else if (status === '지각') {
          late += 1;
        } else if (status === '사유결석') {
          excused += 1;
        } else {
          absent += 1;
        }
      });

      // Standard rate formula: attended + late*0.5, or attended / total
      const totalSessions = schedules.length;
      const rate = totalSessions > 0 ? Math.round(((attended + late * 0.7) / totalSessions) * 100) : 0;

      map.set(m.id, { attended, late, excused, absent, rate });
    });

    return map;
  }, [members, schedules, reconciliationsBySchedule]);

  // Sorting
  const sortedMembers = React.useMemo(() => {
    return [...members].sort((a, b) => {
      if (sortField === 'rate') {
        const rateA = memberStats.get(a.id)?.rate || 0;
        const rateB = memberStats.get(b.id)?.rate || 0;
        return sortOrder === 'asc' ? rateA - rateB : rateB - rateA;
      }
      if (sortField === 'part') {
        const cmp = a.part.localeCompare(b.part);
        return sortOrder === 'asc' ? cmp : -cmp;
      }
      const cmp = a.name.localeCompare(b.name);
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [members, sortField, sortOrder, memberStats]);

  const toggleSort = (field: 'name' | 'part' | 'rate') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder(field === 'rate' ? 'desc' : 'asc');
    }
  };

  // Open Popover on cell click
  const handleCellClick = (
    e: React.MouseEvent,
    member: Member,
    schedule: Schedule
  ) => {
    const recList = reconciliationsBySchedule.get(schedule.id) || [];
    const item = recList.find((r) => r.memberId === member.id);
    const rect = e.currentTarget.getBoundingClientRect();

    setPopoverTarget({
      member,
      schedule,
      currentStatus: item?.finalStatus || '결석',
      checkInTime: item?.checkInTime,
      rsvpReason: item?.rsvpReason,
      x: rect.left,
      y: rect.bottom + 4,
    });
    setCustomNote('');
  };

  // Quick Status Override Handler
  const handleSetStatus = async (targetStatus: AttendanceStatus) => {
    if (!popoverTarget) return;
    setIsUpdating(true);

    const { member, schedule } = popoverTarget;

    try {
      if (targetStatus === '출석' || targetStatus === '수동인정') {
        await sheetsService.addCheckInLog({
          id: `log_manual_${Date.now()}`,
          scheduleId: schedule.id,
          memberId: member.id,
          memberName: member.name,
          part: member.part,
          timestamp: `${schedule.date}T${schedule.startTime}:00`,
          authMethod: 'MANUAL_BY_ADMIN',
          isVerifiedLocation: true,
          adminNote: customNote || '관리자 수동 인정',
        });
      } else if (targetStatus === '지각') {
        // Log with late timestamp
        await sheetsService.addCheckInLog({
          id: `log_late_${Date.now()}`,
          scheduleId: schedule.id,
          memberId: member.id,
          memberName: member.name,
          part: member.part,
          timestamp: `${schedule.date}T${schedule.startTime.slice(0, 2)}:50:00`,
          authMethod: 'MANUAL_BY_ADMIN',
          isVerifiedLocation: true,
          adminNote: customNote || '관리자 지각 처리',
        });
      } else if (targetStatus === '사유결석') {
        await sheetsService.submitRSVP({
          id: `vote_admin_${Date.now()}`,
          scheduleId: schedule.id,
          memberId: member.id,
          memberName: member.name,
          part: member.part,
          status: 'ABSENT',
          reason: customNote || '관리자 지정 사유결석',
          timestamp: getKSTTimestampString(),
        });
      }

      setPopoverTarget(null);
      onDataChanged();
    } finally {
      setIsUpdating(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = ['이름', '파트', '단원상태', ...schedules.map((s) => `${s.date}(${s.title})`), '출석', '지각', '사유결석', '결석', '출석률(%)'];
    const rows = sortedMembers.map((m) => {
      const stats = memberStats.get(m.id);
      const sessionStatuses = schedules.map((s) => {
        const item = reconciliationsBySchedule.get(s.id)?.find((r) => r.memberId === m.id);
        return item?.finalStatus || '결석';
      });
      return [
        m.name,
        m.part,
        m.memberStatus || '정단원',
        ...sessionStatuses,
        stats?.attended || 0,
        stats?.late || 0,
        stats?.excused || 0,
        stats?.absent || 0,
        `${stats?.rate || 0}%`,
      ];
    });

    const csvContent = '\uFEFF' + [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `문콰이어_출결매트릭스_${getKSTTimestampString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="matrix-grid-card">
      <div className="matrix-toolbar">
        <div className="matrix-toolbar-left">
          <h3 className="matrix-title">📊 통합 출결 & 누적 통계 매트릭스</h3>
          <span className="matrix-sub">
            단원명을 클릭하면 인적사항을 관리할 수 있고, 셀을 클릭하면 출결 상태를 즉시 보정할 수 있습니다.
          </span>
        </div>
        <div className="matrix-toolbar-actions">
          {onAddNewMember && (
            <button
              type="button"
              className="btn btn-primary btn-sm btn-add-member"
              onClick={onAddNewMember}
            >
              + 신규 단원 등록
            </button>
          )}
          <button type="button" className="btn-csv-export" onClick={handleExportCSV}>
            📥 엑셀/CSV 다운로드
          </button>
        </div>
      </div>

      <div className="matrix-scroll-wrapper">
        <table className="matrix-table">
          <thead>
            <tr>
              {/* Sticky Left Headers */}
              <th className="sticky-col col-num">#</th>
              <th
                className="sticky-col col-name sortable"
                onClick={() => toggleSort('name')}
              >
                단원명 {sortField === 'name' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th
                className="sticky-col col-part sortable"
                onClick={() => toggleSort('part')}
              >
                파트 {sortField === 'part' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th className="sticky-col col-status">상태</th>

              {/* Dynamic Rehearsal Columns (Slim 60px Excel Style) */}
              {schedules.map((s) => {
                const recList = reconciliationsBySchedule.get(s.id) || [];
                const attendCount = recList.filter(
                  (r) => r.finalStatus === '출석' || r.finalStatus === '수동인정'
                ).length;
                const headerDate = formatMatrixHeaderDate(s.date);

                return (
                  <th
                    key={s.id}
                    className="matrix-session-col"
                    title={`${s.title} (${headerDate.fullDate || s.date}) - 출석 ${attendCount}/${members.length}명`}
                  >
                    <div className="session-col-header">
                      <span className="session-date-label">
                        {headerDate.dateLabel}
                      </span>
                      <span className="session-day-label">
                        {headerDate.dayLabel}
                      </span>
                    </div>
                  </th>
                );
              })}

              {/* Sticky Right Headers */}
              <th className="sticky-col-right col-att">출석</th>
              <th className="sticky-col-right col-late">지각</th>
              <th className="sticky-col-right col-abs">결석</th>
              <th
                className="sticky-col-right col-rate sortable"
                onClick={() => toggleSort('rate')}
              >
                출석률 {sortField === 'rate' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th className="sticky-col-right col-energy">에너지</th>
            </tr>
          </thead>

          <tbody>
            {sortedMembers.map((m, idx) => {
              const stats = memberStats.get(m.id);

              return (
                <tr key={m.id} className="matrix-row">
                  {/* Sticky Left Data */}
                  <td className="sticky-col col-num">{idx + 1}</td>
                  <td className="sticky-col col-name">
                    <button
                      type="button"
                      className="btn-member-name-link"
                      onClick={() => onSelectMember?.(m)}
                      title={`${m.name} 단원 인적사항 열람 및 수정`}
                    >
                      <span className="name-text">{m.name}</span>
                      <span className="profile-link-indicator">›</span>
                    </button>
                  </td>
                  <td className="sticky-col col-part">
                    <span className={`part-badge part-${m.part}`}>{m.part}</span>
                  </td>
                  <td className="sticky-col col-status">
                    <span className="member-status-pill">{m.memberStatus || '정단원'}</span>
                  </td>

                  {/* Rehearsal Cell Data */}
                  {schedules.map((s) => {
                    const recList = reconciliationsBySchedule.get(s.id) || [];
                    const item = recList.find((r) => r.memberId === m.id);
                    const status = item?.finalStatus || '결석';

                    let badgeClass = 'cell-absent';
                    let statusLabel = '결석';
                    let timeSub = '';

                    if (status === '출석') {
                      badgeClass = 'cell-attend';
                      statusLabel = '출석';
                      timeSub = item?.checkInTime ? item.checkInTime.slice(11, 16) : '';
                    } else if (status === '수동인정') {
                      badgeClass = 'cell-manual';
                      statusLabel = '수동';
                    } else if (status === '지각') {
                      badgeClass = 'cell-late';
                      statusLabel = '지각';
                      timeSub = item?.checkInTime ? item.checkInTime.slice(11, 16) : '';
                    } else if (status === '사유결석') {
                      badgeClass = 'cell-excused';
                      statusLabel = '사유';
                    }

                    return (
                      <td
                        key={s.id}
                        className={`matrix-cell ${badgeClass}`}
                        onClick={(e) => handleCellClick(e, m, s)}
                        title={`${m.name} · ${s.date}: ${status}${item?.rsvpReason ? ` (${item.rsvpReason})` : ''} - 클릭하여 수정`}
                      >
                        <div className="matrix-cell-content">
                          <span className="cell-status-tag">{statusLabel}</span>
                          {timeSub && <span className="cell-time-sub">{timeSub}</span>}
                        </div>
                      </td>
                    );
                  })}

                  {/* Sticky Right Data */}
                  <td className="sticky-col-right col-att">{stats?.attended || 0}</td>
                  <td className="sticky-col-right col-late">{stats?.late || 0}</td>
                  <td className="sticky-col-right col-abs">{(stats?.absent || 0) + (stats?.excused || 0)}</td>
                  <td className="sticky-col-right col-rate">
                    <strong className="rate-num">{stats?.rate || 0}%</strong>
                  </td>
                  <td className="sticky-col-right col-energy">
                    <LiquidGauge percentage={stats?.rate || 0} size={32} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Popover for Quick Cell Status Override */}
      {popoverTarget && (
        <div
          className="cell-popover-overlay"
          onClick={() => setPopoverTarget(null)}
        >
          <div
            className="cell-popover-menu"
            style={{
              position: 'fixed',
              top: Math.min(popoverTarget.y, window.innerHeight - 260),
              left: Math.min(popoverTarget.x, window.innerWidth - 240),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="popover-title-row">
              <strong>{popoverTarget.member.name}</strong>
              <span className="popover-date">{popoverTarget.schedule.date}</span>
            </div>
            <div className="popover-current">
              현재: <span className="current-status-tag">{popoverTarget.currentStatus}</span>
            </div>

            <div className="popover-options-stack">
              <button
                type="button"
                className="opt-btn attend"
                onClick={() => handleSetStatus('출석')}
                disabled={isUpdating}
              >
                🟢 출석으로 인정
              </button>
              <button
                type="button"
                className="opt-btn late"
                onClick={() => handleSetStatus('지각')}
                disabled={isUpdating}
              >
                🟡 지각으로 변경
              </button>
              <button
                type="button"
                className="opt-btn excused"
                onClick={() => handleSetStatus('사유결석')}
                disabled={isUpdating}
              >
                🔴 사유결석 (사유 기록)
              </button>
              <button
                type="button"
                className="opt-btn manual"
                onClick={() => handleSetStatus('수동인정')}
                disabled={isUpdating}
              >
                🔵 수동 인정 (관리자 확인)
              </button>
            </div>

            <div className="popover-note-box">
              <input
                type="text"
                placeholder="보정 사유 (선택)"
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
              />
            </div>

            <button
              type="button"
              className="popover-close-btn"
              onClick={() => setPopoverTarget(null)}
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
