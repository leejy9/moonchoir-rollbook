import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { sheetsService } from '../../services/sheets';
import type {
  AppConfig,
  BoundDeviceProfile,
  Member,
  MemberActivity,
  RawAttendanceLog,
  RSVPVote,
  Schedule,
} from '../../types/rollbook';
import { resolveMemberIdentity } from '../../utils/memberIdentity';
import { buildMemberScheduleRecords, type MemberScheduleRecord } from '../../utils/memberRecords';
import { evaluatePraiseStickers } from '../../utils/praiseStickers';
import type { EvaluatedSticker } from '../../utils/praiseStickerDefinitions';
import { isActivityStaff } from '../../utils/staff';
import { isStickerDataReady } from './useSeenStickers';

export interface MemberActivityModel {
  currentMember: Member;
  members: Member[];
  config: AppConfig;
  currentNow: Date;
  schedules: Schedule[];
  logs: RawAttendanceLog[];
  rsvpVotes: RSVPVote[];
  isStaff: boolean;
  scheduleRecords: MemberScheduleRecord[];
  activity: MemberActivity | null;
  evaluatedStickers: EvaluatedSticker[];
  isDataReady: boolean;
  lastSyncedAt: number;
}

const FALLBACK_MEMBER: Member = {
  id: '',
  name: '단원',
  part: '소프라노',
  phoneLast4: '',
  role: 'MEMBER',
  status: 'ACTIVE',
  createdAt: '',
  joinedAt: '',
  memberStatus: '정단원',
};

/**
 * 단원 활동·스티커 단일 모델 훅 (R11-4).
 * App에서 한 번만 호출하고 ProfileTab·뉴스·축하가 결과를 공유한다.
 */
export function useMemberActivityModel(
  profile: BoundDeviceProfile | null,
  activityRefreshSignal = 0
): MemberActivityModel {
  const [activity, setActivity] = useState<MemberActivity | null>(null);
  const [currentNow, setCurrentNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentNow(new Date()), 10000);
    return () => clearInterval(timer);
  }, []);

  const syncState = useSyncExternalStore(
    (listener) => sheetsService.subscribeSync(listener),
    () => sheetsService.getSyncState(),
    () => sheetsService.getSyncState()
  );

  const members = sheetsService.getMembers(true, true);
  const config = sheetsService.getConfig();

  const currentMember = useMemo((): Member => {
    if (!profile) return FALLBACK_MEMBER;
    const canonicalId = resolveMemberIdentity(profile.memberId, members).canonicalId;
    const found = members.find((m) => m.id === canonicalId);
    if (found) return found;
    return {
      id: profile.memberId,
      name: profile.name,
      part: profile.part,
      phoneLast4: profile.phoneLast4,
      role: 'MEMBER',
      status: 'ACTIVE',
      createdAt: '',
      joinedAt: '',
      memberStatus: '정단원',
    };
  }, [members, profile]);

  const activityAliasIds = useMemo(() => {
    if (!profile) return [];
    return resolveMemberIdentity(currentMember.id, members).aliasIds;
  }, [profile, currentMember.id, members]);
  const activityAliasIdsKey = activityAliasIds.join(',');

  // 활동 조회는 lastSyncedAt 변경 때와 출석 직후(activityRefreshSignal)에만 수행한다 (R11-4).
  useEffect(() => {
    if (!profile || activityAliasIds.length === 0) return;
    let isMounted = true;
    const ids = activityAliasIdsKey ? activityAliasIdsKey.split(',') : [currentMember.id];
    sheetsService
      .getMemberActivity(ids)
      .then((act) => {
        if (isMounted) setActivity(act);
      })
      .catch((err) => {
        console.warn('[useMemberActivityModel] Failed to fetch member activity:', err);
      });
    return () => {
      isMounted = false;
    };
  }, [profile, currentMember.id, activityAliasIds.length, activityAliasIdsKey, syncState.lastSyncedAt, activityRefreshSignal]);

  const schedules = profile ? sheetsService.getSchedulesForMember(profile.memberId) : [];
  const logs = sheetsService.getLogs();
  const rsvpVotes = sheetsService.getRSVPVotes();
  const lateGraceMinutes = config.lateGraceMinutes ?? 10;

  const isStaff = useMemo(
    () => (profile ? isActivityStaff(currentMember, config, members) : false),
    [profile, currentMember, config, members]
  );

  const scheduleRecords = useMemo(() => {
    if (!profile) return [];
    return buildMemberScheduleRecords({
      member: currentMember,
      members,
      schedules,
      logs,
      rsvpVotes,
      now: currentNow,
      lateGraceMinutes,
      includeArchived: true,
    });
  }, [profile, currentMember, members, schedules, logs, rsvpVotes, lateGraceMinutes, currentNow]);

  const evaluatedStickers = useMemo(() => {
    if (!profile) return [];
    return evaluatePraiseStickers({
      member: currentMember,
      schedules,
      logs,
      rsvpVotes,
      activity,
      performanceCategories: config.performanceCategories,
      lateGraceMinutes,
      allMembers: members,
      now: currentNow,
      isStaff,
      scheduleRecords,
    });
  }, [
    profile,
    currentMember,
    schedules,
    logs,
    rsvpVotes,
    activity,
    config.performanceCategories,
    lateGraceMinutes,
    members,
    isStaff,
    scheduleRecords,
    currentNow,
  ]);

  const isDataReady = isStickerDataReady(
    Boolean(activity),
    isStaff,
    syncState.lastSyncedAt
  );

  return {
    currentMember,
    members,
    config,
    currentNow,
    schedules,
    logs,
    rsvpVotes,
    isStaff,
    scheduleRecords,
    activity,
    evaluatedStickers,
    isDataReady,
    lastSyncedAt: syncState.lastSyncedAt,
  };
}
