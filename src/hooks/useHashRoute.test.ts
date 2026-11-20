import { describe, expect, it } from 'vitest';
import { parseRoute } from '../utils/route';

describe('Hash Routing and History State Handling', () => {

  it('parses empty or root hash as today tab', () => {
    expect(parseRoute('')).toEqual({ area: 'member', tab: 'today' });
    expect(parseRoute('#/')).toEqual({ area: 'member', tab: 'today' });
    expect(parseRoute('#/today')).toEqual({ area: 'member', tab: 'today' });
  });

  it('parses calendar tab with month parameter', () => {
    expect(parseRoute('#/calendar?m=2026-11')).toEqual({
      area: 'member',
      tab: 'calendar',
      month: '2026-11',
    });
  });

  it('parses admin area routes', () => {
    expect(parseRoute('#/admin')).toEqual({ area: 'admin' });
    expect(parseRoute('#/super')).toEqual({ area: 'superAdmin' });
  });
});
