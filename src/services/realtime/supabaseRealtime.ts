import type {
  AuthMethod,
  LocationPreset,
  Member,
  MemberStatus,
  PartType,
  ProgramCard,
  RoleType,
  RSVPStatus,
  RSVPVote,
  RawAttendanceLog,
  Schedule,
  ScheduleCategory,
  ScheduleCommentAction,
  ScheduleCommentEvent,
  ScheduleVisibility,
  TargetAudienceType,
} from '../../types/rollbook';
import { sheetsService, type SheetsService } from '../sheets';

export interface SupabaseRealtimeConfig {
  url: string;
  anonKey: string;
  heartbeatIntervalMs?: number;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  customWebSocketClass?: typeof WebSocket;
}

/**
 * 실시간 WebSocket 연결 상태에 따른 백업 폴링 주기(ms)를 계산합니다.
 * - 실시간 연결 중: 5분 (300,000ms)으로 완화하여 과도한 DB 조회 방지
 * - 연결 끊김/재연결 중: 30초 (30,000ms) 백업 안전망 가동
 */
export function getBackupPollingIntervalMs(isRealtimeConnected: boolean): number {
  return isRealtimeConnected ? 5 * 60 * 1000 : 30 * 1000;
}

export function buildSupabaseRealtimeUrl(rawUrl: string, anonKey: string): string {
  const trimmed = rawUrl.trim();
  const withoutTrailingSlash = trimmed.replace(/\/+$/, '');
  const cleanBase = withoutTrailingSlash.replace(/\/rest\/v1\/?$/, '');

  let wsBase: string;
  if (/^https:\/\//i.test(cleanBase)) {
    wsBase = cleanBase.replace(/^https:\/\//i, 'wss://');
  } else if (/^http:\/\//i.test(cleanBase)) {
    wsBase = cleanBase.replace(/^http:\/\//i, 'ws://');
  } else if (/^wss?:\/\//i.test(cleanBase)) {
    wsBase = cleanBase;
  } else {
    wsBase = `wss://${cleanBase}`;
  }

  return `${wsBase}/realtime/v1/websocket?apikey=${encodeURIComponent(anonKey)}&vsn=2.0.0`;
}

export function mapSnakeToCamelAttendanceLog(raw: Record<string, unknown>): RawAttendanceLog {
  const numOrUndefined = (val: unknown): number | undefined => {
    if (val === undefined || val === null || val === '') return undefined;
    const n = Number(val);
    return isNaN(n) ? undefined : n;
  };
  const str = (val: unknown, fallback = ''): string => {
    if (val === undefined || val === null) return fallback;
    return String(val);
  };

  return {
    id: str(raw.id),
    timestamp: str(raw.timestamp),
    scheduleId: str(raw.schedule_id ?? raw.scheduleId),
    memberId: str(raw.member_id ?? raw.memberId),
    memberName: str(raw.member_name ?? raw.memberName),
    part: (str(raw.part) || '소프라노') as PartType,
    authMethod: (str(raw.auth_method ?? raw.authMethod) || 'MANUAL_PIN') as AuthMethod,
    isVerifiedLocation: Boolean(raw.is_verified_location ?? raw.isVerifiedLocation ?? false),
    adminNote:
      raw.admin_note !== undefined && raw.admin_note !== null
        ? String(raw.admin_note)
        : raw.adminNote !== undefined && raw.adminNote !== null
        ? String(raw.adminNote)
        : undefined,
    distanceMeters: numOrUndefined(raw.distance_meters ?? raw.distanceMeters),
    deviceId: raw.device_id ? String(raw.device_id) : raw.deviceId ? String(raw.deviceId) : undefined,
    latitude: numOrUndefined(raw.latitude),
    longitude: numOrUndefined(raw.longitude),
  };
}

export function mapSnakeToCamelCommentEvent(raw: Record<string, unknown>): ScheduleCommentEvent {
  const str = (val: unknown, fallback = ''): string => {
    if (val === undefined || val === null) return fallback;
    return String(val).trim();
  };

  const actionRaw = str(raw.action, 'CREATE').toUpperCase();
  const action: ScheduleCommentAction =
    actionRaw === 'EDIT' ? 'EDIT' : actionRaw === 'DELETE' ? 'DELETE' : 'CREATE';

  return {
    id: str(raw.id),
    scheduleId: str(raw.schedule_id ?? raw.scheduleId),
    memberId: str(raw.member_id ?? raw.memberId),
    memberName: str(raw.member_name ?? raw.memberName) || '단원',
    part: (str(raw.part) || '소프라노') as PartType,
    action,
    targetId: str(raw.target_id ?? raw.targetId) || undefined,
    text: raw.text !== undefined && raw.text !== null ? String(raw.text) : undefined,
    timestamp: str(raw.timestamp),
    deviceId: str(raw.device_id ?? raw.deviceId) || undefined,
  };
}

export function mapSnakeToCamelRsvpVote(raw: Record<string, unknown>): RSVPVote {
  const str = (val: unknown, fallback = ''): string => {
    if (val === undefined || val === null) return fallback;
    return String(val).trim();
  };

  const statusRaw = str(raw.status, 'ATTEND').toUpperCase();
  const status: RSVPStatus = statusRaw === 'ABSENT' ? 'ABSENT' : 'ATTEND';

  return {
    id: str(raw.id),
    scheduleId: str(raw.schedule_id ?? raw.scheduleId),
    memberId: str(raw.member_id ?? raw.memberId),
    memberName: str(raw.member_name ?? raw.memberName),
    part: (str(raw.part) || '소프라노') as PartType,
    status,
    reason: str(raw.reason) || undefined,
    timestamp: str(raw.timestamp),
  };
}

export function mapSnakeToCamelSchedule(raw: Record<string, unknown>): Schedule {
  const str = (val: unknown, fallback = ''): string => {
    if (val === undefined || val === null) return fallback;
    return String(val);
  };
  const numOrUndefined = (val: unknown): number | undefined => {
    if (val === undefined || val === null || val === '') return undefined;
    const n = Number(val);
    return isNaN(n) ? undefined : n;
  };
  const parseArray = (val: unknown): string[] | undefined => {
    if (Array.isArray(val)) return val.map((x) => String(x).trim()).filter(Boolean);
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (!trimmed) return undefined;
      const clean = trimmed.replace(/^\{|\}$/g, '');
      return clean.split(',').map((x) => x.replace(/^"|"$/g, '').trim()).filter(Boolean);
    }
    return undefined;
  };

  const rawParts = parseArray(raw.target_parts ?? raw.targetParts);
  const rawMembers = parseArray(raw.target_member_ids ?? raw.targetMemberIds);

  const rawVisibility = str(raw.visibility, 'ALL').trim().toUpperCase();
  const visibility: ScheduleVisibility = rawVisibility === 'TARGETS_ONLY' ? 'TARGETS_ONLY' : 'ALL';

  return {
    id: str(raw.id),
    title: str(raw.title),
    date: str(raw.date),
    startTime: str(raw.start_time ?? raw.startTime, '19:30'),
    endTime: str(raw.end_time ?? raw.endTime, '21:30'),
    locationName: str(raw.location_name ?? raw.locationName),
    locationId: str(raw.location_id ?? raw.locationId) || undefined,
    detailAddress: str(raw.detail_address ?? raw.detailAddress) || undefined,
    entranceNote: str(raw.entrance_note ?? raw.entranceNote) || undefined,
    targetLat: numOrUndefined(raw.latitude ?? raw.targetLat),
    targetLon: numOrUndefined(raw.longitude ?? raw.targetLon),
    radiusMeters: numOrUndefined(raw.radius_meters ?? raw.radiusMeters),
    category: (str(raw.category, '정기연습')) as ScheduleCategory,
    checkInPin: str(raw.check_in_pin ?? raw.checkInPin) || undefined,
    description: str(raw.description) || undefined,
    programId: str(raw.program_id ?? raw.programId) || undefined,
    seriesId: str(raw.series_id ?? raw.seriesId) || undefined,
    seriesIndex: numOrUndefined(raw.series_index ?? raw.seriesIndex),
    seriesTotal: numOrUndefined(raw.series_total ?? raw.seriesTotal),
    isArchived: Boolean(raw.is_archived ?? raw.isArchived ?? false),
    isCancelled: Boolean(raw.is_cancelled ?? raw.isCancelled ?? false),
    targetAudienceType: (str(raw.target_audience_type ?? raw.targetAudienceType, 'ALL') as TargetAudienceType) || 'ALL',
    targetParts: rawParts as PartType[] | undefined,
    targetMemberIds: rawMembers,
    visibility,
  };
}

export function mapSnakeToCamelMember(raw: Record<string, unknown>): Member {
  const str = (val: unknown, fallback = ''): string => {
    if (val === undefined || val === null) return fallback;
    return String(val);
  };
  const phone = str(raw.phone);
  const phoneLast4 = str(raw.phone_last4 ?? raw.phoneLast4) || (phone ? phone.replace(/\D/g, '').slice(-4) : '0000');
  const roleRaw = str(raw.role, 'MEMBER').toUpperCase();
  const role: RoleType = roleRaw === 'ADMIN' ? 'ADMIN' : roleRaw === 'GUEST' ? 'GUEST' : 'MEMBER';
  const statusRaw = str(raw.status, 'ACTIVE').toUpperCase();
  const status: 'ACTIVE' | 'INACTIVE' | 'MERGED' | 'DELETED' =
    statusRaw === 'INACTIVE' ? 'INACTIVE' : statusRaw === 'MERGED' ? 'MERGED' : statusRaw === 'DELETED' ? 'DELETED' : 'ACTIVE';

  return {
    id: str(raw.id),
    name: str(raw.name),
    part: (str(raw.part, '소프라노')) as PartType,
    phone: phone || undefined,
    phoneLast4,
    role,
    createdAt: str(raw.created_at ?? raw.createdAt),
    status,
    mergedIntoId: str(raw.merged_into_id ?? raw.mergedIntoId) || undefined,
    joinedAt: str(raw.joined_at ?? raw.joinedAt) || undefined,
    memberStatus: (str(raw.member_status ?? raw.memberStatus, '정단원')) as MemberStatus,
    note: str(raw.note) || '',
    boundDeviceId: str(raw.bound_device_id ?? raw.boundDeviceId) || undefined,
    boundDeviceAt: str(raw.bound_device_at ?? raw.boundDeviceAt) || undefined,
  };
}

export function mapSnakeToCamelLocation(raw: Record<string, unknown>): LocationPreset {
  const str = (val: unknown, fallback = ''): string => {
    if (val === undefined || val === null) return fallback;
    return String(val);
  };
  const num = (val: unknown, fallback: number): number => {
    if (val === undefined || val === null || val === '') return fallback;
    const n = Number(val);
    return isNaN(n) ? fallback : n;
  };

  return {
    id: str(raw.id),
    name: str(raw.name),
    address: str(raw.address) || undefined,
    detailAddress: str(raw.detail_address ?? raw.detailAddress) || undefined,
    entranceNote: str(raw.entrance_note ?? raw.entranceNote) || undefined,
    latitude: num(raw.latitude, 37.5665),
    longitude: num(raw.longitude, 126.978),
    radiusMeters: num(raw.radius_meters ?? raw.radiusMeters, 100),
    isDefault: Boolean(raw.is_default ?? raw.isDefault ?? false),
  };
}

export function mapSnakeToCamelProgramCard(raw: Record<string, unknown>): ProgramCard {
  const str = (val: unknown, fallback = ''): string => {
    if (val === undefined || val === null) return fallback;
    return String(val);
  };
  const parseArray = (val: unknown): string[] | undefined => {
    if (Array.isArray(val)) return val.map((x) => String(x).trim()).filter(Boolean);
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (!trimmed) return undefined;
      const clean = trimmed.replace(/^\{|\}$/g, '');
      return clean.split(',').map((x) => x.replace(/^"|"$/g, '').trim()).filter(Boolean);
    }
    return undefined;
  };

  const rawParts = parseArray(raw.target_parts ?? raw.targetParts);
  const rawMembers = parseArray(raw.target_member_ids ?? raw.targetMemberIds);

  return {
    id: str(raw.id),
    title: str(raw.title),
    description: str(raw.description) || undefined,
    category: (str(raw.category, '정기연습')) as ScheduleCategory,
    defaultLocationId: str(raw.default_location_id ?? raw.defaultLocationId) || undefined,
    defaultStartTime: str(raw.default_start_time ?? raw.defaultStartTime) || '19:30',
    defaultEndTime: str(raw.default_end_time ?? raw.defaultEndTime) || '21:30',
    targetAudienceType: (str(raw.target_audience_type ?? raw.targetAudienceType, 'ALL') as TargetAudienceType) || 'ALL',
    targetParts: rawParts as PartType[] | undefined,
    targetMemberIds: rawMembers,
    isArchived: Boolean(raw.is_archived ?? raw.isArchived ?? false),
    createdAt: str(raw.created_at ?? raw.createdAt),
  };
}

export class SupabaseRealtimeClient {
  private config: SupabaseRealtimeConfig;
  private targetSheetsService: SheetsService;
  private ws: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private currentBackoffMs: number;
  private isExplicitlyClosed = false;
  private refCounter = 1;
  private isConnected = false;
  private lastMessageAt = Date.now();

  constructor(config: SupabaseRealtimeConfig, service: SheetsService = sheetsService) {
    this.config = config;
    this.targetSheetsService = service;
    this.currentBackoffMs = config.reconnectBaseMs ?? 1000;
  }

  public getIsConnected(): boolean {
    return this.isConnected;
  }

  public getLastMessageAt(): number {
    return this.lastMessageAt;
  }

  public setLastMessageAt(time: number): void {
    this.lastMessageAt = time;
  }

  public connect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isExplicitlyClosed = false;
    const WSClass = this.config.customWebSocketClass || (typeof WebSocket !== 'undefined' ? WebSocket : null);
    if (!WSClass) {
      console.warn('[Supabase Realtime] WebSocket is not available in current environment.');
      return;
    }

    try {
      const url = buildSupabaseRealtimeUrl(this.config.url, this.config.anonKey);
      const ws = new WSClass(url);
      this.ws = ws;

      ws.onopen = () => {
        if (this.ws !== ws) return;
        this.isConnected = true;
        this.lastMessageAt = Date.now();
        this.currentBackoffMs = this.config.reconnectBaseMs ?? 1000;

        // Phoenix channel join message (Supabase Realtime v2 protocol)
        const joinMessage = [
          '1',
          String(this.refCounter++),
          'realtime:moonchoir',
          'phx_join',
          {
            config: {
              broadcast: { ack: false, self: false },
              presence: { key: '', enabled: false },
              postgres_changes: [
                { event: '*', schema: 'public', table: 'attendance_logs' },
                { event: '*', schema: 'public', table: 'schedule_comment_events' },
                { event: '*', schema: 'public', table: 'rsvp_votes' },
                { event: '*', schema: 'public', table: 'schedules' },
                { event: '*', schema: 'public', table: 'members' },
                { event: '*', schema: 'public', table: 'locations' },
                { event: '*', schema: 'public', table: 'program_cards' },
              ],
              private: false,
            },
          },
        ];
        ws.send(JSON.stringify(joinMessage));

        this.startHeartbeat();
      };

      ws.onmessage = (event: MessageEvent) => {
        if (this.ws !== ws) return;
        this.handleMessage(typeof event.data === 'string' ? event.data : String(event.data));
      };

      ws.onerror = (err) => {
        console.warn('[Supabase Realtime] WebSocket error:', err);
      };

      ws.onclose = () => {
        if (this.ws !== ws) return;
        this.cleanupSocket();
        if (!this.isExplicitlyClosed) {
          this.scheduleReconnect();
        }
      };
    } catch (err) {
      console.error('[Supabase Realtime] Failed to initialize WebSocket connection:', err);
      this.cleanupSocket();
      if (!this.isExplicitlyClosed) {
        this.scheduleReconnect();
      }
    }
  }

  public disconnect(): void {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanupSocket();
  }

  public checkAndReconnect(): void {
    if (this.isExplicitlyClosed) return;
    const isZombie = Boolean(
      this.ws &&
      this.ws.readyState === WebSocket.OPEN &&
      Date.now() - this.lastMessageAt > 60_000
    );
    if (isZombie) {
      this.cleanupSocket();
      this.connect();
      return;
    }
    if (!this.ws || (this.ws.readyState !== WebSocket.OPEN && this.ws.readyState !== WebSocket.CONNECTING)) {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.connect();
    }
  }

  public handleMessage(dataStr: string): void {
    try {
      const envelope = JSON.parse(dataStr);
      if (!Array.isArray(envelope) || envelope.length < 5) return;
      const [_joinRef, _ref, topic, phxEvent, payload] = envelope;

      this.lastMessageAt = Date.now();

      if (typeof topic === 'string' && topic.startsWith('realtime:') && phxEvent === 'postgres_changes') {
        const change = (payload && typeof payload === 'object' && 'data' in payload)
          ? (payload as { data: unknown }).data
          : payload;

        if (!change || typeof change !== 'object') return;
        const changeObj = change as Record<string, unknown>;
        const table = String(changeObj.table || '');
        const type = String(changeObj.type || '').toUpperCase();
        const record = changeObj.record as Record<string, unknown> | null;
        const oldRecord = changeObj.old_record as Record<string, unknown> | null;

        if (table === 'attendance_logs') {
          const mappedRecord = record && typeof record === 'object' ? mapSnakeToCamelAttendanceLog(record) : null;
          const mappedOldRecord = oldRecord && typeof oldRecord === 'object' ? mapSnakeToCamelAttendanceLog(oldRecord) : null;
          this.targetSheetsService.mergeRealtimeAttendanceLog(type, mappedRecord, mappedOldRecord);
        } else if (table === 'schedule_comment_events') {
          const mappedRecord = record && typeof record === 'object' ? mapSnakeToCamelCommentEvent(record) : null;
          const mappedOldRecord = oldRecord && typeof oldRecord === 'object' ? mapSnakeToCamelCommentEvent(oldRecord) : null;
          this.targetSheetsService.mergeRealtimeCommentEvent(type, mappedRecord, mappedOldRecord);
        } else if (table === 'rsvp_votes') {
          const mappedRecord = record && typeof record === 'object' ? mapSnakeToCamelRsvpVote(record) : null;
          const mappedOldRecord = oldRecord && typeof oldRecord === 'object' ? mapSnakeToCamelRsvpVote(oldRecord) : null;
          this.targetSheetsService.mergeRealtimeRsvpVote(type, mappedRecord, mappedOldRecord);
        } else if (table === 'schedules') {
          const mappedRecord = record && typeof record === 'object' ? mapSnakeToCamelSchedule(record) : null;
          const mappedOldRecord = oldRecord && typeof oldRecord === 'object' ? mapSnakeToCamelSchedule(oldRecord) : null;
          this.targetSheetsService.mergeRealtimeSchedule(type, mappedRecord, mappedOldRecord);
        } else if (table === 'members') {
          const mappedRecord = record && typeof record === 'object' ? mapSnakeToCamelMember(record) : null;
          const mappedOldRecord = oldRecord && typeof oldRecord === 'object' ? mapSnakeToCamelMember(oldRecord) : null;
          this.targetSheetsService.mergeRealtimeMember(type, mappedRecord, mappedOldRecord);
        } else if (table === 'locations') {
          const mappedRecord = record && typeof record === 'object' ? mapSnakeToCamelLocation(record) : null;
          const mappedOldRecord = oldRecord && typeof oldRecord === 'object' ? mapSnakeToCamelLocation(oldRecord) : null;
          this.targetSheetsService.mergeRealtimeLocation(type, mappedRecord, mappedOldRecord);
        } else if (table === 'program_cards') {
          const mappedRecord = record && typeof record === 'object' ? mapSnakeToCamelProgramCard(record) : null;
          const mappedOldRecord = oldRecord && typeof oldRecord === 'object' ? mapSnakeToCamelProgramCard(oldRecord) : null;
          this.targetSheetsService.mergeRealtimeProgramCard(type, mappedRecord, mappedOldRecord);
        }
      }
    } catch (err) {
      console.warn('[Supabase Realtime] Error handling message:', err);
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    const interval = this.config.heartbeatIntervalMs ?? 25000;
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const heartbeatEnvelope = [null, String(this.refCounter++), 'phoenix', 'heartbeat', {}];
        this.ws.send(JSON.stringify(heartbeatEnvelope));
      }
    }, interval);
  }

  private scheduleReconnect(): void {
    if (this.isExplicitlyClosed || this.reconnectTimer) return;
    const delay = this.currentBackoffMs;
    const maxDelay = this.config.reconnectMaxMs ?? 30000;
    this.currentBackoffMs = Math.min(delay * 2, maxDelay);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.isExplicitlyClosed) {
        this.connect();
      }
    }, delay);
  }

  private cleanupSocket(): void {
    this.isConnected = false;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onmessage = null;
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close();
        }
      } catch {
        // Safe ignore
      }
      this.ws = null;
    }
  }
}

let activeClient: SupabaseRealtimeClient | null = null;

export function startSupabaseRealtime(
  config?: SupabaseRealtimeConfig,
  service: SheetsService = sheetsService
): SupabaseRealtimeClient | null {
  if (activeClient) {
    activeClient.checkAndReconnect();
    return activeClient;
  }

  const resolvedConfig =
    config ||
    (() => {
      const supaConfig = service.getSupabaseConfig();
      if (supaConfig && supaConfig.url && supaConfig.anonKey) {
        return {
          url: supaConfig.url,
          anonKey: supaConfig.anonKey,
        };
      }
      return null;
    })();

  if (!resolvedConfig || !resolvedConfig.url || !resolvedConfig.anonKey) {
    return null;
  }

  activeClient = new SupabaseRealtimeClient(resolvedConfig, service);
  activeClient.connect();
  return activeClient;
}

export function stopSupabaseRealtime(): void {
  if (activeClient) {
    activeClient.disconnect();
    activeClient = null;
  }
}

export function getActiveSupabaseRealtime(): SupabaseRealtimeClient | null {
  return activeClient;
}
