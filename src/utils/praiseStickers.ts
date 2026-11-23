import type {
  BoundDeviceProfile,
  Member,
  MemberActivity,
  RawAttendanceLog,
  RSVPVote,
  Schedule,
} from '../types/rollbook';
import {
  isMemberRequiredForSchedule,
  resolveMergedMemberIds,
} from './attendanceStats';
import { getKSTDateString } from './date';
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
import { DEFAULT_PERFORMANCE_CATEGORIES } from './performanceCategories';
import {
  buildMemberScheduleRecords,
  type MemberScheduleRecord,
} from './memberRecords';

export * from './praiseStickerDefinitions';

/** 스티커 이미지 주소. Vite `base`(./)·GitHub Pages 하위 경로에서도 맞도록 BASE_URL을 앞에 붙인다. */
export function stickerImageUrl(image: string): string {
  return `${import.meta.env.BASE_URL}stickers/${image}.png`;
}

export interface EvaluatePraiseStickersParams {
  member: Member | BoundDeviceProfile;
  schedules: Schedule[];
  logs?: RawAttendanceLog[];
  rsvpVotes?: RSVPVote[];
  activity?: MemberActivity | null;
  performanceCategories?: string[];
  lateGraceMinutes?: number;
  allMembers?: Member[];
  now?: Date;
  isStaff?: boolean;
  scheduleRecords?: MemberScheduleRecord[];
}

export function evaluatePraiseStickers({
  member,
  schedules,
  logs = [],
  rsvpVotes = [],
  activity = null,
  performanceCategories = DEFAULT_PERFORMANCE_CATEGORIES,
  lateGraceMinutes = 10,
  allMembers = [],
  now = new Date(),
  isStaff,
  scheduleRecords,
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

  const allRecords =
    scheduleRecords ??
    buildMemberScheduleRecords({
      member: targetMember,
      members: allMembers,
      schedules,
      logs,
      rsvpVotes,
      now,
      lateGraceMinutes,
      includeArchived: true,
    });

  // Filter and sort schedules ascending chronologically
  const activeRecords = allRecords
    .filter((r) => !r.schedule.isCancelled)
    .sort((a, b) => a.date.localeCompare(b.date));

  const activeSchedules = activeRecords.map((r) => r.schedule);

  // Pre-calculate per-schedule attendance outcomes
  const scheduleOutcomes: ScheduleOutcome[] = activeRecords.map((r) => {
    const s = r.schedule;
    const isRequired = isMemberRequiredForSchedule(
      targetMember,
      r.date,
      s,
      aliasIds,
      allMembers
    );
    const isAttended = r.finalStatus === '출석' || r.finalStatus === '수동인정';
    const isLate = r.finalStatus === '지각';

    const startMin = parseClockMinutes(s.startTime || '19:30') ?? 19 * 60 + 30;
    const checkInMin = parseClockMinutes(r.checkInTime) ?? startMin;
    const isOnTime = isAttended && checkInMin <= startMin;
    const isEarly = isAttended && checkInMin <= startMin - 10;
    const isPerformance = Boolean(s.category && perfCats.has(s.category));

    return {
      schedule: s,
      rec: { finalStatus: r.finalStatus },
      isRequired,
      isAttended,
      isLate,
      isOnTime,
      isEarly,
      isPerformance,
      date: r.date,
      isPast: r.date <= todayStr,
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
  const promiseResults = evaluatePromiseBundle(
    activity,
    activeSchedules,
    scheduleOutcomes
  );
  for (const [k, v] of promiseResults) resultMap.set(k, v);

  // Bundles 4 & 5: 연습실 & 무대
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
