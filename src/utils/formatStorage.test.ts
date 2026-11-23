import { describe, expect, it } from 'vitest';
import { formatStorageUsage } from './formatStorage';

describe('formatStorageUsage (L1)', () => {
  it('formats 0 bytes as 0MB', () => {
    expect(formatStorageUsage(0)).toBe('0MB');
  });

  it('formats bytes below 0.1MB (> 0) as 0.1MB ceiling', () => {
    expect(formatStorageUsage(50_000)).toBe('0.1MB');
  });

  it('formats bytes under 1GB as MB with 1 decimal place', () => {
    expect(formatStorageUsage(10_905_190)).toBe('10.4MB');
  });

  it('formats 1GB as 1.00GB with 2 decimal places', () => {
    expect(formatStorageUsage(1_073_741_824)).toBe('1.00GB');
  });

  it('formats fractional GB as GB with 2 decimal places', () => {
    expect(formatStorageUsage(1_342_177_280)).toBe('1.25GB');
  });

  it('handles negative or invalid numbers safely as 0MB', () => {
    expect(formatStorageUsage(-100)).toBe('0MB');
    expect(formatStorageUsage(NaN)).toBe('0MB');
  });
});
