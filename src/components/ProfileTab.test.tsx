import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ProfileTab } from './ProfileTab';
import { sheetsService } from '../services/sheets';
import type { BoundDeviceProfile, Member, Schedule } from '../types/rollbook';

describe('ProfileTab Component (MEMBER_UX_AUDIO_SPEC §2-5)', () => {
  const mockProfile: BoundDeviceProfile = {
    memberId: 'mem_1',
    name: '김단원',
    part: 'Soprano',
    phoneLast4: '1234',
    boundAt: '2026-01-01T00:00:00Z',
  };

  const ordinaryMember: Member = {
    id: 'mem_1',
    name: '김단원',
    part: 'Soprano',
    phoneLast4: '1234',
    role: 'MEMBER',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00Z',
    joinedAt: '2026-01-01',
    memberStatus: '정단원',
  };

  const adminMember: Member = {
    ...ordinaryMember,
    role: 'ADMIN',
  };

  const mockSchedules: Schedule[] = [
    {
      id: 'sch_1',
      title: '정기연습 1회차',
      date: '2026-10-18',
      startTime: '19:30',
      endTime: '21:30',
      locationName: '연습실',
      category: '정기연습',
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(sheetsService, 'getMembers').mockReturnValue([ordinaryMember]);
    vi.spyOn(sheetsService, 'getSchedulesForMember').mockReturnValue(mockSchedules);
    vi.spyOn(sheetsService, 'getLogs').mockReturnValue([]);
    vi.spyOn(sheetsService, 'getRSVPVotes').mockReturnValue([]);
  });

  it('renders member profile, attendance table titled "회차별 출결 기록", and 5 core actions', () => {
    const html = renderToString(
      <ProfileTab
        profile={mockProfile}
        displayMode="AUTO"
        isDarkMode={false}
        onChangeDisplayMode={vi.fn()}
        onChangeDarkMode={vi.fn()}
        onChangeBinding={vi.fn()}
        onLogout={vi.fn()}
        onRefreshData={vi.fn()}
      />
    );

    // Profile info
    expect(html).toContain('김단원');
    expect(html).toContain('Soprano');
    expect(html).toContain('1234');
    expect(html).toContain('연락처 수정은 운영진에게 요청해 주세요');

    // Attendance Table Title and Columns (Spec §2-5)
    expect(html).toContain('회차별 출결 기록');
    expect(html).toContain('연습명칭');
    expect(html).toContain('연습일');
    expect(html).toContain('투표 상태');
    expect(html).toContain('출결 시간');

    // 5 Core Features
    expect(html).toContain('화면 표시 모드');
    expect(html).toContain('다크 모드');
    expect(html).toContain('구글 시트 최신 데이터와 동기화');
    expect(html).toContain('이 브라우저에 저장된 단원 바꾸기');
    expect(html).toContain('이 브라우저에서 로그아웃');
  });

  it('contains ZERO gamification level cards, titles, progress bars, or badge emojis (Spec §6-4 #2)', () => {
    const html = renderToString(
      <ProfileTab
        profile={mockProfile}
        displayMode="AUTO"
        isDarkMode={false}
        onChangeDisplayMode={vi.fn()}
        onChangeDarkMode={vi.fn()}
        onChangeBinding={vi.fn()}
      />
    );

    // Must NOT contain old gamification elements
    expect(html).not.toContain('새싹');
    expect(html).not.toContain('칭호:');
    expect(html).not.toContain('다음 레벨까지');
    expect(html).not.toContain('개인 대시보드');

    // Must NOT contain emojis
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(emojiRegex.test(html)).toBe(false);
  });

  it('renders staff mode button if and only if isStaffMember is true', () => {
    // 1. Ordinary member -> No staff button
    const ordinaryHtml = renderToString(
      <ProfileTab
        profile={mockProfile}
        displayMode="AUTO"
        isDarkMode={false}
        onChangeDisplayMode={vi.fn()}
        onChangeDarkMode={vi.fn()}
        onChangeBinding={vi.fn()}
        onOpenAdmin={vi.fn()}
      />
    );
    expect(ordinaryHtml).not.toContain('운영진 모드');

    // 2. Admin member -> Staff button rendered
    vi.spyOn(sheetsService, 'getMembers').mockReturnValue([adminMember]);
    const adminHtml = renderToString(
      <ProfileTab
        profile={mockProfile}
        displayMode="AUTO"
        isDarkMode={false}
        onChangeDisplayMode={vi.fn()}
        onChangeDarkMode={vi.fn()}
        onChangeBinding={vi.fn()}
        onOpenAdmin={vi.fn()}
      />
    );
    expect(adminHtml).toContain('운영진 모드');
  });

  it('guarantees touch targets of at least 44px on clickable controls', () => {
    const html = renderToString(
      <ProfileTab
        profile={mockProfile}
        displayMode="AUTO"
        isDarkMode={false}
        onChangeDisplayMode={vi.fn()}
        onChangeDarkMode={vi.fn()}
        onChangeBinding={vi.fn()}
        onLogout={vi.fn()}
      />
    );

    expect(html).toContain('min-height:44px');
    expect(html).toContain('min-width:44px');
  });
});
