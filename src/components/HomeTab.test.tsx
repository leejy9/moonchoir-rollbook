import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { HomeTab } from './HomeTab';
import { sheetsService } from '../services/sheets';
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

  it('renders month calendar, card row, upcoming list in that order with no week toggle', () => {
    const html = renderToString(
      <HomeTab
        profile={mockProfile}
        month="2099-12"
        onNavigate={() => {}}
        onOpenQRScanner={() => {}}
        onOpenRSVP={() => {}}
      />
    ).replace(/<!-- -->/g, '');

    expect(html).not.toContain('주간');
    expect(html).not.toContain('home-calendar-toggle');
    expect(html).not.toContain('최대 5개 표시');
    expect(html).toContain('2099년 12월');
    const cal = html.indexOf('aria-label="월간 달력"');
    const cards = html.indexOf('aria-label="오늘과 다음 일정"');
    const upcoming = html.indexOf('aria-label="다가오는 일정"');
    expect(cal).toBeGreaterThan(-1);
    expect(cards).toBeGreaterThan(cal);
    expect(upcoming).toBeGreaterThan(cards);
  });

  it('shows each schedule once: cards first, the rest in upcoming list', () => {
    const html = renderToString(
      <HomeTab
        profile={mockProfile}
        onNavigate={() => {}}
        onOpenQRScanner={() => {}}
        onOpenRSVP={() => {}}
      />
    );
    // 두 일정 모두 카드 묶음(최대 3장)에 들어가므로 목록 줄은 없고 빈 문구가 나온다
    expect(html).toContain('정기 연습 1');
    expect(html).toContain('특별 연주회');
    expect(html.match(/정기 연습 1/g)).toHaveLength(1);
    expect(html).toContain('예정된 일정이 없습니다.');
  });

  it('card 1 shows the voting button and the card corner label for today', () => {
    const today = new Date();
    const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(today);
    vi.spyOn(sheetsService, 'getSchedulesForMember').mockReturnValue([
      { ...mockSchedules[0], id: 'sch_today', date: dateStr, startTime: '23:00', endTime: '23:59' },
    ]);
    const html = renderToString(
      <HomeTab
        profile={mockProfile}
        onNavigate={() => {}}
        onOpenQRScanner={() => {}}
        onOpenRSVP={() => {}}
      />
    );
    expect(html).toContain('참석 투표하기');
    expect(html).toContain('home-card-corner is-warning');
    expect(html).toContain('투표 전');
    expect(html).toContain('첫 댓글을 남겨 보세요');
    expect(html).not.toContain('상세 보기');
  });

  describe('calendar check mark (V3-22: finalStatus는 한국어 값)', () => {
    const todayKst = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
    const renderWith = (finalStatus: string) => {
      vi.spyOn(sheetsService, 'getSchedulesForMember').mockReturnValue([
        { ...mockSchedules[0], id: 'sch_today', date: todayKst(), startTime: '00:00', endTime: '23:59' },
      ]);
      vi.spyOn(sheetsService, 'reconcileMemberAttendance').mockReturnValue({
        memberId: mockMember.id,
        memberName: mockMember.name,
        part: mockMember.part,
        scheduleId: 'sch_today',
        finalStatus,
      } as unknown as ReturnType<typeof sheetsService.reconcileMemberAttendance>);
      return renderToString(
        <HomeTab profile={mockProfile} onNavigate={() => {}} onOpenQRScanner={() => {}} onOpenRSVP={() => {}} />
      );
    };

    it('출석이면 날짜 칸에 체크', () => expect(renderWith('출석')).toContain('cell-check'));
    it('지각이면 체크', () => expect(renderWith('지각')).toContain('cell-check'));
    it('결석이면 체크 없음', () => expect(renderWith('결석')).not.toContain('cell-check'));
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
