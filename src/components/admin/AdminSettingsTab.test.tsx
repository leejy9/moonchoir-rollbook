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

describe('AdminSettingsTab Component (Notion Gallery & Drawers)', () => {
  it('renders subsegment pill bar with LOCATIONS and TAXONOMY tabs', () => {
    const props = createMockProps();
    const html = renderToString(<AdminSettingsTab {...props} />);

    expect(html).toContain('admin-settings-layout');
    expect(html).toContain('admin-settings-nav');
    expect(html).toContain('장소 관리');
    expect(html).toContain('태그 관리');
    // 시트 연동은 마스터 어드민으로 완전히 이관되어 일반 설정 탭에서 제거됨
    expect(html).not.toContain('시트 연동');
  });

  it('renders location notion gallery cards by default', () => {
    const props = createMockProps();
    const html = renderToString(<AdminSettingsTab {...props} />);

    expect(html).toContain('등록 장소 (1곳)');
    expect(html).toContain('새 장소 등록');
    expect(html).toContain('notion-gallery-card');
    expect(html).toContain('메인 연습실');
    expect(html).toContain('기본 연습실');
    expect(html).toContain('반경 100m');
    expect(html).toContain('서울시 서초구');
    expect(html).toContain('수정');
    expect(html).toContain('삭제');
  });

  it('renders empty gallery placeholder when there are no locations', () => {
    const props = createMockProps({ locationPresets: [] });
    const html = renderToString(<AdminSettingsTab {...props} />);

    expect(html).toContain('등록 장소 (0곳)');
    expect(html).toContain('등록된 장소가 없습니다.');
    expect(html).toContain('새 장소 등록');
  });
});
