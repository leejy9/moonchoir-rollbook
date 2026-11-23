import type {
  Member,
  RawAttendanceLog,
  RsvpEvent,
  Schedule,
} from '../types/rollbook';
import { reconcileSingleMemberAttendance } from './attendanceStats';
import { getKSTClock } from './date';
import {
  PASSION_RULES,
  getScheduleStartMs,
  isAbsentStatus,
  isAttendStatus,
  parseClockMinutes,
  type PassionItem,
} from './passionRules';

export function calculateAttendanceGroup(
  member: Member,
  windowSchedules: Schedule[],
  memberLogs: RawAttendanceLog[],
  noShowScheduleIds: Set<string>
): { items: PassionItem[]; onTimeStreak: number } {
  const onTimeIds: string[] = [];
  const earlyIds: string[] = [];
  const lateIds: string[] = [];
  const absentIds: string[] = [];

  for (const s of windowSchedules) {
    const schedLogs = memberLogs.filter((l) => l.scheduleId === s.id);
    const rec = reconcileSingleMemberAttendance(member, s, schedLogs);
    const startMin = parseClockMinutes(s.startTime || '19:30') ?? 19 * 60 + 30;

    if (rec.finalStatus === '출석' || rec.finalStatus === '수동인정') {
      const checkInLog = schedLogs[schedLogs.length - 1];
      const checkInClock = checkInLog ? getKSTClock(checkInLog.timestamp) : s.startTime;
      const checkInMin = parseClockMinutes(checkInClock) ?? startMin;

      if (checkInMin <= startMin) {
        onTimeIds.push(s.id);
        if (checkInMin <= startMin - 10) {
          earlyIds.push(s.id);
        }
      }
    } else if (rec.finalStatus === '지각') {
      lateIds.push(s.id);
    } else if (rec.finalStatus === '결석') {
      if (!noShowScheduleIds.has(s.id)) {
        absentIds.push(s.id);
      }
    }
  }

  // Consecutive on-time streak
  let onTimeStreak = 0;
  for (const s of windowSchedules) {
    const schedLogs = memberLogs.filter((l) => l.scheduleId === s.id);
    const rec = reconcileSingleMemberAttendance(member, s, schedLogs);
    const startMin = parseClockMinutes(s.startTime || '19:30') ?? 19 * 60 + 30;

    if (rec.finalStatus === '사유결석') {
      continue;
    }

    if (rec.finalStatus === '출석' || rec.finalStatus === '수동인정') {
      const checkInLog = schedLogs[schedLogs.length - 1];
      const checkInClock = checkInLog ? getKSTClock(checkInLog.timestamp) : s.startTime;
      const checkInMin = parseClockMinutes(checkInClock) ?? startMin;
      if (checkInMin <= startMin) {
        onTimeStreak += 1;
        continue;
      }
    }
    break;
  }

  const items: PassionItem[] = [];
  if (onTimeIds.length > 0) {
    items.push({
      key: 'ontime',
      label: PASSION_RULES.LABELS.ON_TIME(onTimeIds.length),
      count: onTimeIds.length,
      delta: Math.round(onTimeIds.length * PASSION_RULES.DELTAS.ON_TIME * 100) / 100,
      scheduleIds: onTimeIds,
    });
  }
  if (earlyIds.length > 0) {
    items.push({
      key: 'early',
      label: PASSION_RULES.LABELS.EARLY(earlyIds.length),
      count: earlyIds.length,
      delta: Math.round(earlyIds.length * PASSION_RULES.DELTAS.EARLY * 100) / 100,
      scheduleIds: earlyIds,
    });
  }
  if (onTimeStreak >= 10) {
    items.push({
      key: 'streak',
      label: PASSION_RULES.LABELS.STREAK_10,
      count: 1,
      delta: PASSION_RULES.DELTAS.STREAK_10,
      scheduleIds: onTimeIds.slice(0, 10),
    });
  } else if (onTimeStreak >= 5) {
    items.push({
      key: 'streak',
      label: PASSION_RULES.LABELS.STREAK_5,
      count: 1,
      delta: PASSION_RULES.DELTAS.STREAK_5,
      scheduleIds: onTimeIds.slice(0, 5),
    });
  }
  items.push({
    key: 'late',
    label: PASSION_RULES.LABELS.LATE(lateIds.length),
    count: lateIds.length,
    delta: 0,
    scheduleIds: lateIds,
  });
  if (absentIds.length > 0) {
    items.push({
      key: 'absent',
      label: PASSION_RULES.LABELS.ABSENT(absentIds.length),
      count: absentIds.length,
      delta: Math.round(absentIds.length * PASSION_RULES.DELTAS.ABSENT * 100) / 100,
      scheduleIds: absentIds,
    });
  }

  return { items, onTimeStreak };
}

export function calculatePromiseGroup(
  member: Member,
  windowSchedules: Schedule[],
  memberLogs: RawAttendanceLog[],
  memberRsvpEvents: RsvpEvent[],
  noShowScheduleIds: Set<string>
): PassionItem[] {
  const nonBackfillEvents = memberRsvpEvents.filter((e) => e.action !== 'backfill');
  const earlyVoteIds: string[] = [];
  const lateCancelIds: string[] = [];
  const noShowIds: string[] = [];

  let totalPromiseVotedSchedules = 0;
  let totalPromiseKeptSchedules = 0;
  const promiseTargetScheduleIds: string[] = [];

  for (const s of windowSchedules) {
    const schedEvents = nonBackfillEvents.filter((e) => e.scheduleId === s.id);
    if (schedEvents.length === 0) continue;
    promiseTargetScheduleIds.push(s.id);

    const sStartMs = getScheduleStartMs(s);
    const earlyVoteDeadline = sStartMs - 24 * 60 * 60 * 1000;
    if (schedEvents.some((e) => new Date(e.occurredAt).getTime() <= earlyVoteDeadline)) {
      earlyVoteIds.push(s.id);
    }

    const threeHoursBefore = sStartMs - 3 * 60 * 60 * 1000;
    const lateCancels = schedEvents.filter((e) => {
      const eTime = new Date(e.occurredAt).getTime();
      if (eTime < threeHoursBefore || eTime > sStartMs) return false;
      if (!isAbsentStatus(e.status)) return false;
      if (e.prevStatus && isAttendStatus(e.prevStatus)) return true;

      const allPrev = memberRsvpEvents
        .filter((ev) => ev.scheduleId === s.id && new Date(ev.occurredAt).getTime() < eTime)
        .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
      const lastPrev = allPrev[allPrev.length - 1];
      return Boolean(lastPrev && isAttendStatus(lastPrev.status));
    });

    if (lateCancels.length > 0) {
      lateCancelIds.push(s.id);
    }

    const allBeforeStart = schedEvents
      .filter((e) => new Date(e.occurredAt).getTime() <= sStartMs)
      .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
    const lastVote = allBeforeStart[allBeforeStart.length - 1];

    if (lastVote) {
      totalPromiseVotedSchedules += 1;
      const schedLogs = memberLogs.filter((l) => l.scheduleId === s.id);
      const rec = reconcileSingleMemberAttendance(member, s, schedLogs);

      const votedAttend = isAttendStatus(lastVote.status);
      const resultAttended =
        rec.finalStatus === '출석' ||
        rec.finalStatus === '수동인정' ||
        rec.finalStatus === '지각';

      const votedAbsent = isAbsentStatus(lastVote.status);
      const resultAbsent = rec.finalStatus === '사유결석' || rec.finalStatus === '결석';

      if ((votedAttend && resultAttended) || (votedAbsent && resultAbsent)) {
        totalPromiseKeptSchedules += 1;
      }
    }

    if (noShowScheduleIds.has(s.id)) {
      noShowIds.push(s.id);
    }
  }

  const items: PassionItem[] = [];
  if (promiseTargetScheduleIds.length === 0) return items;

  if (earlyVoteIds.length > 0) {
    const delta = Math.min(
      PASSION_RULES.DELTAS.EARLY_VOTE_MAX,
      Math.round(earlyVoteIds.length * PASSION_RULES.DELTAS.EARLY_VOTE * 100) / 100
    );
    items.push({
      key: 'early_vote',
      label: PASSION_RULES.LABELS.EARLY_VOTE(earlyVoteIds.length),
      count: earlyVoteIds.length,
      delta,
      scheduleIds: earlyVoteIds,
    });
  }

  if (totalPromiseVotedSchedules > 0) {
    const rate = Math.round((totalPromiseKeptSchedules / totalPromiseVotedSchedules) * 100);
    if (rate >= 90) {
      items.push({
        key: 'vote_rate',
        label: PASSION_RULES.LABELS.VOTE_RATE(rate),
        count: 1,
        delta: PASSION_RULES.DELTAS.VOTE_RATE_HIGH,
        scheduleIds: promiseTargetScheduleIds,
      });
    } else if (rate >= 75) {
      items.push({
        key: 'vote_rate',
        label: PASSION_RULES.LABELS.VOTE_RATE(rate),
        count: 1,
        delta: PASSION_RULES.DELTAS.VOTE_RATE_MID,
        scheduleIds: promiseTargetScheduleIds,
      });
    }
  }

  if (noShowIds.length > 0) {
    items.push({
      key: 'noshow',
      label: PASSION_RULES.LABELS.NO_SHOW(noShowIds.length),
      count: noShowIds.length,
      delta: Math.round(noShowIds.length * PASSION_RULES.DELTAS.NO_SHOW * 100) / 100,
      scheduleIds: noShowIds,
    });
  }

  if (lateCancelIds.length > 0) {
    items.push({
      key: 'late_cancel',
      label: PASSION_RULES.LABELS.LATE_CANCEL(lateCancelIds.length),
      count: lateCancelIds.length,
      delta: Math.round(lateCancelIds.length * PASSION_RULES.DELTAS.LATE_CANCEL * 100) / 100,
      scheduleIds: lateCancelIds,
    });
  }

  return items;
}

export function calculateStageGroup(
  member: Member,
  schedules: Schedule[],
  memberLogs: RawAttendanceLog[],
  performanceCats: Set<string>,
  refTimeMs: number
): PassionItem[] {
  const oneYearAgoMs = refTimeMs - PASSION_RULES.STAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const stageAttendedIds: string[] = [];

  for (const s of schedules) {
    if (s.isCancelled || !s.category || !performanceCats.has(s.category)) continue;
    const sStartMs = getScheduleStartMs(s);
    if (sStartMs > refTimeMs || sStartMs < oneYearAgoMs) continue;

    const schedLogs = memberLogs.filter((l) => l.scheduleId === s.id);
    const rec = reconcileSingleMemberAttendance(member, s, schedLogs);
    if (rec.finalStatus === '출석' || rec.finalStatus === '수동인정') {
      stageAttendedIds.push(s.id);
    }
  }

  const items: PassionItem[] = [];
  if (stageAttendedIds.length > 0) {
    const delta = Math.min(
      PASSION_RULES.DELTAS.STAGE_MAX,
      Math.round(stageAttendedIds.length * PASSION_RULES.DELTAS.STAGE_ATTEND * 100) / 100
    );
    items.push({
      key: 'stage_attend',
      label: PASSION_RULES.LABELS.STAGE_ATTEND(stageAttendedIds.length),
      count: stageAttendedIds.length,
      delta,
      scheduleIds: stageAttendedIds,
    });
  }
  return items;
}
