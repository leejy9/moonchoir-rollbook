import { afterEach, describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { TodayTab } from './TodayTab';
import { sheetsService, resetStorage } from '../services/sheets';
import type { BoundDeviceProfile, Schedule } from '../types/rollbook';
import { getKSTDateString } from '../utils/date';

describe('TodayTab Component', () => {
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
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${todayStr}T18:00:00+09:00`));
    resetStorage();
    vi.spyOn(sheetsService, 'sendToGoogleSheet').mockResolvedValue({ success: true });
    await cleanupTestSchedules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Scenario 1: Single schedule
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
      <TodayTab
        profile={mockProfile}
        onOpenQRScanner={() => {}}
        onOpenRSVP={() => {}}
        onNavigateToCalendar={() => {}}
      />
    );

    expect(html).toContain('단일 정기연습');
    // Carousel navigation bar should NOT be rendered when count <= 1
    expect(html).not.toContain('이전 일정 보기');
    expect(html).not.toContain('다음 일정 보기');
  });

  // Scenario 2: Multiple schedules
  it('renders carousel switcher bar when multiple active/upcoming schedules exist for today', async () => {
    const sch1: Schedule = {
      id: 'sch_test_multi_1',
      title: '저녁 파트연습',
      category: '추가연습',
      date: todayStr,
      startTime: '22:00',
      endTime: '23:00',
      locationName: '제1연습실',
      targetLat: 37.5665,
      targetLon: 126.978,
      radiusMeters: 100,
    };

    const sch2: Schedule = {
      id: 'sch_test_multi_2',
      title: '심야 전체연습',
      category: '정기연습',
      date: todayStr,
      startTime: '23:00',
      endTime: '23:59',
      locationName: '제1연습실',
      targetLat: 37.5665,
      targetLon: 126.978,
      radiusMeters: 100,
    };

    await sheetsService.addSchedule(sch1);
    await sheetsService.addSchedule(sch2);

    const html = renderToString(
      <TodayTab
        profile={mockProfile}
        onOpenQRScanner={() => {}}
        onOpenRSVP={() => {}}
        onNavigateToCalendar={() => {}}
      />
    );

    // Multi-schedule switcher bar should render
    expect(html).toContain('이전 일정 보기');
    expect(html).toContain('다음 일정 보기');
    expect(html).toMatch(/1<!-- -->\/<!-- -->2/);
    expect(html).toContain('저녁 파트연습');
  });

  // Scenario 3: Concluded schedule hidden, upcoming displayed
  it('hides already concluded schedule on today and displays only upcoming/open schedule', async () => {
    // schClosed was at 00:00~01:00 (already closed at 18:00)
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
      <TodayTab
        profile={mockProfile}
        onOpenQRScanner={() => {}}
        onOpenRSVP={() => {}}
        onNavigateToCalendar={() => {}}
      />
    );

    expect(html).toContain('야간 총연습 (예정)');
    expect(html).not.toContain('새벽 특훈 (종료)');
  });

  // Scenario 4: Admin manually marked absent (Spec §2-3 wording: 운영진 확인: 결석)
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
      <TodayTab
        profile={mockProfile}
        onOpenQRScanner={() => {}}
        onOpenRSVP={() => {}}
        onNavigateToCalendar={() => {}}
      />
    );

    expect(html).not.toContain('출석 완료');
    expect(html).toContain('운영진 확인: 결석');
  });

  // Scenario 5: Does not fall back to past schedule when today has no schedule (Spec §2-3 wording: 예정된 일정이 없습니다)
  it('does NOT fall back to past schedule when today has no schedule', async () => {
    const pastSch: Schedule = {
      id: 'sch_test_past_only',
      title: '경찰의날 녹음 (과거)',
      category: '녹음',
      date: '2026-10-16',
      startTime: '21:00',
      endTime: '22:00',
      locationName: '10월 16일 테스트 장소',
      targetLat: 37.5665,
      targetLon: 126.978,
      radiusMeters: 100,
    };
    await sheetsService.addSchedule(pastSch);

    const html = renderToString(
      <TodayTab
        profile={mockProfile}
        onOpenQRScanner={() => {}}
        onOpenRSVP={() => {}}
        onNavigateToCalendar={() => {}}
      />
    );

    expect(html).not.toContain('경찰의날 녹음 (과거)');
    expect(html).toContain('예정된 일정이 없습니다');
  });

  // Scenario 6: Counts a member who checked in without voting as checked in (Spec §2-3: 현재 N명 출석)
  it('counts a member who checked in without voting in the checked in tally', async () => {
    // Current time at 18:35, schedule at 19:30 (check-in window is OPEN since 18:30)
    vi.setSystemTime(new Date(`${todayStr}T18:35:00+09:00`));

    const schedule: Schedule = {
      id: 'sch_test_onsite',
      title: '현장 출석 확인 연습',
      category: '정기연습',
      date: todayStr,
      startTime: '19:30',
      endTime: '21:30',
      locationName: '문콰이어 제1연습실',
      targetLat: 37.5665,
      targetLon: 126.978,
      radiusMeters: 100,
    };
    sheetsService.seedTestData({});
    await sheetsService.addSchedule(schedule);

    const other = sheetsService
      .getMembers()
      .find((m) => m.id !== mockProfile.memberId && m.status === 'ACTIVE');
    expect(other).toBeDefined();

    await sheetsService.addCheckInLog({
      id: 'log_test_onsite',
      timestamp: `${todayStr}T18:32:00`,
      scheduleId: schedule.id,
      memberId: other!.id,
      memberName: other!.name,
      part: other!.part,
      authMethod: 'MANUAL_BY_ADMIN',
      isVerifiedLocation: true,
      adminNote: '테스트 현장 출석',
    });

    const html = renderToString(
      <TodayTab
        profile={mockProfile}
        onOpenQRScanner={() => {}}
        onOpenRSVP={() => {}}
        onNavigateToCalendar={() => {}}
      />
    ).replace(/<!-- -->/g, '');

    // Spec §2-3 replaces old tally bar with "현재 N명 출석 (HH:mm 기준)"
    expect(html).toContain('현재 1명 출석');
  });

  // New P1-07 Test: CTA states rendering (RSVP_NEW, CHECKIN_OPEN, ATTENDED, CANCELLED)
  describe('P1-07 CTA States Rendering', () => {
    it('renders RSVP_NEW state (참석 투표하기) when before cutoff', async () => {
      // 17:00 KST, schedule at 19:30 (cutoff at 18:30, so RSVP is open)
      vi.setSystemTime(new Date(`${todayStr}T17:00:00+09:00`));
      const sch: Schedule = {
        id: 'sch_test_cta_rsvp',
        title: '투표 예정 연습',
        category: '정기연습',
        date: todayStr,
        startTime: '19:30',
        endTime: '21:30',
        locationName: '제1연습실',
      };
      await sheetsService.addSchedule(sch);

      const html = renderToString(
        <TodayTab
          profile={mockProfile}
          onOpenQRScanner={() => {}}
          onOpenRSVP={() => {}}
          onNavigateToCalendar={() => {}}
        />
      );

      expect(html).toContain('참석 투표하기');
    });

    it('renders CHECKIN_OPEN state (QR 찍기 / PIN 출석) when checkin window opens', async () => {
      // 18:40 KST, schedule at 19:30 (window open since 18:30)
      vi.setSystemTime(new Date(`${todayStr}T18:40:00+09:00`));
      const sch: Schedule = {
        id: 'sch_test_cta_checkin',
        title: '출석 창 열린 연습',
        category: '정기연습',
        date: todayStr,
        startTime: '19:30',
        endTime: '21:30',
        locationName: '제1연습실',
      };
      await sheetsService.addSchedule(sch);

      const html = renderToString(
        <TodayTab
          profile={mockProfile}
          onOpenQRScanner={() => {}}
          onOpenRSVP={() => {}}
          onNavigateToCalendar={() => {}}
        />
      );

      expect(html).toContain('QR 찍기 / PIN 출석');
    });

    it('renders ATTENDED state as text without checkin button', async () => {
      // 19:35 KST, user checked in at 19:24
      vi.setSystemTime(new Date(`${todayStr}T19:35:00+09:00`));
      const sch: Schedule = {
        id: 'sch_test_cta_attended',
        title: '출석 완료된 연습',
        category: '정기연습',
        date: todayStr,
        startTime: '19:30',
        endTime: '21:30',
        locationName: '제1연습실',
      };
      await sheetsService.addSchedule(sch);
      await sheetsService.addCheckInLog({
        id: 'log_attended',
        scheduleId: sch.id,
        memberId: mockProfile.memberId,
        memberName: mockProfile.name,
        part: mockProfile.part,
        timestamp: `${todayStr}T19:24:00`,
        authMethod: 'QR_WEB_CAM',
        isVerifiedLocation: true,
      });

      const html = renderToString(
        <TodayTab
          profile={mockProfile}
          onOpenQRScanner={() => {}}
          onOpenRSVP={() => {}}
          onNavigateToCalendar={() => {}}
        />
      );

      expect(html).toContain('출석 완료 19:24');
      // No re-checkin button (Spec §2-3)
      expect(html).not.toContain('다시 출석 체크하기');
    });

    it('excludes cancelled schedule from focus and displays empty state', async () => {
      const sch: Schedule = {
        id: 'sch_test_cancelled',
        title: '취소된 연습',
        category: '정기연습',
        date: todayStr,
        startTime: '19:30',
        endTime: '21:30',
        locationName: '제1연습실',
        isCancelled: true,
      };
      await sheetsService.addSchedule(sch);

      const html = renderToString(
        <TodayTab
          profile={mockProfile}
          onOpenQRScanner={() => {}}
          onOpenRSVP={() => {}}
          onNavigateToCalendar={() => {}}
        />
      );

      expect(html).toContain('예정된 일정이 없습니다');
    });
  });

  // Zero Emojis Check
  it('contains zero emojis in rendered HTML', async () => {
    const sch: Schedule = {
      id: 'sch_test_no_emoji',
      title: '클린 UI 정기연습',
      category: '정기연습',
      date: todayStr,
      startTime: '19:30',
      endTime: '21:30',
      locationName: '서초 연습실',
    };
    await sheetsService.addSchedule(sch);

    const html = renderToString(
      <TodayTab
        profile={mockProfile}
        onOpenQRScanner={() => {}}
        onOpenRSVP={() => {}}
        onNavigateToCalendar={() => {}}
      />
    );

    const emojiRegex = /\p{Extended_Pictographic}/u;
    expect(html).not.toMatch(emojiRegex);
  });
});
