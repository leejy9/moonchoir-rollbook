import type {
  AppConfig,
  AttendanceReconciliation,
  AttendanceStatus,
  CumulativeMemberAttendance,
  LocationPreset,
  Member,
  MemberStatusHistory,
  ProgramCard,
  RSVPVote,
  RawAttendanceLog,
  Schedule,
} from '../types/rollbook';
import { isMemberRequiredForSchedule } from '../utils/attendanceStats';
import { getKSTTimestampString, getKSTDateString, addDaysKST, normalizeDateToYYYYMMDD } from '../utils/date';
import {
  INITIAL_CONFIG,
  INITIAL_LOCATION_PRESETS,
  INITIAL_LOGS,
  INITIAL_MEMBERS,
  INITIAL_PROGRAM_CARDS,
  INITIAL_RSVP_VOTES,
  INITIAL_SCHEDULES,
} from './mockData';

const STORAGE_KEYS = {
  MEMBERS: 'moonchoir_members_v2',
  SCHEDULES: 'moonchoir_schedules_v2',
  RSVP_VOTES: 'moonchoir_rsvp_votes_v2',
  LOGS: 'moonchoir_logs_v2',
  CONFIG: 'moonchoir_config_v2',
  LOCATIONS: 'moonchoir_locations_v2',
  PENDING_MEMBERS: 'moonchoir_pending_members_v2',
  PROGRAM_CARDS: 'moonchoir_program_cards_v2',
};

class MemoryStorage {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = value;
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  clear(): void {
    this.store = {};
  }
}

const memoryStorage = new MemoryStorage();

function getStorage() {
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    return window.localStorage;
  }
  return memoryStorage;
}

export function resetStorage(): void {
  getStorage().clear();
}

// Safe JSON parser with fallback (Schema Evolution invariant)
function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = getStorage().getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn(`[Storage] Failed to parse key ${key}, falling back to initial data:`, err);
    return fallback;
  }
}

function saveToStorage<T>(key: string, data: T): void {
  try {
    getStorage().setItem(key, JSON.stringify(data));
  } catch (err) {
    console.error(`[Storage] Failed to save key ${key}:`, err);
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
  private pendingMemberIds: Set<string>;

  constructor() {
    this.config = loadFromStorage(STORAGE_KEYS.CONFIG, INITIAL_CONFIG);
    if (!this.config.sheetsWebAppUrl && INITIAL_CONFIG.sheetsWebAppUrl) {
      this.config.sheetsWebAppUrl = INITIAL_CONFIG.sheetsWebAppUrl;
      saveToStorage(STORAGE_KEYS.CONFIG, this.config);
    }
    this.members = loadFromStorage(STORAGE_KEYS.MEMBERS, INITIAL_MEMBERS);
    this.schedules = loadFromStorage(STORAGE_KEYS.SCHEDULES, INITIAL_SCHEDULES);
    this.rsvpVotes = loadFromStorage(STORAGE_KEYS.RSVP_VOTES, INITIAL_RSVP_VOTES);
    this.logs = loadFromStorage(STORAGE_KEYS.LOGS, INITIAL_LOGS);
    this.locations = loadFromStorage(STORAGE_KEYS.LOCATIONS, INITIAL_LOCATION_PRESETS);
    this.programCards = loadFromStorage(STORAGE_KEYS.PROGRAM_CARDS, INITIAL_PROGRAM_CARDS);
    this.pendingMemberIds = new Set(loadFromStorage<string[]>(STORAGE_KEYS.PENDING_MEMBERS, []));
  }

  // --- Read Operations ---
  public getConfig(): AppConfig {
    return {
      ...this.config,
      locationPresets: this.getLocationPresets(),
    };
  }

  public getMembers(includeMerged = false): Member[] {
    // Auto-restore or align bound device profile with member array
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const boundRaw =
          window.localStorage.getItem('moonchoir_bound_device_v1') ||
          window.localStorage.getItem('moonchoir_bound_device');
        if (boundRaw) {
          const bound = JSON.parse(boundRaw);
          if (bound && bound.name) {
            const existingByName = this.members.find((m) => m.name.trim() === String(bound.name).trim());
            if (existingByName) {
              if (bound.memberId !== existingByName.id) {
                bound.memberId = existingByName.id;
                bound.part = existingByName.part;
                window.localStorage.setItem('moonchoir_bound_device_v1', JSON.stringify(bound));
                window.localStorage.setItem('moonchoir_bound_device', JSON.stringify(bound));
              }
            } else if (bound.memberId && !this.members.some((m) => m.id === bound.memberId)) {
              const restored: Member = {
                id: bound.memberId,
                name: bound.name,
                part: bound.part,
                phoneLast4: bound.phoneLast4 || '0000',
                role: bound.part === '선생님' ? 'ADMIN' : bound.part === '객원' ? 'GUEST' : 'MEMBER',
                createdAt: getKSTTimestampString(),
                status: 'ACTIVE',
                joinedAt: getKSTTimestampString().slice(0, 10),
                memberStatus: bound.part === '선생님' ? '선생님' : bound.part === '객원' ? '객원' : '정단원',
                note: '',
              };
              this.members.push(restored);
              saveToStorage(STORAGE_KEYS.MEMBERS, this.members);
              this.sendToGoogleSheet('REGISTER_MEMBER', restored).catch(() => {});
            }
          }
        }
      }
    } catch {
      // ignore storage access errors
    }

    const targetMembers = includeMerged
      ? this.members
      : this.members.filter((m) => m.status !== 'MERGED');

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
    const presets = this.getLocationPresets();
    const locName = schedule.locationName || '';

    // Match by ID, exact name, or substring
    const matched =
      (schedule.locationId ? presets.find((p) => p.id === schedule.locationId) : undefined) ||
      presets.find((p) => p.name.trim() === locName.trim()) ||
      presets.find((p) => locName.includes(p.name) || p.name.includes(locName)) ||
      presets.find((p) => p.isDefault) ||
      presets[0];

    const targetLat = matched?.latitude ?? schedule.targetLat ?? this.config.defaultLat ?? 37.5665;
    const targetLon = matched?.longitude ?? schedule.targetLon ?? this.config.defaultLon ?? 126.9780;
    const radiusMeters = matched?.radiusMeters ?? schedule.radiusMeters ?? this.config.defaultRadius ?? 100;
    const finalLocationName = matched?.name || schedule.locationName || '연습실';

    return {
      targetLat,
      targetLon,
      radiusMeters,
      locationName: finalLocationName,
      detailAddress: schedule.detailAddress || matched?.detailAddress,
      entranceNote: schedule.entranceNote || matched?.entranceNote,
    };
  }

  public getSchedules(): Schedule[] {
    return [...this.schedules].sort((a, b) => a.date.localeCompare(b.date));
  }

  public getRSVPVotes(scheduleId?: string): RSVPVote[] {
    const targetSchedule = scheduleId ? this.schedules.find((s) => s.id === scheduleId) : undefined;
    const list = scheduleId
      ? this.rsvpVotes.filter((v) => {
          if (v.scheduleId === scheduleId) return true;
          if (targetSchedule && v.scheduleId) {
            if (scheduleId.startsWith(v.scheduleId) || v.scheduleId.startsWith(scheduleId)) return true;
          }
          return false;
        })
      : this.rsvpVotes;

    const memberIdSet = new Set(this.members.map((m) => m.id));
    const memberNameSet = new Set(this.members.map((m) => m.name.trim()));

    const map = new Map<string, RSVPVote>();
    list.forEach((v) => {
      if (!v.scheduleId || !v.memberId) return;
      const mId = String(v.memberId).trim();
      const mName = v.memberName ? String(v.memberName).trim() : '';
      // Inner Join: exclude orphan/ghost votes from deleted or non-existent members
      if (!memberIdSet.has(mId) && (!mName || !memberNameSet.has(mName))) {
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
    const memberNameSet = new Set(this.members.map((m) => m.name.trim()));

    const list = scheduleId
      ? (() => {
          const targetSchedule = this.schedules.find((s) => s.id === scheduleId);
          return this.logs.filter((l) => {
            if (l.scheduleId === scheduleId) return true;
            if (targetSchedule) {
              // Fallback 1: scheduleId prefix matching (e.g. sch_20261022 vs sch_20261022_klyd)
              if (l.scheduleId && (scheduleId.startsWith(l.scheduleId) || l.scheduleId.startsWith(scheduleId))) {
                return true;
              }
              // Fallback 2: exact match on schedule date if log has timestamp with YYYY-MM-DD
              if (l.timestamp && l.timestamp.length >= 10 && l.timestamp.slice(0, 10) === targetSchedule.date) {
                return true;
              }
            }
            return false;
          });
        })()
      : this.logs;

    return list.filter((l) => {
      const mId = String(l.memberId || '').trim();
      const mName = l.memberName ? String(l.memberName).trim() : '';
      return memberIdSet.has(mId) || (mName && memberNameSet.has(mName));
    });
  }

  public getLocationPresets(): LocationPreset[] {
    return [...this.locations];
  }

  public getProgramCards(): ProgramCard[] {
    return [...this.programCards];
  }

  public async saveProgramCard(card: ProgramCard): Promise<ProgramCard> {
    const idx = this.programCards.findIndex((c) => c.id === card.id);
    if (idx >= 0) {
      this.programCards[idx] = { ...card };
    } else {
      this.programCards.push({ ...card });
    }
    saveToStorage(STORAGE_KEYS.PROGRAM_CARDS, this.programCards);

    if (this.config.sheetsWebAppUrl) {
      this.sendToGoogleSheet('SAVE_PROGRAM_CARD', card).catch((err) => {
        console.error('[Sheets API] SAVE_PROGRAM_CARD background sync failed:', err);
      });
    }
    return card;
  }

  public async deleteProgramCard(cardId: string): Promise<void> {
    this.programCards = this.programCards.filter((c) => c.id !== cardId);
    saveToStorage(STORAGE_KEYS.PROGRAM_CARDS, this.programCards);

    if (this.config.sheetsWebAppUrl) {
      this.sendToGoogleSheet('DELETE_PROGRAM_CARD', { id: cardId }).catch((err) => {
        console.error('[Sheets API] DELETE_PROGRAM_CARD background sync failed:', err);
      });
    }
  }

  // --- Append-Only Write Operations ---
  public async addCheckInLog(log: RawAttendanceLog): Promise<RawAttendanceLog> {
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

    this.logs.push(log);
    saveToStorage(STORAGE_KEYS.LOGS, this.logs);

    if (this.config.sheetsWebAppUrl) {
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
   * 특정 세션에 대한 단원의 출결 보정 기록 및 로그를 초기화하여 원래 상태로 되돌립니다.
   */
  public async clearAttendanceLog(scheduleId: string, memberId: string): Promise<void> {
    const targetMember = this.members.find((m) => m.id === memberId);
    const siblingIds = new Set(
      this.members
        .filter((m) => m.name === targetMember?.name && (m.phoneLast4 === targetMember?.phoneLast4 || !m.phoneLast4 || !targetMember?.phoneLast4))
        .map((m) => m.id)
    );
    siblingIds.add(memberId);

    const targetSchedule =
      this.schedules.find((s) => s.id === scheduleId) ||
      this.schedules.find((s) => s.id.startsWith(scheduleId) || (s.id && scheduleId.startsWith(s.id)));

    const isMatchingSchedule = (sId: string, timestamp?: string) => {
      if (sId === scheduleId) return true;
      if (sId && scheduleId && (scheduleId.startsWith(sId) || sId.startsWith(scheduleId))) return true;
      if (targetSchedule) {
        if (timestamp && timestamp.length >= 10 && timestamp.slice(0, 10) === targetSchedule.date) return true;
      }
      return false;
    };

    this.logs = this.logs.filter((l) => !(isMatchingSchedule(l.scheduleId, l.timestamp) && siblingIds.has(l.memberId)));
    saveToStorage(STORAGE_KEYS.LOGS, this.logs);

    this.rsvpVotes = this.rsvpVotes.filter((v) => !(isMatchingSchedule(v.scheduleId) && siblingIds.has(v.memberId)));
    saveToStorage(STORAGE_KEYS.RSVP_VOTES, this.rsvpVotes);

    if (this.config.sheetsWebAppUrl) {
      this.sendToGoogleSheet('CLEAR_ATTENDANCE', {
        scheduleId,
        memberId,
        memberName: targetMember?.name,
        scheduleDate: targetSchedule?.date,
      }).catch((err) => {
        console.error('[Sheets API] Clear attendance sync failed:', err);
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
    this.members.push(newMember);
    this.pendingMemberIds.add(newMember.id);
    saveToStorage(STORAGE_KEYS.MEMBERS, this.members);
    saveToStorage(STORAGE_KEYS.PENDING_MEMBERS, Array.from(this.pendingMemberIds));

    if (this.config.sheetsWebAppUrl) {
      try {
        await this.sendToGoogleSheet('REGISTER_MEMBER', newMember);
      } catch (err) {
        console.error('[Sheets API] Member register sync failed:', err);
      }
    }

    return newMember;
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
    this.members = this.members.filter((m) => m.id !== memberId);
    this.pendingMemberIds.delete(memberId);
    saveToStorage(STORAGE_KEYS.MEMBERS, this.members);
    saveToStorage(STORAGE_KEYS.PENDING_MEMBERS, Array.from(this.pendingMemberIds));

    if (this.config.sheetsWebAppUrl) {
      this.sendToGoogleSheet('DELETE_MEMBER', { id: memberId }).catch((err) => {
        console.error('[Sheets API] Member delete sync failed:', err);
      });
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
    const updated = await this.updateMember(memberId, {
      boundDeviceId: deviceId,
      boundDeviceAt: getKSTTimestampString(),
    });
    if (this.config.sheetsWebAppUrl) {
      this.sendToGoogleSheet('BIND_DEVICE', { memberId, deviceId }).catch((err) => {
        console.error('[Sheets API] BIND_DEVICE sync failed:', err);
      });
    }
    return updated;
  }

  public async unbindMemberDevice(memberId: string): Promise<Member> {
    const member = this.members.find((m) => m.id === memberId);
    if (!member) throw new Error('단원을 찾을 수 없습니다.');
    const updated = await this.updateMember(memberId, {
      boundDeviceId: undefined,
      boundDeviceAt: undefined,
    });
    if (this.config.sheetsWebAppUrl) {
      this.sendToGoogleSheet('UNBIND_DEVICE', { memberId }).catch((err) => {
        console.error('[Sheets API] UNBIND_DEVICE sync failed:', err);
      });
    }
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
   * Merges duplicate member record into canonical standard ID without deleting any raw logs.
   * Re-points raw attendance logs & RSVP votes to canonical ID, marks duplicate as MERGED.
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

    // 1. Re-point raw attendance logs from secondaryId to canonicalId
    let affectedLogsCount = 0;
    this.logs.forEach((log) => {
      if (log.memberId === secondaryId) {
        log.memberId = canonicalId;
        log.memberName = canonical.name;
        log.adminNote = log.adminNote
          ? `${log.adminNote} (통합: ${secondaryId})`
          : `[ID통합: ${secondaryId} -> ${canonicalId}]`;
        affectedLogsCount += 1;
      }
    });
    saveToStorage(STORAGE_KEYS.LOGS, this.logs);

    // 2. Re-point RSVP votes from secondaryId to canonicalId
    let affectedRsvpCount = 0;
    this.rsvpVotes.forEach((vote) => {
      if (vote.memberId === secondaryId) {
        vote.memberId = canonicalId;
        vote.memberName = canonical.name;
        affectedRsvpCount += 1;
      }
    });
    saveToStorage(STORAGE_KEYS.RSVP_VOTES, this.rsvpVotes);

    // 3. Mark secondary member as MERGED (preserves record, hides from active view)
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
      this.sendToGoogleSheet('CREATE_SCHEDULE', schedule).catch((err) => {
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
        this.sendToGoogleSheet('CREATE_SCHEDULE', sch).catch((err) => {
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
      this.sendToGoogleSheet('UPDATE_SCHEDULE', this.schedules[idx]).catch((err) => {
        console.error('[Sheets API] Schedule update sync failed:', err);
      });
    }

    return this.schedules[idx];
  }

  public async deleteSchedule(scheduleId: string): Promise<void> {
    this.schedules = this.schedules.filter((s) => s.id !== scheduleId);
    saveToStorage(STORAGE_KEYS.SCHEDULES, this.schedules);

    if (this.config.sheetsWebAppUrl) {
      this.sendToGoogleSheet('DELETE_SCHEDULE', { id: scheduleId }).catch((err) => {
        console.error('[Sheets API] Schedule delete sync failed:', err);
      });
    }
  }

  public async deleteSchedules(scheduleIds: string[]): Promise<void> {
    const idSet = new Set(scheduleIds);
    this.schedules = this.schedules.filter((s) => !idSet.has(s.id));
    saveToStorage(STORAGE_KEYS.SCHEDULES, this.schedules);

    if (this.config.sheetsWebAppUrl) {
      this.sendToGoogleSheet('BATCH_DELETE_SCHEDULES', { ids: scheduleIds }).catch((err) => {
        console.error('[Sheets API] Batch schedule delete sync failed:', err);
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
      this.sendToGoogleSheet('BATCH_UPDATE_SCHEDULES', { ids: scheduleIds, updates }).catch((err) => {
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
    return { ...this.config };
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
    const todayStr = getKSTTimestampString().slice(0, 10);
    const todaySch = this.schedules.find((s) => s.date === todayStr);
    return this.config.activeOnSitePin || todaySch?.checkInPin || '5027';
  }

  public refreshActiveOnSitePin(): string {
    const newPin = String(Math.floor(1000 + Math.random() * 9000));
    this.updateConfig({ activeOnSitePin: newPin });
    const todayStr = getKSTTimestampString().slice(0, 10);
    const todaySch = this.schedules.find((s) => s.date === todayStr);
    if (todaySch) {
      this.updateSchedule(todaySch.id, { checkInPin: newPin }).catch(() => {});
    }
    return newPin;
  }

  // --- Projection View: Cumulative Attendance Statistics ---
  public calculateCumulativeAttendance(
    startDate?: string,
    endDate?: string
  ): { sessions: Schedule[]; memberSummaries: CumulativeMemberAttendance[] } {
    const allSchedules = this.getSchedules();
    const members = this.getMembers();

    // Filter schedules within date range
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

    // Reconcile each session in the window
    const sessionReconciliations = sessions.map((sch) => ({
      schedule: sch,
      reconciliation: this.reconcileAttendance(sch.id),
    }));

    const memberSummaries: CumulativeMemberAttendance[] = members.map((m) => {
      let totalSessions = 0;
      let attended = 0;
      let late = 0;
      let excused = 0;
      let absent = 0;
      let guestAttended = 0;
      const recentStatusList: AttendanceStatus[] = [];

      for (const { schedule, reconciliation } of sessionReconciliations) {
        const isRequired = isMemberRequiredForSchedule(m, schedule.date, schedule);
        const item = reconciliation.find((r) => r.memberId === m.id);
        const hasCheckedIn = item && (item.finalStatus === '출석' || item.finalStatus === '수동인정' || item.finalStatus === '지각');

        if (isRequired) {
          totalSessions += 1;
          const status = item ? item.finalStatus : '결석';
          recentStatusList.push(status);

          if (status === '출석' || status === '수동인정') {
            attended += 1;
          } else if (status === '지각') {
            late += 1;
          } else if (status === '사유결석') {
            excused += 1;
          } else {
            absent += 1;
          }
        } else {
          // 비필참 기간 (입단 전, 휴단/퇴단/객원 기간)
          if (hasCheckedIn) {
            // 자발적 옵트인 참석! 출석한 날만 모수+1, 출석+1
            totalSessions += 1;
            attended += 1;
            guestAttended += 1;
            recentStatusList.push(item!.finalStatus);
          }
          // 출석하지 않았으면 모수 및 결석 카운트 안 함 (결석 왜곡 0%)
        }
      }

      // Formula: (출석 + 지각*0.5) / 총 유효 회차 * 100
      const attendanceRate = totalSessions > 0
        ? Math.min(100, Math.round(((attended + late * 0.5) / totalSessions) * 100))
        : 100;

      // Smart Badges calculation
      const badges: string[] = [];
      if (totalSessions >= 3 && attendanceRate === 100) {
        badges.push('개근');
      } else if (attendanceRate >= 90) {
        badges.push('우수');
      }

      if (absent >= 3 || (totalSessions >= 3 && attendanceRate < 60)) {
        badges.push('주의');
      }

      if (guestAttended > 0) {
        badges.push(`게스트 ${guestAttended}회`);
      }

      return {
        memberId: m.id,
        memberName: m.name,
        part: m.part,
        memberStatus: m.memberStatus || '정단원',
        joinedAt: m.joinedAt,
        note: m.note,
        totalSessions,
        attended,
        late,
        excused,
        absent,
        attendanceRate,
        recentStatusList: recentStatusList.slice(-5), // last 5 sessions
        badges,
        guestAttended,
        isSpecialGuest: guestAttended > 0,
      };
    });

    // Default sort by attendanceRate desc, name asc
    memberSummaries.sort((a, b) => b.attendanceRate - a.attendanceRate || a.memberName.localeCompare(b.memberName));

    return { sessions, memberSummaries };
  }

  // --- Projection View: Reconcile Attendance ---
  /**
   * Reconciles RSVP votes + Raw Attendance Logs into a final projection view.
   * Conforms strictly to Domain Invariant 1.1 (Raw log is immutable; status is calculated view).
   */
  public reconcileAttendance(scheduleId: string): AttendanceReconciliation[] {
    const schedule = this.schedules.find((s) => s.id === scheduleId);
    if (!schedule) return [];

    const scheduleRSVPs = this.getRSVPVotes(scheduleId);
    const scheduleLogs = this.getLogs(scheduleId);

    // Scheduled start time as minutes from midnight
    const [startHour, startMin] = schedule.startTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    const lateGraceMinutes = this.config.lateGraceMinutes ?? 10;
    const lateThresholdMinutes = startMinutes + lateGraceMinutes;

    return this.members.map((member) => {
      // 자연키(이름+전화번호) 기반 다중 ID 세트 (파편화된 과거 ID 구출)
      const siblingIds = new Set(
        this.members
          .filter((m) => m.name === member.name && (m.phoneLast4 === member.phoneLast4 || !m.phoneLast4 || !member.phoneLast4))
          .map((m) => m.id)
      );
      siblingIds.add(member.id);

      const rsvp = scheduleRSVPs.find((v) => siblingIds.has(v.memberId));

      // Recency Resolution: 동일 단원의 다중 로그 중 가장 최신 액션 우선 채택
      const matchingLogs = scheduleLogs
        .filter((l) => siblingIds.has(l.memberId))
        .sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
      const log = matchingLogs.length > 0 ? matchingLogs[matchingLogs.length - 1] : undefined;

      let finalStatus: AttendanceStatus = '결석';
      let checkInTime: string | undefined;

      const isRequired = isMemberRequiredForSchedule(member, schedule.date, schedule);
      const isExempt = !isRequired;

      if (log) {
        checkInTime = log.timestamp;
        if (
          log.adminNote?.includes('결석 처리') ||
          log.adminNote === '관리자 결석 처리' ||
          (log as any).status === '결석'
        ) {
          finalStatus = '결석';
        } else if (log.authMethod === 'MANUAL_BY_ADMIN') {
          finalStatus = '수동인정';
        } else {
          // Check timestamp against schedule start time
          let logMinutes = 0;
          if (log.timestamp.includes('T')) {
            const timePart = log.timestamp.split('T')[1].slice(0, 5); // "HH:mm"
            const [h, m] = timePart.split(':').map(Number);
            logMinutes = (h || 0) * 60 + (m || 0);
          } else {
            const logDate = new Date(log.timestamp);
            if (!isNaN(logDate.getTime())) {
              logMinutes = logDate.getHours() * 60 + logDate.getMinutes();
            } else if (log.timestamp.includes(':')) {
              const [h, m] = log.timestamp.split(':').map(Number);
              logMinutes = (h || 0) * 60 + (m || 0);
            }
          }

          if (logMinutes > lateThresholdMinutes) {
            finalStatus = '지각';
          } else {
            finalStatus = '출석';
          }
        }
      } else {
        // No log found: evaluate exemption or RSVP status
        if (isExempt) {
          finalStatus = '미참';
        } else if (rsvp && rsvp.status === 'ABSENT' && rsvp.reason) {
          finalStatus = '사유결석';
        } else {
          finalStatus = '결석'; // 무단 결석
        }
      }

      return {
        memberId: member.id,
        memberName: member.name,
        part: member.part,
        rsvpStatus: rsvp ? rsvp.status : 'UNVOTED',
        rsvpReason: rsvp?.reason,
        checkInTime,
        authMethod: log?.authMethod,
        distanceMeters: log?.distanceMeters,
        isVerifiedLocation: log?.isVerifiedLocation,
        finalStatus,
        isManualOverride: log?.authMethod === 'MANUAL_BY_ADMIN',
        adminNote: log?.adminNote,
      };
    });
  }

  /**
   * Reconciles attendance for a single member on a single schedule.
   */
  public reconcileMemberAttendance(memberId: string, scheduleId: string, memberName?: string): AttendanceReconciliation | null {
    const list = this.reconcileAttendance(scheduleId);
    if (memberName) {
      const byName = list.find((r) => r.memberName === memberName);
      if (byName) return byName;
    }
    const targetMember = this.members.find((m) => m.id === memberId || (memberName && m.name === memberName));
    if (targetMember) {
      return (
        list.find((r) => r.memberId === targetMember.id) ||
        list.find((r) => r.memberName === targetMember.name) ||
        null
      );
    }
    return list.find((r) => r.memberId === memberId) || null;
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
      // Map member history by memberId
      const historyByMember = new Map<string, MemberStatusHistory[]>();
      if (Array.isArray(data.memberHistory)) {
        for (const h of data.memberHistory) {
          if (!h.memberId) continue;
          const list = historyByMember.get(h.memberId) || [];
          list.push({
            id: h.id || `hist_${Math.random()}`,
            memberId: h.memberId,
            status: h.status,
            part: h.part,
            startDate: h.startDate,
            endDate: h.endDate || '2999-12-31',
            reason: h.reason || '',
            createdAt: h.createdAt || '',
          });
          historyByMember.set(h.memberId, list);
        }
      }

      const remoteMembers = data.members.map((m) => {
        const localExisting = this.members.find((cur) => cur.id === m.id);
        const rawPhone = m.phone ? String(m.phone).trim() : '';
        const phone = rawPhone || (localExisting?.phone ? String(localExisting.phone).trim() : '');
        const rawLast4 = m.phoneLast4 !== undefined && m.phoneLast4 !== null ? String(m.phoneLast4).trim() : '';
        const phoneLast4 = rawLast4 ? rawLast4.padStart(4, '0') : (phone ? phone.replace(/\D/g, '').slice(-4) : '0000');
        const history = historyByMember.get(m.id) || m.statusHistory;

        return {
          ...m,
          name: String(m.name || ''),
          phone,
          phoneLast4,
          joinedAt: m.joinedAt ? String(m.joinedAt) : (m.createdAt ? String(m.createdAt).slice(0, 10) : ''),
          memberStatus: m.memberStatus || (m.role === 'ADMIN' ? '선생님' : m.role === 'GUEST' ? '객원' : '정단원'),
          note: m.note ? String(m.note) : '',
          boundDeviceId: m.boundDeviceId ? String(m.boundDeviceId) : undefined,
          boundDeviceAt: m.boundDeviceAt ? String(m.boundDeviceAt) : undefined,
          ...(history && history.length > 0 ? { statusHistory: history } : {}),
        };
      });

      // Clear confirmed remote members from pending set
      const remoteIds = new Set(remoteMembers.map((m) => m.id));
      for (const id of remoteIds) {
        this.pendingMemberIds.delete(id);
      }

      // Check if bound device profile exists locally and isn't in remote yet
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          const boundRaw = window.localStorage.getItem('moonchoir_bound_device');
          if (boundRaw) {
            const bound = JSON.parse(boundRaw);
            if (bound && bound.memberId && !remoteIds.has(bound.memberId)) {
              this.pendingMemberIds.add(bound.memberId);
            }
          }
        }
      } catch {
        // ignore
      }

      saveToStorage(STORAGE_KEYS.PENDING_MEMBERS, Array.from(this.pendingMemberIds));

      // Keep only remote members + pending user-created members
      const unsyncedLocalMembers = this.members.filter((m) => this.pendingMemberIds.has(m.id));

      this.members = [...remoteMembers, ...unsyncedLocalMembers];
      saveToStorage(STORAGE_KEYS.MEMBERS, this.members);

      // Background push any unsynced local members to Google Sheets
      for (const unsynced of unsyncedLocalMembers) {
        this.sendToGoogleSheet('REGISTER_MEMBER', unsynced).catch(() => {});
      }
    }
    if (Array.isArray(data.schedules)) {
      this.schedules = data.schedules.map((s) => {
        let normalizedDate = s.date;
        if (s.date) {
          normalizedDate = normalizeDateToYYYYMMDD(s.date);
        }
        let startTime = s.startTime || '19:30';
        let endTime = s.endTime || '21:30';
        if (startTime.includes('T')) {
          const dt = new Date(startTime);
          if (!isNaN(dt.getTime())) {
            const kst = new Date(dt.getTime() + (9 * 60 + dt.getTimezoneOffset()) * 60 * 1000);
            startTime = kst.toISOString().slice(11, 16);
          }
        }
        if (endTime.includes('T')) {
          const dt = new Date(endTime);
          if (!isNaN(dt.getTime())) {
            const kst = new Date(dt.getTime() + (9 * 60 + dt.getTimezoneOffset()) * 60 * 1000);
            endTime = kst.toISOString().slice(11, 16);
          }
        }
        const rawParts = (s as unknown as Record<string, unknown>).targetParts;
        const targetParts = typeof rawParts === 'string'
          ? (rawParts.split(',').map((p: string) => p.trim()).filter(Boolean) as import('../types/rollbook').PartType[])
          : Array.isArray(rawParts) ? (rawParts as import('../types/rollbook').PartType[]) : undefined;
        const rawMembers = (s as unknown as Record<string, unknown>).targetMemberIds;
        const targetMemberIds = typeof rawMembers === 'string'
          ? rawMembers.split(',').map((id: string) => id.trim()).filter(Boolean)
          : Array.isArray(rawMembers) ? (rawMembers as string[]) : undefined;

        return {
          ...s,
          date: normalizedDate,
          startTime,
          endTime,
          targetParts,
          targetMemberIds,
        };
      });
      saveToStorage(STORAGE_KEYS.SCHEDULES, this.schedules);
    }
    // Build canonical member ID resolution map
    const primaryMemberIdByName = new Map<string, string>();
    this.members.forEach((m) => {
      if (m.name) primaryMemberIdByName.set(m.name.trim(), m.id);
    });

    if (Array.isArray(data.rsvpVotes)) {
      const voteMap = new Map<string, RSVPVote>();
      data.rsvpVotes.forEach((v) => {
        if (!v.scheduleId) return;
        let memberId = String(v.memberId || '').trim();
        // Resolve alias if memberId unknown but memberName matches an active member
        if (!this.members.some((m) => m.id === memberId) && v.memberName && primaryMemberIdByName.has(String(v.memberName).trim())) {
          memberId = primaryMemberIdByName.get(String(v.memberName).trim())!;
        }
        // Ghost check: must match a member in this.members
        const memberExists = this.members.some((m) => m.id === memberId);
        if (!memberExists) return;

        const canonicalVote: RSVPVote = {
          ...v,
          memberId,
        };
        const key = `${String(v.scheduleId).trim()}_${memberId}`;
        const existing = voteMap.get(key);
        if (!existing || (v.timestamp && (!existing.timestamp || v.timestamp >= existing.timestamp))) {
          voteMap.set(key, canonicalVote);
        }
      });
      this.rsvpVotes = Array.from(voteMap.values());
      saveToStorage(STORAGE_KEYS.RSVP_VOTES, this.rsvpVotes);
    }
    const logList = data.logs || data.recentLogs;
    if (Array.isArray(logList)) {
      this.logs = logList
        .filter((l: RawAttendanceLog) => {
          let memberId = String(l.memberId || '').trim();
          if (!this.members.some((m) => m.id === memberId) && l.memberName && primaryMemberIdByName.has(String(l.memberName).trim())) {
            memberId = primaryMemberIdByName.get(String(l.memberName).trim())!;
          }
          return this.members.some((m) => m.id === memberId);
        })
        .map((l: RawAttendanceLog) => {
          let memberId = String(l.memberId || '').trim();
          if (!this.members.some((m) => m.id === memberId) && l.memberName && primaryMemberIdByName.has(String(l.memberName).trim())) {
            memberId = primaryMemberIdByName.get(String(l.memberName).trim())!;
          }
          return {
            ...l,
            memberId,
          };
        });
      saveToStorage(STORAGE_KEYS.LOGS, this.logs);
    }
    if (data.config && typeof data.config === 'object') {
      this.config = { ...this.config, ...data.config, sheetsWebAppUrl: targetUrl };
      saveToStorage(STORAGE_KEYS.CONFIG, this.config);
    }
    if (Array.isArray(data.locations) && data.locations.length > 0) {
      const remoteLocations: LocationPreset[] = data.locations.map((l) => ({
        id: String(l.id || `loc_${Date.now()}`),
        name: String(l.name || ''),
        address: l.address ? String(l.address) : undefined,
        detailAddress: l.detailAddress ? String(l.detailAddress) : undefined,
        entranceNote: l.entranceNote ? String(l.entranceNote) : undefined,
        latitude: typeof l.latitude === 'number' ? l.latitude : parseFloat(String(l.latitude || 37.5665)),
        longitude: typeof l.longitude === 'number' ? l.longitude : parseFloat(String(l.longitude || 126.9780)),
        radiusMeters: typeof l.radiusMeters === 'number' ? l.radiusMeters : parseInt(String(l.radiusMeters || 100), 10),
        isDefault: l.isDefault === true || String(l.isDefault).toUpperCase() === 'TRUE',
      }));

      const remoteLocIds = new Set(remoteLocations.map((l) => l.id));
      const localOnly = this.locations.filter((l) => !remoteLocIds.has(l.id));
      this.locations = [...remoteLocations, ...localOnly];
      saveToStorage(STORAGE_KEYS.LOCATIONS, this.locations);

      // 원격 시트에 장소 데이터가 비어있고 로컬 장소가 있으면 백그라운드로 자동 업로드
      if (remoteLocations.length === 0 && localOnly.length > 0 && this.config.sheetsWebAppUrl) {
        localOnly.forEach((loc) => {
          this.sendToGoogleSheet('SAVE_LOCATION', loc).catch(() => {});
        });
      }
    }

    if (Array.isArray(data.programCards)) {
      const remoteCards: ProgramCard[] = data.programCards.map((c) => ({
        id: String(c.id || `card_${Date.now()}`),
        title: String(c.title || ''),
        description: c.description ? String(c.description) : undefined,
        category: c.category || '정기연습',
        defaultLocationId: c.defaultLocationId ? String(c.defaultLocationId) : undefined,
        defaultStartTime: c.defaultStartTime ? String(c.defaultStartTime) : '19:30',
        defaultEndTime: c.defaultEndTime ? String(c.defaultEndTime) : '21:30',
        targetAudienceType: c.targetAudienceType || 'ALL',
        targetParts: typeof (c as unknown as Record<string, unknown>).targetParts === 'string'
          ? (((c as unknown as Record<string, unknown>).targetParts as string).split(',').map((p: string) => p.trim()).filter(Boolean) as import('../types/rollbook').PartType[])
          : Array.isArray((c as unknown as Record<string, unknown>).targetParts) ? ((c as unknown as Record<string, unknown>).targetParts as import('../types/rollbook').PartType[]) : undefined,
        targetMemberIds: typeof (c as unknown as Record<string, unknown>).targetMemberIds === 'string'
          ? (((c as unknown as Record<string, unknown>).targetMemberIds as string).split(',').map((id: string) => id.trim()).filter(Boolean) as string[])
          : Array.isArray((c as unknown as Record<string, unknown>).targetMemberIds) ? ((c as unknown as Record<string, unknown>).targetMemberIds as string[]) : undefined,
        isArchived: c.isArchived === true || String(c.isArchived).toUpperCase() === 'TRUE',
        createdAt: c.createdAt ? String(c.createdAt) : getKSTTimestampString(),
      }));

      const remoteCardIds = new Set(remoteCards.map((c) => c.id));
      const localOnlyCards = this.programCards.filter((c) => !remoteCardIds.has(c.id));
      this.programCards = [...remoteCards, ...localOnlyCards];
      saveToStorage(STORAGE_KEYS.PROGRAM_CARDS, this.programCards);

      // 원격 시트에 일정카드가 비어있고 로컬 카드가 있으면 백그라운드로 자동 업로드
      if (remoteCards.length === 0 && localOnlyCards.length > 0 && this.config.sheetsWebAppUrl) {
        localOnlyCards.forEach((card) => {
          this.sendToGoogleSheet('SAVE_PROGRAM_CARD', card).catch(() => {});
        });
      }
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

  private async sendToGoogleSheet(action: string, payload: unknown): Promise<void> {
    if (!this.config.sheetsWebAppUrl) return;

    // Google Apps Script redirect: use mode: 'no-cors' so mobile browsers
    // never abort or throw CORS redirect errors on 302 responses.
    try {
      await fetch(this.config.sheetsWebAppUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify({ action, data: payload, payload }),
      });
    } catch (err) {
      console.warn('[Sheets API] POST send warning:', err);
    }
  }
}

export const sheetsService = new SheetsService();

