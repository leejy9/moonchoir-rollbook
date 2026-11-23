import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker, { computeContentRange, generateKey, authorizeAdmin } from './index.js';

describe('computeContentRange', () => {
  it('handles {offset: 0, length: 2}, size 1000', () => {
    expect(computeContentRange({ offset: 0, length: 2 }, 1000)).toEqual({
      start: 0,
      end: 1,
      header: 'bytes 0-1/1000',
      length: 2,
    });
  });

  it('handles {offset: 0}(without length), size 1000', () => {
    expect(computeContentRange({ offset: 0 }, 1000)).toEqual({
      start: 0,
      end: 999,
      header: 'bytes 0-999/1000',
      length: 1000,
    });
  });

  it('handles {offset: 500}, size 1000', () => {
    expect(computeContentRange({ offset: 500 }, 1000)).toEqual({
      start: 500,
      end: 999,
      header: 'bytes 500-999/1000',
      length: 500,
    });
  });

  it('handles {suffix: 100}, size 1000', () => {
    expect(computeContentRange({ suffix: 100 }, 1000)).toEqual({
      start: 900,
      end: 999,
      header: 'bytes 900-999/1000',
      length: 100,
    });
  });

  it('handles {suffix: 5000}, size 1000', () => {
    expect(computeContentRange({ suffix: 5000 }, 1000)).toEqual({
      start: 0,
      end: 999,
      header: 'bytes 0-999/1000',
      length: 1000,
    });
  });

  it('handles {offset: 2000}, size 1000', () => {
    expect(computeContentRange({ offset: 2000 }, 1000)).toBeNull();
  });

  it('handles {offset: 990, length: 100}, size 1000', () => {
    expect(computeContentRange({ offset: 990, length: 100 }, 1000)).toEqual({
      start: 990,
      end: 999,
      header: 'bytes 990-999/1000',
      length: 10,
    });
  });

  it('handles missing or invalid range', () => {
    expect(computeContentRange(null, 1000)).toBeNull();
    expect(computeContentRange(undefined, 1000)).toBeNull();
    expect(computeContentRange({ offset: 0 }, 0)).toBeNull();
    expect(computeContentRange({ offset: 0 }, -100)).toBeNull();
  });
});

describe('generateKey', () => {
  it('generates a key matching YYYY/(audio|score)/[a-z0-9]{16}.(ext)', () => {
    const audioKey = generateKey('audio', 'audio/mp4');
    expect(audioKey).toMatch(/^\d{4}\/audio\/[a-z0-9]{16}\.m4a$/);

    const mp3Key = generateKey('audio', 'audio/mpeg');
    expect(mp3Key).toMatch(/^\d{4}\/audio\/[a-z0-9]{16}\.mp3$/);

    const aacKey = generateKey('audio', 'audio/aac');
    expect(aacKey).toMatch(/^\d{4}\/audio\/[a-z0-9]{16}\.aac$/);

    const scoreKey = generateKey('score', 'application/pdf');
    expect(scoreKey).toMatch(/^\d{4}\/score\/[a-z0-9]{16}\.pdf$/);
  });
});

describe('authorizeAdmin', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns false when token is missing or env is incomplete', async () => {
    expect(await authorizeAdmin('', { SUPABASE_URL: 'http://test', SUPABASE_ANON_KEY: 'anon' })).toBe(false);
    expect(await authorizeAdmin('token', null)).toBe(false);
    expect(await authorizeAdmin('token', { SUPABASE_URL: '' })).toBe(false);
  });

  it('returns true when Supabase RPC returns true', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('true'),
    });

    const result = await authorizeAdmin('valid-token', {
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_ANON_KEY: 'test-anon-key',
    });
    expect(result).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://test.supabase.co/rest/v1/rpc/fn_authorize_media_upload',
      expect.objectContaining({
        method: 'POST',
        headers: {
          apikey: 'test-anon-key',
          Authorization: 'Bearer test-anon-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_token: 'valid-token' }),
      })
    );
  });

  it('returns false when Supabase RPC returns false or fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('false'),
    });
    expect(await authorizeAdmin('bad-token', {
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_ANON_KEY: 'test-anon-key',
    })).toBe(false);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: () => Promise.resolve('error'),
    });
    expect(await authorizeAdmin('bad-token', {
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_ANON_KEY: 'test-anon-key',
    })).toBe(false);
  });
});

describe('Worker HTTP handlers', () => {
  const originalFetch = globalThis.fetch;
  let mockBucket;
  let fakeEnv;

  beforeEach(() => {
    mockBucket = {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    };
    fakeEnv = {
      MEDIA_BUCKET: mockBucket,
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_ANON_KEY: 'anon-key',
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('handles CORS OPTIONS preflight with POST, DELETE, X-Admin-Token', async () => {
    const req = new Request('https://worker.dev/upload', {
      method: 'OPTIONS',
      headers: { Origin: 'https://leejy9.github.io' },
    });
    const res = await worker.fetch(req, fakeEnv);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('DELETE');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('X-Admin-Token');
  });

  describe('POST /upload', () => {
    it('returns 400 when kind is not audio or score', async () => {
      const req = new Request('https://worker.dev/upload?kind=video', { method: 'POST' });
      const res = await worker.fetch(req, fakeEnv);
      expect(res.status).toBe(400);
    });

    it('returns 401 when admin auth fails', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('false') });
      const req = new Request('https://worker.dev/upload?kind=audio', {
        method: 'POST',
        headers: { 'X-Admin-Token': 'invalid' },
      });
      const res = await worker.fetch(req, fakeEnv);
      expect(res.status).toBe(401);
    });

    it('returns 411 when Content-Length is missing or invalid', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('true') });
      const req = new Request('https://worker.dev/upload?kind=audio', {
        method: 'POST',
        headers: { 'X-Admin-Token': 'valid' },
      });
      const res = await worker.fetch(req, fakeEnv);
      expect(res.status).toBe(411);
    });

    it('returns 415 when Content-Type is unsupported for kind', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('true') });
      const req = new Request('https://worker.dev/upload?kind=audio', {
        method: 'POST',
        headers: {
          'X-Admin-Token': 'valid',
          'Content-Length': '1024',
          'Content-Type': 'application/pdf',
        },
      });
      const res = await worker.fetch(req, fakeEnv);
      expect(res.status).toBe(415);
    });

    it('returns 413 when size exceeds maximum limit', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('true') });
      const req = new Request('https://worker.dev/upload?kind=audio', {
        method: 'POST',
        headers: {
          'X-Admin-Token': 'valid',
          'Content-Length': String(31 * 1024 * 1024), // 31MB > 30MB
          'Content-Type': 'audio/mp4',
        },
      });
      const res = await worker.fetch(req, fakeEnv);
      expect(res.status).toBe(413);
    });

    it('puts object into MEDIA_BUCKET and returns 201 on success', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('true') });
      const body = new Uint8Array([1, 2, 3, 4]);
      const req = new Request('https://worker.dev/upload?kind=audio', {
        method: 'POST',
        headers: {
          'X-Admin-Token': 'valid',
          'Content-Length': '4',
          'Content-Type': 'audio/mpeg',
        },
        body,
      });

      const res = await worker.fetch(req, fakeEnv);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.size).toBe(4);
      expect(json.key).toMatch(/^\d{4}\/audio\/[a-z0-9]{16}\.mp3$/);
      expect(mockBucket.put).toHaveBeenCalledWith(
        json.key,
        expect.anything(),
        { httpMetadata: { contentType: 'audio/mpeg' } }
      );
    });
  });

  describe('DELETE /object/{key}', () => {
    it('returns 401 when admin auth fails', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('false') });
      const req = new Request('https://worker.dev/object/2026/audio/abcdef1234567890.mp3', {
        method: 'DELETE',
        headers: { 'X-Admin-Token': 'invalid' },
      });
      const res = await worker.fetch(req, fakeEnv);
      expect(res.status).toBe(401);
    });

    it('returns 400 when key does not match regex', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('true') });
      const invalidKeys = [
        '../secret.txt',
        '2026/video/1234567890123456.mp4',
        '2026/audio/short.mp3',
        '2026/audio/1234567890123456.exe',
      ];
      for (const key of invalidKeys) {
        const req = new Request(`https://worker.dev/object/${encodeURIComponent(key)}`, {
          method: 'DELETE',
          headers: { 'X-Admin-Token': 'valid' },
        });
        const res = await worker.fetch(req, fakeEnv);
        expect(res.status).toBe(400);
      }
    });

    it('deletes object from MEDIA_BUCKET and returns 204 on valid key', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('true') });
      const validKey = '2026/audio/abcdef1234567890.mp3';
      const req = new Request(`https://worker.dev/object/${validKey}`, {
        method: 'DELETE',
        headers: { 'X-Admin-Token': 'valid' },
      });
      const res = await worker.fetch(req, fakeEnv);
      expect(res.status).toBe(204);
      expect(mockBucket.delete).toHaveBeenCalledWith(validKey);
    });
  });
});
