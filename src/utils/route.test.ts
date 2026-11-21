import { describe, expect, it } from 'vitest';
import {
  formatRoute,
  navReducer,
  parseRoute,
  type Route,
} from './route';

describe('Route Pure Functions & navReducer', () => {
  it('parses empty, root hash, and unknown hash as home tab fallback', () => {
    expect(parseRoute('')).toEqual({ area: 'member', tab: 'home' });
    expect(parseRoute('#')).toEqual({ area: 'member', tab: 'home' });
    expect(parseRoute('#/')).toEqual({ area: 'member', tab: 'home' });
    expect(parseRoute('#/unknown_route')).toEqual({ area: 'member', tab: 'home' });
    expect(parseRoute('#/studio')).toEqual({ area: 'member', tab: 'studio' });
  });

  it('parses v3 home tab and legacy #/today, #/calendar routes to home tab', () => {
    expect(parseRoute('#/home')).toEqual({ area: 'member', tab: 'home' });
    expect(parseRoute('#/today')).toEqual({ area: 'member', tab: 'home' });
    expect(parseRoute('#/calendar')).toEqual({ area: 'member', tab: 'home' });

    expect(parseRoute('#/calendar?m=2026-11&d=2026-11-24&sheet=1&sid=sch_99')).toEqual({
      area: 'member',
      tab: 'home',
      month: '2026-11',
      overlay: {
        kind: 'scheduleSheet',
        date: '2026-11-24',
        scheduleId: 'sch_99',
      },
    });

    expect(parseRoute('#/today?qr=1&sid=sch_today_qr')).toEqual({
      area: 'member',
      tab: 'home',
      overlay: {
        kind: 'qr',
        scheduleId: 'sch_today_qr',
      },
    });
  });

  it('parses admin and super admin routes', () => {
    expect(parseRoute('#/admin')).toEqual({ area: 'admin' });
    expect(parseRoute('#/super')).toEqual({ area: 'superAdmin' });
    expect(parseRoute('#/superadmin')).toEqual({ area: 'superAdmin' });
  });

  it('parses member tabs and query parameters', () => {
    expect(parseRoute('#/home')).toEqual({ area: 'member', tab: 'home' });
    expect(parseRoute('#/studio')).toEqual({ area: 'member', tab: 'studio' });
    expect(parseRoute('#/profile')).toEqual({ area: 'member', tab: 'profile' });

    expect(parseRoute('#/home?m=2026-11')).toEqual({
      area: 'member',
      tab: 'home',
      month: '2026-11',
    });

    expect(parseRoute('#/home?m=2026-11&d=2026-11-20&sheet=1&sid=sch_1')).toEqual({
      area: 'member',
      tab: 'home',
      month: '2026-11',
      overlay: {
        kind: 'scheduleSheet',
        date: '2026-11-20',
        scheduleId: 'sch_1',
      },
    });

    expect(parseRoute('#/home?qr=1&sid=sch_today')).toEqual({
      area: 'member',
      tab: 'home',
      overlay: {
        kind: 'qr',
        scheduleId: 'sch_today',
      },
    });

    expect(parseRoute('#/home?rsvp=1&sid=sch_vote')).toEqual({
      area: 'member',
      tab: 'home',
      overlay: {
        kind: 'rsvp',
        scheduleId: 'sch_vote',
      },
    });
  });

  it('ignores invalid dates and invalid month query formats', () => {
    // Invalid month
    expect(parseRoute('#/home?m=abc')).toEqual({ area: 'member', tab: 'home' });
    expect(parseRoute('#/home?m=2026-13')).toEqual({ area: 'member', tab: 'home' });

    // Invalid date for scheduleSheet
    expect(parseRoute('#/home?d=2026-13-40&sheet=1&sid=sch_1')).toEqual({
      area: 'member',
      tab: 'home',
    });
    expect(parseRoute('#/home?d=2026-02-30&sheet=1')).toEqual({
      area: 'member',
      tab: 'home',
    });
  });

  it('guarantees bidirectional roundtrip between parseRoute and formatRoute', () => {
    const testRoutes: Route[] = [
      { area: 'admin' },
      { area: 'superAdmin' },
      { area: 'member', tab: 'home' },
      { area: 'member', tab: 'studio' },
      { area: 'member', tab: 'profile' },
      { area: 'member', tab: 'home', month: '2026-11' },
      {
        area: 'member',
        tab: 'home',
        month: '2026-11',
        overlay: { kind: 'scheduleSheet', date: '2026-11-20', scheduleId: 'sch_1' },
      },
      {
        area: 'member',
        tab: 'home',
        overlay: { kind: 'qr', scheduleId: 'sch_qr' },
      },
      {
        area: 'member',
        tab: 'home',
        overlay: { kind: 'rsvp', scheduleId: 'sch_rsvp' },
      },
    ];

    for (const r of testRoutes) {
      const formatted = formatRoute(r);
      const parsed = parseRoute(formatted);
      expect(parsed).toEqual(r);
    }
  });

  it('reproduces spec navigation reducer transitions', () => {
    // 1) Starts at home
    let state: Route = { area: 'member', tab: 'home' };

    // 2) Move to studio tab: first navigation from home pushes history
    const toStudio = navReducer(state, { type: 'TAB', tab: 'studio' });
    expect(toStudio.history).toBe('push');
    expect(toStudio.route).toEqual({ area: 'member', tab: 'studio' });
    state = toStudio.route;

    // 3) Back to home with overlay -> pushes history
    const openSheet = navReducer(state, {
      type: 'OPEN',
      overlay: { kind: 'scheduleSheet', date: '2026-11-20', scheduleId: 'sch_1' },
    });
    expect(openSheet.history).toBe('push');
    expect(openSheet.route).toEqual({
      area: 'member',
      tab: 'studio',
      overlay: {
        kind: 'scheduleSheet',
        date: '2026-11-20',
        scheduleId: 'sch_1',
      },
    });
    state = openSheet.route;

    // 4) Close sheet action -> removes overlay with replace
    const closeSheet = navReducer(state, { type: 'CLOSE' });
    expect(closeSheet.history).toBe('replace');
    expect(closeSheet.route).toEqual({
      area: 'member',
      tab: 'studio',
    });
    state = closeSheet.route;

    // 5) Tab navigation between non-home tabs uses replace
    const toProfile = navReducer(state, { type: 'TAB', tab: 'profile' });
    expect(toProfile.history).toBe('replace');
    expect(toProfile.route).toEqual({ area: 'member', tab: 'profile' });

    // 6) Tab navigation back to home uses replace
    const backToHome = navReducer(toProfile.route, { type: 'TAB', tab: 'home' });
    expect(backToHome.history).toBe('replace');
    expect(backToHome.route).toEqual({ area: 'member', tab: 'home' });

    // 7) RESET action returns to #/home with replace
    const reset = navReducer({ area: 'admin' }, { type: 'RESET' });
    expect(reset.history).toBe('replace');
    expect(reset.route).toEqual({ area: 'member', tab: 'home' });
  });
});
