import type { Schedule } from '../types/rollbook';
import { getKSTDateString, getKSTTimestampString } from './date';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function formatMinutes(total: number): string {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}${':'}${String(m).padStart(2, '0')}`;
}

/** 지각 판정 경계 시각(HH:mm): 시작 시각 + 지각 유예 분. 이 시각까지는 출석, 넘으면 지각. */
export function getLateThresholdTime(startTime: string, lateGraceMinutes: number): string {
  return formatMinutes(toMinutes(startTime) + lateGraceMinutes);
}

export type ManualAttendanceTimestampResult = { timestamp: string; error?: undefined } | { error: string; timestamp?: undefined };

interface ResolveOptions {
  status: '출석' | '지각';
  schedule: Pick<Schedule, 'date' | 'startTime'>;
  /** 관리자가 입력한 도착 시각(HH:mm). 비어 있으면 기존 기본값을 쓴다. */
  inputTime?: string;
  lateGraceMinutes: number;
  /** 시각을 입력하지 않았을 때 쓰는 기존 기본 로그 시각 */
  defaultTimestamp: string;
}

/**
 * 관리자가 수동으로 출석/지각을 기록할 때 로그의 시각을 정한다.
 * 상태와 시각이 어긋나면(예: 지각 기준 이후 시각으로 `출석`) 판정이 뒤집히므로 저장 전에 막는다.
 */
export function resolveManualAttendanceTimestamp({
  status,
  schedule,
  inputTime,
  lateGraceMinutes,
  defaultTimestamp,
}: ResolveOptions): ManualAttendanceTimestampResult {
  const trimmed = (inputTime || '').trim();
  if (!trimmed) return { timestamp: defaultTimestamp };
  if (!TIME_PATTERN.test(trimmed)) return { error: '도착 시각을 시:분 형식으로 입력해 주세요.' };

  const threshold = getLateThresholdTime(schedule.startTime, lateGraceMinutes);
  const isAfterThreshold = toMinutes(trimmed) > toMinutes(threshold);

  if (status === '출석' && isAfterThreshold) {
    return { error: `지각 기준 시각(${threshold})보다 늦어 출석으로 기록할 수 없습니다. 지각으로 기록해 주세요.` };
  }
  if (status === '지각' && !isAfterThreshold) {
    return { error: `지각으로 기록하려면 ${threshold}보다 늦은 시각이어야 합니다.` };
  }

  return { timestamp: `${schedule.date}T${trimmed}:00` };
}

/** 한국 시각 기준 지금의 HH:mm */
export function getNowKSTTime(now: Date = new Date()): string {
  return getKSTTimestampString(now).slice(11, 16);
}

interface DefaultArrivalOptions {
  status: '출석' | '지각';
  schedule: Pick<Schedule, 'date' | 'startTime'>;
  lateGraceMinutes: number;
  now?: Date;
}

/**
 * 시계 팝업에 미리 채워 둘 도착 시각.
 * - 오늘 일정: 지금 시각(현장에서 QR이 안 되는 단원을 바로 처리하는 경우). 지각은 지각 기준 직후보다 이르면 기준 직후로 올린다.
 * - 다른 날 일정: 지금 시각이 의미 없으므로 출석은 시작 시각, 지각은 지각 기준 직후.
 */
export function getDefaultArrivalTime({ status, schedule, lateGraceMinutes, now = new Date() }: DefaultArrivalOptions): string {
  const justAfterThreshold = formatMinutes(toMinutes(getLateThresholdTime(schedule.startTime, lateGraceMinutes)) + 1);
  const isToday = getKSTDateString(now) === schedule.date;

  if (!isToday) return status === '출석' ? schedule.startTime : justAfterThreshold;

  const nowTime = getNowKSTTime(now);
  if (status === '출석') return nowTime;
  return toMinutes(nowTime) > toMinutes(justAfterThreshold) ? nowTime : justAfterThreshold;
}
