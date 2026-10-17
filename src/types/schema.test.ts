import { describe, it, expect } from 'vitest';
import type {
  Member,
  MemberStatusHistory,
  ProgramCard,
  Schedule,
  RawAttendanceLog,
  RSVPVote,
  LocationPreset,
} from './rollbook';

describe('Data Contract & Schema Integrity (DATA_SCHEMA.md Compliance)', () => {
  it('should enforce Member entity contract with statusHistory support', () => {
    const historyItem: MemberStatusHistory = {
      id: 'hist_1',
      memberId: 'm_test_1',
      status: '정단원',
      part: '테너',
      startDate: '2026-10-16',
      endDate: '2999-12-31',
      reason: '신규 입단 등록',
      createdAt: '2026-10-17T10:00:00Z',
    };

    const sampleMember: Member = {
      id: 'm_test_1',
      name: '홍길동',
      part: '테너',
      phone: '010-1234-5678',
      phoneLast4: '5678',
      role: 'MEMBER',
      createdAt: '2026-10-17T10:00:00Z',
      status: 'ACTIVE',
      joinedAt: '2026-10-16',
      memberStatus: '정단원',
      note: '신규 입단',
      statusHistory: [historyItem],
    };

    expect(sampleMember.id).toBeDefined();
    expect(sampleMember.phoneLast4).toHaveLength(4);
    expect(sampleMember.statusHistory).toHaveLength(1);
    expect(sampleMember.statusHistory![0].endDate).toBe('2999-12-31');
  });

  it('should enforce ProgramCard container contract', () => {
    const sampleCard: ProgramCard = {
      id: 'card_2026_fall',
      title: '2026 가을 정기연습',
      description: '가을 학기 정기연습 묶음',
      category: '정기연습',
      defaultLocationId: 'loc_1',
      defaultStartTime: '19:30',
      defaultEndTime: '22:00',
      isArchived: false,
      createdAt: '2026-10-17T10:00:00Z',
    };

    expect(sampleCard.id).toBe('card_2026_fall');
    expect(sampleCard.category).toBe('정기연습');
    expect(sampleCard.isArchived).toBe(false);
  });

  it('should enforce Schedule contract with programId relation', () => {
    const sampleSchedule: Schedule = {
      id: 'sched_1',
      title: '가을 정기연습',
      date: '2026-10-22',
      startTime: '19:30',
      endTime: '22:00',
      locationName: '제1연습실 (서초)',
      locationId: 'loc_1',
      category: '정기연습',
      programId: 'card_2026_fall',
      seriesId: 'series_2026_fall',
      checkInPin: '1234',
    };

    expect(sampleSchedule.programId).toBe('card_2026_fall');
    expect(sampleSchedule.title).not.toMatch(/1회차/); // Simple title without forced index
  });

  it('should enforce RawAttendanceLog append-only foreign key to Schedule', () => {
    const sampleLog: RawAttendanceLog = {
      id: 'log_1',
      timestamp: '2026-10-22T19:35:00Z',
      scheduleId: 'sched_1',
      memberId: 'm_test_1',
      memberName: '홍길동',
      part: '테너',
      authMethod: 'QR_WEB_CAM',
      isVerifiedLocation: true,
    };

    expect(sampleLog.scheduleId).toBe('sched_1');
    expect(sampleLog.memberId).toBe('m_test_1');
  });

  it('should enforce RSVPVote contract referencing Schedule and Member', () => {
    const sampleVote: RSVPVote = {
      id: 'vote_1',
      scheduleId: 'sched_1',
      memberId: 'm_test_1',
      memberName: '홍길동',
      part: '테너',
      status: 'ATTEND',
      reason: '정시 참석',
      timestamp: '2026-10-20T10:00:00Z',
    };

    expect(sampleVote.scheduleId).toBe('sched_1');
    expect(sampleVote.status).toBe('ATTEND');
  });

  it('should enforce LocationPreset contract with coordinates and radius', () => {
    const samplePreset: LocationPreset = {
      id: 'loc_1',
      name: '제1연습실 (서초)',
      address: '서울특별시 서초구 서초대로 123',
      detailAddress: '지하 1층',
      entranceNote: '건물 뒷편 주차장 입구',
      latitude: 37.4923,
      longitude: 127.0134,
      radiusMeters: 100,
      isDefault: true,
    };

    expect(samplePreset.radiusMeters).toBe(100);
    expect(samplePreset.isDefault).toBe(true);
  });
});
