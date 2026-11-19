import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SupabaseBackend } from './supabaseBackend';

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
});
