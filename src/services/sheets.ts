import type {
  AppConfig,
  AttendanceReconciliation,
  CumulativeMemberAttendance,
  LocationPreset,
  Member,
  MemberStatusHistory,
  ProgramCard,
  RSVPVote,
  RawAttendanceLog,
  Schedule,
} from '../types/rollbook';
import {
  calculateCumulativeAttendanceWithLifecycle,
  reconcileSingleMemberAttendance,
  resolveMergedMemberIds,
} from '../utils/attendanceStats';
import { getKSTTimestampString, getKSTDateString, addDaysKST, parseKSTDate } from '../utils/date';
import {
  INITIAL_CONFIG,
  INITIAL_LOCATION_PRESETS,
  INITIAL_MEMBERS,
} from './mockData';
import {
  parseRemoteAttendanceLogs,
  parseRemoteLocations,
  parseRemoteMembers,
  parseRemoteProgramCards,
  parseRemoteRSVPVotes,
  parseRemoteSchedules,
  resolveScheduleLocationFromPresets,
  serializeScheduleForSheet,
} from './sheetsParser';
import {
  STORAGE_KEYS,
  loadFromStorage,
  resetStorage,
  saveToStorage,
} from './sheetsStorage';

export { resetStorage };

export class ExistingMemberConflictError extends Error {
  public readonly existingMemberId: string;

  constructor(existingMemberId: string) {
    super('이미 같은 이름과 연락처로 등록된 단원이 있습니다. 기존 명부에서 확인해 연결해 주세요.');
    this.name = 'ExistingMemberConflictError';
    this.existingMemberId = existingMemberId;
  }
}

export class SheetsService {
  private config: AppConfig;
  private members: Member[];
  private schedules: Schedule[];
  private rsvpVotes: RSVPVote[];
  private logs: RawAttendanceLog[];
  private locations: LocationPreset[];
  private programCards: ProgramCard[];

  constructor() {
    this.config = loadFromStorage(STORAGE_KEYS.CONFIG, { ...INITIAL_CONFIG, locationPresets: [] });
    if (!this.config.sheetsWebAppUrl && INITIAL_CONFIG.sheetsWebAppUrl) {
      this.config.sheetsWebAppUrl = INITIAL_CONFIG.sheetsWebAppUrl;
      saveToStorage(STORAGE_KEYS.CONFIG, this.config);
    }
    this.members = loadFromStorage(STORAGE_KEYS.MEMBERS, []);
    this.schedules = loadFromStorage(STORAGE_KEYS.SCHEDULES, []);
    this.rsvpVotes = loadFromStorage(STORAGE_KEYS.RSVP_VOTES, []);
    this.logs = loadFromStorage(STORAGE_KEYS.LOGS, []);
    this.locations = loadFromStorage(STORAGE_KEYS.LOCATIONS, []);
    this.programCards = loadFromStorage(STORAGE_KEYS.PROGRAM_CARDS, []);
  }

  public seedTestData(data: {
    schedules?: Schedule[];
    rsvpVotes?: RSVPVote[];
    logs?: RawAttendanceLog[];
    programCards?: ProgramCard[];
    members?: Member[];
    locations?: LocationPreset[];
  }): void {
    this.members = data.members ? [...data.members] : JSON.parse(JSON.stringify(INITIAL_MEMBERS));
    saveToStorage(STORAGE_KEYS.MEMBERS, this.members);

    this.locations = data.locations ? [...data.locations] : JSON.parse(JSON.stringify(INITIAL_LOCATION_PRESETS));
    saveToStorage(STORAGE_KEYS.LOCATIONS, this.locations);

    if (data.schedules) {
      this.schedules = [...data.schedules];
      saveToStorage(STORAGE_KEYS.SCHEDULES, this.schedules);
    }
    if (data.rsvpVotes) {
      this.rsvpVotes = [...data.rsvpVotes];
      saveToStorage(STORAGE_KEYS.RSVP_VOTES, this.rsvpVotes);
    }
    if (data.logs) {
      this.logs = [...data.logs];
      saveToStorage(STORAGE_KEYS.LOGS, this.logs);
    }
    if (data.programCards) {
      this.programCards = [...data.programCards];
      saveToStorage(STORAGE_KEYS.PROGRAM_CARDS, this.programCards);
    }
  }

  // --- Read Operations ---
  public getConfig(): AppConfig {
    return {
      ...this.config,
      locationPresets: this.getLocationPresets(),
    };
  }

  public getMembers(includeMerged = false, includeDeleted = false): Member[] {
    const targetMembers = this.members.filter((m) => {
      if (!includeMerged && m.status === 'MERGED') return false;
      if (!includeDeleted && m.status === 'DELETED') return false;
      return true;
    });

    // Backward compatibility adapter (Schema Evolution Invariant)
    return targetMembers.map((m) => ({
      ...m,
      joinedAt: m.joinedAt || m.createdAt.slice(0, 10),
      memberStatus: m.memberStatus || (m.role === 'ADMIN' ? '선생님' : m.role === 'GUEST' ? '객원' : '정단원'),
      note: m.note || '',
    }));
  }

  /**
   * Resolves target GPS coordinates & radius for any schedule
   * by matching against location presets or falling back to defaults.
   */
  public resolveScheduleLocation(schedule: Schedule): {
    targetLat: number;
    targetLon: number;
    radiusMeters: number;
    locationName: string;
    detailAddress?: string;
    entranceNote?: string;
  } {
    return resolveScheduleLocationFromPresets(schedule, this.getLocationPresets(), this.config);
  }

  public getSchedules(): Schedule[] {
    return [...this.schedules].sort((a, b) => a.date.localeCompare(b.date));
  }

  public getRSVPVotes(scheduleId?: string): RSVPVote[] {
    const list = scheduleId
      ? this.rsvpVotes.filter((v) => v.scheduleId === scheduleId)
      : this.rsvpVotes;

    const memberIdSet = new Set(this.members.map((m) => m.id));

    const map = new Map<string, RSVPVote>();
    list.forEach((v) => {
      if (!v.scheduleId || !v.memberId) return;
      const mId = String(v.memberId).trim();
      if (!memberIdSet.has(mId)) {
        return;
      }
      const key = `${String(v.scheduleId).trim()}_${mId}`;
      const existing = map.get(key);
      if (!existing || (v.timestamp && (!existing.timestamp || v.timestamp >= existing.timestamp))) {
        map.set(key, v);
      }
    });
    return Array.from(map.values());
  }

  public getLogs(scheduleId?: string): RawAttendanceLog[] {
    const memberIdSet = new Set(this.members.map((m) => m.id));
    const list = scheduleId
      ? this.logs.filter((l) => l.scheduleId === scheduleId)
      : this.logs;

    return list.filter((l) => {
      const mId = String(l.memberId || '').trim();
      return memberIdSet.has(mId);
    });
  }

  public getLocationPresets(): LocationPreset[] {
    return [...this.locations];
  }

  public getProgramCards(): ProgramCard[] {
    return [...this.programCards];
  }

  public async saveProgramCard(card: ProgramCard): Promise<ProgramCard> {
    const result = await this.sendToGoogleSheet('SAVE_PROGRAM_CARD', card);
    if (!result.success) {
      throw new Error(result.message || '일정 카드 저장이 확인되지 않았습니다.');
    }

    const idx = this.programCards.findIndex((c) => c.id === card.id);
    if (idx >= 0) {
      this.programCards[idx] = { ...card };
    } else {
      this.programCards.push({ ...card });
    }
    saveToStorage(STORAGE_KEYS.PROGRAM_CARDS, this.programCards);
    return card;
  }

  public async deleteProgramCard(cardId: string): Promise<void> {
    const result = await this.sendToGoogleSheet('DELETE_PROGRAM_CARD', { id: cardId });
    if (!result.success) {
      throw new Error(result.message || '일정 카드 삭제가 확인되지 않았습니다.');
    }

    this.programCards = this.programCards.filter((c) => c.id !== cardId);
    saveToStorage(STORAGE_KEYS.PROGRAM_CARDS, this.programCards);
  }

  // --- Append-Only Write Operations (Idempotent by log.id) ---
  public async addCheckInLog(
    log: RawAttendanceLog,
    checkInPin?: string
  ): Promise<RawAttendanceLog> {
    if (log.authMethod === 'MANUAL_PIN') {
      if (!checkInPin) {
        throw new Error('현장 PIN이 누락되어 출석을 확인할 수 없습니다.');
      }
      const result = await this.sendToGoogleSheet('RECORD_ATTENDANCE', {
        ...log,
        checkInPin,
      });
      if (!result.success) {
        throw new Error(result.message || '현장 PIN 출석이 시트에서 확인되지 않았습니다.');
      }
    }

    if (log.memberId && !this.members.some((m) => m.id === log.memberId)) {
      this.members.push({
        id: log.memberId,
        name: log.memberName || '단원',
        part: log.part || '소프라노',
        phoneLast4: '0000',
        role: 'MEMBER',
        createdAt: getKSTTimestampString(),
        status: 'ACTIVE',
        joinedAt: getKSTTimestampString().slice(0, 10),
        memberStatus: '정단원',
        note: '',
      });
      saveToStorage(STORAGE_KEYS.MEMBERS, this.members);
    }

    if (!this.logs.some((existing) => existing.id === log.id)) {
      this.logs.push(log);
      saveToStorage(STORAGE_KEYS.LOGS, this.logs);
    }

    if (log.authMethod !== 'MANUAL_PIN' && this.config.sheetsWebAppUrl) {
      this.sendToGoogleSheet('RECORD_ATTENDANCE', log).catch((err) => {
        console.error('[Sheets API] Background sync failed, preserved in local log:', err);
      });
    }

    return log;
  }

  public async submitRSVP(vote: RSVPVote): Promise<RSVPVote> {
    if (vote.memberId && !this.members.some((m) => m.id === vote.memberId)) {
      this.members.push({
        id: vote.memberId,
        name: vote.memberName || '단원',
        part: vote.part || '소프라노',
        phoneLast4: '0000',
        role: 'MEMBER',
        createdAt: getKSTTimestampString(),
        status: 'ACTIVE',
        joinedAt: getKSTTimestampString().slice(0, 10),
        memberStatus: '정단원',
        note: '',
      });
      saveToStorage(STORAGE_KEYS.MEMBERS, this.members);
    }

    const existingIndex = this.rsvpVotes.findIndex(
      (v) => v.scheduleId === vote.scheduleId && v.memberId === vote.memberId
    );

    if (existingIndex >= 0) {
      this.rsvpVotes[existingIndex] = vote;
    } else {
      this.rsvpVotes.push(vote);
    }
    saveToStorage(STORAGE_KEYS.RSVP_VOTES, this.rsvpVotes);

    if (this.config.sheetsWebAppUrl) {
      this.sendToGoogleSheet('SUBMIT_RSVP', vote).catch((err) => {
        console.error('[Sheets API] RSVP sync failed:', err);
      });
    }

    return vote;
  }

  /**
   * 특정 세션에 대한 단원의 출결을 취소하여 원래 상태(결석/미참)로 되돌립니다.
   * (도메인 불변식: 원천 데이터 물리 삭제 금지, 취소 로그 Append-Only 적재)
   */
  public async clearAttendanceLog(scheduleId: string, memberId: string): Promise<void> {
    const targetMember = this.members.find((m) => m.id === memberId);
    const targetSchedule = this.schedules.find((s) => s.id === scheduleId);

    // 취소 로그는 해당 일정의 기존 로그들 중 가장 최신 타임스탬프보다 뒤여야 최신 판정됨
    let cancelTimestamp = getKSTTimestampString();
    const existingScheduleLogs = this.logs.filter(
      (l) => (l.scheduleId === scheduleId || (targetSchedule && l.scheduleId.startsWith(targetSchedule.id))) && l.memberId === memberId
    );
    if (existingScheduleLogs.length > 0) {
      const sorted = [...existingScheduleLogs].sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
      const maxExisting = sorted[sorted.length - 1].timestamp || '';
      if (maxExisting >= cancelTimestamp) {
        const baseDate = parseKSTDate(maxExisting);
        baseDate.setSeconds(baseDate.getSeconds() + 1);
        cancelTimestamp = getKSTTimestampString(baseDate);
      }
    }

    const cancelLog: RawAttendanceLog = {
      id: `log_cancel_${Date.now()}`,
      timestamp: cancelTimestamp,
      scheduleId,
      memberId,
      memberName: targetMember?.name || '단원',
      part: targetMember?.part || '소프라노',
      authMethod: 'MANUAL_BY_ADMIN',
      isVerifiedLocation: false,
      adminNote: '관리자 출결 취소 (초기화)',
    };

    this.logs.push(cancelLog);
    saveToStorage(STORAGE_KEYS.LOGS, this.logs);

    if (this.config.sheetsWebAppUrl) {
      this.sendToGoogleSheet('CLEAR_ATTENDANCE', {
        scheduleId,
        memberId,
        memberName: targetMember?.name,
        part: targetMember?.part,
        adminNote: '관리자 출결 취소 (초기화)',
        scheduleDate: targetSchedule?.date,
      }).catch((err) => {
        console.error('[Sheets API] Clear attendance cancel-log sync failed:', err);
      });
    }
  }

  public async cancelRSVP(scheduleId: string, memberId: string): Promise<boolean> {
    const existingIndex = this.rsvpVotes.findIndex(
      (v) => v.scheduleId === scheduleId && v.memberId === memberId
    );

    if (existingIndex >= 0) {
      const removed = this.rsvpVotes.splice(existingIndex, 1)[0];
      saveToStorage(STORAGE_KEYS.RSVP_VOTES, this.rsvpVotes);

      if (this.config.sheetsWebAppUrl) {
        this.sendToGoogleSheet('CANCEL_RSVP', { scheduleId, memberId, removedVoteId: removed.id }).catch((err) => {
          console.error('[Sheets API] RSVP cancel sync failed:', err);
        });
      }
      return true;
    }

    return false;
  }

  public async addMember(member: Member): Promise<Member> {
    const newMember: Member = {
      ...member,
      joinedAt: member.joinedAt || member.createdAt.slice(0, 10),
      memberStatus: member.memberStatus || '정단원',
      note: member.note || '',
    };
    const result = await this.sendToGoogleSheet('REGISTER_MEMBER', newMember);
    if (result.existingMemberId && result.existingMemberId !== newMember.id) {
      throw new ExistingMemberConflictError(result.existingMemberId);
    }
    if (!result.success) {
      throw new Error(result.message || '단원 등록이 Google Sheets에서 확인되지 않았습니다.');
    }

    this.commitMember(newMember);
    return newMember;
  }

  public async registerAndBindMember(member: Member, deviceId: string): Promise<Member> {
    const boundMember: Member = {
      ...member,
      boundDeviceId: deviceId,
      boundDeviceAt: member.boundDeviceAt || getKSTTimestampString(),
      joinedAt: member.joinedAt || member.createdAt.slice(0, 10),
      memberStatus: member.memberStatus || '정단원',
      note: member.note || '',
    };
    const result = await this.sendToGoogleSheet('REGISTER_AND_BIND_MEMBER', {
      member: boundMember,
      deviceId,
    });

    if (result.existingMemberId && result.existingMemberId !== boundMember.id) {
      throw new ExistingMemberConflictError(result.existingMemberId);
    }
    if (!result.success) {
      throw new Error(result.message || '단원 등록과 기기 연결이 확인되지 않았습니다.');
    }

    this.commitMember(boundMember);
    return boundMember;
  }

  public async bindExistingMember(
    memberId: string,
    deviceId: string,
    phone: string,
    phoneLast4: string
  ): Promise<Member> {
    const member = this.members.find((candidate) => candidate.id === memberId);
    if (!member) throw new Error('단원을 찾을 수 없습니다.');

    const result = await this.sendToGoogleSheet('BIND_EXISTING_MEMBER', {
      memberId,
      deviceId,
      phone,
      phoneLast4,
    });
    if (!result.success) {
      throw new Error(result.message || '단원 정보와 기기 연결이 확인되지 않았습니다.');
    }

    const updatedMember: Member = {
      ...member,
      phone,
      phoneLast4,
      boundDeviceId: deviceId,
      boundDeviceAt: getKSTTimestampString(),
    };
    this.commitMember(updatedMember);
    return updatedMember;
  }

  private commitMember(member: Member): void {
    const existingIndex = this.members.findIndex((candidate) => candidate.id === member.id);
    if (existingIndex >= 0) {
      this.members[existingIndex] = member;
    } else {
      this.members.push(member);
    }
    saveToStorage(STORAGE_KEYS.MEMBERS, this.members);
  }

  public async updateMember(
    memberId: string,
    updates: Partial<Member>,
    historyItem?: MemberStatusHistory
  ): Promise<Member> {
    const idx = this.members.findIndex((m) => m.id === memberId);
    if (idx < 0) {
      throw new Error(`대원을 찾을 수 없습니다. (ID: ${memberId})`);
    }

    let currentHistory = this.members[idx].statusHistory ? [...this.members[idx].statusHistory!] : [];
    let effectiveHistoryItem = historyItem;
    if (historyItem) {
      // 새 이력이 시작하는 날짜 이전으로 기존 오픈 이력(2999-12-31) 마감
      const prevDay = addDaysKST(historyItem.startDate, -1);
      currentHistory = currentHistory.map((h) => {
        if (h.endDate >= historyItem.startDate) {
          return { ...h, endDate: h.startDate < historyItem.startDate ? prevDay : historyItem.startDate };
        }
        return h;
      });
      currentHistory.push(historyItem);
    } else if (updates.memberStatus && updates.memberStatus !== this.members[idx].memberStatus) {
      // historyItem 없이 memberStatus만 바뀐 경우에도 오픈 이력 마감 및 최신 상태 등록
      const today = getKSTDateString();
      const yesterday = addDaysKST(today, -1);
      currentHistory = currentHistory.map((h) => {
        if (h.endDate >= today) {
          return { ...h, endDate: yesterday };
        }
        return h;
      });
      effectiveHistoryItem = {
        id: `hist_${Date.now()}`,
        memberId,
        status: updates.memberStatus,
        part: updates.part || this.members[idx].part,
        startDate: today,
        endDate: '2999-12-31',
        reason: `상태를 [${updates.memberStatus}]으로 변경`,
        createdAt: getKSTTimestampString(),
      };
      currentHistory.push(effectiveHistoryItem);
    }

    this.members[idx] = {
      ...this.members[idx],
      ...updates,
      ...(currentHistory.length > 0 ? { statusHistory: currentHistory } : {}),
    };
    saveToStorage(STORAGE_KEYS.MEMBERS, this.members);

    if (this.config.sheetsWebAppUrl) {
      this.sendToGoogleSheet('UPDATE_MEMBER', {
        ...this.members[idx],
        historyItem: effectiveHistoryItem,
      }).catch((err) => {
        console.error('[Sheets API] Member update sync failed:', err);
      });
    }

    return this.members[idx];
  }

  public async deleteMember(memberId: string): Promise<void> {
    const target = this.members.find((m) => m.id === memberId);
    if (!target) return;

    // 병합된 단원(MERGED)이거나 다른 병합 단원의 참조 대상인 경우 연결 무결성을 위해 물리 삭제 차단
    if (target.status === 'MERGED' || this.members.some((m) => m.mergedIntoId === memberId)) {
      return;
    }

    const hasActivity =
      this.logs.some((l) => l.memberId === memberId) ||
      this.rsvpVotes.some((v) => v.memberId === memberId);

    if (hasActivity) {
      // 과거 출결 통계 보호를 위한 소프트 삭제 (status='DELETED')
      await this.updateMember(memberId, { status: 'DELETED' });
      if (this.config.sheetsWebAppUrl) {
        this.sendToGoogleSheet('DELETE_MEMBER', { id: memberId }).catch((err) => {
          console.error('[Sheets API] Member delete sync failed:', err);
        });
      }
    } else {
      this.members = this.members.filter((m) => m.id !== memberId);
      saveToStorage(STORAGE_KEYS.MEMBERS, this.members);

      if (this.config.sheetsWebAppUrl) {
        this.sendToGoogleSheet('DELETE_MEMBER', { id: memberId }).catch((err) => {
          console.error('[Sheets API] Member delete sync failed:', err);
        });
      }
    }
  }

  public async bindMemberDevice(memberId: string, deviceId: string): Promise<Member> {
    const member = this.members.find((m) => m.id === memberId);
    if (!member) throw new Error('단원을 찾을 수 없습니다.');
    if (member.boundDeviceId && member.boundDeviceId !== deviceId) {
      throw new Error(
        '이미 다른 기기(스마트폰)에 연동되어 있는 계정입니다.\n기존 기기에서 [연동 해제]를 먼저 진행하시거나, 기기 분실/변경 시 관리자에게 초기화를 요청하세요.'
      );
    }

    const result = await this.sendToGoogleSheet('BIND_DEVICE', { memberId, deviceId });
    if (!result.success) {
      throw new Error(result.message || '기기 연동이 구글 시트에서 확인되지 않았습니다.');
    }

    const updated = {
      ...member,
      boundDeviceId: deviceId,
      boundDeviceAt: getKSTTimestampString(),
    };
    this.members[this.members.findIndex((m) => m.id === memberId)] = updated;
    saveToStorage(STORAGE_KEYS.MEMBERS, this.members);
    return updated;
  }

  public async unbindMemberDevice(memberId: string): Promise<Member> {
    const member = this.members.find((m) => m.id === memberId);
    if (!member) throw new Error('단원을 찾을 수 없습니다.');

    const result = await this.sendToGoogleSheet('UNBIND_DEVICE', { memberId });
    if (!result.success) {
      throw new Error(result.message || '기기 연동 해제가 구글 시트에서 확인되지 않았습니다.');
    }

    const updated = {
      ...member,
      boundDeviceId: undefined,
      boundDeviceAt: undefined,
    };
    this.members[this.members.findIndex((m) => m.id === memberId)] = updated;
    saveToStorage(STORAGE_KEYS.MEMBERS, this.members);
    return updated;
  }

  /**
   * Scans for members with duplicate names and matching/missing phone numbers.
   * Useful for administrative review and safe consolidation.
   */
  public findDuplicateMemberGroups(): {
    key: string;
    name: string;
    phoneLast4: string;
    members: Member[];
  }[] {
    const activeMembers = this.members.filter((m) => m.status !== 'MERGED');
    const groupMap = new Map<string, Member[]>();

    activeMembers.forEach((m) => {
      const pLast4 = (m.phoneLast4 || '').trim();
      const normName = m.name.trim().toLowerCase();
      const key = `${normName}__${pLast4 || '0000'}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, []);
      }
      groupMap.get(key)!.push(m);
    });

    const results: { key: string; name: string; phoneLast4: string; members: Member[] }[] = [];
    groupMap.forEach((membersList, key) => {
      if (membersList.length > 1) {
        results.push({
          key,
          name: membersList[0].name,
          phoneLast4: membersList[0].phoneLast4,
          members: membersList,
        });
      }
    });

    return results;
  }

  /**
   * Merges duplicate member record into canonical standard ID while preserving immutable raw attendance logs.
   * Raw attendance logs keep their original memberId; projection views follow mergedIntoId.
   */
  public async mergeDuplicateMembers(
    canonicalId: string,
    secondaryId: string
  ): Promise<{ affectedLogsCount: number; affectedRsvpCount: number }> {
    const canonical = this.members.find((m) => m.id === canonicalId);
    const secondary = this.members.find((m) => m.id === secondaryId);
    if (!canonical || !secondary) {
      throw new Error('통합 대상 단원 정보를 찾을 수 없습니다.');
    }

    // 1. Preserve raw attendance logs' original memberId (Append-Only Event Sourcing Invariant)
    const affectedLogsCount = this.logs.filter((log) => log.memberId === secondaryId).length;

    // 2. Consolidate current RSVP responses (keep canonical response if both exist for a schedule)
    let affectedRsvpCount = 0;
    const remainingVotes: RSVPVote[] = [];
    for (const vote of this.rsvpVotes) {
      if (vote.memberId === secondaryId) {
        affectedRsvpCount += 1;
        const canonicalHasVote = this.rsvpVotes.some(
          (v) => v.memberId === canonicalId && v.scheduleId === vote.scheduleId
        );
        if (!canonicalHasVote) {
          remainingVotes.push({
            ...vote,
            memberId: canonicalId,
            memberName: canonical.name,
          });
        }
      } else {
        remainingVotes.push(vote);
      }
    }
    this.rsvpVotes = remainingVotes;
    saveToStorage(STORAGE_KEYS.RSVP_VOTES, this.rsvpVotes);

    // 3. Mark secondary member as MERGED with explicit mergedIntoId link
    secondary.status = 'MERGED';
    secondary.mergedIntoId = canonicalId;

    // Carry over device binding if canonical didn't have one
    if (!canonical.boundDeviceId && secondary.boundDeviceId) {
      canonical.boundDeviceId = secondary.boundDeviceId;
      canonical.boundDeviceAt = secondary.boundDeviceAt;
    }
    // Carry over phone number if canonical didn't have full phone
    if (!canonical.phone && secondary.phone) {
      canonical.phone = secondary.phone;
    }

    saveToStorage(STORAGE_KEYS.MEMBERS, this.members);

    // 4. Sync with Google Sheets backend
    if (this.config.sheetsWebAppUrl) {
      this.sendToGoogleSheet('MERGE_MEMBERS', {
        canonicalId,
        secondaryId,
      }).catch((err) => {
        console.error('[Sheets API] Member merge sync failed:', err);
      });
    }

    return { affectedLogsCount, affectedRsvpCount };
  }

  public async addSchedule(schedule: Schedule): Promise<Schedule> {
    this.schedules.push(schedule);
    saveToStorage(STORAGE_KEYS.SCHEDULES, this.schedules);

    if (this.config.sheetsWebAppUrl) {
      this.sendToGoogleSheet('CREATE_SCHEDULE', serializeScheduleForSheet(schedule)).catch((err) => {
        console.error('[Sheets API] Schedule create sync failed:', err);
      });
    }

    return schedule;
  }

  public async addSchedules(schedules: Schedule[]): Promise<Schedule[]> {
    this.schedules.push(...schedules);
    saveToStorage(STORAGE_KEYS.SCHEDULES, this.schedules);

    if (this.config.sheetsWebAppUrl) {
      for (const sch of schedules) {
        this.sendToGoogleSheet('CREATE_SCHEDULE', serializeScheduleForSheet(sch)).catch((err) => {
          console.error('[Sheets API] Batch schedule sync error:', err);
        });
      }
    }

    return schedules;
  }

  public async updateSchedule(scheduleId: string, updates: Partial<Schedule>): Promise<Schedule> {
    const idx = this.schedules.findIndex((s) => s.id === scheduleId);
    if (idx < 0) throw new Error(`일정을 찾을 수 없습니다. (ID: ${scheduleId})`);
    this.schedules[idx] = { ...this.schedules[idx], ...updates };
    saveToStorage(STORAGE_KEYS.SCHEDULES, this.schedules);

    if (this.config.sheetsWebAppUrl) {
      this.sendToGoogleSheet('UPDATE_SCHEDULE', serializeScheduleForSheet(this.schedules[idx])).catch((err) => {
        console.error('[Sheets API] Schedule update sync failed:', err);
      });
    }

    return this.schedules[idx];
  }

  public async restoreSchedule(scheduleId: string): Promise<Schedule> {
    return this.updateSchedule(scheduleId, { isCancelled: false });
  }

  public async deleteSchedule(scheduleId: string, forceHardDelete: boolean = false): Promise<void> {
    const hasActivity =
      this.logs.some((l) => l.scheduleId === scheduleId) ||
      this.rsvpVotes.some((v) => v.scheduleId === scheduleId);

    if (hasActivity && !forceHardDelete) {
      // 출석로그나 투표가 있는 경우 물리 삭제하지 않고 [연습 취소]로 보존
      await this.updateSchedule(scheduleId, { isCancelled: true });
      if (this.config.sheetsWebAppUrl) {
        this.sendToGoogleSheet('DELETE_SCHEDULE', { id: scheduleId, forceHardDelete: false }).catch((err) => {
          console.error('[Sheets API] Schedule cancel sync failed:', err);
        });
      }
    } else {
      // 활동이 없거나, 관리자가 명시적으로 완전 영구 삭제를 요청한 경우
      this.schedules = this.schedules.filter((s) => s.id !== scheduleId);
      saveToStorage(STORAGE_KEYS.SCHEDULES, this.schedules);

      if (this.config.sheetsWebAppUrl) {
        this.sendToGoogleSheet('DELETE_SCHEDULE', { id: scheduleId, forceHardDelete: true }).catch((err) => {
          console.error('[Sheets API] Schedule delete sync failed:', err);
        });
      }
    }
  }

  public async deleteSchedules(scheduleIds: string[], forceHardDelete: boolean = false): Promise<void> {
    if (forceHardDelete) {
      // 강제 영구 삭제 모드: 모든 지정 일정을 물리 삭제
      const idsToDeleteSet = new Set(scheduleIds);
      this.schedules = this.schedules.filter((s) => !idsToDeleteSet.has(s.id));
      saveToStorage(STORAGE_KEYS.SCHEDULES, this.schedules);

      if (this.config.sheetsWebAppUrl) {
        this.sendToGoogleSheet('BATCH_DELETE_SCHEDULES', { ids: scheduleIds, forceHardDelete: true }).catch((err) => {
          console.error('[Sheets API] Batch schedule hard delete sync failed:', err);
        });
      }
      return;
    }

    const activeScheduleIds = new Set(
      scheduleIds.filter(
        (sid) =>
          this.logs.some((l) => l.scheduleId === sid) ||
          this.rsvpVotes.some((v) => v.scheduleId === sid)
      )
    );

    // 활동 있는 일정은 isCancelled=true로 갱신
    if (activeScheduleIds.size > 0) {
      await this.batchUpdateSchedules(Array.from(activeScheduleIds), { isCancelled: true });
    }

    // 활동 없는 일정만 물리 삭제
    const idsToHardDelete = new Set(scheduleIds.filter((sid) => !activeScheduleIds.has(sid)));
    if (idsToHardDelete.size > 0) {
      this.schedules = this.schedules.filter((s) => !idsToHardDelete.has(s.id));
      saveToStorage(STORAGE_KEYS.SCHEDULES, this.schedules);
    }

    if (this.config.sheetsWebAppUrl) {
      this.sendToGoogleSheet('BATCH_DELETE_SCHEDULES', { ids: scheduleIds, forceHardDelete: false }).catch((err) => {
        console.error('[Sheets API] Batch schedule delete/cancel sync failed:', err);
      });
    }
  }

  public async batchUpdateSchedules(scheduleIds: string[], updates: Partial<Schedule>): Promise<Schedule[]> {
    const idSet = new Set(scheduleIds);
    const updatedSchedules: Schedule[] = [];

    this.schedules = this.schedules.map((s) => {
      if (idSet.has(s.id)) {
        const updated = { ...s, ...updates };
        updatedSchedules.push(updated);
        return updated;
      }
      return s;
    });

    saveToStorage(STORAGE_KEYS.SCHEDULES, this.schedules);

    if (this.config.sheetsWebAppUrl) {
      const serializedUpdates = {
        ...updates,
        ...(updates.targetParts !== undefined
          ? { targetParts: Array.isArray(updates.targetParts) ? updates.targetParts.join(',') : (updates.targetParts || '') }
          : {}),
        ...(updates.targetMemberIds !== undefined
          ? { targetMemberIds: Array.isArray(updates.targetMemberIds) ? updates.targetMemberIds.join(',') : (updates.targetMemberIds || '') }
          : {}),
      };
      this.sendToGoogleSheet('BATCH_UPDATE_SCHEDULES', { ids: scheduleIds, updates: serializedUpdates }).catch((err) => {
        console.error('[Sheets API] Batch schedule update sync failed:', err);
      });
    }

    return updatedSchedules;
  }

  // --- Location Presets Management ---
  public async addLocationPreset(preset: LocationPreset): Promise<LocationPreset> {
    if (preset.isDefault) {
      this.locations = this.locations.map((l) => ({ ...l, isDefault: false }));
    }
    this.locations.push(preset);
    saveToStorage(STORAGE_KEYS.LOCATIONS, this.locations);

    if (this.config.sheetsWebAppUrl) {
      this.sendToGoogleSheet('SAVE_LOCATION', preset).catch((err) => {
        console.error('[Sheets API] Location preset save sync failed:', err);
      });
    }

    return preset;
  }

  public async updateLocationPreset(id: string, updates: Partial<LocationPreset>): Promise<LocationPreset> {
    const idx = this.locations.findIndex((l) => l.id === id);
    if (idx < 0) throw new Error(`장소 프리셋을 찾을 수 없습니다: ${id}`);
    if (updates.isDefault) {
      this.locations = this.locations.map((l) => ({ ...l, isDefault: false }));
    }
    this.locations[idx] = { ...this.locations[idx], ...updates };
    saveToStorage(STORAGE_KEYS.LOCATIONS, this.locations);

    // Cascade updates to existing schedules referencing this location
    const updatedLoc = this.locations[idx];
    this.schedules = this.schedules.map((s) => {
      if (s.locationId === id || s.locationName === updatedLoc.name) {
        return {
          ...s,
          locationId: id,
          locationName: updatedLoc.name,
          targetLat: updatedLoc.latitude,
          targetLon: updatedLoc.longitude,
          radiusMeters: updatedLoc.radiusMeters,
          detailAddress: updatedLoc.detailAddress,
          entranceNote: updatedLoc.entranceNote,
        };
      }
      return s;
    });
    saveToStorage(STORAGE_KEYS.SCHEDULES, this.schedules);

    if (this.config.sheetsWebAppUrl) {
      this.sendToGoogleSheet('SAVE_LOCATION', this.locations[idx]).catch((err) => {
        console.error('[Sheets API] Location preset update sync failed:', err);
      });
    }

    return this.locations[idx];
  }

  public async deleteLocationPreset(id: string): Promise<void> {
    const wasDefault = this.locations.find((l) => l.id === id)?.isDefault;
    this.locations = this.locations.filter((l) => l.id !== id);
    if (wasDefault && this.locations.length > 0) {
      this.locations[0].isDefault = true;
    }
    saveToStorage(STORAGE_KEYS.LOCATIONS, this.locations);

    if (this.config.sheetsWebAppUrl) {
      this.sendToGoogleSheet('DELETE_LOCATION', { id }).catch((err) => {
        console.error('[Sheets API] Location preset delete sync failed:', err);
      });
    }
  }

  public updateConfig(newConfig: Partial<AppConfig>): AppConfig {
    this.config = { ...this.config, ...newConfig };
    saveToStorage(STORAGE_KEYS.CONFIG, this.config);

    if (this.config.sheetsWebAppUrl) {
      this.sendToGoogleSheet('SAVE_CONFIG', { config: newConfig }).catch((err) => {
        console.error('[Sheets API] Config sync failed:', err);
      });
    }

    return { ...this.config };
  }

  public async saveConfigConfirmed(newConfig: Partial<AppConfig>): Promise<AppConfig> {
    const nextEndpoint =
      newConfig.sheetsWebAppUrl !== undefined
        ? newConfig.sheetsWebAppUrl.trim()
        : this.config.sheetsWebAppUrl;
    const endpoint = this.config.sheetsWebAppUrl || nextEndpoint;
    if (!endpoint || !nextEndpoint) {
      throw new Error('구글 시트 Web App URL이 설정되지 않았습니다.');
    }

    const result = await this.sendToGoogleSheet(
      'SAVE_CONFIG',
      { config: newConfig },
      endpoint
    );
    if (!result.success) {
      throw new Error(result.message || '설정 저장이 구글 시트에서 확인되지 않았습니다.');
    }

    this.config = { ...this.config, ...newConfig, sheetsWebAppUrl: nextEndpoint };
    saveToStorage(STORAGE_KEYS.CONFIG, this.config);
    return { ...this.config };
  }

  public async verifyOnSitePin(pin: string): Promise<void> {
    const result = await this.sendToGoogleSheet('VERIFY_ON_SITE_PIN', { pin });
    if (!result.success) {
      throw new Error(result.message || '현장 PIN을 시트에서 확인할 수 없습니다.');
    }
  }

  public async verifyAdminPin(pin: string): Promise<void> {
    const result = await this.sendToGoogleSheet('VERIFY_ADMIN_PIN', { pin });
    if (!result.success) {
      throw new Error(result.message || '관리자 PIN이 일치하지 않거나 확인되지 않았습니다.');
    }
  }

  // --- Taxonomy & Categories Dynamic Management ---
  public getParts(): string[] {
    return this.config.customParts && this.config.customParts.length > 0
      ? [...this.config.customParts]
      : ['소프라노', '알토', '테너', '베이스', '선생님', '객원'];
  }

  public getMemberStatuses(): string[] {
    return this.config.customMemberStatuses && this.config.customMemberStatuses.length > 0
      ? [...this.config.customMemberStatuses]
      : ['정단원', '준단원', '휴단원', '퇴단원', '선생님', '객원'];
  }

  public getCategories(): string[] {
    return this.config.customCategories && this.config.customCategories.length > 0
      ? [...this.config.customCategories]
      : ['정기연습', '추가연습', '연주', '녹음', '기타행사'];
  }

  public addPart(newPart: string): string[] {
    const trimmed = newPart.trim();
    if (!trimmed) return this.getParts();
    const current = this.getParts();
    if (!current.includes(trimmed)) {
      current.push(trimmed);
      this.updateConfig({ customParts: current });
    }
    return current;
  }

  public removePart(targetPart: string): string[] {
    const current = this.getParts().filter((p) => p !== targetPart);
    this.updateConfig({ customParts: current });
    return current;
  }

  public addMemberStatus(newStatus: string): string[] {
    const trimmed = newStatus.trim();
    if (!trimmed) return this.getMemberStatuses();
    const current = this.getMemberStatuses();
    if (!current.includes(trimmed)) {
      current.push(trimmed);
      this.updateConfig({ customMemberStatuses: current });
    }
    return current;
  }

  public removeMemberStatus(targetStatus: string): string[] {
    const current = this.getMemberStatuses().filter((s) => s !== targetStatus);
    this.updateConfig({ customMemberStatuses: current });
    return current;
  }

  public addCategory(newCategory: string): string[] {
    const trimmed = newCategory.trim();
    if (!trimmed) return this.getCategories();
    const current = this.getCategories();
    if (!current.includes(trimmed)) {
      current.push(trimmed);
      this.updateConfig({ customCategories: current });
    }
    return current;
  }

  public removeCategory(targetCategory: string): string[] {
    const current = this.getCategories().filter((c) => c !== targetCategory);
    this.updateConfig({ customCategories: current });
    return current;
  }

  public refreshMasterQrToken(): string {
    const newToken = 'mq_master_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now();
    this.updateConfig({ masterQrToken: newToken });
    return newToken;
  }

  public getActiveOnSitePin(): string {
    return this.config.activeOnSitePin || '5027';
  }

  public async refreshActiveOnSitePin(): Promise<string> {
    const newPin = String(Math.floor(1000 + Math.random() * 9000));
    await this.saveConfigConfirmed({ activeOnSitePin: newPin });
    return newPin;
  }

  // --- Projection View: Cumulative Attendance Statistics (Delegates to Pure Domain Engine) ---
  public calculateCumulativeAttendance(
    startDate?: string,
    endDate?: string
  ): { sessions: Schedule[]; memberSummaries: CumulativeMemberAttendance[] } {
    const allSchedules = this.getSchedules();
    const members = this.getMembers();

    const sessions = allSchedules.filter((s) => {
      if (startDate && s.date < startDate) return false;
      if (endDate && s.date > endDate) return false;
      return true;
    });

    if (sessions.length === 0) {
      return {
        sessions: [],
        memberSummaries: members.map((m) => ({
          memberId: m.id,
          memberName: m.name,
          part: m.part,
          memberStatus: m.memberStatus || '정단원',
          joinedAt: m.joinedAt,
          note: m.note,
          totalSessions: 0,
          attended: 0,
          late: 0,
          excused: 0,
          absent: 0,
          attendanceRate: 0,
          recentStatusList: [],
          badges: [],
        })),
      };
    }

    const lateGraceMinutes = this.config.lateGraceMinutes ?? 10;
    const memberSummaries = calculateCumulativeAttendanceWithLifecycle(
      members,
      sessions,
      this.logs,
      getKSTDateString(),
      this.rsvpVotes,
      lateGraceMinutes,
      this.members
    );

    memberSummaries.sort(
      (a, b) => b.attendanceRate - a.attendanceRate || a.memberName.localeCompare(b.memberName)
    );

    return { sessions, memberSummaries };
  }

  // --- Projection View: Reconcile Attendance (Delegates to Pure Domain Engine) ---
  public reconcileMemberAttendance(
    memberId: string,
    scheduleId: string,
    _memberName?: string
  ): AttendanceReconciliation | null {
    const schedule = this.schedules.find((s) => s.id === scheduleId);
    if (!schedule) return null;

    const targetMember = this.members.find((m) => m.id === memberId);
    if (!targetMember) return null;

    const aliasIds = resolveMergedMemberIds(targetMember.id, this.members);

    const memberRsvp = this.rsvpVotes.find(
      (v) => aliasIds.has(v.memberId) && v.scheduleId === scheduleId
    );

    const memberLogs = this.logs.filter(
      (l) => aliasIds.has(l.memberId) && l.scheduleId === scheduleId
    );

    const lateGraceMinutes = this.config.lateGraceMinutes ?? 10;
    return reconcileSingleMemberAttendance(
      targetMember,
      schedule,
      memberLogs,
      memberRsvp,
      lateGraceMinutes
    );
  }

  public reconcileAttendance(scheduleId: string): AttendanceReconciliation[] {
    const schedule = this.schedules.find((s) => s.id === scheduleId);
    if (!schedule) return [];

    return this.getMembers().map((member) => {
      const rec = this.reconcileMemberAttendance(member.id, scheduleId);
      if (rec) return rec;
      return {
        memberId: member.id,
        memberName: member.name,
        part: member.part,
        rsvpStatus: 'UNVOTED',
        finalStatus: '결석',
        isManualOverride: false,
      };
    });
  }

  // --- Remote Google Sheets API Handler ---
  public async fetchRemoteData(overrideUrl?: string): Promise<{ success: boolean; message: string; count?: { members: number; schedules: number; logs: number; locations?: number; programCards?: number } }> {
    const targetUrl = overrideUrl || this.config.sheetsWebAppUrl;
    if (!targetUrl) {
      throw new Error('구글 시트 Web App URL이 설정되지 않았습니다.');
    }

    const fetchUrl = targetUrl.includes('?')
      ? `${targetUrl}&action=GET_INITIAL_DATA`
      : `${targetUrl}?action=GET_INITIAL_DATA`;

    const res = await fetch(fetchUrl, {
      method: 'GET',
      redirect: 'follow',
    });

    if (!res.ok) {
      throw new Error(`구글 시트 통신 오류 (HTTP ${res.status})`);
    }

    const json = (await res.json()) as { success: boolean; error?: string; data?: {
      members?: Member[];
      schedules?: Schedule[];
      rsvpVotes?: RSVPVote[];
      logs?: RawAttendanceLog[];
      recentLogs?: RawAttendanceLog[];
      locations?: LocationPreset[];
      memberHistory?: MemberStatusHistory[];
      programCards?: ProgramCard[];
      config?: Partial<AppConfig>;
    } };

    if (!json.success || !json.data) {
      throw new Error(json.error || '구글 시트 응답 형식이 올바르지 않습니다.');
    }

    const data = json.data;
    if (Array.isArray(data.members)) {
      this.members = parseRemoteMembers(data.members, data.memberHistory);
      saveToStorage(STORAGE_KEYS.MEMBERS, this.members);
    }
    if (Array.isArray(data.schedules)) {
      this.schedules = parseRemoteSchedules(data.schedules);
      saveToStorage(STORAGE_KEYS.SCHEDULES, this.schedules);
    }

    const memberIdSet = new Set(this.members.map((m) => m.id));

    if (Array.isArray(data.rsvpVotes)) {
      this.rsvpVotes = parseRemoteRSVPVotes(data.rsvpVotes, memberIdSet);
      saveToStorage(STORAGE_KEYS.RSVP_VOTES, this.rsvpVotes);
    }

    const logList = data.logs || data.recentLogs;
    if (Array.isArray(logList)) {
      this.logs = parseRemoteAttendanceLogs(logList, memberIdSet);
      saveToStorage(STORAGE_KEYS.LOGS, this.logs);
    }

    if (data.config && typeof data.config === 'object') {
      this.config = { ...this.config, ...data.config, sheetsWebAppUrl: targetUrl };
      saveToStorage(STORAGE_KEYS.CONFIG, this.config);
    }

    if (Array.isArray(data.locations)) {
      this.locations = parseRemoteLocations(data.locations);
      saveToStorage(STORAGE_KEYS.LOCATIONS, this.locations);
    }

    if (Array.isArray(data.programCards)) {
      this.programCards = parseRemoteProgramCards(data.programCards);
      saveToStorage(STORAGE_KEYS.PROGRAM_CARDS, this.programCards);
    }

    return {
      success: true,
      message: '구글 스프레드시트와 성공적으로 동기화되었습니다.',
      count: {
        members: this.members.length,
        schedules: this.schedules.length,
        logs: this.logs.length,
        locations: this.locations.length,
        programCards: this.programCards.length,
      },
    };
  }

  public async sendToGoogleSheet(
    action: string,
    payload: unknown,
    endpointUrl?: string
  ): Promise<{ success: boolean; message?: string; existingMemberId?: string }> {
    const targetUrl = endpointUrl || this.config.sheetsWebAppUrl;
    if (!targetUrl) {
      return { success: false, message: '시트 Web App URL이 설정되지 않았습니다.' };
    }

    try {
      const res = await fetch(targetUrl, {
        method: 'POST',
        redirect: 'follow',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify({ action, data: payload, payload }),
      });

      if (!res.ok) {
        return { success: false, message: `구글 시트 통신 오류 (HTTP ${res.status})` };
      }

      const json = (await res.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
        existingMemberId?: string;
      };
      return {
        success: json.success === true,
        message: json.message || json.error || (json.success === true ? '저장 완료' : '시트 저장이 확인되지 않았습니다.'),
        existingMemberId: json.existingMemberId,
      };
    } catch (err) {
      console.error('[Sheets API] POST failed:', err);
      return { success: false, message: '시트 전송 실패' };
    }
  }
}

export const sheetsService = new SheetsService();
