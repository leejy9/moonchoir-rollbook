import type {
  AppConfig,
  AttendanceReconciliation,
  AttendanceStatus,
  CumulativeMemberAttendance,
  LocationPreset,
  Member,
  RSVPVote,
  RawAttendanceLog,
  Schedule,
} from '../types/rollbook';
import {
  INITIAL_CONFIG,
  INITIAL_LOCATION_PRESETS,
  INITIAL_LOGS,
  INITIAL_MEMBERS,
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
    this.pendingMemberIds = new Set(loadFromStorage<string[]>(STORAGE_KEYS.PENDING_MEMBERS, []));
  }

  // --- Read Operations ---
  public getConfig(): AppConfig {
    return {
      ...this.config,
      locationPresets: this.getLocationPresets(),
    };
  }

  public getMembers(): Member[] {
    // Auto-restore bound device profile if missing from member array
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const boundRaw = window.localStorage.getItem('moonchoir_bound_device');
        if (boundRaw) {
          const bound = JSON.parse(boundRaw);
          if (bound && bound.memberId && !this.members.some((m) => m.id === bound.memberId)) {
            const restored: Member = {
              id: bound.memberId,
              name: bound.name,
              part: bound.part,
              phoneLast4: bound.phoneLast4 || '0000',
              role: bound.part === '선생님' ? 'ADMIN' : bound.part === '객원' ? 'GUEST' : 'MEMBER',
              createdAt: new Date().toISOString(),
              status: 'ACTIVE',
              joinedAt: new Date().toISOString().slice(0, 10),
              memberStatus: bound.part === '선생님' ? '선생님' : bound.part === '객원' ? '객원' : '정단원',
              note: '',
            };
            this.members.push(restored);
            saveToStorage(STORAGE_KEYS.MEMBERS, this.members);
            this.sendToGoogleSheet('REGISTER_MEMBER', restored).catch(() => {});
          }
        }
      }
    } catch {
      // ignore storage access errors
    }

    // Backward compatibility adapter (Schema Evolution Invariant)
    return this.members.map((m) => ({
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

    const targetLat = schedule.targetLat ?? matched?.latitude ?? this.config.defaultLat ?? 37.5665;
    const targetLon = schedule.targetLon ?? matched?.longitude ?? this.config.defaultLon ?? 126.9780;
    const radiusMeters = schedule.radiusMeters ?? matched?.radiusMeters ?? this.config.defaultRadius ?? 100;
    const finalLocationName = schedule.locationName || matched?.name || '연습실';

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
    if (!scheduleId) return [...this.rsvpVotes];
    return this.rsvpVotes.filter((v) => v.scheduleId === scheduleId);
  }

  public getLogs(scheduleId?: string): RawAttendanceLog[] {
    if (!scheduleId) return [...this.logs];
    return this.logs.filter((l) => l.scheduleId === scheduleId);
  }

  public getLocationPresets(): LocationPreset[] {
    return [...this.locations];
  }

  // --- Append-Only Write Operations ---
  public async addCheckInLog(log: RawAttendanceLog): Promise<RawAttendanceLog> {
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

  public async updateMember(memberId: string, updates: Partial<Member>): Promise<Member> {
    const idx = this.members.findIndex((m) => m.id === memberId);
    if (idx < 0) {
      throw new Error(`대원을 찾을 수 없습니다. (ID: ${memberId})`);
    }
    this.members[idx] = { ...this.members[idx], ...updates };
    saveToStorage(STORAGE_KEYS.MEMBERS, this.members);

    if (this.config.sheetsWebAppUrl) {
      this.sendToGoogleSheet('UPDATE_MEMBER', this.members[idx]).catch((err) => {
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
      let attended = 0;
      let late = 0;
      let excused = 0;
      let absent = 0;
      const recentStatusList: AttendanceStatus[] = [];

      for (const { reconciliation } of sessionReconciliations) {
        const item = reconciliation.find((r) => r.memberId === m.id);
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
      }

      const totalSessions = sessions.length;
      // Formula: (출석 + 지각*0.5) / 총 회차 * 100
      const attendanceRate = totalSessions > 0
        ? Math.min(100, Math.round(((attended + late * 0.5) / totalSessions) * 100))
        : 0;

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
      const rsvp = scheduleRSVPs.find((v) => v.memberId === member.id);
      const log = scheduleLogs.find((l) => l.memberId === member.id);

      let finalStatus: AttendanceStatus = '결석';
      let checkInTime: string | undefined;

      if (log) {
        checkInTime = log.timestamp;
        if (log.authMethod === 'MANUAL_BY_ADMIN') {
          finalStatus = '수동인정';
        } else {
          // Check timestamp against schedule start time
          let logMinutes = 0;
          if (log.timestamp.includes('T')) {
            const timePart = log.timestamp.split('T')[1].slice(0, 5); // "HH:mm"
            const [h, m] = timePart.split(':').map(Number);
            logMinutes = h * 60 + m;
          } else {
            const logDate = new Date(log.timestamp);
            logMinutes = logDate.getHours() * 60 + logDate.getMinutes();
          }

          if (logMinutes > lateThresholdMinutes) {
            finalStatus = '지각';
          } else {
            finalStatus = '출석';
          }
        }
      } else {
        // No log found: evaluate RSVP status
        if (rsvp && rsvp.status === 'ABSENT' && rsvp.reason) {
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

  // --- Remote Google Sheets API Handler ---
  public async fetchRemoteData(overrideUrl?: string): Promise<{ success: boolean; message: string; count?: { members: number; schedules: number; logs: number; locations?: number } }> {
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
      config?: Partial<AppConfig>;
    } };

    if (!json.success || !json.data) {
      throw new Error(json.error || '구글 시트 응답 형식이 올바르지 않습니다.');
    }

    const data = json.data;
    if (Array.isArray(data.members)) {
      const remoteMembers = data.members.map((m) => {
        const phone = m.phone ? String(m.phone).trim() : '';
        const rawLast4 = m.phoneLast4 !== undefined && m.phoneLast4 !== null ? String(m.phoneLast4).trim() : '';
        const phoneLast4 = rawLast4 ? rawLast4.padStart(4, '0') : (phone ? phone.replace(/\D/g, '').slice(-4) : '0000');
        return {
          ...m,
          name: String(m.name || ''),
          phone,
          phoneLast4,
          joinedAt: m.joinedAt ? String(m.joinedAt) : (m.createdAt ? String(m.createdAt).slice(0, 10) : ''),
          memberStatus: m.memberStatus || (m.role === 'ADMIN' ? '선생님' : m.role === 'GUEST' ? '객원' : '정단원'),
          note: m.note ? String(m.note) : '',
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
        if (s.date && (s.date.includes('T') || !/^\d{4}-\d{2}-\d{2}$/.test(s.date))) {
          const d = new Date(s.date);
          if (!isNaN(d.getTime())) {
            const kstDate = new Date(d.getTime() + (9 * 60 + d.getTimezoneOffset()) * 60 * 1000);
            normalizedDate = kstDate.toISOString().slice(0, 10);
          }
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
        return {
          ...s,
          date: normalizedDate,
          startTime,
          endTime,
        };
      });
      saveToStorage(STORAGE_KEYS.SCHEDULES, this.schedules);
    }
    if (Array.isArray(data.rsvpVotes)) {
      this.rsvpVotes = data.rsvpVotes;
      saveToStorage(STORAGE_KEYS.RSVP_VOTES, this.rsvpVotes);
    }
    const logList = data.logs || data.recentLogs;
    if (Array.isArray(logList)) {
      this.logs = logList;
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
    }

    return {
      success: true,
      message: '구글 스프레드시트와 성공적으로 동기화되었습니다.',
      count: {
        members: this.members.length,
        schedules: this.schedules.length,
        logs: this.logs.length,
        locations: this.locations.length,
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

