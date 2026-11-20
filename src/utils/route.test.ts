import { describe, expect, it } from 'vitest';
import {
  formatRoute,
  navReducer,
  parseRoute,
  type Route,
} from './route';

describe('Route Pure Functions & navReducer', () => {
  it('parses empty, root hash, and unknown hash as today tab fallback', () => {
    expect(parseRoute('')).toEqual({ area: 'member', tab: 'today' });
    expect(parseRoute('#')).toEqual({ area: 'member', tab: 'today' });
    expect(parseRoute('#/')).toEqual({ area: 'member', tab: 'today' });
    expect(parseRoute('#/unknown_route')).toEqual({ area: 'member', tab: 'today' });
    expect(parseRoute('#/studio')).toEqual({ area: 'member', tab: 'studio' });
  });

  it('parses admin and super admin routes', () => {
    expect(parseRoute('#/admin')).toEqual({ area: 'admin' });
    expect(parseRoute('#/super')).toEqual({ area: 'superAdmin' });
    expect(parseRoute('#/superadmin')).toEqual({ area: 'superAdmin' });
  });

  it('parses member tabs and query parameters', () => {
    expect(parseRoute('#/today')).toEqual({ area: 'member', tab: 'today' });
    expect(parseRoute('#/studio')).toEqual({ area: 'member', tab: 'studio' });
    expect(parseRoute('#/profile')).toEqual({ area: 'member', tab: 'profile' });
    expect(parseRoute('#/calendar')).toEqual({ area: 'member', tab: 'calendar' });

    expect(parseRoute('#/calendar?m=2026-11')).toEqual({
      area: 'member',
      tab: 'calendar',
      month: '2026-11',
    });

    expect(parseRoute('#/calendar?m=2026-11&d=2026-11-20&sheet=1&sid=sch_1')).toEqual({
      area: 'member',
      tab: 'calendar',
      month: '2026-11',
      overlay: {
        kind: 'scheduleSheet',
        date: '2026-11-20',
        scheduleId: 'sch_1',
      },
    });

    expect(parseRoute('#/today?qr=1&sid=sch_today')).toEqual({
      area: 'member',
      tab: 'today',
      overlay: {
        kind: 'qr',
        scheduleId: 'sch_today',
      },
    });

    expect(parseRoute('#/today?rsvp=1&sid=sch_vote')).toEqual({
      area: 'member',
      tab: 'today',
      overlay: {
        kind: 'rsvp',
        scheduleId: 'sch_vote',
      },
    });
  });

  it('ignores invalid dates and invalid month query formats', () => {
    // Invalid month
    expect(parseRoute('#/calendar?m=abc')).toEqual({ area: 'member', tab: 'calendar' });
    expect(parseRoute('#/calendar?m=2026-13')).toEqual({ area: 'member', tab: 'calendar' });

    // Invalid date for scheduleSheet
    expect(parseRoute('#/calendar?d=2026-13-40&sheet=1&sid=sch_1')).toEqual({
      area: 'member',
      tab: 'calendar',
    });
    expect(parseRoute('#/calendar?d=2026-02-30&sheet=1')).toEqual({
      area: 'member',
      tab: 'calendar',
    });
  });

  it('guarantees bidirectional roundtrip between parseRoute and formatRoute', () => {
    const testRoutes: Route[] = [
      { area: 'admin' },
      { area: 'superAdmin' },
      { area: 'member', tab: 'today' },
      { area: 'member', tab: 'studio' },
      { area: 'member', tab: 'profile' },
      { area: 'member', tab: 'calendar' },
      { area: 'member', tab: 'calendar', month: '2026-11' },
      {
        area: 'member',
        tab: 'calendar',
        month: '2026-11',
        overlay: { kind: 'scheduleSheet', date: '2026-11-20', scheduleId: 'sch_1' },
      },
      {
        area: 'member',
        tab: 'today',
        overlay: { kind: 'qr', scheduleId: 'sch_qr' },
      },
      {
        area: 'member',
        tab: 'today',
        overlay: { kind: 'rsvp', scheduleId: 'sch_rsvp' },
      },
    ];

    for (const r of testRoutes) {
      const formatted = formatRoute(r);
      const parsed = parseRoute(formatted);
      expect(parsed).toEqual(r);
    }
  });

  it('reproduces spec §6-1 sequence 5 navigation reducer transitions', () => {
    // 1) Starts at today
    let state: Route = { area: 'member', tab: 'today' };

    // 2) Move to calendar tab: first navigation from today pushes history
    const toCal = navReducer(state, { type: 'TAB', tab: 'calendar' });
    expect(toCal.history).toBe('push');
    expect(toCal.route).toEqual({ area: 'member', tab: 'calendar' });
    state = toCal.route;

    // 3) Open scheduleSheet overlay -> pushes history
    const openSheet = navReducer(state, {
      type: 'OPEN',
      overlay: { kind: 'scheduleSheet', date: '2026-11-20', scheduleId: 'sch_1' },
    });
    expect(openSheet.history).toBe('push');
    expect(openSheet.route).toEqual({
      area: 'member',
      tab: 'calendar',
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
      tab: 'calendar',
    });
    state = closeSheet.route;

    // 5) Tab navigation between non-today tabs uses replace
    const toProfile = navReducer(state, { type: 'TAB', tab: 'profile' });
    expect(toProfile.history).toBe('replace');
    expect(toProfile.route).toEqual({ area: 'member', tab: 'profile' });

    // 6) Tab navigation back to today uses replace
    const backToToday = navReducer(toProfile.route, { type: 'TAB', tab: 'today' });
    expect(backToToday.history).toBe('replace');
    expect(backToToday.route).toEqual({ area: 'member', tab: 'today' });

    // 7) RESET action returns to #/today with replace
    const reset = navReducer({ area: 'admin' }, { type: 'RESET' });
    expect(reset.history).toBe('replace');
    expect(reset.route).toEqual({ area: 'member', tab: 'today' });
  });
});
