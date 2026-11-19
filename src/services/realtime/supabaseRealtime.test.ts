import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildSupabaseRealtimeUrl,
  mapSnakeToCamelAttendanceLog,
  mapSnakeToCamelCommentEvent,
  mapSnakeToCamelRsvpVote,
  SupabaseRealtimeClient,
  startSupabaseRealtime,
  stopSupabaseRealtime,
  getActiveSupabaseRealtime,
} from './supabaseRealtime';
import { SheetsService } from '../sheets';
import { GasBackend } from '../backend/gasBackend';
import { SupabaseBackend } from '../backend/supabaseBackend';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  public url: string;
  public readyState: number = WebSocket.CONNECTING;
  public sentMessages: string[] = [];
  public onopen: (() => void) | null = null;
  public onclose: (() => void) | null = null;
  public onerror: ((err: unknown) => void) | null = null;
  public onmessage: ((event: { data: string }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(): void {
    this.readyState = WebSocket.CLOSED;
    if (this.onclose) this.onclose();
  }

  // Test helper
  simulateOpen(): void {
    this.readyState = WebSocket.OPEN;
    if (this.onopen) this.onopen();
  }

  // Test helper
  simulateMessage(data: unknown): void {
    if (this.onmessage) {
      this.onmessage({ data: typeof data === 'string' ? data : JSON.stringify(data) });
    }
  }
}

describe('supabaseRealtime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    stopSupabaseRealtime();
  });

  afterEach(() => {
    stopSupabaseRealtime();
    vi.restoreAllMocks();
  });

  describe('buildSupabaseRealtimeUrl', () => {
    it('converts https to wss and adds parameters', () => {
      const url = buildSupabaseRealtimeUrl('https://example.supabase.co', 'anon-key-123');
      expect(url).toBe('wss://example.supabase.co/realtime/v1/websocket?apikey=anon-key-123&vsn=1.0.0');
    });

    it('converts http to ws for local development', () => {
      const url = buildSupabaseRealtimeUrl('http://127.0.0.1:54321', 'anon-key-123');
      expect(url).toBe('ws://127.0.0.1:54321/realtime/v1/websocket?apikey=anon-key-123&vsn=1.0.0');
    });

    it('strips trailing slash and /rest/v1 paths', () => {
      const url = buildSupabaseRealtimeUrl('https://example.supabase.co/rest/v1/', 'anon-key-123');
      expect(url).toBe('wss://example.supabase.co/realtime/v1/websocket?apikey=anon-key-123&vsn=1.0.0');
    });
  });

  describe('Mapping functions', () => {
    it('maps snake_case attendance_logs to camelCase RawAttendanceLog', () => {
      const mapped = mapSnakeToCamelAttendanceLog({
        id: 'log_1',
        timestamp: '2026-11-19 19:30:00',
        schedule_id: 'sch_1',
        member_id: 'mem_1',
        member_name: '홍길동',
        part: '테너',
        auth_method: 'QR_WEB_CAM',
        is_verified_location: true,
        admin_note: '정상 출석',
        distance_meters: 15.5,
        device_id: 'dev_abc',
      });

      expect(mapped).toEqual({
        id: 'log_1',
        timestamp: '2026-11-19 19:30:00',
        scheduleId: 'sch_1',
        memberId: 'mem_1',
        memberName: '홍길동',
        part: '테너',
        authMethod: 'QR_WEB_CAM',
        isVerifiedLocation: true,
        adminNote: '정상 출석',
        distanceMeters: 15.5,
        deviceId: 'dev_abc',
        latitude: undefined,
        longitude: undefined,
      });
    });

    it('maps snake_case schedule_comment_events to camelCase ScheduleCommentEvent', () => {
      const mapped = mapSnakeToCamelCommentEvent({
        id: 'cmt_1',
        schedule_id: 'sch_1',
        member_id: 'mem_1',
        member_name: '이순신',
        part: '베이스',
        action: 'CREATE',
        target_id: '',
        text: '연습 참석합니다!',
        timestamp: '2026-11-19 18:00:00',
        device_id: 'dev_xyz',
      });

      expect(mapped).toEqual({
        id: 'cmt_1',
        scheduleId: 'sch_1',
        memberId: 'mem_1',
        memberName: '이순신',
        part: '베이스',
        action: 'CREATE',
        targetId: undefined,
        text: '연습 참석합니다!',
        timestamp: '2026-11-19 18:00:00',
        deviceId: 'dev_xyz',
      });
    });

    it('maps snake_case rsvp_votes to camelCase RSVPVote', () => {
      const mapped = mapSnakeToCamelRsvpVote({
        id: 'vote_1',
        schedule_id: 'sch_1',
        member_id: 'mem_1',
        member_name: '강감찬',
        part: '알토',
        status: 'ATTEND',
        reason: '개인 사정 없음',
        timestamp: '2026-11-19 12:00:00',
      });

      expect(mapped).toEqual({
        id: 'vote_1',
        scheduleId: 'sch_1',
        memberId: 'mem_1',
        memberName: '강감찬',
        part: '알토',
        status: 'ATTEND',
        reason: '개인 사정 없음',
        timestamp: '2026-11-19 12:00:00',
      });
    });
  });

  describe('SupabaseRealtimeClient', () => {
    it('connects, sends phx_join, and starts heartbeat on interval', () => {
      const mockService = new SheetsService(new GasBackend(() => ''));
      const client = new SupabaseRealtimeClient(
        {
          url: 'https://example.supabase.co',
          anonKey: 'anon-test',
          heartbeatIntervalMs: 5000,
          customWebSocketClass: MockWebSocket as unknown as typeof WebSocket,
        },
        mockService
      );

      client.connect();
      expect(MockWebSocket.instances.length).toBe(1);
      const ws = MockWebSocket.instances[0];

      // On open
      ws.simulateOpen();
      expect(client.getIsConnected()).toBe(true);

      // Verify phx_join envelope
      expect(ws.sentMessages.length).toBe(1);
      const joinMsg = JSON.parse(ws.sentMessages[0]);
      expect(joinMsg[0]).toBe('1');
      expect(joinMsg[2]).toBe('realtime:public');
      expect(joinMsg[3]).toBe('phx_join');
      expect(joinMsg[4].config.postgres_changes).toEqual([
        { event: '*', schema: 'public', table: 'attendance_logs' },
        { event: '*', schema: 'public', table: 'schedule_comment_events' },
        { event: '*', schema: 'public', table: 'rsvp_votes' },
      ]);

      // Advance clock by heartbeat interval
      vi.advanceTimersByTime(5000);
      expect(ws.sentMessages.length).toBe(2);
      const heartbeatMsg = JSON.parse(ws.sentMessages[1]);
      expect(heartbeatMsg[0]).toBeNull();
      expect(heartbeatMsg[2]).toBe('phoenix');
      expect(heartbeatMsg[3]).toBe('heartbeat');

      client.disconnect();
      expect(client.getIsConnected()).toBe(false);
    });

    it('routes incoming postgres_changes for attendance_logs to service.mergeRealtimeAttendanceLog', () => {
      const mockService = new SheetsService(new GasBackend(() => ''));
      const mergeLogSpy = vi.spyOn(mockService, 'mergeRealtimeAttendanceLog');

      const client = new SupabaseRealtimeClient(
        {
          url: 'https://example.supabase.co',
          anonKey: 'anon-test',
          customWebSocketClass: MockWebSocket as unknown as typeof WebSocket,
        },
        mockService
      );

      client.connect();
      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();

      // Simulate incoming postgres_changes message
      ws.simulateMessage([
        null,
        null,
        'realtime:public',
        'postgres_changes',
        {
          data: {
            table: 'attendance_logs',
            type: 'INSERT',
            record: {
              id: 'log_realtime_1',
              timestamp: '2026-11-19 19:35:00',
              schedule_id: 'sch_realtime_1',
              member_id: 'mem_realtime_1',
              member_name: '테스트단원',
              part: '소프라노',
              auth_method: 'MANUAL_PIN',
              is_verified_location: true,
            },
          },
        },
      ]);

      expect(mergeLogSpy).toHaveBeenCalledTimes(1);
      expect(mergeLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'log_realtime_1',
          scheduleId: 'sch_realtime_1',
          memberId: 'mem_realtime_1',
        })
      );

      client.disconnect();
    });

    it('routes incoming postgres_changes for schedule_comment_events to service.mergeRealtimeCommentEvent', () => {
      const mockService = new SheetsService(new GasBackend(() => ''));
      const mergeCommentSpy = vi.spyOn(mockService, 'mergeRealtimeCommentEvent');

      const client = new SupabaseRealtimeClient(
        {
          url: 'https://example.supabase.co',
          anonKey: 'anon-test',
          customWebSocketClass: MockWebSocket as unknown as typeof WebSocket,
        },
        mockService
      );

      client.connect();
      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();

      ws.simulateMessage([
        null,
        null,
        'realtime:public',
        'postgres_changes',
        {
          data: {
            table: 'schedule_comment_events',
            type: 'INSERT',
            record: {
              id: 'comment_realtime_1',
              schedule_id: 'sch_realtime_1',
              member_id: 'mem_realtime_1',
              member_name: '테스트단원',
              part: '알토',
              action: 'CREATE',
              text: '실시간 댓글 테스트',
              timestamp: '2026-11-19 19:40:00',
            },
          },
        },
      ]);

      expect(mergeCommentSpy).toHaveBeenCalledTimes(1);
      expect(mergeCommentSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'comment_realtime_1',
          text: '실시간 댓글 테스트',
        })
      );

      client.disconnect();
    });

    it('routes incoming postgres_changes for rsvp_votes to service.mergeRealtimeRsvpVote', () => {
      const mockService = new SheetsService(new GasBackend(() => ''));
      const mergeRsvpSpy = vi.spyOn(mockService, 'mergeRealtimeRsvpVote');

      const client = new SupabaseRealtimeClient(
        {
          url: 'https://example.supabase.co',
          anonKey: 'anon-test',
          customWebSocketClass: MockWebSocket as unknown as typeof WebSocket,
        },
        mockService
      );

      client.connect();
      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();

      ws.simulateMessage([
        null,
        null,
        'realtime:public',
        'postgres_changes',
        {
          data: {
            table: 'rsvp_votes',
            type: 'UPDATE',
            record: {
              id: 'rsvp_realtime_1',
              schedule_id: 'sch_realtime_1',
              member_id: 'mem_realtime_1',
              member_name: '테스트단원',
              part: '테너',
              status: 'ABSENT',
              reason: '출장',
              timestamp: '2026-11-19 14:00:00',
            },
            old_record: {
              id: 'rsvp_realtime_1',
              schedule_id: 'sch_realtime_1',
              member_id: 'mem_realtime_1',
              status: 'ATTEND',
            },
          },
        },
      ]);

      expect(mergeRsvpSpy).toHaveBeenCalledTimes(1);
      expect(mergeRsvpSpy).toHaveBeenCalledWith(
        'UPDATE',
        expect.objectContaining({
          id: 'rsvp_realtime_1',
          status: 'ABSENT',
          reason: '출장',
        }),
        expect.objectContaining({
          id: 'rsvp_realtime_1',
          status: 'ATTEND',
        })
      );

      client.disconnect();
    });

    it('reconnects with exponential backoff on close', () => {
      const mockService = new SheetsService(new GasBackend(() => ''));
      const client = new SupabaseRealtimeClient(
        {
          url: 'https://example.supabase.co',
          anonKey: 'anon-test',
          reconnectBaseMs: 1000,
          reconnectMaxMs: 4000,
          customWebSocketClass: MockWebSocket as unknown as typeof WebSocket,
        },
        mockService
      );

      client.connect();
      expect(MockWebSocket.instances.length).toBe(1);
      const ws1 = MockWebSocket.instances[0];

      // Simulate unexpected close
      ws1.close();
      expect(MockWebSocket.instances.length).toBe(1);

      // Advance by backoff delay (1000ms)
      vi.advanceTimersByTime(1000);
      expect(MockWebSocket.instances.length).toBe(2);

      const ws2 = MockWebSocket.instances[1];
      ws2.close();

      // Next backoff delay should double (2000ms)
      vi.advanceTimersByTime(1000);
      expect(MockWebSocket.instances.length).toBe(2);
      vi.advanceTimersByTime(1000);
      expect(MockWebSocket.instances.length).toBe(3);

      client.disconnect();
    });

    it('checkAndReconnect triggers reconnection if socket is disconnected', () => {
      const mockService = new SheetsService(new GasBackend(() => ''));
      const client = new SupabaseRealtimeClient(
        {
          url: 'https://example.supabase.co',
          anonKey: 'anon-test',
          reconnectBaseMs: 10000,
          customWebSocketClass: MockWebSocket as unknown as typeof WebSocket,
        },
        mockService
      );

      client.connect();
      const ws1 = MockWebSocket.instances[0];
      ws1.close();

      // Trigger visibility wake-up immediately
      client.checkAndReconnect();
      expect(MockWebSocket.instances.length).toBe(2);

      client.disconnect();
    });
  });

  describe('startSupabaseRealtime and stopSupabaseRealtime lifecycle', () => {
    it('creates active client when backend has Supabase config and cleans up on stop', () => {
      const backend = new SupabaseBackend({
        url: 'https://custom.supabase.co',
        anonKey: 'custom-key',
      });
      const service = new SheetsService(backend);

      const client = startSupabaseRealtime(
        {
          url: 'https://custom.supabase.co',
          anonKey: 'custom-key',
          customWebSocketClass: MockWebSocket as unknown as typeof WebSocket,
        },
        service
      );

      expect(client).toBeDefined();
      expect(getActiveSupabaseRealtime()).toBe(client);

      stopSupabaseRealtime();
      expect(getActiveSupabaseRealtime()).toBeNull();
    });
  });
});
