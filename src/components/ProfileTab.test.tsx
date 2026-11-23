import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ProfileTab } from './ProfileTab';
import { sheetsService } from '../services/sheets';
import type { BoundDeviceProfile, Member, Schedule } from '../types/rollbook';
import { LevelLineageSheet } from './profile/LevelLineageSheet';
import { AttendanceRecordSheet } from './profile/AttendanceRecordSheet';
import { computeMemberLevel } from '../utils/memberProgress';

describe('ProfileTab Component (Spec §5-1 ~ §5-4, §5-7, V3-11)', () => {
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

  const teacherMember: Member = {
    id: 'mem_teacher',
    name: '박선생',
    part: '반주',
    phoneLast4: '9999',
    role: 'MEMBER',
    status: 'ACTIVE',
    createdAt: '2025-01-01T00:00:00Z',
    joinedAt: '2025-01-01',
    memberStatus: '선생님',
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

  it('renders member profile, 2 hero cards (level & ring), 3 number cards, passion temp, and stickers preview', () => {
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

    // 1. Profile line
    expect(html).toContain('김단원');
    expect(html).toContain('Soprano');

    // 2. Hero cards (Level & Donut Ring)
    expect(html).toContain('내 레벨');
    expect(html).toContain('Lv.1');
    expect(html).toContain('새내기 Soprano');
    expect(html).toContain('Lv.2까지 10회');

    // 3. Three Number Cards
    expect(html).toContain('함께한 날');
    expect(html).toContain('연습');
    expect(html).toContain('공연');

    // 4. Passion Temperature Card (1 unexcused absence -> 36.5 - 0.40 = 36.1°C)
    expect(html).toContain('열정 온도');
    expect(html).toContain('36.1°C');

    // 5. Praise Stickers Preview (24 stickers for member)
    expect(html).toContain('칭찬 스티커');
    expect(html).toContain('0 / 24');

    // 6. Settings section
    expect(html).toContain('화면 표시 모드');
    expect(html).toContain('다크 모드');
    expect(html).toContain('앱처럼 설치하기');
    expect(html).toContain('브라우저 저장 단원 바꾸기');
    expect(html).toContain('로그아웃');
    expect(html).not.toContain('구글 시트 최신 데이터와 동기화');
    expect(html).not.toContain('운영진 모드로 전환');
  });

  it('renders staff title card and hides level/ring/temperature DOM elements when isActivityStaff is true (Spec §5-7, V26)', () => {
    vi.spyOn(sheetsService, 'getMembers').mockReturnValue([teacherMember]);

    const teacherProfile: BoundDeviceProfile = {
      memberId: 'mem_teacher',
      name: '박선생',
      part: '반주',
      phoneLast4: '9999',
      boundAt: '2025-01-01T00:00:00Z',
    };

    const html = renderToString(
      <ProfileTab
        profile={teacherProfile}
        displayMode="AUTO"
        isDarkMode={false}
        onChangeDisplayMode={vi.fn()}
        onChangeDarkMode={vi.fn()}
        onChangeBinding={vi.fn()}
      />
    );

    // Staff Card
    expect(html).toContain('박선생 선생님');
    expect(html).toContain('함께한 지');
    expect(html).toContain('출석 기록');

    // Praise Stickers Preview (8 stickers for staff, earned 1y anniversary sticker)
    expect(html).toContain('1 / 8');

    // Must NOT contain Level Card, Ring, or Temperature Card
    expect(html).not.toContain('내 레벨');
    expect(html).not.toContain('Lv.1');
    expect(html).not.toContain('새내기');
    expect(html).not.toContain('출석률');
    expect(html).not.toContain('열정 온도');
  });

  it('keeps admin mode controls out of the member settings list', () => {
    const ordinaryHtml = renderToString(
      <ProfileTab
        profile={mockProfile}
        displayMode="AUTO"
        isDarkMode={false}
        onChangeDisplayMode={vi.fn()}
        onChangeDarkMode={vi.fn()}
        onChangeBinding={vi.fn()}
      />
    );
    expect(ordinaryHtml).not.toContain('운영진 모드로 전환');
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

  it('renders LevelLineageSheet with current tier and 6 tiers list (Spec §5-3)', () => {
    const levelInfo = computeMemberLevel(15, 'Tenor');
    const html = renderToString(
      <LevelLineageSheet
        levelInfo={levelInfo}
        part="Tenor"
        onClose={vi.fn()}
      />
    );

    expect(html).toContain('내 레벨 계보');
    expect(html).toContain('Lv.2 첫걸음 Tenor');
    expect(html).toContain('Lv.3까지 5회');
    expect(html).toContain('달성');
    expect(html).toContain('지금');
    expect(html).toContain('문콰이어의 목소리');
  });

  it('renders AttendanceRecordSheet with 4 status toggles and 3 period chips (Spec §5-4)', () => {
    const html = renderToString(
      <AttendanceRecordSheet
        records={[]}
        onClose={vi.fn()}
      />
    );

    expect(html).toContain('출석 기록');
    expect(html).toContain('출석');
    expect(html).toContain('지각');
    expect(html).toContain('사유 결석');
    expect(html).toContain('결석');
    expect(html).toContain('최근 3개월');
    expect(html).toContain('올해');
    expect(html).toContain('전체');
    expect(html).toContain('선택한 조건의 출결 기록이 없어요');
  });
});
