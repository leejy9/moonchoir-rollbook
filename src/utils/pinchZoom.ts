/**
 * Pure helper functions for pinch-to-zoom distance and ratio calculation.
 * Compliant with J7 & R20 (< 400 lines).
 */

export interface Point {
  x: number;
  y: number;
}

export const MIN_SCALE = 1.0;
export const MAX_SCALE = 3.0;

/**
 * Calculates euclidean distance between two touch points.
 */
export function calculateDistance(p1: Point, p2: Point): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

/**
 * Calculates focal center point between two touch points.
 */
export function calculateCenter(p1: Point, p2: Point): Point {
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
  };
}

/**
 * Clamps scale between minScale (default 1.0) and maxScale (default 3.0).
 */
export function clampScale(scale: number, min = MIN_SCALE, max = MAX_SCALE): number {
  if (scale < min) return min;
  if (scale > max) return max;
  return scale;
}
