import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { AdminSettingsTab, type AdminSettingsTabProps } from './AdminSettingsTab';
import { sheetsService } from '../../services/sheets';
import type { AppConfig, LocationPreset } from '../../types/rollbook';

vi.mock('../LocationPickerMap', () => ({
  LocationPickerMap: () => <div data-testid="mock-location-picker-map">Mock Map</div>,
}));

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
  qrPrintTitle: '테스트 QR',
  qrPrintSubtitle: '연습실',
  qrPrintNotice: '스캔 요망',
};

const mockLocations: LocationPreset[] = [
  {
    id: 'loc-1',
    name: '메인 연습실',
    address: '서울시 서초구',
    latitude: 37.5,
    longitude: 127.0,
    radiusMeters: 100,
    isDefault: true,
  },
];

function createMockProps(overrides: Partial<AdminSettingsTabProps> = {}): AdminSettingsTabProps {
  return {
    config: mockConfig,
    locationPresets: mockLocations,
    dynamicParts: ['소프라노', '알토', '테너', '베이스'],
    dynamicMemberStatuses: ['정단원', '준단원'],
    dynamicCategories: ['정기연습', '추가연습'],
    onDataChanged: vi.fn(),
    ...overrides,
  };
}

describe('AdminSettingsTab Component', () => {
  it('renders subsegment pill bar with 3 tabs', () => {
    const props = createMockProps();
    const html = renderToString(<AdminSettingsTab {...props} />);

    expect(html).toContain('admin-settings-layout');
    expect(html).toContain('admin-settings-nav');
    expect(html).toContain('시트 연동');
    expect(html).toContain('장소 관리');
    expect(html).toContain('태그 관리');
  });

  it('renders sheets settings by default', () => {
    const props = createMockProps();
    const html = renderToString(<AdminSettingsTab {...props} />);

    expect(html).toContain('시트 연동');
    expect(html).toContain('Google Sheets 보조 백업 및 내보내기');
    expect(html).toContain('필요 시 Google Sheets로 데이터를 백업하거나 수동 동기화할 수 있습니다.');
    expect(html).toContain('Google Apps Script Web App URL');
    expect(html).toContain('지각 유예 (분)');
    expect(html).toContain('관리자 PIN');
  });

  it('renders Supabase cloud status card when backend is supabase', () => {
    const originalKind = sheetsService.getBackendKind();
    vi.spyOn(sheetsService, 'getBackendKind').mockReturnValue('supabase');

    const props = createMockProps();
    const html = renderToString(<AdminSettingsTab {...props} />);

    expect(html).toContain('🟢 Supabase 클라우드 실시간 연동 활성화');
    expect(html).toContain('실시간 WebSocket 채널 및 원자적 DB 트랜잭션이 작동 중입니다.');
    expect(html).toContain('클라우드 최신 데이터 즉시 수신');

    vi.spyOn(sheetsService, 'getBackendKind').mockReturnValue(originalKind);
  });

  it('renders location preset preview within sheets subtab', () => {
    const props = createMockProps();
    const html = renderToString(<AdminSettingsTab {...props} />);

    expect(html).toContain('등록된 장소');
    expect(html).toContain('메인 연습실');
  });
});
