import { describe, expect, it } from 'vitest';
import {
  findActiveScheduleForMasterQR,
  generateMasterWallQRPayload,
  parseQRPayload,
  verifySchedulePin,
} from './qr';
import type { Schedule } from '../types/rollbook';

describe('QR and PIN utilities', () => {
  it('encodes and parses Master Wall QR payload', () => {
    const payload = generateMasterWallQRPayload('token_abc123');
    const parsed = parseQRPayload(payload);

    expect(parsed.type).toBe('MASTER_WALL_QR');
    expect(parsed.masterToken).toBe('token_abc123');
  });

  it('matches today schedule when scanning Master QR', () => {
    const schedules: Schedule[] = [
      {
        id: 'sch_today',
        title: '오늘 연습',
        date: '2026-10-16',
        startTime: '19:30',
        endTime: '21:30',
        locationName: '제1연습실',
        category: '정기연습',
      },
      {
        id: 'sch_next_week',
        title: '다음주 연습',
        date: '2026-10-23',
        startTime: '19:30',
        endTime: '21:30',
        locationName: '제1연습실',
        category: '정기연습',
      },
    ];

    const match = findActiveScheduleForMasterQR(schedules, new Date('2026-10-16T15:00:00'));
    expect(match?.id).toBe('sch_today');
  });

  it('accepts only the current choir-wide PIN, not stale schedule PINs or defaults', () => {
    const schedule: Schedule = {
      id: 'sch_pinned',
      title: '외부 연습',
      date: '2026-10-25',
      startTime: '14:00',
      endTime: '17:00',
      locationName: '예술의전당',
      category: '추가연습',
      checkInPin: '8899',
    };

    expect(verifySchedulePin(schedule, '5027', '5027')).toBe(true);
    expect(verifySchedulePin(schedule, '8899', '5027')).toBe(false);
    expect(verifySchedulePin(schedule, '1234')).toBe(false);
  });
});
