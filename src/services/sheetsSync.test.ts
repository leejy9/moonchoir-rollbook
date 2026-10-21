import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Member, RawAttendanceLog } from '../types/rollbook';
import { MIN_REFRESH_INTERVAL_MS, SheetsService, resetStorage, type SheetsNotice } from './sheets';

const URL = 'https://script.google.com/macros/s/test/exec';

const member: Member = {
  id: 'mem_a',
  name: '단원A',
  part: '알토',
  phoneLast4: '1111',
  role: 'MEMBER',
  status: 'ACTIVE',
  createdAt: '2026-01-01 00:00:00',
  joinedAt: '2026-01-01',
  memberStatus: '정단원',
};

const makeLog = (id: string, authMethod: RawAttendanceLog['authMethod'] = 'QR_WEB_CAM'): RawAttendanceLog => ({
  id,
  timestamp: '2026-10-22 19:25:00',
  scheduleId: 'sch_1',
  memberId: member.id,
  memberName: member.name,
  part: member.part,
  authMethod,
  isVerifiedLocation: true,
});

interface FakeBackend {
  logs: RawAttendanceLog[];
  gets: number;
  posts: number;
  failPosts: boolean;
  failGets: boolean;
  /** 지정하면 GET 응답을 이 promise가 풀릴 때까지 붙잡는다(요청 시점의 데이터로 응답) */
  holdGet?: Promise<void>;
  /** 지정하면 POST 응답을 이 promise가 풀릴 때까지 붙잡는다 */
  holdPost?: Promise<void>;
}

function installBackend(): FakeBackend {
  const backend: FakeBackend = { logs: [], gets: 0, posts: 0, failPosts: false, failGets: false };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: { method?: string; body?: string }) => {
      if (init?.method === 'POST') {
        backend.posts += 1;
        const body = JSON.parse(init.body ?? '{}') as { action: string; data: RawAttendanceLog };
        if (backend.holdPost) await backend.holdPost;
        if (backend.failPosts) return { ok: false, status: 500, json: async () => ({}) };
        if (body.action === 'RECORD_ATTENDANCE') backend.logs.push(body.data);
        return { ok: true, status: 200, json: async () => ({ success: true }) };
      }
      backend.gets += 1;
      const snapshotAtRequest = backend.logs.map((l) => ({ ...l }));
      if (backend.holdGet) await backend.holdGet;
      if (backend.failGets) return { ok: false, status: 500, json: async () => ({}) };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { members: [member], schedules: [], logs: snapshotAtRequest },
        }),
      };
    })
  );
  return backend;
}

describe('SheetsService refresh & write confirmation', () => {
  let service: SheetsService;
  let backend: FakeBackend;

  beforeEach(() => {
    resetStorage();
    backend = installBackend();
    service = new SheetsService();
    service.updateConfig({ sheetsWebAppUrl: URL });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('refreshRemoteData는 이 기기에서 20초 안에 다시 요청하지 않고, force는 건너뛰지 않는다', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-22T19:00:00'));
    backend.gets = 0;

    expect(await service.refreshRemoteData()).toBe(true);
    expect(backend.gets).toBe(1);

    expect(await service.refreshRemoteData()).toBe(false);
    expect(backend.gets).toBe(1);

    vi.setSystemTime(new Date(Date.now() + MIN_REFRESH_INTERVAL_MS + 1000));
    expect(await service.refreshRemoteData()).toBe(true);
    expect(backend.gets).toBe(2);

    expect(await service.refreshRemoteData({ force: true })).toBe(true);
    expect(backend.gets).toBe(3);
  });

  it('동시에 여러 번 요청해도 시트는 한 번만 읽는다', async () => {
    let release!: () => void;
    backend.holdGet = new Promise<void>((resolve) => (release = resolve));
    backend.gets = 0;

    const first = service.refreshRemoteData({ force: true });
    const second = service.refreshRemoteData({ force: true });
    release();

    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(backend.gets).toBe(1);
  });

  it('전송 중인 저장이 끝난 뒤에 읽는다: 방금 한 출석이 새로고침에 사라지지 않는다', async () => {
    let releasePost!: () => void;
    backend.holdPost = new Promise<void>((resolve) => (releasePost = resolve));
    backend.gets = 0;

    const checkIn = service.addCheckInLog(makeLog('log_qr_1'));
    const refresh = service.refreshRemoteData({ force: true });
    await Promise.resolve();
    expect(backend.gets).toBe(0); // 저장 응답 전에는 읽지 않는다

    releasePost();
    await checkIn;
    expect(await refresh).toBe(true);
    expect(service.getLogs().map((l) => l.id)).toContain('log_qr_1');
  });

  it('읽는 도중 새 저장이 시작되면 그 응답은 버리고 다시 읽는다', async () => {
    let releaseGet!: () => void;
    backend.holdGet = new Promise<void>((resolve) => (releaseGet = resolve));
    backend.gets = 0;

    const refresh = service.refreshRemoteData({ force: true });
    await vi.waitFor(() => expect(backend.gets).toBe(1));

    backend.holdGet = undefined; // 두 번째 읽기는 바로 응답
    await service.addCheckInLog(makeLog('log_during_get')); // 첫 읽기 응답보다 늦게 도착한 새 출석
    releaseGet(); // 첫 읽기는 출석이 없던 시점의 옛 데이터

    expect(await refresh).toBe(true);
    expect(backend.gets).toBeGreaterThanOrEqual(2);
    expect(service.getLogs().map((l) => l.id)).toContain('log_during_get');
  });

  it('QR 출석은 시트가 확정해야 기록되고, 실패하면 오류를 던지며 로컬에 남기지 않는다', async () => {
    backend.failPosts = true;
    await expect(service.addCheckInLog(makeLog('log_fail'))).rejects.toThrow(/출석|시트|통신/);
    expect(service.getLogs().some((l) => l.id === 'log_fail')).toBe(false);

    backend.failPosts = false;
    await service.addCheckInLog(makeLog('log_ok'));
    expect(service.getLogs().some((l) => l.id === 'log_ok')).toBe(true);
    expect(backend.logs.some((l) => l.id === 'log_ok')).toBe(true);
  });

  it('관리자 수동 입력은 먼저 반영하고, 저장에 실패하면 알림을 띄우고 시트 상태로 되돌린다', async () => {
    const notices: SheetsNotice[] = [];
    service.subscribeNotices((n) => notices.push(n));
    backend.failPosts = true;

    await service.addCheckInLog(makeLog('log_admin_1', 'MANUAL_BY_ADMIN'));
    expect(service.getLogs().some((l) => l.id === 'log_admin_1')).toBe(true); // 즉시 반영

    await vi.waitFor(() => expect(notices.length).toBe(1));
    expect(notices[0].message).toContain('출석');
    expect(notices[0].message).toContain('저장하지 못했어요');

    // 시트에는 없으므로 새로 읽어 오면 화면에서도 사라진다
    await vi.waitFor(() => expect(service.getLogs().some((l) => l.id === 'log_admin_1')).toBe(false));
  });

  it('같은 종류의 저장 실패 알림은 짧은 시간 안에 한 번만 띄운다', async () => {
    const notices: SheetsNotice[] = [];
    service.subscribeNotices((n) => notices.push(n));
    backend.failPosts = true;

    await service.addCheckInLog(makeLog('log_admin_a', 'MANUAL_BY_ADMIN'));
    await service.addCheckInLog(makeLog('log_admin_b', 'MANUAL_BY_ADMIN'));
    await vi.waitFor(() => expect(backend.posts).toBeGreaterThanOrEqual(2));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(notices.length).toBe(1);
  });

  it('새로고침이 실패해도 기존 데이터를 유지하고 상태만 ERROR로 바꾼다', async () => {
    await service.addCheckInLog(makeLog('log_keep'));
    await service.refreshRemoteData({ force: true });
    expect(service.getLogs().some((l) => l.id === 'log_keep')).toBe(true);

    backend.failGets = true;
    expect(await service.refreshRemoteData({ force: true })).toBe(false);
    expect(service.getSyncState().status).toBe('ERROR');
    expect(service.getLogs().some((l) => l.id === 'log_keep')).toBe(true);

    backend.failGets = false;
    expect(await service.refreshRemoteData({ force: true })).toBe(true);
    expect(service.getSyncState().status).toBe('IDLE');
  });

  it('시트 URL이 없으면 새로고침하지 않는다', async () => {
    const offline = new SheetsService();
    offline.updateConfig({ sheetsWebAppUrl: '' });
    backend.gets = 0;
    expect(await offline.refreshRemoteData({ force: true })).toBe(false);
    expect(backend.gets).toBe(0);
  });
});
