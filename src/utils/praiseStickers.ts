import type {
  BoundDeviceProfile,
  Member,
  MemberActivity,
  RawAttendanceLog,
  Schedule,
} from '../types/rollbook';
import {
  isMemberRequiredForSchedule,
  reconcileSingleMemberAttendance,
  resolveMergedMemberIds,
} from './attendanceStats';
import { getKSTClock, getKSTDateString } from './date';
import { parseClockMinutes } from './passionRules';
import {
  STICKER_DEFINITIONS,
  type EvaluatedSticker,
} from './praiseStickerDefinitions';
import {
  evaluatePerseveranceBundle,
  evaluatePromiseBundle,
  evaluatePunctualityBundle,
  evaluateStudioAndStageBundles,
  type ScheduleOutcome,
  type StickerResult,
} from './praiseStickerEvaluators';
import { isActivityStaff } from './staff';

export * from './praiseStickerDefinitions';

export interface EvaluatePraiseStickersParams {
  member: Member | BoundDeviceProfile;
  schedules: Schedule[];
  logs?: RawAttendanceLog[];
  activity?: MemberActivity | null;
  performanceCategories?: string[];
  allMembers?: Member[];
  now?: Date;
  isStaff?: boolean;
}

export function evaluatePraiseStickers({
  member,
  schedules,
  logs = [],
  activity = null,
  performanceCategories = ['연주', '녹음'],
  allMembers = [],
  now = new Date(),
  isStaff,
}: EvaluatePraiseStickersParams): EvaluatedSticker[] {
  const staff = isStaff ?? isActivityStaff(member, null, allMembers);
  const targetMember: Member =
    'id' in member && typeof member.id === 'string'
      ? (member as Member)
      : (allMembers.find((m) => m.id === (member as BoundDeviceProfile).memberId) || {
          id: (member as BoundDeviceProfile).memberId,
          name: member.name,
          part: member.part || '소프라노',
          memberStatus: '정단원',
          role: 'MEMBER',
          phone: '',
          phoneLast4: '',
          createdAt: '',
          status: 'ACTIVE',
          joinedAt: '',
        });

  const todayStr = getKSTDateString(now);
  const aliasIds = resolveMergedMemberIds(targetMember.id, allMembers);
  const memberLogs = logs.filter((l) => aliasIds.has(l.memberId));
  const perfCats = new Set(performanceCategories);

  // Filter and sort schedules ascending chronologically
  const activeSchedules = schedules
    .filter((s) => !s.isCancelled && !s.isArchived)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Pre-calculate per-schedule attendance outcomes
  const scheduleOutcomes: ScheduleOutcome[] = activeSchedules.map((s) => {
    const sLogs = memberLogs.filter((l) => l.scheduleId === s.id);
    const rec = reconcileSingleMemberAttendance(targetMember, s, sLogs);
    const isRequired = isMemberRequiredForSchedule(targetMember, s.date, s);
    const isAttended = rec.finalStatus === '출석' || rec.finalStatus === '수동인정';
    const isLate = rec.finalStatus === '지각';

    const startMin = parseClockMinutes(s.startTime || '19:30') ?? 19 * 60 + 30;
    const checkInLog = sLogs[sLogs.length - 1];
    const checkInClock = checkInLog ? getKSTClock(checkInLog.timestamp) : s.startTime;
    const checkInMin = parseClockMinutes(checkInClock) ?? startMin;
    const isOnTime = isAttended && checkInMin <= startMin;
    const isEarly = isAttended && checkInMin <= startMin - 10;
    const isPerformance = Boolean(s.category && perfCats.has(s.category));

    return {
      schedule: s,
      rec,
      isRequired,
      isAttended,
      isLate,
      isOnTime,
      isEarly,
      isPerformance,
      date: s.date,
      isPast: s.date <= todayStr,
    };
  });

  const resultMap = new Map<string, StickerResult>();

  // Bundle 1: 꾸준함
  const perseveranceResults = evaluatePerseveranceBundle(
    targetMember,
    memberLogs,
    scheduleOutcomes,
    todayStr
  );
  for (const [k, v] of perseveranceResults) resultMap.set(k, v);

  // Bundle 2: 시간 약속
  const punctualityResults = evaluatePunctualityBundle(scheduleOutcomes);
  for (const [k, v] of punctualityResults) resultMap.set(k, v);

  // Bundle 3: 약속
  const promiseResults = evaluatePromiseBundle(activity, activeSchedules, scheduleOutcomes);
  for (const [k, v] of promiseResults) resultMap.set(k, v);

  // Bundle 4 & 5: 연습실 & 무대
  const studioAndStageResults = evaluateStudioAndStageBundles(
    activity,
    scheduleOutcomes,
    activeSchedules,
    perfCats,
    todayStr
  );
  for (const [k, v] of studioAndStageResults) resultMap.set(k, v);

  // Filter definitions for staff if applicable
  const defs = staff
    ? STICKER_DEFINITIONS.filter((d) => d.staffEligible)
    : STICKER_DEFINITIONS;

  return defs.map((def) => {
    const res = resultMap.get(def.id) || { earned: false, progress: 0 };
    return {
      ...def,
      earned: res.earned,
      earnedOn: res.earnedOn,
      progress: Math.round(res.progress * 100) / 100,
    };
  });
}
