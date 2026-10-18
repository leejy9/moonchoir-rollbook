import { describe, it, expect, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { HomeView } from './HomeView';
import { sheetsService, resetStorage } from '../services/sheets';
import type { BoundDeviceProfile, Schedule } from '../types/rollbook';
import { getKSTDateString } from '../utils/date';

describe('HomeView Component (Multi-Schedule Smart Ranking & Switcher Bar)', () => {
  const mockProfile: BoundDeviceProfile = {
    memberId: 'mem_s01',
    name: '김하은',
    part: '소프라노',
    phoneLast4: '1234',
    boundAt: '2026-10-17T10:00:00Z',
  };

  const todayStr = getKSTDateString();

  const cleanupTestSchedules = async () => {
    const list = sheetsService.getSchedules();
    for (const s of list) {
      if (s.id.startsWith('sch_test_')) {
        await sheetsService.deleteSchedule(s.id);
      }
    }
  };

  beforeEach(async () => {
    resetStorage();
    await cleanupTestSchedules();
  });

  it('renders single schedule normally when only one schedule exists for today', async () => {
    const singleSchedule: Schedule = {
      id: 'sch_test_single',
      title: '단일 정기연습',
      category: '정기연습',
      date: todayStr,
      startTime: '19:30',
      endTime: '21:30',
      locationName: '문콰이어 제1연습실',
      targetLat: 37.5665,
      targetLon: 126.978,
      radiusMeters: 100,
    };
    await sheetsService.addSchedule(singleSchedule);

    const html = renderToString(
      <HomeView
        profile={mockProfile}
        onOpenQRScanner={() => {}}
        onOpenRSVP={() => {}}
        onOpenAdmin={() => {}}
        onChangeProfile={() => {}}
        refreshTrigger={0}
      />
    );

    expect(html).toContain('단일 정기연습');
    // Carousel navigation bar should NOT be rendered when count <= 1
    expect(html).not.toContain('이전 일정 보기');
    expect(html).not.toContain('다음 일정 보기');
  });

  it('renders carousel switcher bar when multiple schedules exist for today', async () => {
    const sch1: Schedule = {
      id: 'sch_test_multi_1',
      title: '오전 파트연습',
      category: '추가연습',
      date: todayStr,
      startTime: '10:00',
      endTime: '12:00',
      locationName: '제1연습실',
      targetLat: 37.5665,
      targetLon: 126.978,
      radiusMeters: 100,
    };

    const sch2: Schedule = {
      id: 'sch_test_multi_2',
      title: '오후 전체연습',
      category: '정기연습',
      date: todayStr,
      startTime: '19:30',
      endTime: '21:30',
      locationName: '제1연습실',
      targetLat: 37.5665,
      targetLon: 126.978,
      radiusMeters: 100,
    };

    await sheetsService.addSchedule(sch1);
    await sheetsService.addSchedule(sch2);

    const html = renderToString(
      <HomeView
        profile={mockProfile}
        onOpenQRScanner={() => {}}
        onOpenRSVP={() => {}}
        onOpenAdmin={() => {}}
        onChangeProfile={() => {}}
        refreshTrigger={0}
      />
    );

    // Multi-schedule switcher bar should render
    expect(html).toContain('이전 일정 보기');
    expect(html).toContain('다음 일정 보기');
    expect(html).toMatch(/1<!-- -->\/<!-- -->2/);
    expect(html).toContain('오전 파트연습 (10:00)');
    expect(html).toContain('오후 전체연습 (19:30)');
  });

  it('prioritizes upcoming/open schedule over closed schedule on the same date', async () => {
    // schClosed was at 00:00~01:00 (already closed)
    const schClosed: Schedule = {
      id: 'sch_test_closed',
      title: '새벽 특훈 (종료)',
      category: '추가연습',
      date: todayStr,
      startTime: '00:00',
      endTime: '01:00',
      locationName: '제1연습실',
      targetLat: 37.5665,
      targetLon: 126.978,
      radiusMeters: 100,
    };

    // schUpcoming is at 23:59 (still upcoming)
    const schUpcoming: Schedule = {
      id: 'sch_test_upcoming',
      title: '야간 총연습 (예정)',
      category: '정기연습',
      date: todayStr,
      startTime: '23:59',
      endTime: '23:59',
      locationName: '제1연습실',
      targetLat: 37.5665,
      targetLon: 126.978,
      radiusMeters: 100,
    };

    await sheetsService.addSchedule(schClosed);
    await sheetsService.addSchedule(schUpcoming);

    const html = renderToString(
      <HomeView
        profile={mockProfile}
        onOpenQRScanner={() => {}}
        onOpenRSVP={() => {}}
        onOpenAdmin={() => {}}
        onChangeProfile={() => {}}
        refreshTrigger={0}
      />
    );

    // The top-priority card displayed should be the upcoming one
    expect(html).toContain('야간 총연습 (예정)');
    expect(html).toContain('(23:59)');
  });

  it('does NOT display 오늘 출석 체크 완료 when admin manually marked absent', async () => {
    const sch: Schedule = {
      id: 'sch_test_absent_view',
      title: '관리자 결석 테스트 일정',
      category: '정기연습',
      date: todayStr,
      startTime: '19:30',
      endTime: '21:30',
      locationName: '제1연습실',
      targetLat: 37.5665,
      targetLon: 126.978,
      radiusMeters: 100,
    };
    await sheetsService.addSchedule(sch);

    // 관리자 결석 처리 로그 추가
    await sheetsService.addCheckInLog({
      id: 'log_test_absent',
      scheduleId: sch.id,
      memberId: mockProfile.memberId,
      memberName: mockProfile.name,
      part: mockProfile.part,
      timestamp: `${todayStr}T19:30:00`,
      authMethod: 'MANUAL_BY_ADMIN',
      adminNote: '관리자 결석 처리',
      isVerifiedLocation: true,
    });

    const html = renderToString(
      <HomeView
        profile={mockProfile}
        onOpenQRScanner={() => {}}
        onOpenRSVP={() => {}}
        onOpenAdmin={() => {}}
        onChangeProfile={() => {}}
        refreshTrigger={0}
      />
    );

    // 출석 완료 배너가 뜨지 않고 결석 안내가 떠야 함
    expect(html).not.toContain('오늘 출석 체크 완료');
    expect(html).toContain('관리자 확인: 결석 처리');
  });
});

