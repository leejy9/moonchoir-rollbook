import type {
  AppConfig,
  Member,
  RawAttendanceLog,
  RsvpEvent,
  Schedule,
} from '../types/rollbook';
import {
  isMemberRequiredForSchedule,
  reconcileSingleMemberAttendance,
  resolveMergedMemberIds,
} from './attendanceStats';
import { getKSTDateString } from './date';
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

export * from './passionRules';

export function computePassionTemperature(
  member: Member,
  allMembers: Member[],
  schedules: Schedule[],
  logs: RawAttendanceLog[],
  rsvpEvents: RsvpEvent[],
  config?: Partial<AppConfig>,
  referenceDate?: Date
): PassionTemperatureResult {
  const refDate = referenceDate ?? new Date();
  const refDateStr = getKSTDateString(refDate);
  const refTimeMs = refDate.getTime();

  const validMemberIds = resolveMergedMemberIds(member.id, allMembers);
  const memberLogs = logs.filter((l) => validMemberIds.has(l.memberId));
  const memberRsvpEvents = rsvpEvents.filter((e) => validMemberIds.has(e.memberId));

  const performanceCats = new Set(config?.performanceCategories || ['연주']);

  // 1. Qualifying schedules for calculation window
  const qualifyingSchedules = schedules
    .filter((s) => {
      if (s.isCancelled) return false;
      if (s.date > refDateStr) return false;

      const schedLogs = memberLogs.filter((l) => l.scheduleId === s.id);
      const isMandatory = isMemberRequiredForSchedule(member, s.date, s);
      const hasCheckedIn = schedLogs.length > 0;
      return isMandatory || hasCheckedIn;
    })
    .sort((a, b) => {
      const msA = getScheduleStartMs(a);
      const msB = getScheduleStartMs(b);
      return msB - msA;
    });

  const windowSchedules = qualifyingSchedules.slice(0, PASSION_RULES.WINDOW_SIZE);

  // 2. Identify no-shows
  const noShowScheduleIds = new Set<string>();
  for (const s of windowSchedules) {
    const schedLogs = memberLogs.filter((l) => l.scheduleId === s.id);
    const rec = reconcileSingleMemberAttendance(member, s, schedLogs);

    if (rec.finalStatus === '결석') {
      const sStartMs = getScheduleStartMs(s);
      const eventsBeforeStart = memberRsvpEvents
        .filter((e) => e.scheduleId === s.id && new Date(e.occurredAt).getTime() <= sStartMs)
        .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());

      const lastVote = eventsBeforeStart[eventsBeforeStart.length - 1];
      if (lastVote && isAttendStatus(lastVote.status)) {
        noShowScheduleIds.add(s.id);
      }
    }
  }

  // 3. Calculate 3 groups
  const { items: attendanceItems } = calculateAttendanceGroup(
    member,
    windowSchedules,
    memberLogs,
    noShowScheduleIds
  );

  const promiseItems = calculatePromiseGroup(
    member,
    windowSchedules,
    memberLogs,
    memberRsvpEvents,
    noShowScheduleIds
  );

  const stageItems = calculateStageGroup(
    member,
    schedules,
    memberLogs,
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

  // Weekly delta: recalculate with refDate - 7 days
  let weeklyDelta = 0;
  if (!referenceDate) {
    const sevenDaysAgo = new Date(refTimeMs - 7 * 24 * 60 * 60 * 1000);
    const pastResult = computePassionTemperature(
      member,
      allMembers,
      schedules,
      logs,
      rsvpEvents,
      config,
      sevenDaysAgo
    );
    weeklyDelta = Math.round((finalValue - pastResult.value) * 10) / 10;
  }

  return {
    value: finalValue,
    weeklyDelta,
    windowSize: windowSchedules.length,
    groups,
  };
}
