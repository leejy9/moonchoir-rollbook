import { describe, it, expect } from 'vitest';
import type {
  Member,
  MemberStatusHistory,
  ProgramCard,
  Schedule,
  RawAttendanceLog,
  RSVPVote,
  LocationPreset,
  AppConfig,
  PracticePiece,
  PracticeTrack,
  PracticeProgramPiece,
  PracticeCatalog,
  TrackPlayback,
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

  it('should preserve backward compatibility for AppConfig without new optional keys', () => {
    const legacyConfig: AppConfig = {
      rehearsalDay: '목요일',
      startTime: '19:30',
      lateGraceMinutes: 10,
      defaultLat: 37.5665,
      defaultLon: 126.978,
      defaultRadius: 100,
      adminPin: '1234',
    };

    expect(legacyConfig.mediaPublicBaseUrl).toBeUndefined();
    expect(legacyConfig.practiceTrackKinds).toBeUndefined();
  });

  it('should accept AppConfig with mediaPublicBaseUrl and practiceTrackKinds', () => {
    const extendedConfig: AppConfig = {
      rehearsalDay: '목요일',
      startTime: '19:30',
      lateGraceMinutes: 10,
      defaultLat: 37.5665,
      defaultLon: 126.978,
      defaultRadius: 100,
      adminPin: '1234',
      mediaPublicBaseUrl: 'https://media.moonchoir.org',
      practiceTrackKinds: ['가이드', 'MR', '참고영상', '베이스 파트'],
    };

    expect(extendedConfig.mediaPublicBaseUrl).toBe('https://media.moonchoir.org');
    expect(extendedConfig.practiceTrackKinds).toHaveLength(4);
  });

  it('should enforce PracticePiece, PracticeTrack, and PracticeProgramPiece contracts', () => {
    const piece: PracticePiece = {
      id: 'piece_1',
      title: '아리랑',
      composer: '한국 민요',
      arranger: '김작곡',
      scoreUrl: 'https://drive.google.com/file/d/score123/view',
      notes: '세종문화회관 가을 연주회용',
      isArchived: false,
      createdAt: '2026-11-20T10:00:00Z',
      updatedAt: '2026-11-20T10:00:00Z',
    };

    const track: PracticeTrack = {
      id: 'track_1',
      pieceId: 'piece_1',
      label: '합창 MR',
      kind: 'MR',
      source: 'r2',
      storageKey: 'audio/arirang_mr.mp3',
      orderIndex: 0,
      isArchived: false,
      createdAt: '2026-11-20T10:00:00Z',
      updatedAt: '2026-11-20T10:00:00Z',
    };

    const programPiece: PracticeProgramPiece = {
      programId: 'card_2026_fall',
      pieceId: 'piece_1',
      orderIndex: 0,
      isArchived: false,
    };

    const catalog: PracticeCatalog = {
      pieces: [piece],
      tracks: [track],
      programPieces: [programPiece],
    };

    const playback: TrackPlayback = {
      mode: 'audio',
      src: 'https://media.moonchoir.org/audio/arirang_mr.mp3',
      canPrefetch: true,
      supportsBackground: true,
    };

    expect(catalog.pieces).toHaveLength(1);
    expect(catalog.tracks[0].kind).toBe('MR');
    expect(catalog.tracks[0].source).toBe('r2');
    expect(catalog.programPieces[0].programId).toBe('card_2026_fall');
    expect(playback.mode).toBe('audio');
  });
});

