import React, { useState } from 'react';
import { sheetsService } from '../services/sheets';
import type {
  AttendanceStatus,
  Member,
  Schedule,
} from '../types/rollbook';
import { LiquidGauge } from './LiquidGauge';
import { formatMatrixHeaderDate, getKSTTimestampString, getKSTDateString } from '../utils/date';
import { isMemberRequiredForSchedule } from '../utils/attendanceStats';

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
    const todayStr = getKSTDateString();
    const map = new Map<
      string,
      { attended: number; late: number; excused: number; absent: number; exempt: number; rate: number }
    >();

    members.forEach((m) => {
      let attended = 0;
      let late = 0;
      let excused = 0;
      let absent = 0;
      let exempt = 0;
      let requiredSessions = 0;

      schedules.forEach((s) => {
        const recList = reconciliationsBySchedule.get(s.id) || [];
        const item = recList.find((r) => r.memberId === m.id);
        const isRequired = isMemberRequiredForSchedule(m, s.date, s);
        const isPastOrToday = s.date <= todayStr;
        const status = item?.finalStatus || (isRequired ? '결석' : '미참');

        const hasCheckedIn =
          status === '출석' || status === '수동인정' || status === '지각';

        // 취소된 일정은 출석률 통계 모수(분모)에서 제외, 비필참 일정도 자발적 출석 시 모수에 포함
        if (!s.isCancelled && (isRequired ? (isPastOrToday || hasCheckedIn) : hasCheckedIn)) {
          requiredSessions += 1;
        }

        if (s.isCancelled) {
          exempt += 1;
        } else if (status === '출석' || status === '수동인정') {
          attended += 1;
        } else if (status === '지각') {
          late += 1;
        } else if (status === '사유결석') {
          excused += 1;
        } else if (status === '미참' || status === '모수제외' || (!isPastOrToday && !hasCheckedIn)) {
          exempt += 1;
        } else {
          absent += 1;
        }
      });

      // Standard rate formula: 지각도 1.0 인정 (별도 감점 없이 출석률 산출)
      const rate = requiredSessions > 0 ? Math.min(100, Math.round(((attended + late) / requiredSessions) * 100)) : 0;

      map.set(m.id, { attended, late, excused, absent, exempt, rate });
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
    if (schedule.isCancelled) {
      alert('취소된 연습 일정입니다. 출결 상태를 수정할 수 없습니다.');
      return;
    }

    const recList = reconciliationsBySchedule.get(schedule.id) || [];
    const item = recList.find((r) => r.memberId === member.id);
    const rect = e.currentTarget.getBoundingClientRect();
    const isRequired = isMemberRequiredForSchedule(member, schedule.date, schedule);
    const todayStr = getKSTDateString();
    const isFuture = schedule.date > todayStr;
    const isRecorded = Boolean(item?.checkInTime || item?.isManualOverride || (item?.rsvpStatus && item.rsvpStatus !== 'UNVOTED'));
    const defaultStatus = !isRecorded && isFuture ? '미진행' : (item?.finalStatus || (isRequired ? '결석' : '미참'));

    setPopoverTarget({
      member,
      schedule,
      currentStatus: defaultStatus,
      checkInTime: item?.checkInTime,
      rsvpReason: item?.rsvpReason,
      x: rect.left,
      y: rect.bottom + 4,
    });
    setCustomNote('');
  };

  // Quick Status Override Handler
  const handleSetStatus = async (targetStatus: '출석' | '지각' | '사유결석' | '결석' | '초기화') => {
    if (!popoverTarget) return;
    setIsUpdating(true);

    const { member, schedule } = popoverTarget;

    try {
      if (targetStatus === '출석') {
        await sheetsService.addCheckInLog({
          id: `log_manual_${Date.now()}`,
          scheduleId: schedule.id,
          memberId: member.id,
          memberName: member.name,
          part: member.part,
          timestamp: `${schedule.date}T${schedule.startTime}:00`,
          authMethod: 'MANUAL_BY_ADMIN',
          isVerifiedLocation: true,
          adminNote: customNote || '관리자 수동 출석 인정',
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
      } else if (targetStatus === '결석') {
        // 관리자 결석/노쇼 처리
        await sheetsService.addCheckInLog({
          id: `log_absent_${Date.now()}`,
          scheduleId: schedule.id,
          memberId: member.id,
          memberName: member.name,
          part: member.part,
          timestamp: `${schedule.date}T${schedule.startTime}:00`,
          authMethod: 'MANUAL_BY_ADMIN',
          isVerifiedLocation: true,
          adminNote: customNote || '관리자 결석 처리 (노쇼)',
        });
      } else if (targetStatus === '초기화') {
        // 기존 수동 보정 로그 초기화 (원래 상태로 복귀)
        await sheetsService.clearAttendanceLog(schedule.id, member.id);
      }

      setPopoverTarget(null);
      onDataChanged();
    } finally {
      setIsUpdating(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = [
      '이름',
      '파트',
      '단원상태',
      ...schedules.map((s) => (s.isCancelled ? `${s.date}(${s.title})[취소]` : `${s.date}(${s.title})`)),
      '출석',
      '지각',
      '사유결석',
      '결석',
      '출석률(%)',
    ];
    const rows = sortedMembers.map((m) => {
      const stats = memberStats.get(m.id);
      const sessionStatuses = schedules.map((s) => {
        if (s.isCancelled) return '취소(미참)';
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
                    className={`matrix-session-col ${s.isCancelled ? 'col-cancelled' : ''}`}
                    title={
                      s.isCancelled
                        ? `${s.title} (취소된 연습) - 출결 통계 모수 제외`
                        : `${s.title} (${headerDate.fullDate || s.date}) - 출석 ${attendCount}/${members.length}명`
                    }
                  >
                    <div className="session-col-header">
                      {s.isCancelled && <span className="session-cancelled-badge">취소</span>}
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
                    const isRequired = isMemberRequiredForSchedule(m, s.date, s);
                    const todayStr = getKSTDateString();
                    const isFuture = s.date > todayStr;
                    const isRecorded = Boolean(item?.checkInTime || item?.isManualOverride || (item?.rsvpStatus && item.rsvpStatus !== 'UNVOTED'));
                    const status = item?.finalStatus || (isRequired ? '결석' : '미참');

                    let badgeClass = 'cell-absent';
                    let statusLabel = '결석';
                    let timeSub = '';

                    if (s.isCancelled) {
                      badgeClass = 'cell-cancelled';
                      statusLabel = '취소';
                    } else if (status === '출석' || status === '수동인정') {
                      badgeClass = 'cell-attend';
                      statusLabel = '출석';
                      timeSub = item?.checkInTime ? item.checkInTime.slice(11, 16) : '';
                    } else if (status === '지각') {
                      badgeClass = 'cell-late';
                      statusLabel = '지각';
                      timeSub = item?.checkInTime ? item.checkInTime.slice(11, 16) : '';
                    } else if (status === '사유결석') {
                      badgeClass = 'cell-excused';
                      statusLabel = '사유';
                    } else if (status === '미참' || status === '모수제외') {
                      badgeClass = 'cell-exempt';
                      statusLabel = '미참';
                    } else if (isFuture && !isRecorded) {
                      // 미래 미진행 일정: 아직 연습 전이므로 결석이 아닌 미체크(-)로 표기
                      badgeClass = 'cell-upcoming';
                      statusLabel = '-';
                    }

                    return (
                      <td
                        key={s.id}
                        className={`matrix-cell ${badgeClass}`}
                        onClick={(e) => handleCellClick(e, m, s)}
                        title={
                          s.isCancelled
                            ? `${m.name} · ${s.date}: 취소된 연습 (모수 제외)`
                            : `${m.name} · ${s.date}: ${status}${item?.rsvpReason ? ` (${item.rsvpReason})` : ''} - 클릭하여 수정`
                        }
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
                🟢 출석으로 변경
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
                className="opt-btn absent"
                onClick={() => handleSetStatus('결석')}
                disabled={isUpdating}
              >
                ⚪ 결석으로 변경 (무단결석/노쇼)
              </button>
              <button
                type="button"
                className="opt-btn reset"
                onClick={() => handleSetStatus('초기화')}
                disabled={isUpdating}
                style={{ color: '#64748b' }}
              >
                🔄 보정 초기화 (기본 상태로 복귀)
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
