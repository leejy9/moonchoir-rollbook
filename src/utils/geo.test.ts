import { describe, it, expect } from 'vitest';
import { calculateDistanceMeters, isWithinRadius } from './geo';

describe('Geolocation Haversine Utility', () => {
  it('calculates 0 meters for identical coordinates', () => {
    expect(calculateDistanceMeters(37.5665, 126.9780, 37.5665, 126.9780)).toBe(0);
  });

  it('determines if user is within radius', () => {
    // 100m radius check
    expect(isWithinRadius(37.5665, 126.9780, 37.5665, 126.9780, 100)).toBe(true);
    // Far away location (Seoul vs Busan)
    expect(isWithinRadius(37.5665, 126.9780, 35.1796, 129.0756, 100)).toBe(false);
  });
});
