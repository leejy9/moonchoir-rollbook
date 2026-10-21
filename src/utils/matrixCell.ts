import type { AttendanceReconciliation, Schedule } from '../types/rollbook';
import { getKSTClock } from './date';
import { getCheckInWindowState } from './timeWindow';

export interface MatrixCellDisplay {
  badgeClass: string;
  label: string;
  /** 칸 아래 작은 글씨: 체크인 시각 또는 투표 표시 */
  sub: string;
  /** 툴팁/팝오버용 한 줄 설명 */
  statusText: string;
}

/** 연습이 아직 끝나지 않았으면(당일 종료 전 포함) 결석을 확정하지 않는다. */
export function isSchedulePending(schedule: Schedule, now: Date): boolean {
  return getCheckInWindowState(schedule, now).status !== 'WINDOW_CLOSED';
}

function cell(badgeClass: string, label: string, sub = ''): MatrixCellDisplay {
  return { badgeClass, label, sub, statusText: sub ? `${label} (${sub})` : label };
}

/**
 * 관리자 매트릭스 한 칸의 표시 규칙.
 * - 출석/지각은 항상 실제 기록이 우선한다.
 * - 연습 종료 전에는 결석 대신 투표 상태(참석/사유/불참/미투표)를 보여 준다.
 * - 연습 종료 후 결석은 투표 여부를 함께 보여 준다(참석 투표 후 불참 등 확인용).
 */
export function getMatrixCellDisplay(input: {
  schedule: Schedule;
  item?: AttendanceReconciliation;
  isRequired: boolean;
  now?: Date;
}): MatrixCellDisplay {
  const { schedule, item, isRequired, now = new Date() } = input;

  if (schedule.isCancelled) return cell('cell-cancelled', '취소');

  const status = item?.finalStatus ?? (isRequired ? '결석' : '미참');
  const vote = item?.rsvpStatus ?? 'UNVOTED';
  const checkInTime = getKSTClock(item?.checkInTime);

  if (status === '출석' || status === '수동인정') return cell('cell-attend', '출석', checkInTime);
  if (status === '지각') return cell('cell-late', '지각', checkInTime);

  const isExempt = status === '미참' || status === '모수제외';
  const isManualAbsent = Boolean(item?.isManualOverride);

  if (isSchedulePending(schedule, now) && !isManualAbsent) {
    if (isExempt) {
      return vote === 'ATTEND' ? cell('cell-vote-attend', '참석', '자율') : cell('cell-exempt', '미참');
    }
    if (vote === 'ATTEND') return cell('cell-vote-attend', '참석', '투표');
    if (vote === 'ABSENT') {
      return item?.rsvpReason ? cell('cell-excused', '사유', '투표') : cell('cell-vote-absent', '불참', '투표');
    }
    return cell('cell-upcoming', '미투표');
  }

  if (status === '사유결석') return cell('cell-excused', '사유');
  if (isExempt) return cell('cell-exempt', '미참');
  if (vote === 'ATTEND') return cell('cell-absent', '결석', '참석투표');
  if (vote === 'ABSENT') return cell('cell-absent', '결석', '불참투표');
  return cell('cell-absent', '결석');
}
