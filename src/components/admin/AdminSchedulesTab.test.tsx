import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { AdminSchedulesTab, type AdminSchedulesTabProps } from './AdminSchedulesTab';
import type { AppConfig, LocationPreset, Member, Schedule } from '../../types/rollbook';

const mockConfig: AppConfig = {
  choirName: '테스트 합창단',
  rehearsalDay: '월요일',
  startTime: '19:30',
  defaultLat: 37.5,
  defaultLon: 127.0,
  defaultRadius: 100,
  sheetsWebAppUrl: 'https://script.google.com/macros/s/test/exec',
  lateGraceMinutes: 10,
  adminPin: '1234',
  qrPrintTitle: '테스트 QR 타이틀',
  qrPrintSubtitle: '합창단 연습실',
  qrPrintNotice: 'QR을 스캔해 주세요',
};

const mockLocationPresets: LocationPreset[] = [
  {
    id: 'loc-1',
    name: '중앙 연습실',
    address: '서울시 서초구',
    latitude: 37.5,
    longitude: 127.0,
    radiusMeters: 100,
  },
];

const mockSchedules: Schedule[] = [
  {
    id: 'sch-1',
    title: '정기연습 1회차',
    date: '2026-10-18',
    startTime: '19:30',
    endTime: '21:30',
    locationName: '중앙 연습실',
    category: '정기연습',
    checkInPin: '1234',
  },
];

const mockMembers: Member[] = [
  {
    id: 'mem-1',
    name: '김테스트',
    part: '소프라노',
    role: 'MEMBER',
    status: 'ACTIVE',
    phoneLast4: '1234',
    createdAt: '2026-01-01T00:00:00Z',
  },
];

function createMockProps(overrides: Partial<AdminSchedulesTabProps> = {}): AdminSchedulesTabProps {
  return {
    schedules: mockSchedules,
    programCards: [],
    locationPresets: mockLocationPresets,
    members: mockMembers,
    defaultLocName: '중앙 연습실',
    config: mockConfig,
    activeQrPayload: 'CHOIR_QR:TEST_TOKEN',
    dynamicParts: ['소프라노', '알토', '테너', '베이스'],
    dynamicCategories: ['정기연습', '추가연습', '연주회'],
    onDataChanged: vi.fn(),

    rightPanelMode: 'SCHEDULE_FORM',
    setRightPanelMode: vi.fn(),
    editingScheduleForForm: null,
    setEditingScheduleForForm: vi.fn(),
    editingProgramCard: null,
    setEditingProgramCard: vi.fn(),
    selectedProgramCardId: null,
    scheduleSuccessMsg: '',
    setScheduleSuccessMsg: vi.fn(),
    scheduleViewTab: 'CALENDAR',
    setScheduleViewTab: vi.fn(),
    selectedBatchScheduleIds: [],
    setSelectedBatchScheduleIds: vi.fn(),
    setIsBatchScheduleEditModalOpen: vi.fn(),
    handleOpenCreateProgramCard: vi.fn(),
    handleOpenEditProgramCard: vi.fn(),
    handleBindScheduleToForm: vi.fn(),
    handleCloneScheduleToForm: vi.fn(),
    handleSaveScheduleFromForm: vi.fn(),
    handleSaveProgramCard: vi.fn(),
    handleDeleteScheduleSingle: vi.fn(),
    handleDeleteScheduleSeries: vi.fn(),
    handleRestoreScheduleSingle: vi.fn(),
    handleDeleteSchedule: vi.fn(),
    handleApplyBatchScheduleUpdates: vi.fn(),
    handleBatchDeleteSelected: vi.fn(),
    handleToggleSelectSchedule: vi.fn(),
    handleSelectAllSchedules: vi.fn(),
    handleToggleArchiveSchedule: vi.fn(),
    handleBatchArchiveSelected: vi.fn(),
    handleToggleArchiveGroup: vi.fn(),
    handleDuplicateSelectedSeries: vi.fn(),
    setCardGroupToDelete: vi.fn(),
    showArchivedSchedules: false,
    setShowArchivedSchedules: vi.fn(),
    setIsScheduleLocationModalOpen: vi.fn(),

    selectedScheduleId: 'sch-1',
    setSelectedScheduleId: vi.fn(),
    currentSchedule: mockSchedules[0],
    reconciledList: [
      {
        memberId: 'mem-1',
        memberName: '김테스트',
        part: '소프라노',
        finalStatus: '출석',
        authMethod: 'QR_WEB_CAM',
        checkInTime: '2026-10-18T19:25:00',
        distanceMeters: 12,
        isManualOverride: false,
        rsvpStatus: 'ATTEND',
      },
    ],
    sessionFilter: '전체',
    setSessionFilter: vi.fn(),
    filteredSessionList: [
      {
        memberId: 'mem-1',
        memberName: '김테스트',
        part: '소프라노',
        finalStatus: '출석',
        authMethod: 'QR_WEB_CAM',
        checkInTime: '2026-10-18T19:25:00',
        distanceMeters: 12,
        isManualOverride: false,
        rsvpStatus: 'ATTEND',
      },
    ],
    setOverrideTarget: vi.fn(),

    handleRefreshMasterQR: vi.fn(),
    handleRegenSessionPin: vi.fn(),
    pinRegenMsg: '',
    ...overrides,
  };
}

describe('AdminSchedulesTab Component', () => {
  it('renders unified subsegment pill bar', () => {
    const props = createMockProps();
    const html = renderToString(<AdminSchedulesTab {...props} />);

    expect(html).toContain('캘린더');
    expect(html).toContain('일정');
    expect(html).toContain('카드');
    expect(html).toContain('QR');
    expect(html).toContain('출결');
    expect(html).toContain('+ 일정 등록');
  });

  it('renders calendar view when scheduleViewTab is CALENDAR', () => {
    const props = createMockProps({ scheduleViewTab: 'CALENDAR' });
    const html = renderToString(<AdminSchedulesTab {...props} />);

    expect(html).toContain('캘린더');
    expect(html).toContain('+ 일정 추가');
  });

  it('renders list view when scheduleViewTab is ALL_LIST', () => {
    const props = createMockProps({ scheduleViewTab: 'ALL_LIST' });
    const html = renderToString(<AdminSchedulesTab {...props} />);

    expect(html).toContain('전체 구분');
  });

  it('renders card view when scheduleViewTab is PROGRAM_CARDS (only registered cards, no unclassified single schedules)', () => {
    const props = createMockProps({
      scheduleViewTab: 'PROGRAM_CARDS',
      programCards: [
        {
          id: 'card-1',
          title: '2026 정기연습 카드',
          category: '정기연습',
          createdAt: '2026-10-01T00:00:00Z',
        },
      ],
    });
    const html = renderToString(<AdminSchedulesTab {...props} />);

    expect(html).toContain('+ 카드 등록');
    expect(html).toContain('2026 정기연습 카드');
    // Unclassified single schedule (mockSchedules[0] without programId) must NOT appear as a card
    expect(html).not.toContain('정기연습 1회차');
  });
});
