/**
 * Pure helper functions for pinch-to-zoom calculation and boundary clamping.
 * Used by ScoreViewer without external libraries.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export const MIN_SCALE = 1.0;
export const MAX_SCALE = 3.0;
export const MAX_CANVAS_PIXELS = 16_000_000; // 16M pixels safe boundary for Safari/iOS

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

/**
 * Clamps pan translation so content doesn't drift infinitely outside viewport.
 */
export function clampTranslation(
  translateX: number,
  translateY: number,
  scale: number,
  container: Size
): Point {
  if (scale <= 1.0) {
    return { x: 0, y: 0 };
  }

  // Maximum allowed pan based on scaled content dimensions
  const maxPanX = ((scale - 1) * container.width) / 2;
  const maxPanY = ((scale - 1) * container.height) / 2;

  const clampedX = Math.min(Math.max(translateX, -maxPanX), maxPanX);
  const clampedY = Math.min(Math.max(translateY, -maxPanY), maxPanY);

  return { x: clampedX, y: clampedY };
}

/**
 * Computes updated transform when a pinch gesture occurs around a focal point.
 */
export function computePinchStep(params: {
  initialDistance: number;
  currentDistance: number;
  initialScale: number;
  focalPoint: Point;
  initialTranslate: Point;
  container: Size;
}): { scale: number; translateX: number; translateY: number } {
  const {
    initialDistance,
    currentDistance,
    initialScale,
    focalPoint,
    initialTranslate,
    container,
  } = params;

  if (initialDistance <= 0) {
    return { scale: initialScale, translateX: initialTranslate.x, translateY: initialTranslate.y };
  }

  const rawScale = initialScale * (currentDistance / initialDistance);
  const scale = clampScale(rawScale);

  // Scale relative to focal point
  const scaleRatio = scale / (initialScale || 1.0);
  const rawX = focalPoint.x - (focalPoint.x - initialTranslate.x) * scaleRatio;
  const rawY = focalPoint.y - (focalPoint.y - initialTranslate.y) * scaleRatio;

  const clamped = clampTranslation(rawX, rawY, scale, container);

  return {
    scale,
    translateX: clamped.x,
    translateY: clamped.y,
  };
}

/**
 * Ensures canvas pixel buffer (width * height * dpr^2) does not exceed iOS Safari 16MP limit.
 */
export function clampCanvasResolution(
  width: number,
  height: number,
  scale: number,
  devicePixelRatio = 1,
  maxPixels = MAX_CANVAS_PIXELS
): { scale: number; effectiveDpr: number } {
  const rawPixels = width * scale * devicePixelRatio * (height * scale * devicePixelRatio);
  if (rawPixels <= maxPixels || rawPixels <= 0) {
    return { scale, effectiveDpr: devicePixelRatio };
  }

  const factor = Math.sqrt(maxPixels / rawPixels);
  let effectiveDpr = devicePixelRatio * factor;
  let effectiveScale = scale;

  if (effectiveDpr < 1) {
    effectiveScale = scale * effectiveDpr;
    effectiveDpr = 1;
  }

  return { scale: effectiveScale, effectiveDpr };
}
