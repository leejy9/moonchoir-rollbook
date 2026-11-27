import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildSupabaseRealtimeUrl,
  mapSnakeToCamelAttendanceLog,
  mapSnakeToCamelCommentEvent,
  mapSnakeToCamelRsvpVote,
  mapSnakeToCamelSchedule,
  mapSnakeToCamelMember,
  mapSnakeToCamelLocation,
  mapSnakeToCamelProgramCard,
  SupabaseRealtimeClient,
  startSupabaseRealtime,
  stopSupabaseRealtime,
  getActiveSupabaseRealtime,
  getBackupPollingIntervalMs,
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
      expect(url).toBe('wss://example.supabase.co/realtime/v1/websocket?apikey=anon-key-123&vsn=2.0.0');
    });

    it('converts http to ws for local development', () => {
      const url = buildSupabaseRealtimeUrl('http://127.0.0.1:54321', 'anon-key-123');
      expect(url).toBe('ws://127.0.0.1:54321/realtime/v1/websocket?apikey=anon-key-123&vsn=2.0.0');
    });

    it('strips trailing slash and /rest/v1 paths', () => {
      const url = buildSupabaseRealtimeUrl('https://example.supabase.co/rest/v1/', 'anon-key-123');
      expect(url).toBe('wss://example.supabase.co/realtime/v1/websocket?apikey=anon-key-123&vsn=2.0.0');
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

    it('maps snake_case schedules to camelCase Schedule', () => {
      const mapped = mapSnakeToCamelSchedule({
        id: 'sch_1',
        title: '정기연습 1회차',
        date: '2026-11-20',
        start_time: '19:30',
        end_time: '21:30',
        location_name: '서초 연습실',
        location_id: 'loc_1',
        detail_address: '3층 대연습실',
        entrance_note: '후문 이용',
        latitude: 37.5,
        longitude: 127.0,
        radius_meters: 100,
        category: '정기연습',
        check_in_pin: '1234',
        description: '오리엔테이션',
        program_id: 'card_1',
        series_id: 'series_1',
        series_index: 1,
        series_total: 10,
        is_archived: false,
        is_cancelled: false,
        target_audience_type: 'PARTS',
        target_parts: ['소프라노', '알토'],
        target_member_ids: ['mem_1'],
        visibility: 'TARGETS_ONLY',
      });

      expect(mapped).toEqual({
        id: 'sch_1',
        title: '정기연습 1회차',
        date: '2026-11-20',
        startTime: '19:30',
        endTime: '21:30',
        locationName: '서초 연습실',
        locationId: 'loc_1',
        detailAddress: '3층 대연습실',
        entranceNote: '후문 이용',
        targetLat: 37.5,
        targetLon: 127.0,
        radiusMeters: 100,
        category: '정기연습',
        checkInPin: '1234',
        description: '오리엔테이션',
        programId: 'card_1',
        seriesId: 'series_1',
        seriesIndex: 1,
        seriesTotal: 10,
        isArchived: false,
        isCancelled: false,
        targetAudienceType: 'PARTS',
        targetParts: ['소프라노', '알토'],
        targetMemberIds: ['mem_1'],
        visibility: 'TARGETS_ONLY',
      });
    });

    it('maps snake_case members to camelCase Member', () => {
      const mapped = mapSnakeToCamelMember({
        id: 'mem_1',
        name: '홍길동',
        part: '테너',
        phone: '010-1234-5678',
        phone_last4: '5678',
        role: 'MEMBER',
        created_at: '2026-11-20T00:00:00Z',
        status: 'ACTIVE',
        merged_into_id: '',
        joined_at: '2026-11-20',
        member_status: '정단원',
        note: '테스트 단원',
        bound_device_id: 'dev_123',
        bound_device_at: '2026-11-20T01:00:00Z',
      });

      expect(mapped).toEqual({
        id: 'mem_1',
        name: '홍길동',
        part: '테너',
        phone: '010-1234-5678',
        phoneLast4: '5678',
        role: 'MEMBER',
        createdAt: '2026-11-20T00:00:00Z',
        status: 'ACTIVE',
        mergedIntoId: undefined,
        joinedAt: '2026-11-20',
        memberStatus: '정단원',
        note: '테스트 단원',
        boundDeviceId: 'dev_123',
        boundDeviceAt: '2026-11-20T01:00:00Z',
      });
    });

    it('maps snake_case locations to camelCase LocationPreset', () => {
      const mapped = mapSnakeToCamelLocation({
        id: 'loc_1',
        name: '서초 연습실',
        address: '서울시 서초구',
        detail_address: '3층',
        entrance_note: '후문 이용',
        latitude: 37.5,
        longitude: 127.0,
        radius_meters: 100,
        is_default: true,
      });

      expect(mapped).toEqual({
        id: 'loc_1',
        name: '서초 연습실',
        address: '서울시 서초구',
        detailAddress: '3층',
        entranceNote: '후문 이용',
        latitude: 37.5,
        longitude: 127.0,
        radiusMeters: 100,
        isDefault: true,
      });
    });

    it('maps snake_case program_cards to camelCase ProgramCard', () => {
      const mapped = mapSnakeToCamelProgramCard({
        id: 'card_1',
        title: '2026 가을 정기연습',
        description: '정기연습 프로젝트',
        category: '정기연습',
        default_location_id: 'loc_1',
        default_start_time: '19:30',
        default_end_time: '21:30',
        target_audience_type: 'ALL',
        is_archived: false,
        created_at: '2026-11-20T00:00:00Z',
      });

      expect(mapped).toEqual({
        id: 'card_1',
        title: '2026 가을 정기연습',
        description: '정기연습 프로젝트',
        category: '정기연습',
        defaultLocationId: 'loc_1',
        defaultStartTime: '19:30',
        defaultEndTime: '21:30',
        targetAudienceType: 'ALL',
        targetParts: undefined,
        targetMemberIds: undefined,
        isArchived: false,
        createdAt: '2026-11-20T00:00:00Z',
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
      expect(joinMsg[2]).toBe('realtime:moonchoir');
      expect(joinMsg[3]).toBe('phx_join');
      expect(joinMsg[4].config.postgres_changes).toEqual([
        { event: '*', schema: 'public', table: 'attendance_logs' },
        { event: '*', schema: 'public', table: 'schedule_comment_events' },
        { event: '*', schema: 'public', table: 'comment_reaction_events' },
        { event: '*', schema: 'public', table: 'rsvp_votes' },
        { event: '*', schema: 'public', table: 'schedules' },
        { event: '*', schema: 'public', table: 'members' },
        { event: '*', schema: 'public', table: 'locations' },
        { event: '*', schema: 'public', table: 'program_cards' },
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
        'realtime:moonchoir',
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
        'INSERT',
        expect.objectContaining({
          id: 'log_realtime_1',
          scheduleId: 'sch_realtime_1',
          memberId: 'mem_realtime_1',
        }),
        null
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
        'realtime:moonchoir',
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
        'INSERT',
        expect.objectContaining({
          id: 'comment_realtime_1',
          text: '실시간 댓글 테스트',
        }),
        null
      );

      client.disconnect();
    });

    it('routes incoming postgres_changes for schedules to service.mergeRealtimeSchedule', () => {
      const mockService = new SheetsService(new GasBackend(() => ''));
      const mergeScheduleSpy = vi.spyOn(mockService, 'mergeRealtimeSchedule');

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
        'realtime:moonchoir',
        'postgres_changes',
        {
          data: {
            table: 'schedules',
            type: 'UPDATE',
            record: {
              id: 'sch_realtime_1',
              title: '수정된 일정',
              date: '2026-11-20',
            },
            old_record: {
              id: 'sch_realtime_1',
              title: '이전 일정',
              date: '2026-11-20',
            },
          },
        },
      ]);

      expect(mergeScheduleSpy).toHaveBeenCalledTimes(1);
      expect(mergeScheduleSpy).toHaveBeenCalledWith(
        'UPDATE',
        expect.objectContaining({
          id: 'sch_realtime_1',
          title: '수정된 일정',
        }),
        expect.objectContaining({
          id: 'sch_realtime_1',
          title: '이전 일정',
        })
      );

      client.disconnect();
    });

    it('routes incoming postgres_changes for members to service.mergeRealtimeMember', () => {
      const mockService = new SheetsService(new GasBackend(() => ''));
      const mergeMemberSpy = vi.spyOn(mockService, 'mergeRealtimeMember');

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
        'realtime:moonchoir',
        'postgres_changes',
        {
          data: {
            table: 'members',
            type: 'INSERT',
            record: {
              id: 'mem_realtime_1',
              name: '새단원',
              part: '소프라노',
            },
          },
        },
      ]);

      expect(mergeMemberSpy).toHaveBeenCalledTimes(1);
      expect(mergeMemberSpy).toHaveBeenCalledWith(
        'INSERT',
        expect.objectContaining({
          id: 'mem_realtime_1',
          name: '새단원',
        }),
        null
      );

      client.disconnect();
    });

    it('routes incoming postgres_changes for locations to service.mergeRealtimeLocation', () => {
      const mockService = new SheetsService(new GasBackend(() => ''));
      const mergeLocationSpy = vi.spyOn(mockService, 'mergeRealtimeLocation');

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
        'realtime:moonchoir',
        'postgres_changes',
        {
          data: {
            table: 'locations',
            type: 'DELETE',
            old_record: {
              id: 'loc_realtime_1',
            },
          },
        },
      ]);

      expect(mergeLocationSpy).toHaveBeenCalledTimes(1);
      expect(mergeLocationSpy).toHaveBeenCalledWith(
        'DELETE',
        null,
        expect.objectContaining({
          id: 'loc_realtime_1',
        })
      );

      client.disconnect();
    });

    it('routes incoming postgres_changes for program_cards to service.mergeRealtimeProgramCard', () => {
      const mockService = new SheetsService(new GasBackend(() => ''));
      const mergeProgramCardSpy = vi.spyOn(mockService, 'mergeRealtimeProgramCard');

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
        'realtime:moonchoir',
        'postgres_changes',
        {
          data: {
            table: 'program_cards',
            type: 'INSERT',
            record: {
              id: 'card_realtime_1',
              title: '새 카드',
            },
          },
        },
      ]);

      expect(mergeProgramCardSpy).toHaveBeenCalledTimes(1);
      expect(mergeProgramCardSpy).toHaveBeenCalledWith(
        'INSERT',
        expect.objectContaining({
          id: 'card_realtime_1',
          title: '새 카드',
        }),
        null
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
        'realtime:moonchoir',
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

    it('checkAndReconnect closes and reconnects stale zombie socket (>60s inactivity)', () => {
      const mockService = new SheetsService(new GasBackend(() => ''));
      const client = new SupabaseRealtimeClient(
        {
          url: 'https://example.supabase.co',
          anonKey: 'anon-test',
          customWebSocketClass: MockWebSocket as unknown as typeof WebSocket,
        },
        mockService
      );

      client.connect();
      const ws1 = MockWebSocket.instances[0];
      ws1.simulateOpen();

      // Advance time by 65 seconds without messages
      vi.advanceTimersByTime(65000);

      // Trigger checkAndReconnect
      client.checkAndReconnect();
      expect(ws1.readyState).toBe(WebSocket.CLOSED);
      expect(MockWebSocket.instances.length).toBe(2);

      client.disconnect();
    });

    it('keeps socket alive and avoids zombie reconnection when phoenix heartbeat/reply messages arrive', () => {
      const mockService = new SheetsService(new GasBackend(() => ''));
      const client = new SupabaseRealtimeClient(
        {
          url: 'https://example.supabase.co',
          anonKey: 'anon-test',
          customWebSocketClass: MockWebSocket as unknown as typeof WebSocket,
        },
        mockService
      );

      client.connect();
      const ws1 = MockWebSocket.instances[0];
      ws1.simulateOpen();

      // Advance 40 seconds
      vi.advanceTimersByTime(40000);

      // Phoenix heartbeat reply arrives (not a postgres_changes event)
      ws1.simulateMessage([null, '2', 'phoenix', 'phx_reply', { response: {}, status: 'ok' }]);

      // Advance another 30 seconds (total 70s since connect, but only 30s since last phoenix message)
      vi.advanceTimersByTime(30000);

      // Trigger checkAndReconnect
      client.checkAndReconnect();

      // Should still be open and NOT reconnected because lastMessageAt was updated
      expect(ws1.readyState).toBe(WebSocket.OPEN);
      expect(MockWebSocket.instances.length).toBe(1);

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

  describe('P1-11: Background Polling Throttle based on Realtime Connection', () => {
    it('returns 5 minutes (300000ms) when realtime is connected', () => {
      expect(getBackupPollingIntervalMs(true)).toBe(300000);
    });

    it('returns 30 seconds (30000ms) when realtime is disconnected', () => {
      expect(getBackupPollingIntervalMs(false)).toBe(30000);
    });
  });
});
