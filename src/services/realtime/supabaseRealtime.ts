import type {
  AuthMethod,
  PartType,
  RSVPStatus,
  RSVPVote,
  RawAttendanceLog,
  ScheduleCommentAction,
  ScheduleCommentEvent,
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

  return `${wsBase}/realtime/v1/websocket?apikey=${encodeURIComponent(anonKey)}&vsn=1.0.0`;
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

  constructor(config: SupabaseRealtimeConfig, service: SheetsService = sheetsService) {
    this.config = config;
    this.targetSheetsService = service;
    this.currentBackoffMs = config.reconnectBaseMs ?? 1000;
  }

  public getIsConnected(): boolean {
    return this.isConnected;
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
        this.currentBackoffMs = this.config.reconnectBaseMs ?? 1000;

        // Phoenix channel join message
        const joinMessage = [
          '1',
          String(this.refCounter++),
          'realtime:public',
          'phx_join',
          {
            config: {
              broadcast: { ack: false, self: false },
              presence: { key: '' },
              postgres_changes: [
                { event: '*', schema: 'public', table: 'attendance_logs' },
                { event: '*', schema: 'public', table: 'schedule_comment_events' },
                { event: '*', schema: 'public', table: 'rsvp_votes' },
              ],
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

      if (topic === 'realtime:public' && phxEvent === 'postgres_changes') {
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
          if (record && typeof record === 'object') {
            const log = mapSnakeToCamelAttendanceLog(record);
            if (log.id) {
              this.targetSheetsService.mergeRealtimeAttendanceLog(log);
            }
          }
        } else if (table === 'schedule_comment_events') {
          if (record && typeof record === 'object') {
            const commentEvent = mapSnakeToCamelCommentEvent(record);
            if (commentEvent.id) {
              this.targetSheetsService.mergeRealtimeCommentEvent(commentEvent);
            }
          }
        } else if (table === 'rsvp_votes') {
          const mappedRecord = record && typeof record === 'object' ? mapSnakeToCamelRsvpVote(record) : null;
          const mappedOldRecord = oldRecord && typeof oldRecord === 'object' ? mapSnakeToCamelRsvpVote(oldRecord) : null;
          this.targetSheetsService.mergeRealtimeRsvpVote(type, mappedRecord, mappedOldRecord);
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
