import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GasBackend } from './gasBackend';

describe('GasBackend', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fails if target URL is missing on requestSnapshot', async () => {
    const backend = new GasBackend(() => undefined);
    await expect(backend.requestSnapshot()).rejects.toThrow(
      '구글 시트 Web App URL이 설정되지 않았습니다.'
    );
  });

  it('requests snapshot successfully from target URL', async () => {
    const backend = new GasBackend(() => 'https://script.google.com/macros/s/TEST/exec');
    const mockData = {
      success: true,
      data: {
        members: [],
        schedules: [],
      },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockData), { status: 200 })
    );

    const snapshot = await backend.requestSnapshot();
    expect(snapshot.members).toEqual([]);
    expect(snapshot.schedules).toEqual([]);
  });

  it('handles action POST call successfully', async () => {
    const backend = new GasBackend(() => 'https://script.google.com/macros/s/TEST/exec');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, message: '출석 완료' }), { status: 200 })
    );

    const result = await backend.callAction('RECORD_ATTENDANCE', { id: 'log_1' });
    expect(result.success).toBe(true);
    expect(result.message).toBe('출석 완료');
  });

  it('returns failure on network error without throwing', async () => {
    const backend = new GasBackend(() => 'https://script.google.com/macros/s/TEST/exec');
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network offline'));

    const result = await backend.callAction('RECORD_ATTENDANCE', { id: 'log_1' });
    expect(result.success).toBe(false);
    expect(result.message).toBe('시트 전송 실패');
  });

  it('returns UNSUPPORTED_BACKEND for v3 media usage and activity actions', async () => {
    const backend = new GasBackend(() => 'https://script.google.com/macros/s/TEST/exec');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const a1 = await backend.callAction('GET_MEDIA_USAGE', {});
    expect(a1.success).toBe(false);
    expect(a1.code).toBe('UNSUPPORTED_BACKEND');

    const a2 = await backend.callAction('LOG_LISTEN_SESSION', {});
    expect(a2.success).toBe(false);
    expect(a2.code).toBe('UNSUPPORTED_BACKEND');

    const a3 = await backend.callAction('GET_MEMBER_ACTIVITY', { memberIds: ['m1'] });
    expect(a3.success).toBe(false);
    expect(a3.code).toBe('UNSUPPORTED_BACKEND');

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
