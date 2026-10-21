import { describe, expect, it } from 'vitest';
import type { AttendanceReconciliation, Schedule } from '../types/rollbook';
import { getMatrixCellDisplay } from './matrixCell';

const schedule = (overrides: Partial<Schedule> = {}): Schedule =>
  ({
    id: 's1',
    title: '정기연습',
    date: '2026-10-22',
    startTime: '19:30',
    endTime: '21:30',
    ...overrides,
  }) as Schedule;

const item = (overrides: Partial<AttendanceReconciliation> = {}): AttendanceReconciliation => ({
  memberId: 'm1',
  memberName: '문유진',
  part: '소프라노',
  rsvpStatus: 'UNVOTED',
  finalStatus: '결석',
  isManualOverride: false,
  ...overrides,
});

// timeWindow.ts가 연습 시각을 로컬 시간으로 해석하므로 테스트 시각도 로컬 기준으로 만든다.
const BEFORE = new Date('2026-10-21T12:00:00'); // 연습 전날
const DURING = new Date('2026-10-22T20:00:00'); // 연습 진행 중
const AFTER = new Date('2026-10-22T23:00:00'); // 연습 종료 후

describe('getMatrixCellDisplay', () => {
  it('연습 전: 참석 투표는 결석이 아니라 참석(투표)으로 보인다', () => {
    const d = getMatrixCellDisplay({ schedule: schedule(), item: item({ rsvpStatus: 'ATTEND' }), isRequired: true, now: BEFORE });
    expect(d.label).toBe('참석');
    expect(d.sub).toBe('투표');
    expect(d.badgeClass).toBe('cell-vote-attend');
  });

  it('연습 전: 사유 있는 불참은 사유, 사유 없는 불참은 불참, 무응답은 미투표', () => {
    const excused = getMatrixCellDisplay({
      schedule: schedule(),
      item: item({ rsvpStatus: 'ABSENT', rsvpReason: '출장', finalStatus: '사유결석' }),
      isRequired: true,
      now: BEFORE,
    });
    expect(excused.label).toBe('사유');
    const absent = getMatrixCellDisplay({ schedule: schedule(), item: item({ rsvpStatus: 'ABSENT' }), isRequired: true, now: BEFORE });
    expect(absent.label).toBe('불참');
    const none = getMatrixCellDisplay({ schedule: schedule(), item: item(), isRequired: true, now: BEFORE });
    expect(none.label).toBe('미투표');
    expect(none.badgeClass).toBe('cell-upcoming');
  });

  it('연습 당일 종료 전에는 아직 체크인 안 한 참석 투표자를 결석으로 확정하지 않는다', () => {
    const d = getMatrixCellDisplay({ schedule: schedule(), item: item({ rsvpStatus: 'ATTEND' }), isRequired: true, now: DURING });
    expect(d.label).toBe('참석');
  });

  it('연습 종료 후: 참석 투표 후 미출석은 결석이며 참석투표 표시가 붙는다', () => {
    const d = getMatrixCellDisplay({ schedule: schedule(), item: item({ rsvpStatus: 'ATTEND' }), isRequired: true, now: AFTER });
    expect(d.label).toBe('결석');
    expect(d.sub).toBe('참석투표');
  });

  it('연습 종료 후: 투표 없이 미출석이면 결석만 표시한다', () => {
    const d = getMatrixCellDisplay({ schedule: schedule(), item: item(), isRequired: true, now: AFTER });
    expect(d.label).toBe('결석');
    expect(d.sub).toBe('');
  });

  it('실제 체크인 기록은 날짜와 무관하게 출석/지각으로 우선 표시한다', () => {
    const attended = getMatrixCellDisplay({
      schedule: schedule(),
      item: item({ finalStatus: '출석', checkInTime: '2026-10-22 19:25:10' }),
      isRequired: true,
      now: BEFORE,
    });
    expect(attended.label).toBe('출석');
    expect(attended.sub).toBe('19:25');
    const late = getMatrixCellDisplay({
      schedule: schedule(),
      item: item({ finalStatus: '지각', checkInTime: '2026-10-22 19:50:00' }),
      isRequired: true,
      now: AFTER,
    });
    expect(late.label).toBe('지각');
  });

  it('관리자가 명시한 결석 처리는 연습 전이어도 결석으로 보인다', () => {
    const d = getMatrixCellDisplay({
      schedule: schedule(),
      item: item({ rsvpStatus: 'ATTEND', isManualOverride: true }),
      isRequired: true,
      now: BEFORE,
    });
    expect(d.label).toBe('결석');
  });

  it('비대상자는 미참, 연습 전 자율 참석 투표는 참석(자율)로 보인다', () => {
    const exempt = getMatrixCellDisplay({ schedule: schedule(), item: item({ finalStatus: '미참' }), isRequired: false, now: BEFORE });
    expect(exempt.label).toBe('미참');
    const voluntary = getMatrixCellDisplay({
      schedule: schedule(),
      item: item({ finalStatus: '미참', rsvpStatus: 'ATTEND' }),
      isRequired: false,
      now: BEFORE,
    });
    expect(voluntary.label).toBe('참석');
    expect(voluntary.sub).toBe('자율');
  });

  it('취소된 일정은 취소로 표시한다', () => {
    const d = getMatrixCellDisplay({ schedule: schedule({ isCancelled: true }), item: item(), isRequired: true, now: BEFORE });
    expect(d.label).toBe('취소');
  });

  it('item이 없으면 대상자는 결석, 비대상자는 미참(종료 후 기준)', () => {
    expect(getMatrixCellDisplay({ schedule: schedule(), isRequired: true, now: AFTER }).label).toBe('결석');
    expect(getMatrixCellDisplay({ schedule: schedule(), isRequired: false, now: AFTER }).label).toBe('미참');
  });
});
