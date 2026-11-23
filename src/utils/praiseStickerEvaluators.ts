import type {
  ListenDailyEntry,
  ListenPerPieceEntry,
  Member,
  MemberActivity,
  RawAttendanceLog,
  RsvpEvent,
  Schedule,
} from '../types/rollbook';
import { addDaysKST, getKSTDateString, parseKSTDate } from './date';
import { computeDaysTogether } from './memberProgress';

export interface ScheduleOutcome {
  schedule: Schedule;
  rec: { finalStatus: string };
  isRequired: boolean;
  isAttended: boolean;
  isLate: boolean;
  isOnTime: boolean;
  isEarly: boolean;
  isPerformance: boolean;
  date: string;
  isPast: boolean;
}

export type StickerResult = { earned: boolean; earnedOn?: string; progress: number };

export function evaluatePerseveranceBundle(
  targetMember: Member,
  memberLogs: RawAttendanceLog[],
  scheduleOutcomes: ScheduleOutcome[],
  todayStr: string
): Map<string, StickerResult> {
  const map = new Map<string, StickerResult>();
  const attendedOutcomes = scheduleOutcomes.filter((o) => o.isAttended && o.isPast);
  const attCount = attendedOutcomes.length;

  map.set('first-step', { earned: attCount >= 1, earnedOn: attendedOutcomes[0]?.date, progress: Math.min(attCount, 1) });
  map.set('att-10', { earned: attCount >= 10, earnedOn: attendedOutcomes[9]?.date, progress: Math.min(attCount, 10) / 10 });
  map.set('att-50', { earned: attCount >= 50, earnedOn: attendedOutcomes[49]?.date, progress: Math.min(attCount, 50) / 50 });
  map.set('att-100', { earned: attCount >= 100, earnedOn: attendedOutcomes[99]?.date, progress: Math.min(attCount, 100) / 100 });

  // full-month
  const monthMap = new Map<string, ScheduleOutcome[]>();
  for (const o of scheduleOutcomes) {
    if (!o.isPast || !o.isRequired) continue;
    const ym = o.date.slice(0, 7);
    const list = monthMap.get(ym) || [];
    list.push(o);
    monthMap.set(ym, list);
  }
  let fullMonthEarned = false;
  let fullMonthDate: string | undefined;
  for (const [_, items] of monthMap) {
    if (items.length >= 2) {
      const allValid = items.every((i) =>
        ['출석', '수동인정', '지각', '사유결석'].includes(i.rec.finalStatus)
      );
      const hasAttend = items.some((i) => i.isAttended);
      if (allValid && hasAttend) {
        fullMonthEarned = true;
        fullMonthDate = items[items.length - 1].date;
        break;
      }
    }
  }
  map.set('full-month', {
    earned: fullMonthEarned,
    earnedOn: fullMonthDate,
    progress: fullMonthEarned ? 1 : 0,
  });

  // anniv-1y
  const daysTogether = computeDaysTogether(targetMember, memberLogs, todayStr);
  let anniv1yDate: string | undefined;
  if (daysTogether >= 366) {
    const baseDate =
      targetMember.joinedAt ||
      (memberLogs[0] ? getKSTDateString(parseKSTDate(memberLogs[0].timestamp)) : todayStr);
    anniv1yDate = addDaysKST(baseDate, 365);
  }
  map.set('anniv-1y', {
    earned: daysTogether >= 366,
    earnedOn: anniv1yDate,
    progress: Math.min(daysTogether, 366) / 366,
  });

  return map;
}

export function evaluatePunctualityBundle(
  scheduleOutcomes: ScheduleOutcome[]
): Map<string, StickerResult> {
  const map = new Map<string, StickerResult>();
  let onTimeStreak = 0;
  let maxOnTimeStreak = 0;
  let ontime5Date: string | undefined;
  let ontime10Date: string | undefined;
  let earlyCount = 0;
  let early5Date: string | undefined;
  let early20Date: string | undefined;

  let trackingPostLate = false;
  let postLateStreak = 0;
  let maxPostLate = 0;
  let backOnTimeEarned = false;
  let backOnTimeDate: string | undefined;

  for (const o of scheduleOutcomes) {
    if (!o.isPast) continue;
    if (o.isEarly) {
      earlyCount += 1;
      if (earlyCount === 5 && !early5Date) early5Date = o.date;
      if (earlyCount === 20 && !early20Date) early20Date = o.date;
    }

    if (o.isRequired) {
      if (o.rec.finalStatus === '사유결석') {
        // Skip
      } else if (o.isOnTime) {
        onTimeStreak += 1;
        if (onTimeStreak > maxOnTimeStreak) maxOnTimeStreak = onTimeStreak;
        if (onTimeStreak === 5 && !ontime5Date) ontime5Date = o.date;
        if (onTimeStreak === 10 && !ontime10Date) ontime10Date = o.date;
      } else {
        onTimeStreak = 0;
      }

      // back-on-time: 지각 바로 다음부터 정시 3연속
      if (o.isLate) {
        trackingPostLate = true;
        postLateStreak = 0;
      } else if (trackingPostLate) {
        if (o.rec.finalStatus === '사유결석') {
          // Skip
        } else if (o.isOnTime) {
          postLateStreak += 1;
          if (postLateStreak > maxPostLate) maxPostLate = postLateStreak;
          if (postLateStreak === 3 && !backOnTimeEarned) {
            backOnTimeEarned = true;
            backOnTimeDate = o.date;
          }
        } else {
          trackingPostLate = false;
          postLateStreak = 0;
        }
      }
    }
  }

  map.set('ontime-5', {
    earned: maxOnTimeStreak >= 5,
    earnedOn: ontime5Date,
    progress: Math.min(maxOnTimeStreak, 5) / 5,
  });
  map.set('ontime-10', {
    earned: maxOnTimeStreak >= 10,
    earnedOn: ontime10Date,
    progress: Math.min(maxOnTimeStreak, 10) / 10,
  });
  map.set('early-5', {
    earned: earlyCount >= 5,
    earnedOn: early5Date,
    progress: Math.min(earlyCount, 5) / 5,
  });
  map.set('early-20', {
    earned: earlyCount >= 20,
    earnedOn: early20Date,
    progress: Math.min(earlyCount, 20) / 20,
  });
  map.set('back-on-time', {
    earned: backOnTimeEarned,
    earnedOn: backOnTimeDate,
    progress: backOnTimeEarned ? 1 : Math.min(maxPostLate, 3) / 3,
  });

  return map;
}

export function evaluatePromiseBundle(
  activity: MemberActivity | null,
  activeSchedules: Schedule[],
  scheduleOutcomes: ScheduleOutcome[]
): Map<string, StickerResult> {
  const map = new Map<string, StickerResult>();
  const events: RsvpEvent[] = activity?.rsvpEvents || [];
  const validEvents = events.filter((e: RsvpEvent) => e.action !== 'backfill');

  map.set('first-vote', {
    earned: validEvents.length >= 1,
    earnedOn: validEvents[0] ? getKSTDateString(parseKSTDate(validEvents[0].occurredAt)) : undefined,
    progress: validEvents.length >= 1 ? 1 : 0,
  });

  // quick-10: 24시간 전 투표 누적 10
  let quickCount = 0;
  let quick10Date: string | undefined;
  for (const e of validEvents) {
    const sched = activeSchedules.find((s) => s.id === e.scheduleId);
    if (!sched) continue;
    const startMs = parseKSTDate(`${sched.date}T${sched.startTime || '19:30'}:00+09:00`).getTime();
    const eventMs = parseKSTDate(e.occurredAt).getTime();
    if (eventMs <= startMs - 24 * 60 * 60 * 1000) {
      quickCount += 1;
      if (quickCount === 10 && !quick10Date) {
        quick10Date = getKSTDateString(parseKSTDate(e.occurredAt));
      }
    }
  }
  map.set('quick-10', {
    earned: quickCount >= 10,
    earnedOn: quick10Date,
    progress: Math.min(quickCount, 10) / 10,
  });

  // kept-10: 약속 지킴 10연속
  let keptStreak = 0;
  let maxKeptStreak = 0;
  let kept10Date: string | undefined;
  for (const o of scheduleOutcomes) {
    if (!o.isPast) continue;
    const schedEvents = validEvents.filter((e: RsvpEvent) => e.scheduleId === o.schedule.id);
    if (schedEvents.length === 0) continue;
    const lastEvent = schedEvents[schedEvents.length - 1];
    const isKept =
      (lastEvent.status === 'ATTEND' && (o.isAttended || o.isLate)) ||
      (lastEvent.status === 'ABSENT' &&
        (o.rec.finalStatus === '사유결석' || o.rec.finalStatus === '결석'));

    if (isKept) {
      keptStreak += 1;
      if (keptStreak > maxKeptStreak) maxKeptStreak = keptStreak;
      if (keptStreak === 10 && !kept10Date) kept10Date = o.date;
    } else {
      keptStreak = 0;
    }
  }
  map.set('kept-10', {
    earned: maxKeptStreak >= 10,
    earnedOn: kept10Date,
    progress: Math.min(maxKeptStreak, 10) / 10,
  });

  // all-voted-month
  const monthMap = new Map<string, ScheduleOutcome[]>();
  for (const o of scheduleOutcomes) {
    if (!o.isPast || !o.isRequired) continue;
    const ym = o.date.slice(0, 7);
    const list = monthMap.get(ym) || [];
    list.push(o);
    monthMap.set(ym, list);
  }
  let allVotedEarned = false;
  let allVotedDate: string | undefined;
  for (const [_, items] of monthMap) {
    if (items.length >= 2) {
      const allVoted = items.every((i) => {
        const schedEvts = validEvents.filter((e: RsvpEvent) => e.scheduleId === i.schedule.id);
        if (schedEvts.length === 0) return false;
        const startMs = parseKSTDate(
          `${i.schedule.date}T${i.schedule.startTime || '19:30'}:00+09:00`
        ).getTime();
        return schedEvts.some((e: RsvpEvent) => parseKSTDate(e.occurredAt).getTime() < startMs);
      });
      if (allVoted) {
        allVotedEarned = true;
        allVotedDate = items[items.length - 1].date;
        break;
      }
    }
  }
  map.set('all-voted-month', {
    earned: allVotedEarned,
    earnedOn: allVotedDate,
    progress: allVotedEarned ? 1 : 0,
  });

  return map;
}

export function evaluateStudioAndStageBundles(
  activity: MemberActivity | null,
  scheduleOutcomes: ScheduleOutcome[],
  activeSchedules: Schedule[],
  perfCats: Set<string>,
  todayStr: string
): Map<string, StickerResult> {
  const map = new Map<string, StickerResult>();

  // Studio
  const listenFirstAt = activity?.listen?.firstAt;
  map.set('first-play', {
    earned: Boolean(listenFirstAt),
    earnedOn: listenFirstAt ? getKSTDateString(parseKSTDate(listenFirstAt)) : undefined,
    progress: listenFirstAt ? 1 : 0,
  });

  const dailyEntries: ListenDailyEntry[] = activity?.listen?.daily || [];
  const dailySorted = [...dailyEntries].sort((a, b) => a.date.localeCompare(b.date));
  let cumSeconds = 0;
  let listen1hDate: string | undefined;
  let listen5hDate: string | undefined;
  let listen20hDate: string | undefined;
  for (const d of dailySorted) {
    cumSeconds += d.seconds;
    if (cumSeconds >= 3600 && !listen1hDate) listen1hDate = d.date;
    if (cumSeconds >= 18000 && !listen5hDate) listen5hDate = d.date;
    if (cumSeconds >= 72000 && !listen20hDate) listen20hDate = d.date;
  }
  map.set('listen-1h', {
    earned: cumSeconds >= 3600,
    earnedOn: listen1hDate,
    progress: Math.min(cumSeconds, 3600) / 3600,
  });
  map.set('listen-5h', {
    earned: cumSeconds >= 18000,
    earnedOn: listen5hDate,
    progress: Math.min(cumSeconds, 18000) / 18000,
  });
  map.set('listen-20h', {
    earned: cumSeconds >= 72000,
    earnedOn: listen20hDate,
    progress: Math.min(cumSeconds, 72000) / 72000,
  });

  const pieceEntries: ListenPerPieceEntry[] = activity?.listen?.perPiece || [];
  const piecesWith60 = pieceEntries
    .filter((p: ListenPerPieceEntry) => Boolean(p.reached60At))
    .sort((a: ListenPerPieceEntry, b: ListenPerPieceEntry) =>
      (a.reached60At || '').localeCompare(b.reached60At || '')
    );
  map.set('explorer-10', {
    earned: piecesWith60.length >= 10,
    earnedOn: piecesWith60[9]?.reached60At
      ? getKSTDateString(parseKSTDate(piecesWith60[9].reached60At))
      : undefined,
    progress: Math.min(piecesWith60.length, 10) / 10,
  });

  // Stage
  const perfAttended = scheduleOutcomes.filter((o) => o.isPerformance && o.isAttended && o.isPast);
  map.set('first-stage', { earned: perfAttended.length >= 1, earnedOn: perfAttended[0]?.date, progress: Math.min(perfAttended.length, 1) });
  map.set('stage-3', { earned: perfAttended.length >= 3, earnedOn: perfAttended[2]?.date, progress: Math.min(perfAttended.length, 3) / 3 });
  map.set('stage-10', { earned: perfAttended.length >= 10, earnedOn: perfAttended[9]?.date, progress: Math.min(perfAttended.length, 10) / 10 });

  // stage-ready
  let stageReadyEarned = false;
  let stageReadyDate: string | undefined;
  const perfSchedules = activeSchedules.filter(
    (s) => s.category && perfCats.has(s.category) && s.date <= todayStr
  );
  for (const ps of perfSchedules) {
    const startDate28 = addDaysKST(ps.date, -28);
    const priorMandatory = scheduleOutcomes.filter(
      (o) => o.isRequired && o.date >= startDate28 && o.date < ps.date
    );
    if (priorMandatory.length >= 2) {
      const allAttendedOrLate = priorMandatory.every(
        (o) =>
          o.rec.finalStatus === '출석' ||
          o.rec.finalStatus === '수동인정' ||
          o.rec.finalStatus === '지각'
      );
      if (allAttendedOrLate) {
        stageReadyEarned = true;
        stageReadyDate = ps.date;
        break;
      }
    }
  }
  map.set('stage-ready', {
    earned: stageReadyEarned,
    earnedOn: stageReadyDate,
    progress: stageReadyEarned ? 1 : 0,
  });

  return map;
}
