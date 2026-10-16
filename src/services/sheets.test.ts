import { beforeEach, describe, expect, it } from 'vitest';
import type { RawAttendanceLog, RSVPVote } from '../types/rollbook';
import { SheetsService, resetStorage } from './sheets';

describe('Sheets Adapter & Attendance Reconciliation', () => {
  let service: SheetsService;

  beforeEach(() => {
    resetStorage();
    service = new SheetsService();
  });

  it('correctly reconciles on-time attendance, late, excused absence, and unexcused absence', () => {
    const scheduleId = 'sch_20261015'; // 19:30 rehearsal, 10 min late grace
    const reconciled = service.reconcileAttendance(scheduleId);

    expect(reconciled.length).toBeGreaterThan(0);

    // 김하은: 19:22 check-in -> 출석
    const kim = reconciled.find((r) => r.memberName === '김하은');
    expect(kim?.finalStatus).toBe('출석');
    expect(kim?.authMethod).toBe('QR_WEB_CAM');

    // 윤도현: 19:42 check-in (19:30 + 10m grace exceeded) -> 지각
    const yoon = reconciled.find((r) => r.memberName === '윤도현');
    expect(yoon?.finalStatus).toBe('지각');

    // 박서연: 사전 불참 사유 작성("회사 야근") + 노로그 -> 사유결석
    const park = reconciled.find((r) => r.memberName === '박서연');
    expect(park?.finalStatus).toBe('사유결석');
    expect(park?.rsvpReason).toBe('회사 야근');

    // 장기하: MANUAL_BY_ADMIN -> 수동인정
    const jang = reconciled.find((r) => r.memberName === '장기하');
    expect(jang?.finalStatus).toBe('수동인정');
    expect(jang?.isManualOverride).toBe(true);

    // 미투표 + 노로그 인원 -> 결석
    const choi = reconciled.find((r) => r.memberName === '최지우');
    expect(choi?.finalStatus).toBe('결석');
  });

  it('guarantees append-only behavior for check-in logs', async () => {
    const initialLogsCount = service.getLogs().length;

    const newLog: RawAttendanceLog = {
      id: 'log_test_new',
      scheduleId: 'sch_20261015',
      timestamp: new Date().toISOString(),
      memberId: 'mem_a01',
      memberName: '정유나',
      part: '알토',
      authMethod: 'QR_WEB_CAM',
      isVerifiedLocation: true,
    };

    await service.addCheckInLog(newLog);

    const updatedLogs = service.getLogs();
    expect(updatedLogs.length).toBe(initialLogsCount + 1);
    expect(updatedLogs[updatedLogs.length - 1].id).toBe('log_test_new');
  });

  it('updates or creates RSVP vote without losing prior votes', async () => {
    const newVote: RSVPVote = {
      id: 'v_test_01',
      scheduleId: 'sch_20261022',
      memberId: 'mem_s01',
      memberName: '김하은',
      part: '소프라노',
      status: 'ATTEND',
      timestamp: new Date().toISOString(),
    };

    await service.submitRSVP(newVote);
    const votes = service.getRSVPVotes('sch_20261022');
    expect(votes.some((v) => v.memberId === 'mem_s01' && v.status === 'ATTEND')).toBe(true);
  });

  it('fetches remote data from Google Apps Script endpoint and populates storage', async () => {
    const originalFetch = globalThis.fetch;
    const mockApiResponse = {
      success: true,
      data: {
        members: [
          { id: 'm_remote_1', name: '원격대원', part: '테너', phoneLast4: '9999', role: 'MEMBER', createdAt: '2026-10-01', status: 'ACTIVE' }
        ],
        schedules: [
          { id: 'sch_remote_1', title: '원격일정', date: '2026-10-31', startTime: '19:00', endTime: '21:00', locationName: '원격홀', category: '연주' }
        ],
        rsvpVotes: [],
        recentLogs: [],
        config: { lateGraceMinutes: 15 }
      }
    };

    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => mockApiResponse,
    })) as unknown as typeof fetch;

    try {
      const result = await service.fetchRemoteData('https://script.google.com/macros/s/TEST/exec');
      expect(result.success).toBe(true);
      expect(result.count?.members).toBe(1);
      expect(service.getMembers()[0].name).toBe('원격대원');
      expect(service.getConfig().lateGraceMinutes).toBe(15);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('calculates cumulative attendance across multiple rehearsal sessions', () => {
    const { sessions, memberSummaries } = service.calculateCumulativeAttendance('2026-09-01', '2026-10-31');

    // Should include 8 schedules in the dataset
    expect(sessions.length).toBe(8);

    // 김하은: 9/17, 9/24, 10/01, 10/08, 10/15 모두 출석
    const kim = memberSummaries.find((m) => m.memberName === '김하은');
    expect(kim).toBeDefined();
    expect(kim?.attended).toBeGreaterThanOrEqual(5);
    expect(kim?.memberStatus).toBe('정단원');
    expect(kim?.joinedAt).toBe('2025-01-10');
  });

  it('updates member status and notes with backward compatibility', async () => {
    const updated = await service.updateMember('mem_s01', {
      memberStatus: '휴단원',
      note: '해외 연수로 일시 휴단',
    });

    expect(updated.memberStatus).toBe('휴단원');
    expect(updated.note).toBe('해외 연수로 일시 휴단');

    const freshMember = service.getMembers().find((m) => m.id === 'mem_s01');
    expect(freshMember?.memberStatus).toBe('휴단원');
  });

  it('dynamically adds and removes custom parts, member statuses, and categories', () => {
    // 1. Dynamic Parts
    expect(service.getParts()).toContain('소프라노');
    service.addPart('바리톤');
    expect(service.getParts()).toContain('바리톤');
    service.removePart('바리톤');
    expect(service.getParts()).not.toContain('바리톤');

    // 2. Dynamic Member Statuses
    expect(service.getMemberStatuses()).toContain('정단원');
    service.addMemberStatus('명예단원');
    expect(service.getMemberStatuses()).toContain('명예단원');
    service.removeMemberStatus('명예단원');
    expect(service.getMemberStatuses()).not.toContain('명예단원');

    // 3. Dynamic Categories
    expect(service.getCategories()).toContain('정기연습');
    service.addCategory('하계MT');
    expect(service.getCategories()).toContain('하계MT');
    service.removeCategory('하계MT');
    expect(service.getCategories()).not.toContain('하계MT');
  });

  it('manages GPS location presets (add, update, delete)', () => {
    const initialCount = service.getLocationPresets().length;
    const newPreset = {
      id: 'loc_test_new',
      name: '새로운 테스트 연습실',
      address: '서울시 강남구 테헤란로 1',
      detailAddress: '지하 1층 대연습실',
      entranceNote: '정문 좌측 계단',
      latitude: 37.5,
      longitude: 127.0,
      radiusMeters: 120,
      isDefault: false,
    };

    service.addLocationPreset(newPreset);
    expect(service.getLocationPresets().length).toBe(initialCount + 1);
    expect(service.getLocationPresets().some((l) => l.id === 'loc_test_new')).toBe(true);

    service.updateLocationPreset('loc_test_new', {
      name: '수정된 테스트 연습실',
      detailAddress: '2층 스튜디오',
      radiusMeters: 150,
    });
    const updated = service.getLocationPresets().find((l) => l.id === 'loc_test_new');
    expect(updated?.name).toBe('수정된 테스트 연습실');
    expect(updated?.detailAddress).toBe('2층 스튜디오');
    expect(updated?.radiusMeters).toBe(150);

    service.deleteLocationPreset('loc_test_new');
    expect(service.getLocationPresets().length).toBe(initialCount);
    expect(service.getLocationPresets().some((l) => l.id === 'loc_test_new')).toBe(false);
  });

  it('allows cancelling an RSVP vote returning member to unvoted state', async () => {
    const scheduleId = 'sch_20261015';
    const memberId = 'mem_test_cancel';

    await service.submitRSVP({
      id: 'vote_cancel_test',
      scheduleId,
      memberId,
      memberName: '테스트단원',
      part: '소프라노',
      status: 'ATTEND',
      timestamp: new Date().toISOString(),
    });

    const votesBefore = service.getRSVPVotes(scheduleId);
    expect(votesBefore.some((v) => v.memberId === memberId)).toBe(true);

    const cancelled = await service.cancelRSVP(scheduleId, memberId);
    expect(cancelled).toBe(true);

    const votesAfter = service.getRSVPVotes(scheduleId);
    expect(votesAfter.some((v) => v.memberId === memberId)).toBe(false);
  });
});


