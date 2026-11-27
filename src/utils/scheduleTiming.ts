import type { Schedule } from '../types/rollbook';
import { getKSTClock } from './date';
import { parseClockMinutes } from './passionRules';

export function isScheduleOver(schedule: Schedule, now: Date): boolean {
  const dateStart = new Date(`${schedule.date}T00:00:00+09:00`);
  const startMinutes = parseClockMinutes(
    getKSTClock(schedule.startTime) || schedule.startTime || ''
  );
  if (Number.isNaN(dateStart.getTime()) || startMinutes === null) return false;

  const start = new Date(dateStart.getTime() + startMinutes * 60 * 1000);
  const configuredEnd = schedule.endTime?.trim();
  let end: Date;
  if (configuredEnd) {
    const endMinutes = parseClockMinutes(getKSTClock(configuredEnd) || configuredEnd);
    if (endMinutes === null) return false;
    end = new Date(dateStart.getTime() + endMinutes * 60 * 1000);
    if (end.getTime() <= start.getTime()) {
      end.setTime(end.getTime() + 24 * 60 * 60 * 1000);
    }
  } else {
    end = new Date(start.getTime() + 120 * 60 * 1000);
  }

  return now.getTime() >= end.getTime();
}
