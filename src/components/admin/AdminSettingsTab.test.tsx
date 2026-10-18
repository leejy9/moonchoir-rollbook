import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { AdminSettingsTab, type AdminSettingsTabProps } from './AdminSettingsTab';
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

    expect(html).toContain('구글 스프레드시트 연동');
    expect(html).toContain('연습실 장소 (GPS 반경)');
    expect(html).toContain('파트 &amp; 태그 설정');
  });

  it('renders sheets settings by default', () => {
    const props = createMockProps();
    const html = renderToString(<AdminSettingsTab {...props} />);

    expect(html).toContain('스마트 출결 시스템 환경설정');
    expect(html).toContain('Google Apps Script Web App URL');
    expect(html).toContain('지각 유예 기준 (분)');
    expect(html).toContain('관리자 마스터 PIN 번호');
  });

  it('renders location preset preview within sheets subtab', () => {
    const props = createMockProps();
    const html = renderToString(<AdminSettingsTab {...props} />);

    expect(html).toContain('등록된 연습실 장소 프리셋');
    expect(html).toContain('메인 연습실');
  });
});
