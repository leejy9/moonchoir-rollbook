import { describe, it, expect } from 'vitest';
import { computeContentRange } from './index.js';

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
