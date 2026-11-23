import { describe, expect, it } from 'vitest';
import type {
  Member,
  MemberActivity,
  RawAttendanceLog,
  RsvpEvent,
  Schedule,
} from '../types/rollbook';
import {
  evaluatePraiseStickers,
  STAFF_STICKER_IDS,
  STICKER_DEFINITIONS,
} from './praiseStickers';

describe('Praise Stickers Engine (V3-13, Spec §5-6, §5-7, V26, V27)', () => {
  const baseMember: Member = {
    id: 'm1',
    name: '김단원',
    part: '소프라노',
    memberStatus: '정단원',
    role: 'MEMBER',
    phone: '010-1234-5678',
    phoneLast4: '5678',
    createdAt: '2025-01-01',
    status: 'ACTIVE',
    joinedAt: '2025-01-01',
  };

  const createSchedule = (id: string, date: string, category = '정기연습', startTime = '19:30'): Schedule => ({
    id,
    title: `연습 ${id}`,
    date,
    startTime,
    endTime: '21:30',
    locationName: '연습실',
    category,
    isCancelled: false,
    targetAudienceType: 'ALL',
  });

  const createLog = (memberId: string, scheduleId: string, timestamp: string): RawAttendanceLog => ({
    id: `log-${memberId}-${scheduleId}`,
    memberName: '김단원',
    part: '소프라노',
    authMethod: 'QR_WEB_CAM',
    isVerifiedLocation: true,
    timestamp,
    memberId,
    scheduleId,
  });

  it('contains exactly 24 stickers in definitions, 8 eligible for staff', () => {
    expect(STICKER_DEFINITIONS).toHaveLength(24);
    expect(STAFF_STICKER_IDS.size).toBe(8);
  });

  it('evaluates empty state: all 24 unearned with 0 progress for new member', () => {
    const newMember: Member = {
      ...baseMember,
      joinedAt: '2026-11-20',
    };
    const stickers = evaluatePraiseStickers({
      member: newMember,
      schedules: [],
      logs: [],
      activity: null,
      now: new Date('2026-11-20T12:00:00+09:00'),
    });

    expect(stickers).toHaveLength(24);
    for (const s of stickers) {
      expect(s.earned).toBe(false);
      expect(s.earnedOn).toBeUndefined();
      expect(s.progress).toBe(0);
    }
  });

  it('staff member gets exactly 8 stickers (V26)', () => {
    const staffMember: Member = {
      ...baseMember,
      id: 'staff-1',
      name: '지휘자님',
      part: '지휘',
    };

    const stickers = evaluatePraiseStickers({
      member: staffMember,
      schedules: [],
      now: new Date('2026-11-20T12:00:00+09:00'),
    });

    expect(stickers).toHaveLength(8);
    for (const s of stickers) {
      expect(STAFF_STICKER_IDS.has(s.id)).toBe(true);
    }
  });

  // Bundle 1: 꾸준함 (first-step, att-10, att-50, att-100, full-month, anniv-1y)
  it('evaluates first-step, att-10, att-50, att-100 and records earned date', () => {
    const schedules: Schedule[] = [];
    const logs: RawAttendanceLog[] = [];

    for (let i = 1; i <= 100; i++) {
      const sDate = new Date(2026, 0, i).toISOString().slice(0, 10);
      const s = createSchedule(`s-${i}`, sDate);
      schedules.push(s);
      logs.push(createLog('m1', s.id, `${sDate} 19:20:00`));
    }

    const stickers = evaluatePraiseStickers({
      member: baseMember,
      schedules,
      logs,
      now: new Date('2026-12-01T12:00:00+09:00'),
    });

    const firstStep = stickers.find((s) => s.id === 'first-step')!;
    const att10 = stickers.find((s) => s.id === 'att-10')!;
    const att50 = stickers.find((s) => s.id === 'att-50')!;
    const att100 = stickers.find((s) => s.id === 'att-100')!;

    expect(firstStep.earned).toBe(true);
    expect(firstStep.earnedOn).toBe(schedules[0].date);

    expect(att10.earned).toBe(true);
    expect(att10.earnedOn).toBe(schedules[9].date);

    expect(att50.earned).toBe(true);
    expect(att50.earnedOn).toBe(schedules[49].date);

    expect(att100.earned).toBe(true);
    expect(att100.earnedOn).toBe(schedules[99].date);
  });

  it('evaluates full-month: month with >= 2 mandatory schedules all valid and at least 1 attended', () => {
    const schedules = [
      createSchedule('s1', '2026-03-05'),
      createSchedule('s2', '2026-03-12'),
    ];
    const logs = [
      createLog('m1', 's1', '2026-03-05 19:25:00'),
    ];

    let stickers = evaluatePraiseStickers({
      member: baseMember,
      schedules,
      logs,
      now: new Date('2026-03-20T12:00:00+09:00'),
    });
    expect(stickers.find((s) => s.id === 'full-month')!.earned).toBe(false);

    // Now attend s2
    logs.push(createLog('m1', 's2', '2026-03-12 19:35:00')); // late is valid
    stickers = evaluatePraiseStickers({
      member: baseMember,
      schedules,
      logs,
      now: new Date('2026-03-20T12:00:00+09:00'),
    });
    const fullMonth = stickers.find((s) => s.id === 'full-month')!;
    expect(fullMonth.earned).toBe(true);
    expect(fullMonth.earnedOn).toBe('2026-03-12');
  });

  it('evaluates anniv-1y: >= 366 days together', () => {
    const memberNew: Member = { ...baseMember, joinedAt: '2026-01-01' };
    let stickers = evaluatePraiseStickers({
      member: memberNew,
      schedules: [],
      logs: [],
      now: new Date('2026-06-01T12:00:00+09:00'),
    });
    expect(stickers.find((s) => s.id === 'anniv-1y')!.earned).toBe(false);

    // 2027-01-03: 367 days
    stickers = evaluatePraiseStickers({
      member: memberNew,
      schedules: [],
      logs: [],
      now: new Date('2027-01-03T12:00:00+09:00'),
    });
    const anniv = stickers.find((s) => s.id === 'anniv-1y')!;
    expect(anniv.earned).toBe(true);
    expect(anniv.earnedOn).toBe('2027-01-01');
  });

  // Bundle 2: 시간 약속 (ontime-5, ontime-10, early-5, early-20, back-on-time)
  it('evaluates ontime-5, ontime-10, early-5, early-20', () => {
    const schedules: Schedule[] = [];
    const logs: RawAttendanceLog[] = [];

    // 20 early on-time attendances
    for (let i = 1; i <= 20; i++) {
      const date = `2026-05-${String(i).padStart(2, '0')}`;
      const s = createSchedule(`s-${i}`, date, '정기연습', '19:30');
      schedules.push(s);
      logs.push(createLog('m1', s.id, `${date} 19:15:00`));
    }

    const stickers = evaluatePraiseStickers({
      member: baseMember,
      schedules,
      logs,
      now: new Date('2026-06-01T12:00:00+09:00'),
    });

    const ontime5 = stickers.find((s) => s.id === 'ontime-5')!;
    const ontime10 = stickers.find((s) => s.id === 'ontime-10')!;
    const early5 = stickers.find((s) => s.id === 'early-5')!;
    const early20 = stickers.find((s) => s.id === 'early-20')!;

    expect(ontime5.earned).toBe(true);
    expect(ontime5.earnedOn).toBe('2026-05-05');

    expect(ontime10.earned).toBe(true);
    expect(ontime10.earnedOn).toBe('2026-05-10');

    expect(early5.earned).toBe(true);
    expect(early5.earnedOn).toBe('2026-05-05');

    expect(early20.earned).toBe(true);
    expect(early20.earnedOn).toBe('2026-05-20');
  });

  it('evaluates back-on-time: late immediately followed by 3 on-time attendances', () => {
    const schedules = [
      createSchedule('s1', '2026-05-01', '정기연습', '19:30'),
      createSchedule('s2', '2026-05-08', '정기연습', '19:30'),
      createSchedule('s3', '2026-05-15', '정기연습', '19:30'),
      createSchedule('s4', '2026-05-22', '정기연습', '19:30'),
    ];
    const logs = [
      createLog('m1', 's1', '2026-05-01 19:45:00'), // late (> 19:40)
      createLog('m1', 's2', '2026-05-08 19:25:00'), // on-time 1
      createLog('m1', 's3', '2026-05-15 19:25:00'), // on-time 2
      createLog('m1', 's4', '2026-05-22 19:25:00'), // on-time 3 -> earned!
    ];

    const stickers = evaluatePraiseStickers({
      member: baseMember,
      schedules,
      logs,
      now: new Date('2026-06-01T12:00:00+09:00'),
    });

    const backOnTime = stickers.find((s) => s.id === 'back-on-time')!;
    expect(backOnTime.earned).toBe(true);
    expect(backOnTime.earnedOn).toBe('2026-05-22');
  });

  // Bundle 3: 약속 (first-vote, quick-10, kept-10, all-voted-month)
  it('excludes backfill events from promise stickers (V27)', () => {
    const backfillEvents: RsvpEvent[] = [
      {
        seq: 1,
        scheduleId: 's1',
        memberId: 'm1',
        action: 'backfill',
        status: 'ATTEND',
        prevStatus: null,
        occurredAt: '2026-01-01T00:00:00+09:00',
      },
    ];

    const activity: MemberActivity = {
      rsvpEvents: backfillEvents,
      listen: { totalSeconds: 0, firstAt: null, daily: [], perPiece: [] },
    };

    const stickers = evaluatePraiseStickers({
      member: baseMember,
      schedules: [createSchedule('s1', '2026-01-05')],
      activity,
      now: new Date('2026-01-10T12:00:00+09:00'),
    });

    expect(stickers.find((s) => s.id === 'first-vote')!.earned).toBe(false);
    expect(stickers.find((s) => s.id === 'quick-10')!.earned).toBe(false);
    expect(stickers.find((s) => s.id === 'kept-10')!.earned).toBe(false);
    expect(stickers.find((s) => s.id === 'all-voted-month')!.earned).toBe(false);
  });

  it('evaluates first-vote, quick-10, kept-10, all-voted-month with valid events', () => {
    const schedules: Schedule[] = [];
    const logs: RawAttendanceLog[] = [];
    const rsvpEvents: RsvpEvent[] = [];

    for (let i = 1; i <= 10; i++) {
      const sDay = 10 + i;
      const sDate = `2026-06-${sDay}`;
      const s = createSchedule(`s-${i}`, sDate, '정기연습', '19:30');
      schedules.push(s);
      logs.push(createLog('m1', s.id, `${sDate} 19:25:00`));

      // Vote 2 days prior (48 hours before schedule)
      const voteDay = String(sDay - 2).padStart(2, '0');
      const voteDate = `2026-06-${voteDay}`;
      rsvpEvents.push({
        seq: i,
        scheduleId: s.id,
        memberId: 'm1',
        action: 'insert',
        status: 'ATTEND',
        prevStatus: null,
        occurredAt: `${voteDate}T12:00:00+09:00`,
      });
    }

    const activity: MemberActivity = {
      rsvpEvents,
      listen: { totalSeconds: 0, firstAt: null, daily: [], perPiece: [] },
    };

    const stickers = evaluatePraiseStickers({
      member: baseMember,
      schedules,
      logs,
      activity,
      now: new Date('2026-07-01T12:00:00+09:00'),
    });

    const firstVote = stickers.find((s) => s.id === 'first-vote')!;
    const quick10 = stickers.find((s) => s.id === 'quick-10')!;
    const kept10 = stickers.find((s) => s.id === 'kept-10')!;
    const allVoted = stickers.find((s) => s.id === 'all-voted-month')!;

    expect(firstVote.earned).toBe(true);
    expect(firstVote.earnedOn).toBe('2026-06-09');

    expect(quick10.earned).toBe(true);
    expect(quick10.earnedOn).toBe('2026-06-18');

    expect(kept10.earned).toBe(true);
    expect(kept10.earnedOn).toBe('2026-06-20');

    expect(allVoted.earned).toBe(true);
    expect(allVoted.earnedOn).toBe('2026-06-20');
  });

  // Bundle 4: 연습실 (first-play, listen-1h, listen-5h, listen-20h, explorer-10)
  it('evaluates studio bundle listen milestones and 10 pieces explored', () => {
    const activity: MemberActivity = {
      rsvpEvents: [],
      listen: {
        totalSeconds: 80000,
        firstAt: '2026-04-01T10:00:00+09:00',
        daily: [
          { date: '2026-04-01', seconds: 4000 },
          { date: '2026-04-05', seconds: 15000 },
          { date: '2026-04-10', seconds: 60000 },
        ],
        perPiece: Array.from({ length: 12 }, (_, i) => ({
          pieceId: `p-${i + 1}`,
          seconds: 120,
          reached60At: `2026-04-${String(i + 1).padStart(2, '0')}T12:00:00+09:00`,
        })),
      },
    };

    const stickers = evaluatePraiseStickers({
      member: baseMember,
      schedules: [],
      logs: [],
      activity,
      now: new Date('2026-05-01T12:00:00+09:00'),
    });

    const firstPlay = stickers.find((s) => s.id === 'first-play')!;
    const listen1h = stickers.find((s) => s.id === 'listen-1h')!;
    const listen5h = stickers.find((s) => s.id === 'listen-5h')!;
    const listen20h = stickers.find((s) => s.id === 'listen-20h')!;
    const explorer10 = stickers.find((s) => s.id === 'explorer-10')!;

    expect(firstPlay.earned).toBe(true);
    expect(firstPlay.earnedOn).toBe('2026-04-01');

    expect(listen1h.earned).toBe(true);
    expect(listen1h.earnedOn).toBe('2026-04-01');

    expect(listen5h.earned).toBe(true);
    expect(listen5h.earnedOn).toBe('2026-04-05');

    expect(listen20h.earned).toBe(true);
    expect(listen20h.earnedOn).toBe('2026-04-10');

    expect(explorer10.earned).toBe(true);
    expect(explorer10.earnedOn).toBe('2026-04-10');
  });

  // Bundle 5: 무대 (first-stage, stage-3, stage-10, stage-ready)
  it('evaluates stage bundle: first-stage, stage-3, stage-10 and stage-ready', () => {
    const schedules: Schedule[] = [];
    const logs: RawAttendanceLog[] = [];

    // 10 concerts over time
    for (let i = 1; i <= 10; i++) {
      const date = `2026-07-${String(i * 2).padStart(2, '0')}`;
      const s = createSchedule(`perf-${i}`, date, '연주');
      schedules.push(s);
      logs.push(createLog('m1', s.id, `${date} 19:20:00`));
    }

    // Two mandatory rehearsals within 28 days before perf-1 (on 2026-07-02)
    const reh1 = createSchedule('reh-1', '2026-06-15', '정기연습');
    const reh2 = createSchedule('reh-2', '2026-06-22', '정기연습');
    schedules.push(reh1, reh2);
    logs.push(createLog('m1', 'reh-1', '2026-06-15 19:25:00'));
    logs.push(createLog('m1', 'reh-2', '2026-06-22 19:25:00'));

    const stickers = evaluatePraiseStickers({
      member: baseMember,
      schedules,
      logs,
      performanceCategories: ['연주', '녹음'],
      now: new Date('2026-08-01T12:00:00+09:00'),
    });

    const firstStage = stickers.find((s) => s.id === 'first-stage')!;
    const stage3 = stickers.find((s) => s.id === 'stage-3')!;
    const stage10 = stickers.find((s) => s.id === 'stage-10')!;
    const stageReady = stickers.find((s) => s.id === 'stage-ready')!;

    expect(firstStage.earned).toBe(true);
    expect(firstStage.earnedOn).toBe('2026-07-02');

    expect(stage3.earned).toBe(true);
    expect(stage3.earnedOn).toBe('2026-07-06');

    expect(stage10.earned).toBe(true);
    expect(stage10.earnedOn).toBe('2026-07-20');

    expect(stageReady.earned).toBe(true);
    expect(stageReady.earnedOn).toBe('2026-07-02');
  });
});
