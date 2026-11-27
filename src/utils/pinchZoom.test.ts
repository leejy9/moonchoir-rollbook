import { describe, it, expect } from 'vitest';
import {
  calculateDistance,
  calculateCenter,
  clampScale,
} from './pinchZoom';

describe('pinchZoom utilities (J7)', () => {
  it('calculates euclidean distance and focal center between two points', () => {
    const p1 = { x: 0, y: 0 };
    const p2 = { x: 30, y: 40 };

    expect(calculateDistance(p1, p2)).toBe(50);
    expect(calculateCenter(p1, p2)).toEqual({ x: 15, y: 20 });
  });

  it('clamps upper scale limit to 3.0 (3배 초과 제한)', () => {
    expect(clampScale(4.5)).toBe(3.0);
  });

  it('clamps lower scale limit to 1.0 (1배 미만 제한)', () => {
    expect(clampScale(0.4)).toBe(1.0);
  });
});
