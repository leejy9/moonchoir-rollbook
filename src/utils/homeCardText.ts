import type { AttendanceStatus, Schedule } from '../types/rollbook';
import type { TodayCtaState } from './todayCta';
import { getWeekdayOfDate } from './date';

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

/** "11월 24일 화 · 19:30 ~ 21:40" (V3-22 R2) */
export function formatCardDateLine(schedule: Pick<Schedule, 'date' | 'startTime' | 'endTime'>): string {
  const [, m, d] = schedule.date.split('-').map(Number);
  const weekday = WEEKDAY_KO[getWeekdayOfDate(schedule.date)];
  const timePart = schedule.endTime?.trim()
    ? `${schedule.startTime} ~ ${schedule.endTime}`
    : schedule.startTime;
  return `${m}월 ${d}일 ${weekday} · ${timePart}`;
}

export interface CardCornerLabel {
  text: string;
  tone: 'warning' | 'muted';
}

/**
 * 카드 오른쪽 위 글자 (V3-22 R2). 오늘 카드는 투표 전일 때만, 미래 카드는 "n일 뒤".
 */
export function cardCornerLabel(
  isToday: boolean,
  dDay: number | undefined,
  ctaKind: TodayCtaState['kind']
): CardCornerLabel | undefined {
  if (isToday) return ctaKind === 'RSVP_NEW' ? { text: '투표 전', tone: 'warning' } : undefined;
  if (dDay !== undefined && dDay > 0) return { text: `${dDay}일 뒤`, tone: 'muted' };
  return undefined;
}

/** 카드 댓글 줄의 최근 댓글 글자 "{파트} {이름} · {내용}" (V3-22 R4) */
export function lastCommentText(comment: { part: string; memberName: string; text: string }): string {
  return `${comment.part} ${comment.memberName} · ${comment.text}`;
}

/** 카드 댓글 줄 aria-label (V3-22 R4) */
export function commentRowAriaLabel(count: number, hasNew: boolean): string {
  if (count <= 0) return '댓글 남기기. 일정 상세 열기';
  return `댓글 ${count}개${hasNew ? ', 새 댓글 있음' : ''}. 일정 상세 열기`;
}

/** 달력 체크 표시 대상 최종 출결 상태 (한국어 값, types/rollbook.ts) */
export function isCheckedInFinalStatus(status: AttendanceStatus | '대기' | undefined): boolean {
  return status === '출석' || status === '지각' || status === '수동인정';
}
