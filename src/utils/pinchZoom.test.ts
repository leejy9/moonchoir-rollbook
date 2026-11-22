import { describe, it, expect } from 'vitest';
import {
  calculateDistance,
  calculateCenter,
  clampScale,
  clampTranslation,
  computePinchStep,
  clampCanvasResolution,
} from './pinchZoom';

describe('pinchZoom utilities (V3-16)', () => {
  it('calculates euclidean distance and focal center between two points', () => {
    const p1 = { x: 0, y: 0 };
    const p2 = { x: 30, y: 40 };

    expect(calculateDistance(p1, p2)).toBe(50);
    expect(calculateCenter(p1, p2)).toEqual({ x: 15, y: 20 });
  });

  it('scales by 2x when distance doubles (거리 2배 → 배율 2배)', () => {
    const res = computePinchStep({
      initialDistance: 100,
      currentDistance: 200,
      initialScale: 1.0,
      focalPoint: { x: 200, y: 300 },
      initialTranslate: { x: 0, y: 0 },
      container: { width: 400, height: 600 },
    });

    expect(res.scale).toBe(2.0);
  });

  it('clamps upper scale limit to 3.0 (3배 초과 제한)', () => {
    expect(clampScale(4.5)).toBe(3.0);

    const res = computePinchStep({
      initialDistance: 100,
      currentDistance: 500, // 5x
      initialScale: 1.0,
      focalPoint: { x: 200, y: 300 },
      initialTranslate: { x: 0, y: 0 },
      container: { width: 400, height: 600 },
    });

    expect(res.scale).toBe(3.0);
  });

  it('clamps lower scale limit to 1.0 (1배 미만 제한)', () => {
    expect(clampScale(0.4)).toBe(1.0);

    const res = computePinchStep({
      initialDistance: 200,
      currentDistance: 50, // 0.25x
      initialScale: 1.0,
      focalPoint: { x: 200, y: 300 },
      initialTranslate: { x: 0, y: 0 },
      container: { width: 400, height: 600 },
    });

    expect(res.scale).toBe(1.0);
  });

  it('preserves translation boundaries when zoomed (이동 경계 및 1배 원점)', () => {
    // 1x scale always centers at (0, 0)
    expect(clampTranslation(50, 50, 1.0, { width: 400, height: 600 })).toEqual({ x: 0, y: 0 });

    // 2x scale: max pan is ((2-1)*400)/2 = 200, ((2-1)*600)/2 = 300
    const clamped = clampTranslation(500, -600, 2.0, { width: 400, height: 600 });
    expect(clamped).toEqual({ x: 200, y: -300 });
  });

  it('clamps canvas resolution to prevent iOS Safari 16MP crash', () => {
    // 4000x3000 at 2x scale with 2x DPR = 8000 * 6000 = 48,000,000 pixels (> 16M)
    const res = clampCanvasResolution(4000, 3000, 2, 2, 16_000_000);
    const totalPixels = 4000 * res.scale * res.effectiveDpr * (3000 * res.scale * res.effectiveDpr);

    expect(totalPixels).toBeLessThanOrEqual(16_000_001);
    expect(res.effectiveDpr).toBeLessThan(2);
  });
});
