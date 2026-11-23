import { describe, expect, it } from 'vitest';
import type { Member, Schedule } from '../types/rollbook';
import {
  computeDDayDifference,
  getSchedulePriorityScore,
  selectTodayFocus,
} from './todayFocus';

describe('selectTodayFocus Pure Function', () => {
  const memberSoprano: Member = {
    id: 'mem_sop_1',
    name: '김소프',
    part: '소프라노',
    phoneLast4: '1234',
    createdAt: '2026-01-01T00:00:00Z',
    status: 'ACTIVE',
    memberStatus: '정단원',
    role: 'MEMBER',
  };

  const memberAlto: Member = {
    id: 'mem_alt_1',
    name: '이알토',
    part: '알토',
    phoneLast4: '5678',
    createdAt: '2026-01-01T00:00:00Z',
    status: 'ACTIVE',
    memberStatus: '정단원',
    role: 'MEMBER',
  };

  const todayStr = '2026-10-15';
  const nowDuring1930 = new Date('2026-10-15T20:00:00+09:00');

  const createSchedule = (partial: Partial<Schedule> & { id: string }): Schedule => ({
    title: '연습',
    date: todayStr,
    startTime: '19:30',
    endTime: '21:30',
    locationName: '문콰이어 연습실',
    category: '정기연습',
    ...partial,
  });

  it('calculates schedule priority score based on window and target relevance', () => {
    const schOpen = createSchedule({
      id: 'sch_prio_open',
      startTime: '19:30',
      endTime: '21:30',
    });
    // At 20:00, schOpen is OPEN (300). For memberSoprano: mandatory regular rehearsal (+50) = 350
    expect(getSchedulePriorityScore(schOpen, memberSoprano, nowDuring1930)).toBe(350);
  });

  it('treats a representative as a priority target when the old ID is selected', () => {
    const targeted = createSchedule({
      id: 'sch_merged_target',
      targetAudienceType: 'CUSTOM_MEMBERS',
      targetMemberIds: ['old'],
    });

    expect(
      getSchedulePriorityScore(
        targeted,
        memberSoprano,
        nowDuring1930,
        new Set([memberSoprano.id, 'old'])
      )
    ).toBe(350);
  });

  it('selects single schedule for today in TODAY mode', () => {
    const single = createSchedule({
      id: 'sch_1',
      title: '단일 연습',
      date: todayStr,
      startTime: '19:30',
      endTime: '21:30',
      category: '정기연습',
    });

    const res = selectTodayFocus({
      schedules: [single],
      member: memberSoprano,
      now: nowDuring1930,
      todayStr,
    });

    expect(res.mode).toBe('TODAY');
    expect(res.schedules).toHaveLength(1);
    expect(res.focus?.id).toBe('sch_1');
    expect(res.dDay).toBe(0);
  });

  it('sorts multiple today schedules by urgency and target priority', () => {
    // sch_open: 19:30~21:30 (OPEN right now at 20:00, score 300)
    // sch_upcoming: 22:00~23:00 (UPCOMING, score 200). For Alto: target (+50)
    // sch_closed: 14:00~16:00 (CLOSED, excluded from activeToday)
    const schOpen = createSchedule({
      id: 'sch_open',
      title: '오픈 연습',
      date: todayStr,
      startTime: '19:30',
      endTime: '21:30',
      category: '정기연습',
    });

    const schUpcomingAlto = createSchedule({
      id: 'sch_upcoming',
      title: '알토 파트연습',
      date: todayStr,
      startTime: '22:00',
      endTime: '23:00',
      targetAudienceType: 'PARTS',
      targetParts: ['알토'],
      category: '추가연습',
    });

    const schClosed = createSchedule({
      id: 'sch_closed',
      title: '낮 마감 연습',
      date: todayStr,
      startTime: '14:00',
      endTime: '16:00',
      category: '추가연습',
    });

    const res = selectTodayFocus({
      schedules: [schClosed, schUpcomingAlto, schOpen],
      member: memberAlto,
      now: nowDuring1930,
      todayStr,
    });

    expect(res.mode).toBe('TODAY');
    expect(res.schedules).toHaveLength(2); // closed is filtered out
    expect(res.schedules[0].id).toBe('sch_open'); // 300+50 vs 200+50
    expect(res.schedules[1].id).toBe('sch_upcoming');
    expect(res.focus?.id).toBe('sch_open');
  });

  it('switches to NEXT mode with dDay when all today schedules are closed', () => {
    const schPast = createSchedule({
      id: 'sch_past',
      title: '오늘 끝난 연습',
      date: todayStr,
      startTime: '14:00',
      endTime: '16:00',
      category: '정기연습',
    });

    const schFuture = createSchedule({
      id: 'sch_future',
      title: '다음 주 연습',
      date: '2026-10-18', // 3 days after 2026-10-15
      startTime: '19:30',
      endTime: '21:30',
      category: '정기연습',
    });

    const res = selectTodayFocus({
      schedules: [schPast, schFuture],
      member: memberSoprano,
      now: new Date('2026-10-15T18:00:00+09:00'), // past is closed
      todayStr,
    });

    expect(res.mode).toBe('NEXT');
    expect(res.schedules).toHaveLength(1);
    expect(res.focus?.id).toBe('sch_future');
    expect(res.dDay).toBe(3);
  });

  it('returns NONE mode when no schedules exist in present or future', () => {
    const res = selectTodayFocus({
      schedules: [],
      member: memberSoprano,
      now: nowDuring1930,
      todayStr,
    });

    expect(res.mode).toBe('NONE');
    expect(res.schedules).toHaveLength(0);
    expect(res.focus).toBeUndefined();
    expect(res.dDay).toBeUndefined();
  });

  it('strictly excludes cancelled and archived schedules from selection', () => {
    const schCancelled = createSchedule({
      id: 'sch_canc',
      title: '취소된 연습',
      date: todayStr,
      startTime: '19:30',
      endTime: '21:30',
      isCancelled: true,
      category: '정기연습',
    });

    const schArchived = createSchedule({
      id: 'sch_arch',
      title: '보관된 연습',
      date: todayStr,
      startTime: '19:30',
      endTime: '21:30',
      isArchived: true,
      category: '정기연습',
    });

    const res = selectTodayFocus({
      schedules: [schCancelled, schArchived],
      member: memberSoprano,
      now: nowDuring1930,
      todayStr,
    });

    expect(res.mode).toBe('NONE');
  });

  it('correctly handles cross-midnight schedules as active', () => {
    const schMidnight = createSchedule({
      id: 'sch_mid',
      title: '심야 집중 리허설',
      date: todayStr,
      startTime: '23:00',
      endTime: '01:00',
      category: '정기연습',
    });

    // At 23:30 KST on todayStr, window is OPEN
    const res = selectTodayFocus({
      schedules: [schMidnight],
      member: memberSoprano,
      now: new Date('2026-10-15T23:30:00+09:00'),
      todayStr,
    });

    expect(res.mode).toBe('TODAY');
    expect(res.focus?.id).toBe('sch_mid');
  });

  it('falls back to first schedule if selectedId is not in active schedule list', () => {
    const schA = createSchedule({
      id: 'sch_a',
      title: 'A',
      date: todayStr,
      startTime: '19:30',
      endTime: '21:30',
      category: '정기연습',
    });

    const schB = createSchedule({
      id: 'sch_b',
      title: 'B',
      date: todayStr,
      startTime: '22:00',
      endTime: '23:00',
      category: '정기연습',
    });

    const res = selectTodayFocus({
      schedules: [schA, schB],
      member: memberSoprano,
      now: nowDuring1930,
      todayStr,
      selectedId: 'non_existent_id',
    });

    expect(res.focus?.id).toBe('sch_a');
  });

  it('honors selectedId when it exists in active schedule list', () => {
    const schA = createSchedule({
      id: 'sch_a',
      title: 'A',
      date: todayStr,
      startTime: '19:30',
      endTime: '21:30',
      category: '정기연습',
    });

    const schB = createSchedule({
      id: 'sch_b',
      title: 'B',
      date: todayStr,
      startTime: '22:00',
      endTime: '23:00',
      category: '정기연습',
    });

    const res = selectTodayFocus({
      schedules: [schA, schB],
      member: memberSoprano,
      now: nowDuring1930,
      todayStr,
      selectedId: 'sch_b',
    });

    expect(res.focus?.id).toBe('sch_b');
  });

  it('computes exact D-Day difference', () => {
    expect(computeDDayDifference('2026-10-18', '2026-10-15')).toBe(3);
    expect(computeDDayDifference('2026-10-15', '2026-10-15')).toBe(0);
    expect(computeDDayDifference('2026-11-01', '2026-10-31')).toBe(1);
  });
});
