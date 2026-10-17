import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RawAttendanceLog, RSVPVote } from '../types/rollbook';
import { SheetsService, resetStorage } from './sheets';

describe('Sheets Adapter & Attendance Reconciliation', () => {
  let service: SheetsService;

  beforeEach(() => {
    resetStorage();
    service = new SheetsService();
    service.updateConfig({ sheetsWebAppUrl: '' });
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

    // 미투표 + 노로그 정규 단원 (조현아) -> 결석
    const jo = reconciled.find((r) => r.memberName === '조현아');
    expect(jo?.finalStatus).toBe('결석');

    // 휴단원/비대상자 (최지우) -> 미참
    const choi = reconciled.find((r) => r.memberName === '최지우');
    expect(choi?.finalStatus).toBe('미참');
  });

  it('supports admin manual absent override and clearAttendanceLog', async () => {
    // 1. 관리자가 수동으로 출석 인정
    await service.addCheckInLog({
      id: 'log_manual_override',
      scheduleId: 'sch_20261022',
      memberId: 'mem_s01',
      memberName: '김하은',
      part: '소프라노',
      timestamp: '2026-10-22T19:30:00',
      authMethod: 'MANUAL_BY_ADMIN',
      adminNote: '수동 인정',
      isVerifiedLocation: true,
    });

    let rec = service.reconcileAttendance('sch_20261022').find((r) => r.memberName === '김하은');
    expect(rec?.finalStatus).toBe('수동인정');

    // 2. 관리자가 결석으로 변경 (오버라이드)
    await service.addCheckInLog({
      id: 'log_absent_override',
      scheduleId: 'sch_20261022',
      memberId: 'mem_s01',
      memberName: '김하은',
      part: '소프라노',
      timestamp: '2026-10-22T19:35:00',
      authMethod: 'MANUAL_BY_ADMIN',
      adminNote: '관리자 결석 처리',
      isVerifiedLocation: true,
    });

    rec = service.reconcileAttendance('sch_20261022').find((r) => r.memberName === '김하은');
    expect(rec?.finalStatus).toBe('결석');

    // 3. 보정 초기화
    await service.clearAttendanceLog('sch_20261022', 'mem_s01');
    rec = service.reconcileAttendance('sch_20261022').find((r) => r.memberName === '김하은');
    expect(rec?.finalStatus).toBe('결석'); // 의무 대상자이므로 기본 결석으로 복귀
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

  it('supports batch deleting and batch updating multiple schedules', async () => {
    await service.addSchedule({
      id: 'sch_batch_1',
      title: '일괄테스트 1',
      date: '2026-11-01',
      startTime: '19:00',
      endTime: '21:00',
      locationName: '합창실 A',
      category: '정기연습',
    });
    await service.addSchedule({
      id: 'sch_batch_2',
      title: '일괄테스트 2',
      date: '2026-11-08',
      startTime: '19:00',
      endTime: '21:00',
      locationName: '합창실 A',
      category: '정기연습',
    });

    expect(service.getSchedules().some((s) => s.id === 'sch_batch_1')).toBe(true);
    expect(service.getSchedules().some((s) => s.id === 'sch_batch_2')).toBe(true);

    // Batch update
    await service.batchUpdateSchedules(['sch_batch_1', 'sch_batch_2'], {
      locationName: '새 연습실 B',
      startTime: '20:00',
    });

    const updated1 = service.getSchedules().find((s) => s.id === 'sch_batch_1');
    const updated2 = service.getSchedules().find((s) => s.id === 'sch_batch_2');
    expect(updated1?.locationName).toBe('새 연습실 B');
    expect(updated1?.startTime).toBe('20:00');
    expect(updated2?.locationName).toBe('새 연습실 B');
    expect(updated2?.startTime).toBe('20:00');

    // Batch delete
    await service.deleteSchedules(['sch_batch_1', 'sch_batch_2']);
    expect(service.getSchedules().some((s) => s.id === 'sch_batch_1')).toBe(false);
    expect(service.getSchedules().some((s) => s.id === 'sch_batch_2')).toBe(false);
  });

  it('enforces 1-person 1-device lock and prevents unauthorized multi-device binding', async () => {
    const memberId = 'mem_s01'; // 김하은
    const device1 = 'device_uuid_phone_1';
    const device2 = 'device_uuid_phone_2';

    // 1st device binding succeeds
    const bound = await service.bindMemberDevice(memberId, device1);
    expect(bound.boundDeviceId).toBe(device1);
    expect(bound.boundDeviceAt).toBeTruthy();

    // Same device re-binding succeeds
    const reBound = await service.bindMemberDevice(memberId, device1);
    expect(reBound.boundDeviceId).toBe(device1);

    // 2nd different device binding MUST be rejected
    await expect(service.bindMemberDevice(memberId, device2)).rejects.toThrow(
      '이미 다른 기기(스마트폰)에 연동되어 있는 계정입니다'
    );

    // Unbinding allows device 2 to bind
    await service.unbindMemberDevice(memberId);
    const unBoundMember = service.getMembers().find((m) => m.id === memberId);
    expect(unBoundMember?.boundDeviceId).toBeUndefined();

    const device2Bound = await service.bindMemberDevice(memberId, device2);
    expect(device2Bound.boundDeviceId).toBe(device2);
  });

  it('guarantees 1-person 1-vote for RSVP without duplicating records', async () => {
    const scheduleId = 'sch_20261015';
    const memberId = 'mem_s01';

    const vote1: RSVPVote = {
      id: 'vote_1',
      scheduleId,
      memberId,
      memberName: '김하은',
      part: '소프라노',
      status: 'ATTEND',
      timestamp: new Date().toISOString(),
    };

    await service.submitRSVP(vote1);
    const votesAfter1 = service.getRSVPVotes().filter(
      (v) => v.scheduleId === scheduleId && v.memberId === memberId
    );
    expect(votesAfter1.length).toBe(1);
    expect(votesAfter1[0].status).toBe('ATTEND');

    // Change mind -> ABSENT
    const vote2: RSVPVote = {
      id: 'vote_2',
      scheduleId,
      memberId,
      memberName: '김하은',
      part: '소프라노',
      status: 'ABSENT',
      reason: '갑작스러운 야근',
      timestamp: new Date().toISOString(),
    };

    await service.submitRSVP(vote2);
    const votesAfter2 = service.getRSVPVotes().filter(
      (v) => v.scheduleId === scheduleId && v.memberId === memberId
    );
    expect(votesAfter2.length).toBe(1); // STILL exactly 1 vote! No duplicate rows!
    expect(votesAfter2[0].status).toBe('ABSENT');
    expect(votesAfter2[0].reason).toBe('갑작스러운 야근');
  });

  it('rescues orphan schedule logs matching by scheduleId prefix or date', async () => {
    // Add a schedule with randomized suffix
    const schedule = await service.addSchedule({
      id: 'sch_20261112_rand',
      title: '11월 특별연습',
      date: '2026-11-12',
      startTime: '19:30',
      endTime: '21:30',
      locationName: '제1연습실',
      category: '정기연습',
      checkInPin: '1112',
    });

    // Add log with base scheduleId (sch_20261112)
    await service.addCheckInLog({
      id: 'log_orphan_test',
      scheduleId: 'sch_20261112',
      timestamp: '2026-11-12T19:25:00',
      memberId: 'mem_s01',
      memberName: '김하은',
      part: '소프라노',
      authMethod: 'QR_WEB_CAM',
      isVerifiedLocation: true,
    });

    // getLogs for the suffixed schedule should rescue and return this log
    const logs = service.getLogs('sch_20261112_rand');
    expect(logs.length).toBe(1);
    expect(logs[0].id).toBe('log_orphan_test');

    // reconcileAttendance should also accurately reflect this attendance
    const rec = service.reconcileMemberAttendance('mem_s01', schedule.id);
    expect(rec?.finalStatus).toBe('출석');
    expect(rec?.authMethod).toBe('QR_WEB_CAM');
  });

  it('canonicalizes fragmented member IDs across rsvpVotes and logs by matching memberName', async () => {
    const originalFetch = globalThis.fetch;
    const mockApiResponse = {
      success: true,
      data: {
        members: [
          { id: 'mem_primary_100', name: '이재연', part: '테너', phoneLast4: '4240', role: 'MEMBER', createdAt: '2026-10-01', status: 'ACTIVE' }
        ],
        schedules: [
          { id: 'sch_test_canon', title: '테스트일정', date: '2026-11-20', startTime: '19:30', endTime: '21:30', locationName: '연습실', category: '정기연습' }
        ],
        // RSVP with an old/fragmented ID 'mem_old_999' but same name '이재연'
        rsvpVotes: [
          { id: 'v_old_1', scheduleId: 'sch_test_canon', memberId: 'mem_old_999', memberName: '이재연', part: '테너', status: 'ATTEND', timestamp: '2026-10-17T03:00:00Z' }
        ],
        // Log with another fragmented ID 'mem_old_888' but same name '이재연'
        recentLogs: [
          { id: 'l_old_1', scheduleId: 'sch_test_canon', memberId: 'mem_old_888', memberName: '이재연', part: '테너', timestamp: '2026-11-20T19:20:00', authMethod: 'QR_WEB_CAM', isVerifiedLocation: true }
        ],
        config: {}
      }
    };

    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => mockApiResponse,
    })) as unknown as typeof fetch;

    try {
      await service.fetchRemoteData('https://script.google.com/macros/s/TEST/exec');

      // The RSVP should now be associated with the primary member ID 'mem_primary_100'
      const votes = service.getRSVPVotes('sch_test_canon');
      expect(votes.length).toBe(1);
      expect(votes[0].memberId).toBe('mem_primary_100');

      // The log should also be associated with 'mem_primary_100'
      const logs = service.getLogs('sch_test_canon');
      expect(logs.length).toBe(1);
      expect(logs[0].memberId).toBe('mem_primary_100');

      // Reconciliation should succeed seamlessly
      const rec = service.reconcileMemberAttendance('mem_primary_100', 'sch_test_canon');
      expect(rec?.finalStatus).toBe('출석');
      expect(rec?.rsvpStatus).toBe('ATTEND');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('detects duplicate member groups and performs safe consolidation without log deletion', async () => {
    // 1. Add duplicate member with same name and phone
    const memberA = await service.addMember({
      id: 'mem_jaeyeon_old',
      name: '이재연',
      part: '베이스',
      phoneLast4: '4240',
      phone: '010-1234-4240',
      role: 'MEMBER',
      createdAt: '2026-09-01T00:00:00Z',
      status: 'ACTIVE',
      joinedAt: '2026-09-01',
      memberStatus: '정단원',
    });

    const memberB = await service.addMember({
      id: 'mem_jaeyeon_new',
      name: '이재연',
      part: '베이스',
      phoneLast4: '4240',
      phone: '010-1234-4240',
      role: 'MEMBER',
      createdAt: '2026-10-15T00:00:00Z',
      status: 'ACTIVE',
      joinedAt: '2026-10-15',
      memberStatus: '정단원',
      boundDeviceId: 'device_uuid_9999',
    });

    // Add a schedule and logs for each ID
    await service.addSchedule({
      id: 'sch_sept_01',
      title: '9월 1차 연습',
      date: '2026-09-05',
      startTime: '19:30',
      endTime: '21:30',
      locationName: '문콰이어 연습실',
      category: '정기연습',
    });

    await service.addSchedule({
      id: 'sch_oct_01',
      title: '10월 1차 연습',
      date: '2026-10-16',
      startTime: '19:30',
      endTime: '21:30',
      locationName: '문콰이어 연습실',
      category: '정기연습',
    });

    // Log under ID A
    await service.addCheckInLog({
      id: 'log_a_1',
      scheduleId: 'sch_sept_01',
      timestamp: '2026-09-05T19:20:00',
      memberId: memberA.id,
      memberName: memberA.name,
      part: memberA.part,
      authMethod: 'QR_WEB_CAM',
      isVerifiedLocation: true,
    });

    // Log and RSVP under ID B
    await service.addCheckInLog({
      id: 'log_b_1',
      scheduleId: 'sch_oct_01',
      timestamp: '2026-10-16T19:25:00',
      memberId: memberB.id,
      memberName: memberB.name,
      part: memberB.part,
      authMethod: 'MANUAL_BY_ADMIN',
      isVerifiedLocation: false,
    });

    await service.submitRSVP({
      id: 'rsvp_b_1',
      scheduleId: 'sch_oct_01',
      memberId: memberB.id,
      memberName: memberB.name,
      part: memberB.part,
      status: 'ATTEND',
      timestamp: '2026-10-15T10:00:00',
    });

    // 2. Duplicate detection
    const duplicateGroups = service.findDuplicateMemberGroups();
    const jaeyeonGroup = duplicateGroups.find((g) => g.name === '이재연' && g.phoneLast4 === '4240');
    expect(jaeyeonGroup).toBeDefined();
    expect(jaeyeonGroup?.members.length).toBe(2);

    // 3. Merge duplicate member B into canonical member A
    const result = await service.mergeDuplicateMembers(memberA.id, memberB.id);
    expect(result.affectedLogsCount).toBe(1);
    expect(result.affectedRsvpCount).toBe(1);

    // Active members should no longer show memberB
    const activeMembers = service.getMembers(false);
    expect(activeMembers.some((m) => m.id === memberB.id)).toBe(false);
    expect(activeMembers.some((m) => m.id === memberA.id)).toBe(true);

    // Full members list with includeMerged=true should show memberB as MERGED
    const allMembers = service.getMembers(true);
    const mergedB = allMembers.find((m) => m.id === memberB.id);
    expect(mergedB?.status).toBe('MERGED');
    expect(mergedB?.mergedIntoId).toBe(memberA.id);

    // Canonical member A inherited device binding from B
    const updatedA = allMembers.find((m) => m.id === memberA.id);
    expect(updatedA?.boundDeviceId).toBe('device_uuid_9999');

    // Attendance logs for sch_oct_01 now reference canonical ID
    const octLogs = service.getLogs('sch_oct_01');
    expect(octLogs[0].memberId).toBe(memberA.id);
    expect(octLogs[0].adminNote).toContain(`[ID통합: ${memberB.id} -> ${memberA.id}]`);

    // Projection view reflects both attendances under memberA
    const recSept = service.reconcileAttendance('sch_sept_01').find((r) => r.memberId === memberA.id);
    expect(recSept?.finalStatus).toBe('출석');

    const recOct = service.reconcileAttendance('sch_oct_01').find((r) => r.memberId === memberA.id);
    expect(recOct?.finalStatus).toBe('수동인정');
  });

  it('prioritizes dynamic preset coordinates and radius over outdated schedule snapshots', async () => {
    // 1. Add preset
    const presetId = 'loc_incheon_practice';
    await service.addLocationPreset({
      id: presetId,
      name: '인천 연수구 연습실',
      address: '인천 연수구 한나루로 158번길 31',
      latitude: 37.4258,
      longitude: 126.6655,
      radiusMeters: 50,
      isDefault: false,
    });

    // 2. Add schedule with outdated/different snapshot coords (e.g. initial Myeongdong coords)
    const testSch: import('../types/rollbook').Schedule = {
      id: 'sch_relational_test',
      title: '인천 연수구 추가 연습',
      date: '2026-10-25',
      startTime: '19:30',
      endTime: '21:30',
      locationName: '인천 연수구 연습실',
      locationId: presetId,
      targetLat: 37.5665, // Outdated Myeongdong
      targetLon: 126.9780,
      radiusMeters: 100,
      category: '추가연습',
    };
    await service.addSchedule(testSch);

    // 3. Resolve location: Must prioritize preset coords (37.4258, 126.6655, 50m)
    const resolved = service.resolveScheduleLocation(testSch);
    expect(resolved.targetLat).toBe(37.4258);
    expect(resolved.targetLon).toBe(126.6655);
    expect(resolved.radiusMeters).toBe(50);

    // 4. Update preset radius to 200m -> immediately cascades to schedule resolution
    await service.updateLocationPreset(presetId, { radiusMeters: 200 });
    const resolvedAfterUpdate = service.resolveScheduleLocation(testSch);
    expect(resolvedAfterUpdate.radiusMeters).toBe(200);
  });

  it('handles universal activeOnSitePin retrieval and regeneration', () => {
    const pin1 = service.getActiveOnSitePin();
    expect(pin1).toBeDefined();
    expect(pin1.length).toBe(4);

    const pin2 = service.refreshActiveOnSitePin();
    expect(pin2).toBeDefined();
    expect(pin2.length).toBe(4);
    expect(service.getActiveOnSitePin()).toBe(pin2);
  });

  it('purges ghost rsvpVotes and attendance logs when members are removed or not present in members list', async () => {
    // Inject a ghost vote for a member who does not exist in service.members
    const scheduleId = 'sch_20261022';
    const ghostVote: RSVPVote = {
      id: 'v_ghost_test',
      scheduleId,
      memberId: 'mem_ghost_9999',
      memberName: '유령단원',
      part: '소프라노',
      status: 'ATTEND',
      timestamp: new Date().toISOString(),
    };

    // Before registering in members, getRSVPVotes must exclude ghost
    // Note: getRSVPVotes uses an inner join with this.members
    const votesBefore = service.getRSVPVotes(scheduleId);
    expect(votesBefore.some((v) => v.memberName === '유령단원')).toBe(false);

    // After member is properly registered via addMember, vote becomes visible
    await service.addMember({
      id: 'mem_ghost_9999',
      name: '유령단원',
      part: '소프라노',
      phoneLast4: '1234',
      role: 'MEMBER',
      createdAt: '2026-10-01',
      status: 'ACTIVE',
      joinedAt: '2026-10-01',
      memberStatus: '정단원',
      note: '',
    });
    // Add vote explicitly now
    (service as unknown as { rsvpVotes: RSVPVote[] }).rsvpVotes.push(ghostVote);
    const votesAfter = service.getRSVPVotes(scheduleId);
    expect(votesAfter.some((v) => v.memberName === '유령단원')).toBe(true);
  });

  it('supports dynamic state projection when member transitions from 정단원 to 휴단원 and back to 정단원', async () => {
    const memberId = 'mem_transition_test';
    const scheduleId = 'sch_20261029';

    // 1. Register active member as 정단원
    await service.addMember({
      id: memberId,
      name: '상태변화단원',
      part: '테너',
      phoneLast4: '5678',
      role: 'MEMBER',
      createdAt: '2026-01-01',
      status: 'ACTIVE',
      joinedAt: '2026-01-01',
      memberStatus: '정단원',
      note: '',
    });

    const sch: import('../types/rollbook').Schedule = {
      id: scheduleId,
      title: '미래 정기연습',
      date: '2026-10-29',
      startTime: '19:30',
      endTime: '21:30',
      locationName: '문콰이어 연습실',
      category: '정기연습',
      targetAudienceType: 'ALL',
    };
    await service.addSchedule(sch);

    // Member submits ATTEND vote
    await service.submitRSVP({
      id: 'vote_trans_1',
      scheduleId,
      memberId,
      memberName: '상태변화단원',
      part: '테너',
      status: 'ATTEND',
      timestamp: new Date().toISOString(),
    });

    // As 정단원: isMemberRequiredForSchedule should be true
    const member1 = service.getMembers().find((m) => m.id === memberId)!;
    const { isMemberRequiredForSchedule } = await import('../utils/attendanceStats');
    expect(isMemberRequiredForSchedule(member1, sch.date, sch)).toBe(true);

    // 2. Admin changes status to '휴단원'
    await service.updateMember(memberId, { memberStatus: '휴단원' });
    const member2 = service.getMembers().find((m) => m.id === memberId)!;
    expect(isMemberRequiredForSchedule(member2, sch.date, sch)).toBe(false);

    // Vote is still preserved in append-only storage
    const votes = service.getRSVPVotes(scheduleId);
    expect(votes.some((v) => v.memberId === memberId && v.status === 'ATTEND')).toBe(true);

    // 3. Admin switches member back to '정단원' (복단)
    await service.updateMember(memberId, { memberStatus: '정단원' });
    const member3 = service.getMembers().find((m) => m.id === memberId)!;
    expect(isMemberRequiredForSchedule(member3, sch.date, sch)).toBe(true);
  });

  it('원격 시트에 phone 정보가 빈 문자열이어도 기존 로컬 연락처를 유실하지 않고 fallback 보존한다', async () => {
    service.updateConfig({ sheetsWebAppUrl: 'https://script.google.com/test' });
    const testMemberId = 'mem_preserve_phone';

    await service.addMember({
      id: testMemberId,
      name: '이재연',
      part: '베이스',
      phone: '010-1234-5678',
      phoneLast4: '5678',
      role: 'MEMBER',
      createdAt: '2026-01-01 00:00:00',
      status: 'ACTIVE',
      joinedAt: '2026-01-01',
      memberStatus: '정단원',
      note: '',
    });

    // Mock remote returning empty phone string for this member
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              members: [
                {
                  id: testMemberId,
                  name: '이재연',
                  part: '베이스',
                  phone: '', // empty in remote sheet!
                  phoneLast4: '5678',
                  role: 'MEMBER',
                  status: 'ACTIVE',
                  joinedAt: '2026-01-01',
                  memberStatus: '정단원',
                },
              ],
              schedules: [],
              rsvpVotes: [],
              logs: [],
              locations: [],
              memberHistory: [],
              programCards: [],
            },
          }),
      } as Response)
    );

    await service.fetchRemoteData();

    const preserved = service.getMembers().find((m) => m.id === testMemberId);
    expect(preserved).toBeDefined();
    expect(preserved?.phone).toBe('010-1234-5678');
    expect(preserved?.phoneLast4).toBe('5678');
  });

  it('출석 로그와 사전투표의 기본 타임스탬프가 한국 표준시(KST: YYYY-MM-DD HH:mm:ss) 형식으로 기록된다', async () => {
    const { getKSTTimestampString } = await import('../utils/date');
    const kstNow = getKSTTimestampString();

    const log = await service.addCheckInLog({
      id: 'log_kst_test',
      timestamp: kstNow,
      scheduleId: 'sch_test',
      memberId: 'mem_test',
      memberName: '단원',
      part: '소프라노',
      authMethod: 'QR_WEB_CAM',
      isVerifiedLocation: true,
    });

    expect(log.timestamp).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(log.timestamp.includes('T')).toBe(false);
    expect(log.timestamp.endsWith('Z')).toBe(false);
  });
});



