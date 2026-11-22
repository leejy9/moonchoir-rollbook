import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SupabaseBackend } from './supabaseBackend';
import { clearAllAdminTokens, getAdminToken, setAdminToken } from '../adminSession';

describe('SupabaseBackend', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockConfig = {
    url: 'https://test.supabase.co',
    anonKey: 'test-anon-key',
  };

  it('normalizes URL with trailing slash or /rest/v1/', () => {
    const b1 = new SupabaseBackend({
      url: 'https://test.supabase.co/rest/v1/',
      anonKey: 'k',
    });
    // @ts-expect-error accessing private field for test verification
    expect(b1.config.url).toBe('https://test.supabase.co');
  });

  it('requests snapshot successfully via RPC', async () => {
    const backend = new SupabaseBackend(mockConfig);
    const mockData = {
      success: true,
      data: {
        members: [{ id: 'mem_1', name: '김단원' }],
        schedules: [],
      },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockData), { status: 200 })
    );

    const snapshot = await backend.requestSnapshot();
    expect(snapshot.members).toHaveLength(1);
    expect(snapshot.members?.[0].name).toBe('김단원');
  });

  it('maps RECORD_ATTENDANCE to fn_record_attendance and calls RPC', async () => {
    const backend = new SupabaseBackend(mockConfig);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, message: '출석 완료' }), { status: 200 })
    );

    const result = await backend.callAction('RECORD_ATTENDANCE', { id: 'log_100' });
    expect(result.success).toBe(true);
    expect(result.message).toBe('출석 완료');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://test.supabase.co/rest/v1/rpc/fn_record_attendance',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          apikey: 'test-anon-key',
          Authorization: 'Bearer test-anon-key',
        }),
      })
    );
  });

  it('maps VERIFY_ADMIN_PIN to fn_verify_admin_pin with p_pin', async () => {
    const backend = new SupabaseBackend(mockConfig);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, message: '인증 성공' }), { status: 200 })
    );

    const result = await backend.callAction('VERIFY_ADMIN_PIN', { pin: '5555' });
    expect(result.success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://test.supabase.co/rest/v1/rpc/fn_verify_admin_pin',
      expect.objectContaining({
        body: JSON.stringify({ p_pin: '5555' }),
      })
    );
  });

  it('returns failure for unsupported action', async () => {
    const backend = new SupabaseBackend(mockConfig);
    const result = await backend.callAction('UNKNOWN_ACTION', {});
    expect(result.success).toBe(false);
    expect(result.message).toContain('지원되지 않는 작업입니다');
  });

  it('maps UNBIND_DEVICE to fn_unbind_member_device with adminToken', async () => {
    const backend = new SupabaseBackend(mockConfig);
    setAdminToken('admin', 'tok_admin');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, message: '기기 바인딩이 해제되었습니다.' }), { status: 200 })
    );

    const result = await backend.callAction('UNBIND_DEVICE', { memberId: 'mem_1' });
    expect(result.success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://test.supabase.co/rest/v1/rpc/fn_unbind_member_device',
      expect.objectContaining({
        body: JSON.stringify({
          p_payload: { memberId: 'mem_1', adminToken: 'tok_admin' },
        }),
      })
    );
  });

  describe('admin session tokens', () => {
    beforeEach(() => {
      clearAllAdminTokens();
    });

    const okResponse = () =>
      new Response(JSON.stringify({ success: true, message: 'ok' }), { status: 200 });

    it('sends no adminToken when nobody is logged in as admin', async () => {
      const backend = new SupabaseBackend(mockConfig);
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(okResponse());

      await backend.callAction('SUBMIT_RSVP', { scheduleId: 's1', memberId: 'm1' });
      const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
      expect(body.p_payload.adminToken).toBeUndefined();
    });

    it('attaches the active admin token to write payloads, preferring the super token', async () => {
      const backend = new SupabaseBackend(mockConfig);
      setAdminToken('admin', 'a'.repeat(64));
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse());

      await backend.callAction('DELETE_SCHEDULE', { id: 's1' });
      expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body)).p_payload).toEqual({
        id: 's1',
        adminToken: 'a'.repeat(64),
      });

      setAdminToken('super', 's'.repeat(64));
      await backend.callAction('SAVE_CONFIG', { config: { adminPin: '123456' } });
      expect(JSON.parse(String(fetchSpy.mock.calls[1][1]?.body)).p_payload).toEqual({
        adminPin: '123456',
        adminToken: 's'.repeat(64),
      });
    });

    it('sends the token as p_token when reading admin secrets', async () => {
      const backend = new SupabaseBackend(mockConfig);
      setAdminToken('admin', 'a'.repeat(64));
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(okResponse());

      await backend.callAction('GET_ADMIN_SECRETS', {});
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://test.supabase.co/rest/v1/rpc/fn_get_admin_secrets',
        expect.objectContaining({ body: JSON.stringify({ p_token: 'a'.repeat(64) }) })
      );
    });

    it('clears stored tokens when the server reports ADMIN_AUTH_REQUIRED', async () => {
      const backend = new SupabaseBackend(mockConfig);
      setAdminToken('admin', 'a'.repeat(64));
      setAdminToken('super', 's'.repeat(64));
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: false, code: 'ADMIN_AUTH_REQUIRED', message: '관리자 인증이 필요합니다.' }),
          { status: 200 }
        )
      );

      const result = await backend.callAction('UPDATE_SCHEDULE', { id: 's1' });
      expect(result.success).toBe(false);
      expect(getAdminToken('admin')).toBeNull();
      expect(getAdminToken('super')).toBeNull();
    });
  });

  describe('practice catalog actions', () => {
    const okResponse = () =>
      new Response(JSON.stringify({ success: true, message: 'ok', data: {} }), { status: 200 });

    it('formats GET_PRACTICE_CATALOG body with p_include_archived and p_token', async () => {
      const backend = new SupabaseBackend(mockConfig);
      setAdminToken('admin', 'tok_practice_admin');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(okResponse());

      await backend.callAction('GET_PRACTICE_CATALOG', { includeArchived: true });

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://test.supabase.co/rest/v1/rpc/fn_get_practice_catalog',
        expect.objectContaining({
          body: JSON.stringify({
            p_include_archived: true,
            p_token: 'tok_practice_admin',
          }),
        })
      );
    });

    it('maps all 6 write practice actions with admin token attached', async () => {
      const backend = new SupabaseBackend(mockConfig);
      setAdminToken('admin', 'tok_practice_admin');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(okResponse()));

      await backend.callAction('SAVE_PRACTICE_PIECE', { id: 'p1', title: '아리랑' });
      expect(fetchSpy).toHaveBeenLastCalledWith(
        'https://test.supabase.co/rest/v1/rpc/fn_save_practice_piece',
        expect.objectContaining({
          body: JSON.stringify({
            p_payload: { id: 'p1', title: '아리랑', adminToken: 'tok_practice_admin' },
          }),
        })
      );

      await backend.callAction('SET_PRACTICE_PIECE_ARCHIVED', { id: 'p1', isArchived: true });
      expect(fetchSpy).toHaveBeenLastCalledWith(
        'https://test.supabase.co/rest/v1/rpc/fn_set_practice_piece_archived',
        expect.anything()
      );

      await backend.callAction('SAVE_PRACTICE_TRACK', { id: 't1', label: '합창 MR' });
      expect(fetchSpy).toHaveBeenLastCalledWith(
        'https://test.supabase.co/rest/v1/rpc/fn_save_practice_track',
        expect.anything()
      );

      await backend.callAction('SET_PRACTICE_TRACK_ARCHIVED', { id: 't1', isArchived: true });
      expect(fetchSpy).toHaveBeenLastCalledWith(
        'https://test.supabase.co/rest/v1/rpc/fn_set_practice_track_archived',
        expect.anything()
      );

      await backend.callAction('SET_PROGRAM_PIECES', { programId: 'card1', pieceIds: ['p1'] });
      expect(fetchSpy).toHaveBeenLastCalledWith(
        'https://test.supabase.co/rest/v1/rpc/fn_set_program_pieces',
        expect.anything()
      );

      await backend.callAction('REORDER_PRACTICE_TRACKS', { pieceId: 'p1', trackIds: ['t1'] });
      expect(fetchSpy).toHaveBeenLastCalledWith(
        'https://test.supabase.co/rest/v1/rpc/fn_reorder_practice_tracks',
        expect.anything()
      );

      await backend.callAction('SAVE_PERFORMANCE', { title: '정기연주회' });
      expect(fetchSpy).toHaveBeenLastCalledWith(
        'https://test.supabase.co/rest/v1/rpc/fn_save_performance',
        expect.anything()
      );

      await backend.callAction('SET_PERFORMANCE_ARCHIVED', { performanceId: 'perf1', archived: true });
      expect(fetchSpy).toHaveBeenLastCalledWith(
        'https://test.supabase.co/rest/v1/rpc/fn_set_performance_archived',
        expect.anything()
      );

      await backend.callAction('SET_PERFORMANCE_PIECES', { performanceId: 'perf1', pieceIds: ['p1'] });
      expect(fetchSpy).toHaveBeenLastCalledWith(
        'https://test.supabase.co/rest/v1/rpc/fn_set_performance_pieces',
        expect.anything()
      );
    });

    it('maps GET_MEDIA_USAGE to fn_get_media_usage with admin token attached', async () => {
      const backend = new SupabaseBackend(mockConfig);
      setAdminToken('admin', 'tok_admin_media');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(okResponse()));

      await backend.callAction('GET_MEDIA_USAGE', {});
      expect(fetchSpy).toHaveBeenLastCalledWith(
        'https://test.supabase.co/rest/v1/rpc/fn_get_media_usage',
        expect.objectContaining({
          body: JSON.stringify({ p_token: 'tok_admin_media' }),
        })
      );
    });
  });
});

