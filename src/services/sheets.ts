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
  ScheduleComment,
  ScheduleCommentEvent,
  PracticeCatalog,
  PracticePiece,
  PracticeTrack,
  MediaUsage,
  ListenSessionPayload,
  MemberActivity,
} from '../types/rollbook';
import {
  calculateCumulativeAttendanceWithLifecycle,
  isScheduleVisibleToMember,
  reconcileSingleMemberAttendance,
  resolveMergedMemberIds,
} from '../utils/attendanceStats';
import { resolveMemberIdentity } from '../utils/memberIdentity';
import { getKSTTimestampString, getKSTDateString, addDaysKST, parseKSTDate } from '../utils/date';
import { buildScheduleComments, createCommentEventId, normalizeCommentText } from '../utils/scheduleComments';
import {
  INITIAL_CONFIG,
  INITIAL_LOCATION_PRESETS,
  INITIAL_MEMBERS,
} from './mockData';
import {
  parsePracticeCatalog,
  parseRemoteAttendanceLogs,
  parseRemoteCommentEvents,
  parseRemoteLocations,
  parseRemoteMembers,
  parseRemoteProgramCards,
  parseRemoteRSVPVotes,
  parseRemoteSchedules,
  resolveScheduleLocationFromPresets,
  serializeScheduleForSheet,
} from './sheetsParser';
import { parseMemberActivity } from '../utils/activityParser';
import {
  STORAGE_KEYS,
  loadFromStorage,
  resetStorage,
  clearDataCache,
  saveToStorage,
} from './sheetsStorage';
import type { RemoteBackend, RemoteSnapshot } from './backend/types';
import { normalizeAppConfig } from './configNormalize';
import { GasBackend } from './backend/gasBackend';
import { SupabaseBackend, type SupabaseConfig } from './backend/supabaseBackend';
import { extractIssuedToken, getAdminToken, setAdminToken, type AdminTier } from './adminSession';

export { resetStorage, clearDataCache };
export type { RemoteBackend, RemoteSnapshot, SupabaseConfig };

function createDefaultBackend(getUrl: () => string | undefined): RemoteBackend {
  const isTest = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.MODE === 'test' : false;
  const backendKind = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_BACKEND : undefined;
  const supaUrl = (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_SUPABASE_URL : undefined) || 'https://hvsftdbqwxjbpfogoldw.supabase.co';
  const supaKey = (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_SUPABASE_ANON_KEY : undefined) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2c2Z0ZGJxd3hqYnBmb2dvbGR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUwNDk2NjksImV4cCI6MjExMDYyNTY2OX0.Pg5U9ger1SD9mrjmKf404--AkKF5RRfU2E7va5EepjQ';

  // In production/dev runtime, default to Supabase unless explicitly configured as 'gas'
  if (!isTest && backendKind !== 'gas' && supaUrl && supaKey) {
    return new SupabaseBackend({ url: supaUrl, anonKey: supaKey });
  }
  if (backendKind === 'supabase' && supaUrl && supaKey) {
    return new SupabaseBackend({ url: supaUrl, anonKey: supaKey });
  }
  return new GasBackend(getUrl);
}

export class ExistingMemberConflictError extends Error {
  public readonly existingMemberId: string;

  constructor(existingMemberId: string) {
    super('이미 같은 이름과 연락처로 등록된 단원이 있습니다. 기존 명부에서 확인해 연결해 주세요.');
    this.name = 'ExistingMemberConflictError';
    this.existingMemberId = existingMemberId;
  }
}

export type SyncStatus = 'IDLE' | 'SYNCING' | 'ERROR';

export interface SyncState {
  status: SyncStatus;
  /** 마지막으로 시트 데이터를 성공적으로 받아온 시각(ms). 한 번도 없으면 0 */
  lastSyncedAt: number;
  error?: string;
}

export interface SheetsNotice {
  id: number;
  kind: 'error';
  message: string;
}

/** 같은 요청이 이 간격 안에 다시 오면 새로 받아오지 않는다(각 기기 안에서만 적용). */
export const MIN_REFRESH_INTERVAL_MS = 20_000;
const REFRESH_AFTER_WRITE_DELAY_MS = 1_500;
const NOTICE_DEDUPE_MS = 4_000;

const WRITE_LABELS: Record<string, string> = {
  RECORD_ATTENDANCE: '출석',
  SUBMIT_RSVP: '사전 투표',
  CANCEL_RSVP: '투표 취소',
  CLEAR_ATTENDANCE: '출결 초기화',
  UPDATE_MEMBER: '단원 정보',
  DELETE_MEMBER: '단원 삭제',
  MERGE_MEMBERS: '단원 병합',
  CREATE_SCHEDULE: '일정 등록',
  UPDATE_SCHEDULE: '일정 수정',
  DELETE_SCHEDULE: '일정 삭제',
  BATCH_DELETE_SCHEDULES: '일정 일괄 삭제',
  BATCH_UPDATE_SCHEDULES: '일정 일괄 수정',
  SAVE_LOCATION: '장소 저장',
  DELETE_LOCATION: '장소 삭제',
  SAVE_CONFIG: '설정 저장',
  ADD_COMMENT: '댓글',
  EDIT_COMMENT: '댓글 수정',
  DELETE_COMMENT: '댓글 삭제',
  SAVE_PRACTICE_PIECE: '연습곡 저장',
  SET_PRACTICE_PIECE_ARCHIVED: '연습곡 보관',
  SAVE_PRACTICE_TRACK: '트랙 저장',
  SET_PRACTICE_TRACK_ARCHIVED: '트랙 보관',
  SET_PROGRAM_PIECES: '시즌 곡 목록 저장',
  REORDER_PRACTICE_TRACKS: '트랙 순서 변경',
};

/** 서버에서 읽기만 하는 요청: 성공해도 데이터가 바뀌지 않으므로 새로고침을 예약하지 않는다. */
const NON_MUTATING_ACTIONS = new Set([
  'VERIFY_ADMIN_PIN',
  'VERIFY_SUPER_ADMIN_PIN',
  'VERIFY_ON_SITE_PIN',
  'GET_PRACTICE_CATALOG',
  'GET_MEDIA_USAGE',
  'GET_MEMBER_ACTIVITY',
  'LOG_LISTEN_SESSION',
]);

export class SheetsService {
  private config: AppConfig;
  private members: Member[];
  private schedules: Schedule[];
  private rsvpVotes: RSVPVote[];
  private logs: RawAttendanceLog[];
  private locations: LocationPreset[];
  private programCards: ProgramCard[];
  private commentEvents: ScheduleCommentEvent[];
  private practiceCatalog: PracticeCatalog;

  // --- Sync state (refresh-on-navigation, write tracking, failure notices) ---
  private inFlightWrites = new Set<Promise<unknown>>();
  private writeEpoch = 0;
  private refreshPromise: Promise<boolean> | null = null;
  private refreshAfterWriteTimer: ReturnType<typeof setTimeout> | null = null;
  private syncState: SyncState = { status: 'IDLE', lastSyncedAt: 0 };
  private syncListeners = new Set<() => void>();
  private noticeListeners = new Set<(notice: SheetsNotice) => void>();
  private noticeSeq = 0;
  private lastNoticeAt = new Map<string, number>();

  private backend: RemoteBackend;

  constructor(backend?: RemoteBackend) {
    const storedConfig = loadFromStorage(STORAGE_KEYS.CONFIG, { ...INITIAL_CONFIG, locationPresets: [] });
    this.config = { ...INITIAL_CONFIG, locationPresets: [], ...normalizeAppConfig(storedConfig) };
    if (!this.config.sheetsWebAppUrl && INITIAL_CONFIG.sheetsWebAppUrl) {
      this.config.sheetsWebAppUrl = INITIAL_CONFIG.sheetsWebAppUrl;
      saveToStorage(STORAGE_KEYS.CONFIG, this.config);
    }
    this.backend = backend || createDefaultBackend(() => this.config.sheetsWebAppUrl);
    this.members = loadFromStorage(STORAGE_KEYS.MEMBERS, []);
    this.schedules = loadFromStorage(STORAGE_KEYS.SCHEDULES, []);
    this.rsvpVotes = loadFromStorage(STORAGE_KEYS.RSVP_VOTES, []);
    this.logs = loadFromStorage(STORAGE_KEYS.LOGS, []);
    this.locations = loadFromStorage(STORAGE_KEYS.LOCATIONS, []);
    this.programCards = loadFromStorage(STORAGE_KEYS.PROGRAM_CARDS, []);
    this.commentEvents = loadFromStorage(STORAGE_KEYS.COMMENTS, []);
    this.practiceCatalog = loadFromStorage(STORAGE_KEYS.PRACTICE_CATALOG, {
      pieces: [],
      tracks: [],
      programPieces: [],
      performances: [],
      performancePieces: [],
    });
  }

  public isBackendActive(): boolean {
    if (this.backend.kind === 'supabase') return true;
    return Boolean(this.config.sheetsWebAppUrl);
  }

  public canSync(): boolean {
    return this.isBackendActive();
  }

  public getBackend(): RemoteBackend {
    return this.backend;
  }

  public getBackendKind(): 'gas' | 'supabase' {
    return this.backend.kind;
  }

  public getSupabaseConfig(): SupabaseConfig | null {
    if (this.backend instanceof SupabaseBackend) {
      return this.backend.getConfig();
    }
    return null;
  }

  public setBackend(backend: RemoteBackend): void {
    this.backend = backend;
  }

  public seedTestData(data: {
    schedules?: Schedule[];
    rsvpVotes?: RSVPVote[];
    logs?: RawAttendanceLog[];
    programCards?: ProgramCard[];
    members?: Member[];
    locations?: LocationPreset[];
    comments?: ScheduleCommentEvent[];
  }): void {
    this.members = data.members ? [...data.members] : JSON.parse(JSON.stringify(INITIAL_MEMBERS));
    saveToStorage(STORAGE_KEYS.MEMBERS, this.members);

    this.locations = data.locations ? [...data.locations] : JSON.parse(JSON.stringify(INITIAL_LOCATION_PRESETS));
    saveToStorage(STORAGE_KEYS.LOCATIONS, this.locations);

    this.commentEvents = data.comments ? [...data.comments] : [];
    saveToStorage(STORAGE_KEYS.COMMENTS, this.commentEvents);

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

  /**
   * 단원 화면용 일정 목록. 노출 범위가 `TARGETS_ONLY`인 일정은 대상이 아닌 단원에게 숨긴다.
   * 대상이 아니어도 그 일정에 출석 기록이 이미 있으면 보여서(관리자가 대신 기록한 경우 등) 본인 기록이 사라지지 않게 한다.
   * 관리자 화면은 `getSchedules()`를 그대로 쓴다.
   */
  public getSchedulesForMember(memberId: string | undefined): Schedule[] {
    const schedules = this.getSchedules();
    if (!schedules.some((s) => s.visibility === 'TARGETS_ONLY')) return schedules;

    const canonicalId = memberId
      ? resolveMemberIdentity(memberId, this.members).canonicalId
      : undefined;
    const member = canonicalId ? this.members.find((m) => m.id === canonicalId) : undefined;

    return schedules.filter((s) => {
      if (isScheduleVisibleToMember(member, s)) return true;
      if (!member) return false;
      // TARGETS_ONLY 일정이라도 해당 단원의 최종 출석이 실제로 인정된 경우에만 내역 보존을 위해 노출
      // (단순 raw 로그 존재나 취소/미인정 로그만 있는 비대상자에게는 절대 노출하지 않음)
      const reconciled = this.reconcileMemberAttendance(member.id, s.id, member.name);
      return Boolean(reconciled && (reconciled.finalStatus === '출석' || reconciled.finalStatus === '지각'));
    });
  }

  // --- Schedule comments (append-only event log, confirmed by the sheet before showing) ---

  private isSameMember = (a: string, b: string): boolean =>
    a === b ||
    resolveMemberIdentity(a, this.members).canonicalId ===
      resolveMemberIdentity(b, this.members).canonicalId;

  /**
   * 댓글에 보이는 이름·파트는 쓸 때의 값(스냅샷)이 아니라 작성자(통합된 단원은 대표 단원)의 현재 값을 우선한다.
   * 단원 기록이 없을 때만 쓸 때의 값을 쓴다. 시트의 원본 행은 바뀌지 않는다.
   */
  private withCurrentAuthor(comment: ScheduleComment): ScheduleComment {
    const canonicalId = resolveMemberIdentity(comment.memberId, this.members).canonicalId;
    const author = this.members.find((m) => m.id === canonicalId);
    return author ? { ...comment, memberName: author.name, part: author.part } : comment;
  }

  /** 일정 하나의 댓글(오래된 순). 삭제된 댓글은 빠지고 수정은 반영된다. */
  public getComments(scheduleId: string): ScheduleComment[] {
    return buildScheduleComments(
      this.commentEvents.filter((e) => e.scheduleId === scheduleId),
      this.isSameMember
    ).map((comment) => this.withCurrentAuthor(comment));
  }

  /** 일정별 댓글 개수 (관리자 화면 배지용) */
  public getCommentCounts(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const comment of buildScheduleComments(this.commentEvents, this.isSameMember)) {
      counts.set(comment.scheduleId, (counts.get(comment.scheduleId) ?? 0) + 1);
    }
    return counts;
  }

  /** 통합 별칭까지 같은 사람인지 확인한다(내 댓글 표시용). */
  public isOwnComment(comment: Pick<ScheduleComment, 'memberId'>, memberId: string): boolean {
    return this.isSameMember(comment.memberId, memberId);
  }

  private async recordCommentEvent(action: string, event: ScheduleCommentEvent): Promise<ScheduleCommentEvent> {
    // 같은 id를 다시 보내는 재시도: 이미 반영된 이벤트면 한 번만 둔다
    if (this.commentEvents.some((e) => e.id === event.id)) return event;
    if (this.isBackendActive()) {
      const result = await this.sendToGoogleSheet(action, event);
      if (!result.success) {
        throw new Error(result.message || '댓글이 시트에서 확인되지 않았습니다. 네트워크를 확인하고 다시 시도해 주세요.');
      }
    }
    this.commentEvents.push(event);
    saveToStorage(STORAGE_KEYS.COMMENTS, this.commentEvents);
    return event;
  }

  public async addComment(input: {
    scheduleId: string;
    member: Pick<Member, 'id' | 'name' | 'part'>;
    text: string;
    deviceId?: string;
    /** 같은 댓글을 다시 보낼 때 같은 id를 쓰도록 호출자가 유지한다 */
    eventId?: string;
  }): Promise<ScheduleCommentEvent> {
    const normalized = normalizeCommentText(input.text);
    if (normalized.error !== undefined) throw new Error(normalized.error);
    return this.recordCommentEvent('ADD_COMMENT', {
      id: input.eventId || createCommentEventId(),
      scheduleId: input.scheduleId,
      memberId: input.member.id,
      memberName: input.member.name,
      part: input.member.part,
      action: 'CREATE',
      text: normalized.text,
      timestamp: getKSTTimestampString(),
      deviceId: input.deviceId,
    });
  }

  private findOwnComment(commentId: string, memberId: string, verb: string): ScheduleComment {
    const comment = buildScheduleComments(this.commentEvents, this.isSameMember).find((c) => c.id === commentId);
    if (!comment) throw new Error('댓글을 찾을 수 없습니다. 이미 삭제되었을 수 있어요.');
    if (!this.isSameMember(comment.memberId, memberId)) throw new Error(`본인이 쓴 댓글만 ${verb}할 수 있습니다.`);
    return comment;
  }

  public async editComment(input: {
    commentId: string;
    member: Pick<Member, 'id' | 'name' | 'part'>;
    text: string;
    deviceId?: string;
    eventId?: string;
  }): Promise<ScheduleCommentEvent> {
    const normalized = normalizeCommentText(input.text);
    if (normalized.error !== undefined) throw new Error(normalized.error);
    const comment = this.findOwnComment(input.commentId, input.member.id, '수정');
    return this.recordCommentEvent('EDIT_COMMENT', {
      id: input.eventId || createCommentEventId(),
      scheduleId: comment.scheduleId,
      memberId: input.member.id,
      memberName: input.member.name,
      part: input.member.part,
      action: 'EDIT',
      targetId: comment.id,
      text: normalized.text,
      timestamp: getKSTTimestampString(),
      deviceId: input.deviceId,
    });
  }

  public async deleteComment(input: {
    commentId: string;
    member: Pick<Member, 'id' | 'name' | 'part'>;
    deviceId?: string;
    eventId?: string;
  }): Promise<ScheduleCommentEvent> {
    const comment = this.findOwnComment(input.commentId, input.member.id, '삭제');
    return this.recordCommentEvent('DELETE_COMMENT', {
      id: input.eventId || createCommentEventId(),
      scheduleId: comment.scheduleId,
      memberId: input.member.id,
      memberName: input.member.name,
      part: input.member.part,
      action: 'DELETE',
      targetId: comment.id,
      timestamp: getKSTTimestampString(),
      deviceId: input.deviceId,
    });
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

  /** 최고 관리자 감사 로그용 전체 원천 출결 로그(Append-Only) */
  public getRawLogs(): RawAttendanceLog[] {
    return [...this.logs];
  }

  /** 최고 관리자 감사 로그용 전체 원천 댓글 이벤트(생성/수정/삭제) */
  public getCommentEvents(): ScheduleCommentEvent[] {
    return [...this.commentEvents];
  }

  /** 최고 관리자 감사 로그용 전체 원천 사전투표(RSVP) 이력 */
  public getAllRSVPVotes(): RSVPVote[] {
    return [...this.rsvpVotes];
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

  // --- Practice Catalog Methods (MEMBER_UX_AUDIO_SPEC.md §4-3) ---

  public getPracticeCatalog(): PracticeCatalog {
    return {
      pieces: [...this.practiceCatalog.pieces],
      tracks: [...this.practiceCatalog.tracks],
      programPieces: [...this.practiceCatalog.programPieces],
      performances: [...(this.practiceCatalog.performances || [])],
      performancePieces: [...(this.practiceCatalog.performancePieces || [])],
    };
  }

  public async refreshPracticeCatalog(): Promise<PracticeCatalog> {
    if (this.backend.kind === 'gas') {
      return { pieces: [], tracks: [], programPieces: [], performances: [], performancePieces: [] };
    }

    const result = await this.sendToGoogleSheet('GET_PRACTICE_CATALOG', { includeArchived: true });
    if (!result.success) {
      throw new Error(result.message || '연습곡 목록을 불러오지 못했습니다.');
    }

    this.practiceCatalog = parsePracticeCatalog(result.data);
    saveToStorage(STORAGE_KEYS.PRACTICE_CATALOG, this.practiceCatalog);
    return this.getPracticeCatalog();
  }

  public async savePracticePiece(
    piece: Partial<PracticePiece> & { title: string }
  ): Promise<PracticePiece> {
    const id = piece.id || `piece_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const target: PracticePiece = {
      id,
      title: piece.title,
      composer: piece.composer ?? '',
      arranger: piece.arranger ?? '',
      scoreUrl: piece.scoreUrl ?? '',
      scoreStorageKey: piece.scoreStorageKey ?? '',
      scoreSizeBytes: piece.scoreSizeBytes,
      notes: piece.notes ?? '',
      isArchived: piece.isArchived ?? false,
      createdAt: piece.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = await this.sendToGoogleSheet('SAVE_PRACTICE_PIECE', target);
    if (!result.success) {
      throw new Error(result.message || '연습곡 저장에 실패했습니다.');
    }

    const finalId = (result as { id?: string }).id || target.id;
    target.id = finalId;

    const idx = this.practiceCatalog.pieces.findIndex((p) => p.id === finalId);
    if (idx >= 0) {
      this.practiceCatalog.pieces[idx] = { ...this.practiceCatalog.pieces[idx], ...target };
    } else {
      this.practiceCatalog.pieces.push(target);
    }
    saveToStorage(STORAGE_KEYS.PRACTICE_CATALOG, this.practiceCatalog);
    return target;
  }

  public async setPracticePieceArchived(pieceId: string, isArchived: boolean): Promise<void> {
    const result = await this.sendToGoogleSheet('SET_PRACTICE_PIECE_ARCHIVED', {
      id: pieceId,
      isArchived,
    });
    if (!result.success) {
      throw new Error(result.message || '연습곡 보관 상태 변경에 실패했습니다.');
    }

    const piece = this.practiceCatalog.pieces.find((p) => p.id === pieceId);
    if (piece) {
      piece.isArchived = isArchived;
      piece.updatedAt = new Date().toISOString();
      saveToStorage(STORAGE_KEYS.PRACTICE_CATALOG, this.practiceCatalog);
    }
  }

  public async savePracticeTrack(
    track: Partial<PracticeTrack> & { pieceId: string; label: string }
  ): Promise<PracticeTrack> {
    const id = track.id || `track_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const target: PracticeTrack = {
      id,
      pieceId: track.pieceId,
      label: track.label,
      kind: track.kind ?? '',
      source: track.source ?? '',
      url: track.url ?? '',
      storageKey: track.storageKey ?? '',
      mimeType: track.mimeType ?? '',
      durationSeconds: track.durationSeconds,
      sizeBytes: track.sizeBytes,
      orderIndex:
        track.orderIndex ??
        this.practiceCatalog.tracks.filter((t) => t.pieceId === track.pieceId).length,
      isArchived: track.isArchived ?? false,
      createdAt: track.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = await this.sendToGoogleSheet('SAVE_PRACTICE_TRACK', target);
    if (!result.success) {
      throw new Error(result.message || '트랙 저장에 실패했습니다.');
    }

    const finalId = (result as { id?: string }).id || target.id;
    target.id = finalId;

    const idx = this.practiceCatalog.tracks.findIndex((t) => t.id === finalId);
    if (idx >= 0) {
      this.practiceCatalog.tracks[idx] = { ...this.practiceCatalog.tracks[idx], ...target };
    } else {
      this.practiceCatalog.tracks.push(target);
    }
    saveToStorage(STORAGE_KEYS.PRACTICE_CATALOG, this.practiceCatalog);
    return target;
  }

  public async setPracticeTrackArchived(trackId: string, isArchived: boolean): Promise<void> {
    const result = await this.sendToGoogleSheet('SET_PRACTICE_TRACK_ARCHIVED', {
      id: trackId,
      isArchived,
    });
    if (!result.success) {
      throw new Error(result.message || '트랙 보관 상태 변경에 실패했습니다.');
    }

    const track = this.practiceCatalog.tracks.find((t) => t.id === trackId);
    if (track) {
      track.isArchived = isArchived;
      track.updatedAt = new Date().toISOString();
      saveToStorage(STORAGE_KEYS.PRACTICE_CATALOG, this.practiceCatalog);
    }
  }

  public async setProgramPieces(programId: string, pieceIds: string[]): Promise<void> {
    const result = await this.sendToGoogleSheet('SET_PROGRAM_PIECES', {
      programId,
      pieceIds,
    });
    if (!result.success) {
      throw new Error(result.message || '시즌 곡 목록 저장에 실패했습니다.');
    }

    for (const pp of this.practiceCatalog.programPieces) {
      if (pp.programId === programId && !pieceIds.includes(pp.pieceId)) {
        pp.isArchived = true;
      }
    }
    pieceIds.forEach((pieceId, idx) => {
      const existing = this.practiceCatalog.programPieces.find(
        (pp) => pp.programId === programId && pp.pieceId === pieceId
      );
      if (existing) {
        existing.orderIndex = idx;
        existing.isArchived = false;
      } else {
        this.practiceCatalog.programPieces.push({
          programId,
          pieceId,
          orderIndex: idx,
          isArchived: false,
        });
      }
    });
    saveToStorage(STORAGE_KEYS.PRACTICE_CATALOG, this.practiceCatalog);
  }

  public async reorderPracticeTracks(pieceId: string, trackIds: string[]): Promise<void> {
    const result = await this.sendToGoogleSheet('REORDER_PRACTICE_TRACKS', {
      pieceId,
      trackIds,
    });
    if (!result.success) {
      throw new Error(result.message || '트랙 순서 변경에 실패했습니다.');
    }

    trackIds.forEach((trackId, idx) => {
      const track = this.practiceCatalog.tracks.find((t) => t.id === trackId);
      if (track) {
        track.orderIndex = idx;
        track.updatedAt = new Date().toISOString();
      }
    });
    saveToStorage(STORAGE_KEYS.PRACTICE_CATALOG, this.practiceCatalog);
  }

  public async savePerformance(performance: {
    id?: string;
    title: string;
    performanceDate?: string;
    venue?: string;
  }): Promise<{ success: boolean; id?: string }> {
    const result = await this.sendToGoogleSheet('SAVE_PERFORMANCE', performance);
    if (!result.success) {
      throw new Error(result.message || '공연 저장에 실패했습니다.');
    }
    const dataObj =
      result.data && typeof result.data === 'object' ? (result.data as { id?: string }) : undefined;
    const finalId = dataObj?.id || (result as { id?: string }).id;
    return { success: true, id: finalId };
  }

  public async setPerformanceArchived(performanceId: string, archived: boolean): Promise<void> {
    const result = await this.sendToGoogleSheet('SET_PERFORMANCE_ARCHIVED', {
      performanceId,
      archived,
    });
    if (!result.success) {
      throw new Error(result.message || '공연 보관 상태 변경에 실패했습니다.');
    }
  }

  public async setPerformancePieces(performanceId: string, pieceIds: string[]): Promise<void> {
    const result = await this.sendToGoogleSheet('SET_PERFORMANCE_PIECES', {
      performanceId,
      pieceIds,
    });
    if (!result.success) {
      throw new Error(result.message || '공연 곡 목록 저장에 실패했습니다.');
    }
  }

  public async deletePracticePiece(pieceId: string): Promise<{ success: boolean; storageKeys?: string[] }> {
    const result = await this.sendToGoogleSheet('DELETE_PRACTICE_PIECE', { pieceId });
    if (!result.success) {
      throw new Error(result.message || '곡 삭제에 실패했습니다.');
    }
    const data = result.data as { storageKeys?: string[] } | undefined;
    return { success: true, storageKeys: data?.storageKeys || (result as { storageKeys?: string[] }).storageKeys || [] };
  }

  public async deletePracticeTrack(trackId: string): Promise<{ success: boolean; storageKeys?: string[] }> {
    const result = await this.sendToGoogleSheet('DELETE_PRACTICE_TRACK', { trackId });
    if (!result.success) {
      throw new Error(result.message || '트랙 삭제에 실패했습니다.');
    }
    const data = result.data as { storageKeys?: string[] } | undefined;
    return { success: true, storageKeys: data?.storageKeys || (result as { storageKeys?: string[] }).storageKeys || [] };
  }

  public async deletePerformance(performanceId: string): Promise<void> {
    const result = await this.sendToGoogleSheet('DELETE_PERFORMANCE', { performanceId });
    if (!result.success) {
      throw new Error(result.message || '공연 삭제에 실패했습니다.');
    }
  }

  public async getMediaUsage(): Promise<MediaUsage | null> {
    if (this.backend.kind === 'gas') {
      return null;
    }
    const result = await this.sendToGoogleSheet('GET_MEDIA_USAGE', {});
    if (!result.success || !result.data) {
      return null;
    }
    const data = result.data as Record<string, unknown>;
    return {
      tracksBytes: Number(data.tracksBytes) || 0,
      scoresBytes: Number(data.scoresBytes) || 0,
      totalBytes: Number(data.totalBytes) || 0,
    };
  }

  public async logListenSession(payload: ListenSessionPayload): Promise<boolean> {
    if (this.backend.kind === 'gas') {
      return false;
    }
    const result = await this.sendToGoogleSheet('LOG_LISTEN_SESSION', payload);
    return result.success;
  }

  public async getMemberActivity(memberIds: string[] | string): Promise<MemberActivity | null> {
    if (this.backend.kind === 'gas') {
      return null;
    }
    const requestedIds = Array.isArray(memberIds) ? memberIds : [memberIds];
    if (requestedIds.length === 0) {
      return null;
    }
    const identity = resolveMemberIdentity(requestedIds[0], this.members);
    const allIds = new Set([...identity.aliasIds, ...requestedIds]);
    const orderedIds = [
      identity.canonicalId,
      ...[...allIds].filter((id) => id !== identity.canonicalId).sort((a, b) => a.localeCompare(b)),
    ];
    if (orderedIds.length > 20) {
      console.warn('[SheetsService] Member activity aliases exceed the 20-ID server limit; truncating.');
    }
    const result = await this.sendToGoogleSheet('GET_MEMBER_ACTIVITY', {
      memberIds: orderedIds.slice(0, 20),
    });
    if (!result.success || !result.data) {
      return null;
    }
    return parseMemberActivity(result.data);
  }

  // --- Append-Only Write Operations (Idempotent by log.id) ---
  public async addCheckInLog(
    log: RawAttendanceLog,
    checkInPin?: string
  ): Promise<RawAttendanceLog> {
    if (log.authMethod === 'MANUAL_PIN' && !checkInPin) {
      throw new Error('현장 PIN이 누락되어 출석을 확인할 수 없습니다.');
    }

    // 단원 본인의 출석(QR/PIN)은 시트가 확정해야 완료로 본다. 관리자 수동 입력만 먼저 반영하고 뒤에서 저장한다.
    const requiresSheetConfirmation = log.authMethod !== 'MANUAL_BY_ADMIN';
    if (
      requiresSheetConfirmation &&
      (log.authMethod === 'MANUAL_PIN' || this.isBackendActive())
    ) {
      const result = await this.sendToGoogleSheet(
        'RECORD_ATTENDANCE',
        checkInPin ? { ...log, checkInPin } : log
      );
      if (!result.success) {
        throw new Error(
          result.message ||
            (log.authMethod === 'MANUAL_PIN'
              ? '현장 PIN 출석이 시트에서 확인되지 않았습니다.'
              : '출석이 시트에서 확인되지 않았습니다. 네트워크를 확인하고 다시 시도해 주세요.')
        );
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

    if (!requiresSheetConfirmation && this.isBackendActive()) {
      this.syncInBackground('RECORD_ATTENDANCE', log);
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

    if (this.isBackendActive()) {
      this.syncInBackground('SUBMIT_RSVP', vote);
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

    if (this.isBackendActive()) {
      this.syncInBackground('CLEAR_ATTENDANCE', {
        scheduleId,
        memberId,
        memberName: targetMember?.name,
        part: targetMember?.part,
        adminNote: '관리자 출결 취소 (초기화)',
        scheduleDate: targetSchedule?.date,
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

      if (this.isBackendActive()) {
        this.syncInBackground('CANCEL_RSVP', { scheduleId, memberId, removedVoteId: removed.id });
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

    // 처음 연동된 기기 값은 시트가 유지한다. 서버가 돌려준 값을 캐시에 그대로 반영한다.
    const sheetDeviceId =
      typeof result.boundDeviceId === 'string' && result.boundDeviceId
        ? result.boundDeviceId
        : member.boundDeviceId || deviceId;
    const updatedMember: Member = {
      ...member,
      phone,
      phoneLast4,
      boundDeviceId: sheetDeviceId,
      boundDeviceAt:
        sheetDeviceId === member.boundDeviceId
          ? member.boundDeviceAt
          : getKSTTimestampString(),
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

    if (this.isBackendActive()) {
      this.syncInBackground('UPDATE_MEMBER', {
        ...this.members[idx],
        historyItem: effectiveHistoryItem,
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
      if (this.isBackendActive()) {
        this.syncInBackground('DELETE_MEMBER', { id: memberId });
      }
    } else {
      this.members = this.members.filter((m) => m.id !== memberId);
      saveToStorage(STORAGE_KEYS.MEMBERS, this.members);

      if (this.isBackendActive()) {
        this.syncInBackground('DELETE_MEMBER', { id: memberId });
      }
    }
  }

  public async bindMemberDevice(memberId: string, deviceId: string): Promise<Member> {
    const member = this.members.find((m) => m.id === memberId);
    if (!member) throw new Error('단원을 찾을 수 없습니다.');

    const result = await this.sendToGoogleSheet('BIND_DEVICE', { memberId, deviceId });
    if (!result.success) {
      throw new Error(result.message || '기기 연동이 구글 시트에서 확인되지 않았습니다.');
    }

    // 여러 브라우저 허용(임시): 시트에 이미 연동 기기가 있으면 그 값을 유지한다.
    const sheetDeviceId =
      typeof result.boundDeviceId === 'string' && result.boundDeviceId
        ? result.boundDeviceId
        : member.boundDeviceId || deviceId;
    const updated = {
      ...member,
      boundDeviceId: sheetDeviceId,
      boundDeviceAt:
        sheetDeviceId === member.boundDeviceId
          ? member.boundDeviceAt
          : getKSTTimestampString(),
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
    if (this.isBackendActive()) {
      this.syncInBackground('MERGE_MEMBERS', {
        canonicalId,
        secondaryId,
      });
    }

    return { affectedLogsCount, affectedRsvpCount };
  }

  public async addSchedule(schedule: Schedule): Promise<Schedule> {
    this.schedules.push(schedule);
    saveToStorage(STORAGE_KEYS.SCHEDULES, this.schedules);

    if (this.isBackendActive()) {
      this.syncInBackground('CREATE_SCHEDULE', serializeScheduleForSheet(schedule));
    }

    return schedule;
  }

  public async addSchedules(schedules: Schedule[]): Promise<Schedule[]> {
    this.schedules.push(...schedules);
    saveToStorage(STORAGE_KEYS.SCHEDULES, this.schedules);

    if (this.isBackendActive()) {
      for (const sch of schedules) {
        this.syncInBackground('CREATE_SCHEDULE', serializeScheduleForSheet(sch));
      }
    }

    return schedules;
  }

  public async updateSchedule(scheduleId: string, updates: Partial<Schedule>): Promise<Schedule> {
    const idx = this.schedules.findIndex((s) => s.id === scheduleId);
    if (idx < 0) throw new Error(`일정을 찾을 수 없습니다. (ID: ${scheduleId})`);
    this.schedules[idx] = { ...this.schedules[idx], ...updates };
    saveToStorage(STORAGE_KEYS.SCHEDULES, this.schedules);

    if (this.isBackendActive()) {
      this.syncInBackground('UPDATE_SCHEDULE', serializeScheduleForSheet(this.schedules[idx]));
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
      if (this.isBackendActive()) {
        this.syncInBackground('DELETE_SCHEDULE', { id: scheduleId, forceHardDelete: false });
      }
    } else {
      // 활동이 없거나, 관리자가 명시적으로 완전 영구 삭제를 요청한 경우
      this.schedules = this.schedules.filter((s) => s.id !== scheduleId);
      saveToStorage(STORAGE_KEYS.SCHEDULES, this.schedules);

      if (this.isBackendActive()) {
        this.syncInBackground('DELETE_SCHEDULE', { id: scheduleId, forceHardDelete: true });
      }
    }
  }

  public async deleteSchedules(scheduleIds: string[], forceHardDelete: boolean = false): Promise<void> {
    if (forceHardDelete) {
      // 강제 영구 삭제 모드: 모든 지정 일정을 물리 삭제
      const idsToDeleteSet = new Set(scheduleIds);
      this.schedules = this.schedules.filter((s) => !idsToDeleteSet.has(s.id));
      saveToStorage(STORAGE_KEYS.SCHEDULES, this.schedules);

      if (this.isBackendActive()) {
        this.syncInBackground('BATCH_DELETE_SCHEDULES', { ids: scheduleIds, forceHardDelete: true });
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

    if (this.isBackendActive()) {
      this.syncInBackground('BATCH_DELETE_SCHEDULES', { ids: scheduleIds, forceHardDelete: false });
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

    if (this.isBackendActive()) {
      const serializedUpdates = {
        ...updates,
        ...(updates.targetParts !== undefined
          ? { targetParts: Array.isArray(updates.targetParts) ? updates.targetParts.join(',') : (updates.targetParts || '') }
          : {}),
        ...(updates.targetMemberIds !== undefined
          ? { targetMemberIds: Array.isArray(updates.targetMemberIds) ? updates.targetMemberIds.join(',') : (updates.targetMemberIds || '') }
          : {}),
      };
      this.syncInBackground('BATCH_UPDATE_SCHEDULES', { ids: scheduleIds, updates: serializedUpdates });
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

    if (this.isBackendActive()) {
      this.syncInBackground('SAVE_LOCATION', preset);
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

    if (this.isBackendActive()) {
      this.syncInBackground('SAVE_LOCATION', this.locations[idx]);
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

    if (this.isBackendActive()) {
      this.syncInBackground('DELETE_LOCATION', { id });
    }
  }

  public updateConfig(newConfig: Partial<AppConfig>): AppConfig {
    this.config = { ...this.config, ...normalizeAppConfig(newConfig) };
    saveToStorage(STORAGE_KEYS.CONFIG, this.config);

    if (this.isBackendActive()) {
      this.syncInBackground('SAVE_CONFIG', { config: newConfig });
    }

    return { ...this.config };
  }

  public async saveConfigConfirmed(newConfig: Partial<AppConfig> | Record<string, unknown>): Promise<AppConfig> {
    const rawUrl = 'sheetsWebAppUrl' in newConfig && typeof newConfig.sheetsWebAppUrl === 'string' ? newConfig.sheetsWebAppUrl : undefined;
    const nextEndpoint =
      rawUrl !== undefined
        ? rawUrl.trim()
        : this.config.sheetsWebAppUrl;
    const endpoint = this.config.sheetsWebAppUrl || nextEndpoint;
    if (this.backend.kind === 'gas' && (!endpoint || !nextEndpoint)) {
      throw new Error('구글 시트 Web App URL이 설정되지 않았습니다.');
    }

    const result = await this.sendToGoogleSheet(
      'SAVE_CONFIG',
      { config: newConfig },
      endpoint || undefined
    );
    if (!result.success) {
      throw new Error(result.message || '설정 저장이 구글 시트에서 확인되지 않았습니다.');
    }

    this.config = { ...this.config, ...normalizeAppConfig(newConfig), sheetsWebAppUrl: nextEndpoint };
    saveToStorage(STORAGE_KEYS.CONFIG, this.config);
    return { ...this.config };
  }

  public async verifyOnSitePin(pin: string): Promise<void> {
    const result = await this.sendToGoogleSheet('VERIFY_ON_SITE_PIN', { pin });
    if (!result.success) {
      throw new Error(result.message || '현장 PIN을 시트에서 확인할 수 없습니다.');
    }
  }

  /**
   * 운영진 PIN을 서버에서 확인한다. 서버를 확인할 수 없으면 실패로 처리한다
   * (기기 안에서 PIN을 비교하는 대체 경로는 두지 않는다).
   * Supabase 백엔드는 성공 시 관리자 세션 토큰을 발급하고, 이 토큰으로만 관리자 RPC가 실행된다.
   */
  public async verifyAdminPin(pin: string): Promise<void> {
    await this.verifyPrivilegedPin('VERIFY_ADMIN_PIN', 'admin', pin, '관리자');
  }

  public async verifySuperAdminPin(pin: string): Promise<void> {
    await this.verifyPrivilegedPin('VERIFY_SUPER_ADMIN_PIN', 'super', pin, '최고 관리자');
  }

  private async verifyPrivilegedPin(
    action: 'VERIFY_ADMIN_PIN' | 'VERIFY_SUPER_ADMIN_PIN',
    tier: AdminTier,
    pin: string,
    label: string
  ): Promise<void> {
    const trimmed = pin.trim();
    if (!trimmed) {
      throw new Error(`${label} PIN을 입력해주세요.`);
    }

    let result: Awaited<ReturnType<SheetsService['sendToGoogleSheet']>>;
    try {
      result = await this.sendToGoogleSheet(action, { pin: trimmed });
    } catch (err) {
      console.warn(`[SheetsService] ${label} PIN verification request failed:`, err);
      throw new Error(`서버에 연결할 수 없어 ${label} 인증을 할 수 없습니다. 네트워크를 확인해 주세요.`);
    }

    if (!result.success) {
      throw new Error(result.message || `${label} PIN 번호가 일치하지 않습니다.`);
    }

    if (this.backend.kind === 'supabase') {
      const issued = extractIssuedToken(result.data);
      if (!issued || issued.tier !== tier) {
        throw new Error(`${label} 세션을 발급받지 못했습니다. 서버 보안 업데이트가 적용됐는지 확인해 주세요.`);
      }
      setAdminToken(tier, issued.token);
    }
  }

  /** Supabase 백엔드에서는 관리자 화면에 서버 발급 토큰이 필요하다. */
  public requiresAdminToken(): boolean {
    return this.backend.kind === 'supabase';
  }

  /** 서버 쪽 세션도 함께 폐기한다(실패해도 로컬 토큰은 지운다). */
  public logoutAdminSession(tier: AdminTier): void {
    const token = getAdminToken(tier);
    setAdminToken(tier, null);
    if (token && this.backend.kind === 'supabase') {
      void this.backend.callAction('ADMIN_LOGOUT', { token }).catch((err) => {
        console.warn('[SheetsService] Admin logout request failed:', err);
      });
    }
  }

  /**
   * 서버에 저장된 PIN을 읽는다. 운영진 세션은 현장 PIN만, 최고 관리자 세션은 전부 받는다.
   * 알 수 없는 값은 빈 문자열로 둔다(기본 PIN 값을 화면에 지어내지 않는다).
   */
  public async getAdminSecrets(): Promise<{ adminPin: string; activeOnSitePin: string; superAdminPin: string }> {
    if (this.backend.kind === 'supabase') {
      try {
        const res = await this.backend.callAction('GET_ADMIN_SECRETS', {});
        if (res.success && res.data && typeof res.data === 'object') {
          const secrets = res.data as { adminPin?: string; activeOnSitePin?: string; superAdminPin?: string };
          if (secrets.activeOnSitePin) {
            this.config = { ...this.config, activeOnSitePin: secrets.activeOnSitePin };
          }
          if (secrets.adminPin) {
            this.config = { ...this.config, adminPin: secrets.adminPin };
          }
          saveToStorage(STORAGE_KEYS.CONFIG, this.config);
          return {
            adminPin: secrets.adminPin ?? '',
            activeOnSitePin: secrets.activeOnSitePin ?? '',
            superAdminPin: secrets.superAdminPin ?? '',
          };
        }
      } catch (err) {
        console.warn('[Sheets] Failed to fetch server secrets:', err);
      }
      return { adminPin: '', activeOnSitePin: this.config.activeOnSitePin ?? '', superAdminPin: '' };
    }
    return {
      adminPin: this.config.adminPin ?? '',
      activeOnSitePin: this.config.activeOnSitePin ?? '',
      superAdminPin: '',
    };
  }

  // --- Field Emergency Controls (GPS Bypass) ---
  public isEmergencyGpsBypassed(): boolean {
    const until = this.config.emergencyGpsBypassUntil;
    if (!until) return false;
    return new Date().toISOString() < until;
  }

  public async setEmergencyGpsBypass(durationMinutes: number): Promise<string> {
    if (durationMinutes <= 0) {
      await this.saveConfigConfirmed({ emergencyGpsBypassUntil: '' });
      return '';
    }
    const untilDate = new Date(Date.now() + durationMinutes * 60 * 1000);
    const untilIso = untilDate.toISOString();
    await this.saveConfigConfirmed({ emergencyGpsBypassUntil: untilIso });
    return untilIso;
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
    return this.config.activeOnSitePin ?? '';
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
    if (this.backend.kind === 'gas' && !targetUrl) {
      throw new Error('구글 시트 Web App URL이 설정되지 않았습니다.');
    }

    const data = await this.loadSnapshotAfterPendingWrites(targetUrl || '');
    if (!data) {
      throw new Error('저장 중인 변경이 있어 동기화를 잠시 미뤘습니다. 잠시 후 다시 시도해 주세요.');
    }
    return this.applyRemoteSnapshot(data, targetUrl || '');
  }

  private async requestRemoteSnapshot(targetUrl: string): Promise<RemoteSnapshot> {
    return this.backend.requestSnapshot(targetUrl);
  }

  /**
   * 전송 중인 쓰기가 모두 끝난 뒤에 시트를 읽는다. 읽는 동안 새 쓰기가 시작되면 그 응답은 쓰기보다
   * 오래된 데이터일 수 있어 버리고 다시 읽는다. 계속 실패하면 null(반영하지 않음).
   */
  private async loadSnapshotAfterPendingWrites(targetUrl: string): Promise<RemoteSnapshot | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
      while (this.inFlightWrites.size > 0) {
        await Promise.allSettled([...this.inFlightWrites]);
      }
      const epoch = this.writeEpoch;
      const snapshot = await this.requestRemoteSnapshot(targetUrl);
      if (epoch === this.writeEpoch && this.inFlightWrites.size === 0) {
        return snapshot;
      }
    }
    return null;
  }

  private applyRemoteSnapshot(data: RemoteSnapshot, targetUrl: string): { success: boolean; message: string; count?: { members: number; schedules: number; logs: number; locations?: number; programCards?: number } } {
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
      this.config = {
        ...this.config,
        ...normalizeAppConfig(data.config),
        sheetsWebAppUrl: targetUrl || this.config.sheetsWebAppUrl,
      };
      saveToStorage(STORAGE_KEYS.CONFIG, this.config);
    }

    if (Array.isArray(data.locations)) {
      this.locations = parseRemoteLocations(data.locations);
      saveToStorage(STORAGE_KEYS.LOCATIONS, this.locations);
    }

    if (Array.isArray(data.comments)) {
      this.commentEvents = parseRemoteCommentEvents(data.comments);
      saveToStorage(STORAGE_KEYS.COMMENTS, this.commentEvents);
    }

    if (Array.isArray(data.programCards)) {
      this.programCards = parseRemoteProgramCards(data.programCards);
      saveToStorage(STORAGE_KEYS.PROGRAM_CARDS, this.programCards);
    }

    this.setSyncState({ status: 'IDLE', lastSyncedAt: Date.now(), error: undefined });

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

  // --- Refresh / sync state -------------------------------------------------

  public getSyncState(): SyncState {
    return this.syncState;
  }

  public subscribeSync(listener: () => void): () => void {
    this.syncListeners.add(listener);
    return () => {
      this.syncListeners.delete(listener);
    };
  }

  public subscribeNotices(listener: (notice: SheetsNotice) => void): () => void {
    this.noticeListeners.add(listener);
    return () => {
      this.noticeListeners.delete(listener);
    };
  }

  public notifySyncListeners(): void {
    this.syncListeners.forEach((listener) => listener());
  }

  private setSyncState(next: SyncState): void {
    this.syncState = next;
    this.syncListeners.forEach((listener) => listener());
  }

  // --- Realtime Event Merging (Supabase WebSocket Realtime) ---

  public mergeRealtimeAttendanceLog(
    eventTypeOrLog: string | RawAttendanceLog,
    rawRecord?: RawAttendanceLog | null,
    rawOldRecord?: RawAttendanceLog | null
  ): void {
    let action: string;
    let targetRecord: RawAttendanceLog | null | undefined;
    let targetOldRecord: RawAttendanceLog | null | undefined;

    if (typeof eventTypeOrLog === 'object' && eventTypeOrLog !== null) {
      action = 'INSERT';
      targetRecord = eventTypeOrLog;
      targetOldRecord = null;
    } else {
      action = String(eventTypeOrLog || '').toUpperCase();
      targetRecord = rawRecord;
      targetOldRecord = rawOldRecord;
    }

    if (action === 'DELETE') {
      const target = targetOldRecord ?? targetRecord;
      if (!target || !target.id) return;
      const initialLen = this.logs.length;
      this.logs = this.logs.filter((l) => l.id !== target.id);
      if (this.logs.length !== initialLen) {
        saveToStorage(STORAGE_KEYS.LOGS, this.logs);
        this.notifySyncListeners();
      }
    } else if (action === 'INSERT') {
      if (!targetRecord || !targetRecord.id) return;
      if (this.logs.some((l) => l.id === targetRecord.id)) return;
      this.logs.push(targetRecord);
      saveToStorage(STORAGE_KEYS.LOGS, this.logs);
      this.notifySyncListeners();
    } else if (action === 'UPDATE') {
      if (!targetRecord || !targetRecord.id) return;
      const idx = this.logs.findIndex((l) => l.id === targetRecord.id);
      if (idx >= 0) {
        this.logs[idx] = { ...this.logs[idx], ...targetRecord };
      } else {
        this.logs.push(targetRecord);
      }
      saveToStorage(STORAGE_KEYS.LOGS, this.logs);
      this.notifySyncListeners();
    }
  }

  public mergeRealtimeCommentEvent(
    eventTypeOrEvent: string | ScheduleCommentEvent,
    rawRecord?: ScheduleCommentEvent | null,
    rawOldRecord?: ScheduleCommentEvent | null
  ): void {
    let action: string;
    let targetRecord: ScheduleCommentEvent | null | undefined;
    let targetOldRecord: ScheduleCommentEvent | null | undefined;

    if (typeof eventTypeOrEvent === 'object' && eventTypeOrEvent !== null) {
      action = 'INSERT';
      targetRecord = eventTypeOrEvent;
      targetOldRecord = null;
    } else {
      action = String(eventTypeOrEvent || '').toUpperCase();
      targetRecord = rawRecord;
      targetOldRecord = rawOldRecord;
    }

    if (action === 'DELETE') {
      const target = targetOldRecord ?? targetRecord;
      if (!target || !target.id) return;
      const initialLen = this.commentEvents.length;
      this.commentEvents = this.commentEvents.filter((c) => c.id !== target.id);
      if (this.commentEvents.length !== initialLen) {
        saveToStorage(STORAGE_KEYS.COMMENTS, this.commentEvents);
        this.notifySyncListeners();
      }
    } else if (action === 'INSERT') {
      if (!targetRecord || !targetRecord.id) return;
      if (this.commentEvents.some((c) => c.id === targetRecord.id)) return;
      this.commentEvents.push(targetRecord);
      saveToStorage(STORAGE_KEYS.COMMENTS, this.commentEvents);
      this.notifySyncListeners();
    } else if (action === 'UPDATE') {
      if (!targetRecord || !targetRecord.id) return;
      const idx = this.commentEvents.findIndex((c) => c.id === targetRecord.id);
      if (idx >= 0) {
        this.commentEvents[idx] = { ...this.commentEvents[idx], ...targetRecord };
      } else {
        this.commentEvents.push(targetRecord);
      }
      saveToStorage(STORAGE_KEYS.COMMENTS, this.commentEvents);
      this.notifySyncListeners();
    }
  }

  public mergeRealtimeRsvpVote(
    eventType: string,
    rawRecord: RSVPVote | null,
    rawOldRecord?: RSVPVote | null
  ): void {
    const action = eventType.toUpperCase();
    if (action === 'DELETE') {
      const target = rawOldRecord ?? rawRecord;
      if (!target) return;
      const initialLen = this.rsvpVotes.length;
      this.rsvpVotes = this.rsvpVotes.filter((v) => {
        if (target.id && v.id === target.id) return false;
        if (
          target.scheduleId &&
          target.memberId &&
          v.scheduleId === target.scheduleId &&
          v.memberId === target.memberId
        ) {
          return false;
        }
        return true;
      });
      if (this.rsvpVotes.length !== initialLen) {
        saveToStorage(STORAGE_KEYS.RSVP_VOTES, this.rsvpVotes);
        this.notifySyncListeners();
      }
    } else if (action === 'INSERT' || action === 'UPDATE') {
      if (!rawRecord || !rawRecord.scheduleId || !rawRecord.memberId) return;
      const index = this.rsvpVotes.findIndex(
        (v) =>
          (rawRecord.id && v.id === rawRecord.id) ||
          (v.scheduleId === rawRecord.scheduleId && v.memberId === rawRecord.memberId)
      );
      if (index >= 0) {
        this.rsvpVotes[index] = { ...this.rsvpVotes[index], ...rawRecord };
      } else {
        this.rsvpVotes.push(rawRecord);
      }
      saveToStorage(STORAGE_KEYS.RSVP_VOTES, this.rsvpVotes);
      this.notifySyncListeners();
    }
  }

  public mergeRealtimeSchedule(
    eventType: string,
    rawRecord: Schedule | null,
    rawOldRecord?: Schedule | null
  ): void {
    const action = String(eventType || '').toUpperCase();
    if (action === 'DELETE') {
      const target = rawOldRecord ?? rawRecord;
      if (!target || !target.id) return;
      const initialLen = this.schedules.length;
      this.schedules = this.schedules.filter((s) => s.id !== target.id);
      if (this.schedules.length !== initialLen) {
        saveToStorage(STORAGE_KEYS.SCHEDULES, this.schedules);
        this.notifySyncListeners();
      }
    } else if (action === 'INSERT' || action === 'UPDATE') {
      if (!rawRecord || !rawRecord.id) return;
      const idx = this.schedules.findIndex((s) => s.id === rawRecord.id);
      if (idx >= 0) {
        this.schedules[idx] = { ...this.schedules[idx], ...rawRecord };
      } else {
        this.schedules.push(rawRecord);
      }
      saveToStorage(STORAGE_KEYS.SCHEDULES, this.schedules);
      this.notifySyncListeners();
    }
  }

  public mergeRealtimeMember(
    eventType: string,
    rawRecord: Member | null,
    rawOldRecord?: Member | null
  ): void {
    const action = String(eventType || '').toUpperCase();
    if (action === 'DELETE') {
      const target = rawOldRecord ?? rawRecord;
      if (!target || !target.id) return;
      const initialLen = this.members.length;
      this.members = this.members.filter((m) => m.id !== target.id);
      if (this.members.length !== initialLen) {
        saveToStorage(STORAGE_KEYS.MEMBERS, this.members);
        this.notifySyncListeners();
      }
    } else if (action === 'INSERT' || action === 'UPDATE') {
      if (!rawRecord || !rawRecord.id) return;
      const idx = this.members.findIndex((m) => m.id === rawRecord.id);
      if (idx >= 0) {
        this.members[idx] = { ...this.members[idx], ...rawRecord };
      } else {
        this.members.push(rawRecord);
      }
      saveToStorage(STORAGE_KEYS.MEMBERS, this.members);
      this.notifySyncListeners();
    }
  }

  public mergeRealtimeLocation(
    eventType: string,
    rawRecord: LocationPreset | null,
    rawOldRecord?: LocationPreset | null
  ): void {
    const action = String(eventType || '').toUpperCase();
    if (action === 'DELETE') {
      const target = rawOldRecord ?? rawRecord;
      if (!target || !target.id) return;
      const initialLen = this.locations.length;
      this.locations = this.locations.filter((l) => l.id !== target.id);
      if (this.locations.length !== initialLen) {
        saveToStorage(STORAGE_KEYS.LOCATIONS, this.locations);
        this.notifySyncListeners();
      }
    } else if (action === 'INSERT' || action === 'UPDATE') {
      if (!rawRecord || !rawRecord.id) return;
      const idx = this.locations.findIndex((l) => l.id === rawRecord.id);
      if (idx >= 0) {
        this.locations[idx] = { ...this.locations[idx], ...rawRecord };
      } else {
        this.locations.push(rawRecord);
      }
      saveToStorage(STORAGE_KEYS.LOCATIONS, this.locations);
      this.notifySyncListeners();
    }
  }

  public mergeRealtimeProgramCard(
    eventType: string,
    rawRecord: ProgramCard | null,
    rawOldRecord?: ProgramCard | null
  ): void {
    const action = String(eventType || '').toUpperCase();
    if (action === 'DELETE') {
      const target = rawOldRecord ?? rawRecord;
      if (!target || !target.id) return;
      const initialLen = this.programCards.length;
      this.programCards = this.programCards.filter((p) => p.id !== target.id);
      if (this.programCards.length !== initialLen) {
        saveToStorage(STORAGE_KEYS.PROGRAM_CARDS, this.programCards);
        this.notifySyncListeners();
      }
    } else if (action === 'INSERT' || action === 'UPDATE') {
      if (!rawRecord || !rawRecord.id) return;
      const idx = this.programCards.findIndex((p) => p.id === rawRecord.id);
      if (idx >= 0) {
        this.programCards[idx] = { ...this.programCards[idx], ...rawRecord };
      } else {
        this.programCards.push(rawRecord);
      }
      saveToStorage(STORAGE_KEYS.PROGRAM_CARDS, this.programCards);
      this.notifySyncListeners();
    }
  }

  private emitNotice(dedupeKey: string, message: string): void {
    const now = Date.now();
    const last = this.lastNoticeAt.get(dedupeKey) ?? 0;
    if (now - last < NOTICE_DEDUPE_MS) return;
    this.lastNoticeAt.set(dedupeKey, now);
    const notice: SheetsNotice = { id: ++this.noticeSeq, kind: 'error', message };
    this.noticeListeners.forEach((listener) => listener(notice));
  }

  /**
   * 화면 전환·앱 복귀 등에서 시트의 최신 데이터를 받아온다.
   * - 이 기기에서 `MIN_REFRESH_INTERVAL_MS` 안에 이미 받아왔으면 건너뛴다(force 제외).
   * - 진행 중인 새로고침이 있으면 그 결과를 함께 쓴다.
   * - 전송 중인 저장이 있으면 끝날 때까지 기다린 뒤 읽는다.
   * 반환값: 새 데이터를 반영했으면 true, 건너뜀/실패는 false(실패 시 기존 데이터 유지).
   */
  public refreshRemoteData(options: { force?: boolean } = {}): Promise<boolean> {
    if (!this.isBackendActive()) return Promise.resolve(false);
    if (this.refreshPromise) return this.refreshPromise;
    const minInterval = this.backend.kind === 'supabase' ? 5_000 : MIN_REFRESH_INTERVAL_MS;
    if (!options.force && Date.now() - this.syncState.lastSyncedAt < minInterval) {
      return Promise.resolve(false);
    }

    this.setSyncState({ ...this.syncState, status: 'SYNCING' });
    this.refreshPromise = this.fetchRemoteData()
      .then(() => true)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : '동기화에 실패했습니다.';
        this.setSyncState({ ...this.syncState, status: 'ERROR', error: message });
        return false;
      })
      .finally(() => {
        this.refreshPromise = null;
      });
    return this.refreshPromise;
  }

  /** 저장이 확정된 직후 잠깐 모아서 한 번만 최신 데이터를 받아온다. */
  private scheduleRefreshAfterWrite(): void {
    if (!this.isBackendActive()) return;
    if (this.refreshAfterWriteTimer) clearTimeout(this.refreshAfterWriteTimer);
    this.refreshAfterWriteTimer = setTimeout(() => {
      this.refreshAfterWriteTimer = null;
      void this.refreshRemoteData({ force: true });
    }, REFRESH_AFTER_WRITE_DELAY_MS);
  }

  /**
   * 화면에 먼저 반영한 변경을 뒤에서 시트에 저장한다. 실패하면 알림을 띄우고,
   * 시트에 저장된 상태로 화면을 되돌리기 위해 즉시 다시 읽어 온다.
   */
  private syncInBackground(action: string, payload: unknown): void {
    void this.sendToGoogleSheet(action, payload)
      .then((result) => {
        if (result.success) return;
        const label = WRITE_LABELS[action] ?? '변경 사항';
        this.emitNotice(
          `write:${action}`,
          `[${label}] 저장하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요. 화면은 시트에 저장된 상태로 되돌립니다.`
        );
        void this.refreshRemoteData({ force: true });
      })
      .catch((err) => {
        const label = WRITE_LABELS[action] ?? '변경 사항';
        console.error(`[SheetsService] syncInBackground failed for ${action}:`, err);
        this.emitNotice(
          `write:${action}`,
          `[${label}] 동기화 중 오류가 발생했습니다. 네트워크를 확인해 주세요.`
        );
      });
  }

  /**
   * 시트로 보내는 모든 요청의 단일 통로. 전송 중인 요청을 추적해 새로고침이 저장보다 먼저
   * 도착한 옛 데이터로 화면을 덮어쓰지 않게 하고, 저장이 확정되면 최신 데이터 반영을 예약한다.
   */
  public sendToGoogleSheet(
    action: string,
    payload: unknown,
    endpointUrl?: string
  ): Promise<{ success: boolean; message?: string; existingMemberId?: string; boundDeviceId?: string; data?: unknown }> {
    const targetUrl = endpointUrl || this.config.sheetsWebAppUrl;
    if (this.backend.kind === 'gas' && !targetUrl) {
      return Promise.resolve({
        success: false,
        message: 'Google Apps Script Web App URL이 설정되지 않아 서버에 반영되지 않았습니다.',
      });
    }

    this.writeEpoch += 1;
    const request = this.postToGoogleSheet(action, payload, targetUrl);
    const track = request.then(
      () => undefined,
      () => undefined
    );
    this.inFlightWrites.add(track);
    void track.then(() => {
      this.inFlightWrites.delete(track);
    });
    return request.then((result) => {
      if (result.success && !endpointUrl && !NON_MUTATING_ACTIONS.has(action)) {
        this.scheduleRefreshAfterWrite();
      }
      return result;
    });
  }

  private async postToGoogleSheet(
    action: string,
    payload: unknown,
    endpointUrl?: string
  ): Promise<{ success: boolean; message?: string; existingMemberId?: string; boundDeviceId?: string; data?: unknown }> {
    return this.backend.callAction(action, payload, endpointUrl || this.config.sheetsWebAppUrl);
  }
}

export const sheetsService = new SheetsService();
