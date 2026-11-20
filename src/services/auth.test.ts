import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bindDeviceProfile,
  clearDeviceProfile,
  getBoundDeviceProfile,
  isAdminLoggedIn,
  setAdminLoggedIn,
  touchAdminSession,
} from './auth';
import { sheetsService } from './sheets';
import { SupabaseBackend } from './backend/supabaseBackend';
import { GasBackend } from './backend/gasBackend';
import { getAdminToken, setAdminToken } from './adminSession';

describe('Device Binding & Authentication Service', () => {
  beforeEach(() => {
    clearDeviceProfile();
    setAdminLoggedIn(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('correctly binds and retrieves device profile', () => {
    expect(getBoundDeviceProfile()).toBeNull();

    const bound = bindDeviceProfile('mem_s01', '김하은', '소프라노', '1234');
    expect(bound.name).toBe('김하은');
    expect(bound.part).toBe('소프라노');

    const retrieved = getBoundDeviceProfile();
    expect(retrieved?.memberId).toBe('mem_s01');
    expect(retrieved?.phoneLast4).toBe('1234');
  });

  describe('with the Supabase backend (server-issued admin tokens)', () => {
    beforeEach(() => {
      sheetsService.setBackend(new SupabaseBackend({ url: 'https://test.supabase.co', anonKey: 'k' }));
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 })
      );
    });

    afterEach(() => {
      setAdminLoggedIn(false);
      sheetsService.setBackend(new GasBackend(() => sheetsService.getConfig().sheetsWebAppUrl));
      vi.restoreAllMocks();
    });

    it('does not keep an admin session without a server token', () => {
      setAdminLoggedIn(true);
      expect(isAdminLoggedIn()).toBe(false);
    });

    it('keeps the admin session while a server token exists', () => {
      setAdminToken('admin', 'b'.repeat(64));
      setAdminLoggedIn(true);
      expect(isAdminLoggedIn()).toBe(true);
    });

    it('clears the token and asks the server to revoke it on logout', () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      setAdminToken('admin', 'c'.repeat(64));
      setAdminLoggedIn(true);
      setAdminLoggedIn(false);
      expect(getAdminToken('admin')).toBeNull();
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://test.supabase.co/rest/v1/rpc/fn_admin_logout',
        expect.objectContaining({ body: JSON.stringify({ p_token: 'c'.repeat(64) }) })
      );
    });
  });

  it('manages admin session state', () => {
    expect(isAdminLoggedIn()).toBe(false);
    setAdminLoggedIn(true);
    expect(isAdminLoggedIn()).toBe(true);
    setAdminLoggedIn(false);
    expect(isAdminLoggedIn()).toBe(false);
  });

  it('expires the admin session after 15 minutes without activity', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T12:00:00'));
    setAdminLoggedIn(true);

    vi.advanceTimersByTime(15 * 60 * 1000 - 1);
    expect(isAdminLoggedIn()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(isAdminLoggedIn()).toBe(false);
  });

  it('extends the admin session when activity is recorded', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T12:00:00'));
    setAdminLoggedIn(true);

    vi.advanceTimersByTime(14 * 60 * 1000);
    touchAdminSession();
    vi.advanceTimersByTime(14 * 60 * 1000);

    expect(isAdminLoggedIn()).toBe(true);
  });
});
