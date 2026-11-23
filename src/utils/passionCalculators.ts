import type { RsvpEvent } from '../types/rollbook';
import type { MemberScheduleRecord } from './memberRecords';
import {
  PASSION_RULES,
  getScheduleStartMs,
  isAbsentStatus,
  isAttendStatus,
  parseClockMinutes,
  type PassionItem,
} from './passionRules';

export function calculateAttendanceGroup(
  windowRecords: MemberScheduleRecord[],
  noShowScheduleIds: Set<string>
): { items: PassionItem[]; onTimeStreak: number } {
  const onTimeIds: string[] = [];
  const earlyIds: string[] = [];
  const lateIds: string[] = [];
  const absentIds: string[] = [];

  for (const r of windowRecords) {
    const startMin = parseClockMinutes(r.schedule.startTime || '19:30') ?? 19 * 60 + 30;

    if (r.finalStatus === '출석' || r.finalStatus === '수동인정') {
      const checkInMin = parseClockMinutes(r.checkInTime) ?? startMin;

      if (checkInMin <= startMin) {
        onTimeIds.push(r.id);
        if (checkInMin <= startMin - 10) {
          earlyIds.push(r.id);
        }
      }
    } else if (r.finalStatus === '지각') {
      lateIds.push(r.id);
    } else if (r.finalStatus === '결석') {
      if (!noShowScheduleIds.has(r.id)) {
        absentIds.push(r.id);
      }
    }
  }

  // Consecutive on-time streak
  let onTimeStreak = 0;
  for (const r of windowRecords) {
    const startMin = parseClockMinutes(r.schedule.startTime || '19:30') ?? 19 * 60 + 30;

    if (r.finalStatus === '사유결석') {
      continue;
    }

    if (r.finalStatus === '출석' || r.finalStatus === '수동인정') {
      const checkInMin = parseClockMinutes(r.checkInTime) ?? startMin;
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
  windowRecords: MemberScheduleRecord[],
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

  for (const r of windowRecords) {
    const s = r.schedule;
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

      const votedAttend = isAttendStatus(lastVote.status);
      const resultAttended =
        r.finalStatus === '출석' ||
        r.finalStatus === '수동인정' ||
        r.finalStatus === '지각';

      const votedAbsent = isAbsentStatus(lastVote.status);
      const resultAbsent = r.finalStatus === '사유결석' || r.finalStatus === '결석';

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
  allRecords: MemberScheduleRecord[],
  performanceCats: Set<string>,
  refTimeMs: number
): PassionItem[] {
  const oneYearAgoMs = refTimeMs - PASSION_RULES.STAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const stageAttendedIds: string[] = [];

  for (const r of allRecords) {
    const s = r.schedule;
    if (s.isCancelled || s.isArchived || !s.category || !performanceCats.has(s.category)) continue;
    const sStartMs = getScheduleStartMs(s);
    if (sStartMs > refTimeMs || sStartMs < oneYearAgoMs) continue;

    if (r.finalStatus === '출석' || r.finalStatus === '수동인정' || r.finalStatus === '지각') {
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
