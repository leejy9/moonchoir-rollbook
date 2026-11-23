import type {
  AppConfig,
  Member,
  RawAttendanceLog,
  RSVPVote,
  RsvpEvent,
  Schedule,
} from '../types/rollbook';
import { resolveMergedMemberIds } from './attendanceStats';
import {
  PASSION_RULES,
  getScheduleStartMs,
  isAttendStatus,
  type PassionGroup,
  type PassionTemperatureResult,
} from './passionRules';
import {
  calculateAttendanceGroup,
  calculatePromiseGroup,
  calculateStageGroup,
} from './passionCalculators';
import {
  buildMemberScheduleRecords,
  type MemberScheduleRecord,
} from './memberRecords';

export * from './passionRules';

export interface ComputePassionTemperatureOptions {
  scheduleRecords?: MemberScheduleRecord[];
  rsvpVotes?: RSVPVote[];
  includeWeeklyDelta?: boolean;
}

function convertRsvpEventsToVotes(events: RsvpEvent[]): RSVPVote[] {
  const sorted = [...events].sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
  );
  const bySched = new Map<string, RsvpEvent>();
  for (const ev of sorted) {
    bySched.set(ev.scheduleId, ev);
  }
  return Array.from(bySched.values()).map((ev) => ({
    id: `vote_${ev.seq}`,
    scheduleId: ev.scheduleId,
    memberId: ev.memberId,
    memberName: '',
    part: 'SOPRANO',
    status: ev.status as 'ATTEND' | 'ABSENT',
    reason: '',
    timestamp: ev.occurredAt,
  }));
}

export function computePassionTemperature(
  member: Member,
  allMembers: Member[],
  schedules: Schedule[],
  logs: RawAttendanceLog[],
  rsvpEvents: RsvpEvent[],
  config?: Partial<AppConfig>,
  referenceDate?: Date,
  options?: ComputePassionTemperatureOptions
): PassionTemperatureResult {
  const refDate = referenceDate ?? new Date();
  const refTimeMs = refDate.getTime();

  const validMemberIds = resolveMergedMemberIds(member.id, allMembers);
  const memberRsvpEvents = rsvpEvents.filter((e) => validMemberIds.has(e.memberId));

  const performanceCats = new Set(config?.performanceCategories || ['연주']);

  // Single source of attendance status: buildMemberScheduleRecords
  const allRecords =
    options?.scheduleRecords ??
    buildMemberScheduleRecords({
      member,
      members: allMembers,
      schedules,
      logs,
      rsvpVotes: options?.rsvpVotes ?? convertRsvpEventsToVotes(rsvpEvents),
      now: refDate,
      lateGraceMinutes: config?.lateGraceMinutes ?? 10,
      includeArchived: false,
    });

  // 1. Qualifying records for calculation window
  const qualifyingRecords = allRecords
    .filter((r) => {
      if (r.schedule.isCancelled || r.schedule.isArchived) return false;
      if (r.finalStatus === '대기' || r.finalStatus === '미참' || r.finalStatus === '모수제외') return false;
      const sStartMs = getScheduleStartMs(r.schedule);
      if (sStartMs > refTimeMs) return false;
      return true;
    })
    .sort((a, b) => getScheduleStartMs(b.schedule) - getScheduleStartMs(a.schedule));

  const windowRecords = qualifyingRecords.slice(0, PASSION_RULES.WINDOW_SIZE);

  // 2. Identify no-shows (only non-backfill events considered, Spec V27)
  const noShowScheduleIds = new Set<string>();
  for (const r of windowRecords) {
    if (r.finalStatus === '결석') {
      const sStartMs = getScheduleStartMs(r.schedule);
      const eventsBeforeStart = memberRsvpEvents
        .filter(
          (e) =>
            e.scheduleId === r.id &&
            e.action !== 'backfill' &&
            new Date(e.occurredAt).getTime() <= sStartMs
        )
        .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());

      const lastVote = eventsBeforeStart[eventsBeforeStart.length - 1];
      if (lastVote && isAttendStatus(lastVote.status)) {
        noShowScheduleIds.add(r.id);
      }
    }
  }

  // 3. Calculate 3 groups
  const { items: attendanceItems } = calculateAttendanceGroup(
    windowRecords,
    noShowScheduleIds
  );

  const promiseItems = calculatePromiseGroup(
    windowRecords,
    memberRsvpEvents,
    noShowScheduleIds
  );

  const stageItems = calculateStageGroup(
    allRecords,
    performanceCats,
    refTimeMs
  );

  // 4. Assemble groups & final values
  const groups: PassionGroup[] = [];
  const attTotal =
    Math.round(attendanceItems.reduce((acc, it) => acc + it.delta, 0) * 100) / 100;
  groups.push({
    key: 'attendance',
    title: '출석',
    totalDelta: attTotal,
    items: attendanceItems,
  });

  if (promiseItems.length > 0) {
    const promTotal =
      Math.round(promiseItems.reduce((acc, it) => acc + it.delta, 0) * 100) / 100;
    groups.push({
      key: 'promise',
      title: '약속',
      totalDelta: promTotal,
      items: promiseItems,
    });
  }

  if (stageItems.length > 0) {
    const stageTotal =
      Math.round(stageItems.reduce((acc, it) => acc + it.delta, 0) * 100) / 100;
    groups.push({
      key: 'stage',
      title: '공연',
      totalDelta: stageTotal,
      items: stageItems,
    });
  }

  const allDeltasSum = groups.reduce((acc, g) => acc + g.totalDelta, 0);
  const rawValue = PASSION_RULES.BASE_TEMPERATURE + allDeltasSum;
  const clampedValue = Math.max(
    PASSION_RULES.MIN_TEMPERATURE,
    Math.min(PASSION_RULES.MAX_TEMPERATURE, rawValue)
  );
  const finalValue = Math.round(clampedValue * 10) / 10;

  // Weekly delta: recalculate with refDate - 7 days (R3)
  let weeklyDelta = 0;
  const shouldCalcWeekly = options?.includeWeeklyDelta ?? (!referenceDate);
  if (shouldCalcWeekly) {
    const sevenDaysAgo = new Date(refTimeMs - 7 * 24 * 60 * 60 * 1000);
    const pastResult = computePassionTemperature(
      member,
      allMembers,
      schedules,
      logs,
      rsvpEvents,
      config,
      sevenDaysAgo,
      { ...options, includeWeeklyDelta: false, scheduleRecords: undefined }
    );
    weeklyDelta = Math.round((finalValue - pastResult.value) * 10) / 10;
  }

  return {
    value: finalValue,
    weeklyDelta,
    windowSize: windowRecords.length,
    groups,
  };
}
