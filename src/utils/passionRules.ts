import type { Schedule } from '../types/rollbook';

export interface PassionItem {
  key: string;
  label: string;
  count: number;
  delta: number;
  scheduleIds: string[];
}

export interface PassionGroup {
  key: 'attendance' | 'promise' | 'stage';
  title: string;
  totalDelta: number;
  items: PassionItem[];
}

export interface PassionTemperatureResult {
  value: number; // e.g. 38.2
  weeklyDelta: number; // e.g. +0.1 or -0.2
  windowSize: number; // e.g. 12
  groups: PassionGroup[];
}

export const PASSION_RULES = {
  BASE_TEMPERATURE: 36.5,
  MIN_TEMPERATURE: 34.0,
  MAX_TEMPERATURE: 42.0,
  WINDOW_SIZE: 12,
  STAGE_WINDOW_DAYS: 365,
  DELTAS: {
    ON_TIME: 0.10,
    EARLY: 0.05,
    STREAK_5: 0.30,
    STREAK_10: 0.60,
    ABSENT: -0.40,
    EARLY_VOTE: 0.05,
    EARLY_VOTE_MAX: 0.60,
    VOTE_RATE_HIGH: 0.30, // >= 90%
    VOTE_RATE_MID: 0.10, // 75% ~ 90%
    NO_SHOW: -0.50,
    LATE_CANCEL: -0.10,
    STAGE_ATTEND: 0.20,
    STAGE_MAX: 0.60,
  },
  LABELS: {
    ON_TIME: (n: number) => `정시 ${n}회`,
    EARLY: (n: number) => `일찍 도착 ${n}회`,
    STREAK_5: '정시 5연속',
    STREAK_10: '정시 10연속',
    LATE: (n: number) => `지각 ${n}회`,
    ABSENT: (n: number) => `결석 ${n}회`,
    EARLY_VOTE: (n: number) => `24시간 전 투표 ${n}회`,
    VOTE_RATE: (pct: number) => `약속 지킴 ${pct}%`,
    NO_SHOW: (n: number) => `참석 투표 후 결석 ${n}회`,
    LATE_CANCEL: (n: number) => `직전 취소 ${n}회`,
    STAGE_ATTEND: (n: number) => `공연 ${n}회`,
  },
} as const;

export function parseClockMinutes(clockStr: string): number | null {
  const match = clockStr.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function getScheduleStartMs(schedule: Schedule): number {
  return new Date(`${schedule.date}T${schedule.startTime || '19:30'}:00+09:00`).getTime();
}

export function isAttendStatus(status: string): boolean {
  const s = status.toUpperCase();
  return s === 'ATTEND' || s === '출석' || s === '참석' || s === '수동인정';
}

export function isAbsentStatus(status: string): boolean {
  const s = status.toUpperCase();
  return s === 'ABSENT' || s === '결석' || s === '불참' || s === '사유결석';
}
