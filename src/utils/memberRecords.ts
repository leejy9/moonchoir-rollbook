import type {
  AttendanceStatus,
  BoundDeviceProfile,
  Member,
  RawAttendanceLog,
  RSVPStatus,
  RSVPVote,
  Schedule,
  ScheduleCategory,
} from '../types/rollbook';
import { reconcileSingleMemberAttendance, resolveMergedMemberIds } from './attendanceStats';
import { getKSTClock, getKSTDateString, normalizeToKSTTimestamp } from './date';

export interface MemberScheduleRecord {
  id: string;
  schedule: Schedule;
  title: string;
  date: string;
  category: ScheduleCategory | string;
  voteStatus: RSVPStatus | null;
  voteReason: string;
  voteTimestamp: string;
  isAttended: boolean;
  finalStatus: AttendanceStatus | '대기';
  checkInTime: string;
  isPast: boolean;
  isToday: boolean;
  isExempt: boolean;
}

export interface BuildMemberScheduleRecordsParams {
  member: Member | BoundDeviceProfile;
  members: Member[];
  schedules: Schedule[];
  logs?: RawAttendanceLog[];
  rsvpVotes?: RSVPVote[];
  now?: Date;
  includeArchived?: boolean;
  lateGraceMinutes?: number;
}

/**
 * Pure function to build per-session attendance reconciliation records for a single member.
 * Used by MemberPortalModal and ProfileTab.
 */
export function buildMemberScheduleRecords({
  member,
  members,
  schedules,
  logs = [],
  rsvpVotes = [],
  now = new Date(),
  includeArchived = false,
  lateGraceMinutes = 10,
}: BuildMemberScheduleRecordsParams): MemberScheduleRecord[] {
  const memberId = 'memberId' in member ? member.memberId : member.id;
  const memberName = 'name' in member ? member.name : '';
  const memberPart = 'part' in member ? member.part : '단원';
  const phoneLast4 = 'phoneLast4' in member ? member.phoneLast4 : '';

  const targetMember: Member =
    members.find((m) => m.id === memberId) || {
      id: memberId,
      name: memberName,
      part: memberPart,
      phoneLast4,
      role: 'MEMBER',
      status: 'ACTIVE',
      createdAt: '',
      joinedAt: '',
      memberStatus: '정단원',
    };

  const aliasIds = resolveMergedMemberIds(targetMember.id, members);
  const todayStr = getKSTDateString(now);

  // Filter out cancelled schedules, and optionally filter archived
  const filtered = schedules.filter((s) => {
    if (s.isCancelled) return false;
    if (!includeArchived && s.isArchived) return false;
    return true;
  });

  // Sort descending by date (latest first)
  const sortedSchedules = [...filtered].sort((a, b) => b.date.localeCompare(a.date));

  return sortedSchedules.map((s) => {
    const memberRsvp = rsvpVotes.find((v) => aliasIds.has(v.memberId) && v.scheduleId === s.id);
    const memberLogs = logs.filter((l) => aliasIds.has(l.memberId) && l.scheduleId === s.id);

    const rec = reconcileSingleMemberAttendance(
      targetMember,
      s,
      memberLogs,
      memberRsvp,
      lateGraceMinutes
    );

    const isPast = s.date < todayStr;
    const isToday = s.date === todayStr;
    const isExempt = rec?.finalStatus === '미참' || rec?.finalStatus === '모수제외';

    let checkInTime = '-';
    const isAttended =
      rec?.finalStatus === '출석' || rec?.finalStatus === '수동인정' || rec?.finalStatus === '지각';

    if (rec?.checkInTime) {
      checkInTime = getKSTClock(rec.checkInTime) || rec.checkInTime;
    } else if (rec?.finalStatus === '수동인정') {
      checkInTime = '수동인정';
    }

    const voteTimestamp = memberRsvp?.timestamp ? normalizeToKSTTimestamp(memberRsvp.timestamp) : '';

    let finalStatus: AttendanceStatus | '대기';
    if (isAttended) {
      finalStatus = rec?.finalStatus || '출석';
    } else if (isExempt) {
      finalStatus = rec?.finalStatus || '미참';
    } else if (isPast) {
      finalStatus = rec?.finalStatus || '결석';
    } else {
      finalStatus = '대기';
    }

    return {
      id: s.id,
      schedule: s,
      title: s.title,
      date: s.date,
      category: s.category || '정기연습',
      voteStatus: rec?.rsvpStatus && rec.rsvpStatus !== 'UNVOTED' ? rec.rsvpStatus : null,
      voteReason: rec?.rsvpReason || '',
      voteTimestamp,
      isAttended,
      finalStatus,
      checkInTime,
      isPast,
      isToday,
      isExempt,
    };
  });
}
