import { describe, expect, it } from 'vitest';
import {
  computePassionTemperature,
  PASSION_RULES,
} from './passionTemperature';
import type { Member, RawAttendanceLog, RsvpEvent, Schedule } from '../types/rollbook';

const mockMember: Member = {
  id: 'mem_1',
  name: '김단원',
  part: 'SOPRANO',
  role: 'MEMBER',
  status: 'ACTIVE',
  phoneLast4: '1234',
  createdAt: '2026-01-01T00:00:00Z',
  memberStatus: '정단원',
};

const makeSchedule = (
  id: string,
  date: string,
  startTime = '19:30',
  category = '정기연습'
): Schedule => ({
  id,
  date,
  startTime,
  endTime: '21:30',
  category,
  isCancelled: false,
  title: '연습',
  locationName: '연습실',
});

const makeLog = (id: string, schedId: string, timestamp: string): RawAttendanceLog => ({
  id,
  memberId: 'mem_1',
  memberName: '김단원',
  part: 'SOPRANO',
  scheduleId: schedId,
  timestamp,
  authMethod: 'MANUAL_BY_ADMIN',
  isVerifiedLocation: true,
});

const makeRsvp = (
  seq: number,
  schedId: string,
  status: string,
  occurredAt: string,
  action: RsvpEvent['action'] = 'insert',
  prevStatus: string | null = null
): RsvpEvent => ({
  seq,
  scheduleId: schedId,
  memberId: 'mem_1',
  action,
  status,
  prevStatus,
  occurredAt,
});

describe('computePassionTemperature (V3-12)', () => {
  it('빈 기록: 아무 일정도 없으면 36.5°C를 반환하고 약속/공연 묶음이 없다', () => {
    const res = computePassionTemperature(
      mockMember,
      [mockMember],
      [],
      [],
      [],
      {},
      new Date('2026-11-23T12:00:00+09:00')
    );

    expect(res.value).toBe(36.5);
    expect(res.windowSize).toBe(0);
    expect(res.groups).toHaveLength(1);
    expect(res.groups[0].key).toBe('attendance');
    // Late count is 0 but always present in attendance items
    expect(res.groups[0].items).toHaveLength(1);
    expect(res.groups[0].items[0].key).toBe('late');
    expect(res.groups[0].items[0].count).toBe(0);
  });

  it('backfill 이벤트 무시: 백필 투표 이벤트는 점수와 약속 계산에서 제외된다', () => {
    const sched = makeSchedule('s1', '2026-11-20', '19:30');
    // Only a backfill event exists
    const backfillEvent = makeRsvp(
      1,
      's1',
      'ATTEND',
      '2026-11-19T10:00:00+09:00',
      'backfill'
    );
    const log = makeLog('l1', 's1', '2026-11-20 19:25:00');

    const res = computePassionTemperature(
      mockMember,
      [mockMember],
      [sched],
      [log],
      [backfillEvent],
      {},
      new Date('2026-11-23T12:00:00+09:00')
    );

    // Promise group should be omitted because there are no non-backfill events
    const promiseGroup = res.groups.find((g) => g.key === 'promise');
    expect(promiseGroup).toBeUndefined();
  });

  it('약속 대상 0개면 약속 묶음 숨김: 투표 이벤트가 없는 경우', () => {
    const sched = makeSchedule('s1', '2026-11-20', '19:30');
    const log = makeLog('l1', 's1', '2026-11-20 19:20:00');

    const res = computePassionTemperature(
      mockMember,
      [mockMember],
      [sched],
      [log],
      [],
      {},
      new Date('2026-11-23T12:00:00+09:00')
    );

    expect(res.groups.some((g) => g.key === 'promise')).toBe(false);
  });

  it('상한 3종(24시간 투표 0.60, 공연 0.60, 정시 연속 0.60)이 넘지 않는다', () => {
    const schedules: Schedule[] = [];
    const logs: RawAttendanceLog[] = [];
    const events: RsvpEvent[] = [];

    // Create 15 on-time schedules with early votes
    for (let i = 1; i <= 15; i++) {
      const day = String(i).padStart(2, '0');
      const date = `2026-11-${day}`;
      const s = makeSchedule(`s${i}`, date, '19:30', '연주'); // Performance + practice
      schedules.push(s);
      logs.push(makeLog(`l${i}`, `s${i}`, `${date} 19:20:00`)); // On-time & early
      // Voted 2 days prior (well before 24h deadline)
      events.push(makeRsvp(i, `s${i}`, 'ATTEND', `2026-11-01T10:00:00+09:00`, 'insert'));
    }

    const res = computePassionTemperature(
      mockMember,
      [mockMember],
      schedules,
      logs,
      events,
      { performanceCategories: ['연주'] },
      new Date('2026-11-25T12:00:00+09:00')
    );

    const attGroup = res.groups.find((g) => g.key === 'attendance')!;
    const streakItem = attGroup.items.find((it) => it.key === 'streak')!;
    expect(streakItem.delta).toBe(PASSION_RULES.DELTAS.STREAK_10); // 0.60 max

    const promGroup = res.groups.find((g) => g.key === 'promise')!;
    const earlyVoteItem = promGroup.items.find((it) => it.key === 'early_vote')!;
    expect(earlyVoteItem.delta).toBe(PASSION_RULES.DELTAS.EARLY_VOTE_MAX); // 0.60 max

    const stageGroup = res.groups.find((g) => g.key === 'stage')!;
    const stageItem = stageGroup.items.find((it) => it.key === 'stage_attend')!;
    expect(stageItem.delta).toBe(PASSION_RULES.DELTAS.STAGE_MAX); // 0.60 max
  });

  it('34.0/42.0 자르기: 극단적인 감점이나 가점에서도 범위를 벗어나지 않는다', () => {
    // 12 absents with no-show (-0.50 * 12 = -6.00)
    const schedules: Schedule[] = [];
    const events: RsvpEvent[] = [];
    for (let i = 1; i <= 12; i++) {
      const day = String(i).padStart(2, '0');
      const date = `2026-11-${day}`;
      schedules.push(makeSchedule(`s${i}`, date, '19:30'));
      events.push(makeRsvp(i, `s${i}`, 'ATTEND', `${date}T10:00:00+09:00`));
    }

    const lowRes = computePassionTemperature(
      mockMember,
      [mockMember],
      schedules,
      [], // No attendance logs -> all no-shows
      events,
      {},
      new Date('2026-11-25T12:00:00+09:00')
    );

    // 36.5 - 6.00 = 30.5 -> clamped to 34.0
    expect(lowRes.value).toBe(34.0);
  });

  it('동일 입력의 결정성: 같은 입력에 대해 언제나 동일한 결과를 반환한다', () => {
    const s1 = makeSchedule('s1', '2026-11-20', '19:30');
    const log1 = makeLog('l1', 's1', '2026-11-20 19:25:00');
    const ev1 = makeRsvp(1, 's1', 'ATTEND', '2026-11-18T10:00:00+09:00');

    const res1 = computePassionTemperature(
      mockMember,
      [mockMember],
      [s1],
      [log1],
      [ev1],
      {},
      new Date('2026-11-23T12:00:00+09:00')
    );
    const res2 = computePassionTemperature(
      mockMember,
      [mockMember],
      [s1],
      [log1],
      [ev1],
      {},
      new Date('2026-11-23T12:00:00+09:00')
    );

    expect(res1).toEqual(res2);
  });

  it('시안 및 명세 §5-5 종합 시나리오 (38.2°C 검증)', () => {
    // 9 on-time (+0.90), 3 early (+0.15), 5 streak (+0.30), 1 late (0),
    // 7 early vote (+0.35), 92% kept (+0.30), 1 no-show (-0.50), 1 stage (+0.20)
    // Total deltas = 0.90 + 0.15 + 0.30 + 0 + 0.35 + 0.30 - 0.50 + 0.20 = +1.70
    // Final value = 36.5 + 1.70 = 38.2°C!
    const schedules: Schedule[] = [];
    const logs: RawAttendanceLog[] = [];
    const events: RsvpEvent[] = [];

    // Schedule 1: Performance schedule, attended on-time + early
    const s1 = makeSchedule('s1', '2026-11-01', '19:30', '연주');
    schedules.push(s1);
    logs.push(makeLog('l1', 's1', '2026-11-01 19:15:00')); // On-time + Early (1)
    events.push(makeRsvp(1, 's1', 'ATTEND', '2026-10-30T10:00:00+09:00')); // Early vote (1)

    // Schedule 2: On-time + early
    const s2 = makeSchedule('s2', '2026-11-03', '19:30');
    schedules.push(s2);
    logs.push(makeLog('l2', 's2', '2026-11-03 19:18:00')); // On-time + Early (2)
    events.push(makeRsvp(2, 's2', 'ATTEND', '2026-11-01T10:00:00+09:00')); // Early vote (2)

    // Schedule 3: On-time + early
    const s3 = makeSchedule('s3', '2026-11-05', '19:30');
    schedules.push(s3);
    logs.push(makeLog('l3', 's3', '2026-11-05 19:20:00')); // On-time + Early (3)
    events.push(makeRsvp(3, 's3', 'ATTEND', '2026-11-03T10:00:00+09:00')); // Early vote (3)

    // Schedule 4: On-time (not early, e.g. 19:25)
    const s4 = makeSchedule('s4', '2026-11-07', '19:30');
    schedules.push(s4);
    logs.push(makeLog('l4', 's4', '2026-11-07 19:25:00')); // On-time (4)
    events.push(makeRsvp(4, 's4', 'ATTEND', '2026-11-05T10:00:00+09:00')); // Early vote (4)

    // Schedules 7, 8, 9: On-time (3 more to make total 9 on-time with s1..s4 and s10, s11)
    for (let i = 7; i <= 9; i++) {
      const day = String(i * 2).padStart(2, '0');
      const s = makeSchedule(`s${i}`, `2026-11-${day}`, '19:30');
      schedules.push(s);
      logs.push(makeLog(`l${i}`, `s${i}`, `2026-11-${day} 19:25:00`)); // On-time
      if (i === 7) {
        // Early vote (6th early vote)
        events.push(makeRsvp(i, `s${i}`, 'ATTEND', '2026-11-12T10:00:00+09:00'));
      } else if (i === 8) {
        // Early vote (7th early vote)
        events.push(makeRsvp(i, `s${i}`, 'ATTEND', '2026-11-14T10:00:00+09:00'));
      } else {
        // Normal vote (not early, e.g. within 12h)
        events.push(makeRsvp(i, `s${i}`, 'ATTEND', `2026-11-${day}T10:00:00+09:00`));
      }
    }

    // Schedule 10: On-time (part of 5 streak)
    const s10 = makeSchedule('s10', '2026-11-20', '19:30');
    schedules.push(s10);
    logs.push(makeLog('l10', 's10', '2026-11-20 19:25:00'));
    events.push(makeRsvp(10, 's10', 'ATTEND', '2026-11-20T10:00:00+09:00'));

    // Schedule 11: On-time (recent streak reaches 5: s7, s8, s9, s10, s11)
    const s11 = makeSchedule('s11', '2026-11-22', '19:30');
    schedules.push(s11);
    logs.push(makeLog('l11', 's11', '2026-11-22 19:25:00')); // On-time (9th on-time, 5th consecutive)
    events.push(makeRsvp(11, 's11', 'ATTEND', '2026-11-22T12:00:00+09:00'));

    // Schedule 12: No-show (voted attend, but absent: no log)
    // To keep it from breaking the recent streak, put it before s7 (e.g. 2026-11-13)
    const s12 = makeSchedule('s12', '2026-11-13', '19:30');
    schedules.push(s12);
    events.push(makeRsvp(12, 's12', 'ATTEND', '2026-11-13T10:00:00+09:00'));
    // No log for s12 -> no-show!

    const res = computePassionTemperature(
      mockMember,
      [mockMember],
      schedules,
      logs,
      events,
      { performanceCategories: ['연주'] },
      new Date('2026-11-23T12:00:00+09:00')
    );

    expect(res.value).toBe(38.2);
  });

  describe('V3-20 R2: buildMemberScheduleRecords 단일 원천 검증', () => {
    it('사유 있는 불참은 결석(-0.40)이 되지 않고 0점이며 연속 정시를 유지한다', () => {
      // 5 on-time schedules and 1 excused absence in the middle
      const schedules = [
        makeSchedule('s1', '2026-11-10', '19:30'),
        makeSchedule('s2', '2026-11-12', '19:30'), // excused
        makeSchedule('s3', '2026-11-14', '19:30'),
        makeSchedule('s4', '2026-11-16', '19:30'),
        makeSchedule('s5', '2026-11-18', '19:30'),
        makeSchedule('s6', '2026-11-20', '19:30'),
      ];
      const logs = [
        makeLog('l1', 's1', '2026-11-10 19:25:00'),
        makeLog('l3', 's3', '2026-11-14 19:25:00'),
        makeLog('l4', 's4', '2026-11-16 19:25:00'),
        makeLog('l5', 's5', '2026-11-18 19:25:00'),
        makeLog('l6', 's6', '2026-11-20 19:25:00'),
      ];
      const rsvpVotes = [
        {
          id: 'v2',
          scheduleId: 's2',
          memberId: 'mem_1',
          status: 'ABSENT' as const,
          reason: '야근',
          timestamp: '2026-11-11 10:00:00',
        },
      ];
      const rsvpEvents: RsvpEvent[] = [
        makeRsvp(2, 's2', 'ABSENT', '2026-11-11T10:00:00+09:00'),
      ];

      const res = computePassionTemperature(
        mockMember,
        [mockMember],
        schedules,
        logs,
        rsvpEvents,
        {},
        new Date('2026-11-23T12:00:00+09:00'),
        { rsvpVotes }
      );

      const attGroup = res.groups.find((g) => g.key === 'attendance');
      const absentItem = attGroup?.items.find((it) => it.key === 'absent');
      expect(absentItem).toBeUndefined(); // 사유결석이므로 결석(-0.40)에 포함되지 않아야 함!

      const streakItem = attGroup?.items.find((it) => it.key === 'streak');
      expect(streakItem).toBeDefined(); // 사유결석이 정시 5연속을 끊지 않아야 함!
    });

    it('오늘 19:30 일정이 12:00 기준 계산에 포함되지 않는다', () => {
      const todaySched = makeSchedule('s_today', '2026-11-23', '19:30');
      const pastSched = makeSchedule('s_past', '2026-11-20', '19:30');
      const log = makeLog('l_past', 's_past', '2026-11-20 19:20:00');

      const res = computePassionTemperature(
        mockMember,
        [mockMember],
        [pastSched, todaySched],
        [log],
        [],
        {},
        new Date('2026-11-23T12:00:00+09:00')
      );

      // Only s_past should be in window (today at 12:00 has not started yet!)
      expect(res.windowSize).toBe(1);
      const attGroup = res.groups.find((g) => g.key === 'attendance');
      const absentItem = attGroup?.items.find((it) => it.key === 'absent');
      expect(absentItem).toBeUndefined(); // todaySched must NOT be counted as absent!
    });

    it('7일 사이 정시 1회 추가 시 weeklyDelta === 0.1을 반환한다 (R3)', () => {
      const s1 = makeSchedule('s1', '2026-11-10', '19:30');
      const s2 = makeSchedule('s2', '2026-11-20', '19:30');
      const l1 = makeLog('l1', 's1', '2026-11-10 19:25:00');
      const l2 = makeLog('l2', 's2', '2026-11-20 19:25:00');

      const res = computePassionTemperature(
        mockMember,
        [mockMember],
        [s1, s2],
        [l1, l2],
        [],
        {},
        new Date('2026-11-23T12:00:00+09:00'),
        { includeWeeklyDelta: true }
      );

      expect(res.weeklyDelta).toBe(0.1);
    });
  });
});
