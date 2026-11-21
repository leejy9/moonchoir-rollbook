import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { HomeTab } from './HomeTab';
import { sheetsService } from '../services/sheets';
import { PREFERENCE_KEYS, readPreference, writePreference } from '../services/sheetsStorage';
import type { BoundDeviceProfile, Member, Schedule } from '../types/rollbook';

describe('HomeTab Component (V3-03)', () => {
  const mockProfile: BoundDeviceProfile = {
    memberId: 'mem_home_1',
    name: '김단원',
    part: '소프라노',
    phoneLast4: '1234',
    boundAt: '2026-01-01T00:00:00Z',
  };

  const mockMember: Member = {
    id: 'mem_home_1',
    name: '김단원',
    part: '소프라노',
    phoneLast4: '1234',
    role: 'MEMBER',
    status: 'ACTIVE',
    joinedAt: '2026-01-01',
    createdAt: '2026-01-01T00:00:00Z',
  };

  const mockSchedules: Schedule[] = [
    {
      id: 'sch_upcoming_1',
      title: '정기 연습 1',
      category: '정기연습',
      date: '2099-12-01',
      startTime: '19:30',
      endTime: '21:30',
      locationName: '문콰이어 제1연습실',
    },
    {
      id: 'sch_upcoming_2',
      title: '특별 연주회',
      category: '연주/행사',
      date: '2099-12-05',
      startTime: '14:00',
      endTime: '17:00',
      locationName: '국립극장',
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    const store = new Map<string, string>();
    const mockStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    };
    vi.stubGlobal('window', { localStorage: mockStorage });
    vi.stubGlobal('localStorage', mockStorage);
    vi.spyOn(sheetsService, 'getSchedulesForMember').mockReturnValue(mockSchedules);
    vi.spyOn(sheetsService, 'getMembers').mockReturnValue([mockMember]);
    vi.spyOn(sheetsService, 'reconcileMemberAttendance').mockReturnValue(null);
    vi.spyOn(sheetsService, 'getRSVPVotes').mockReturnValue([]);
  });

  it('renders week calendar view by default and upcoming schedules section', () => {
    const html = renderToString(
      <HomeTab
        profile={mockProfile}
        onNavigate={() => {}}
        onOpenQRScanner={() => {}}
        onOpenRSVP={() => {}}
      />
    );

    // Header & toggle
    expect(html).toContain('주간');
    expect(html).toContain('월간');
    expect(html).toContain('aria-label="주간 달력"');

    // Upcoming schedules
    expect(html).toContain('다가오는 일정');
    expect(html).toContain('최대 5개 표시');
    expect(html).toContain('정기 연습 1');
    expect(html).toContain('특별 연주회');
  });

  it('renders month calendar view when preference is month', () => {
    writePreference(PREFERENCE_KEYS.HOME_CALENDAR_VIEW, 'month');

    const html = renderToString(
      <HomeTab
        profile={mockProfile}
        month="2026-12"
        onNavigate={() => {}}
        onOpenQRScanner={() => {}}
        onOpenRSVP={() => {}}
      />
    ).replace(/<!-- -->/g, '');

    expect(html).toContain('2026년 12월');
    expect(html).toContain('home-calendar-toggle');
  });

  it('persists home calendar view preference key correctly', () => {
    expect(readPreference(PREFERENCE_KEYS.HOME_CALENDAR_VIEW, (_v): _v is string => true, 'week')).toBe('week');
    writePreference(PREFERENCE_KEYS.HOME_CALENDAR_VIEW, 'month');
    expect(readPreference(PREFERENCE_KEYS.HOME_CALENDAR_VIEW, (_v): _v is string => true, 'week')).toBe('month');
  });

  it('contains NO emoji characters in HomeTab output (anti-slop rule)', () => {
    const html = renderToString(
      <HomeTab
        profile={mockProfile}
        onNavigate={() => {}}
        onOpenQRScanner={() => {}}
        onOpenRSVP={() => {}}
      />
    );
    const emojiRegex = /\p{Extended_Pictographic}/u;
    expect(emojiRegex.test(html)).toBe(false);
  });
});
