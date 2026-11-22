import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { PerformanceCategoriesSettingSection } from './PerformanceCategoriesSettingSection';
import { sheetsService } from '../../../services/sheets';
import type { AppConfig } from '../../../types/rollbook';
import { normalizeAppConfig } from '../../../services/configNormalize';

describe('PerformanceCategoriesSettingSection (V3-16)', () => {
  const dummyConfig: AppConfig = {
    choirName: '문콰이어',
    rehearsalDay: '일요일',
    startTime: '19:30',
    defaultLat: 37.5,
    defaultLon: 127.0,
    defaultRadius: 100,
    sheetsWebAppUrl: 'https://script.google.com/macros/s/test/exec',
    lateGraceMinutes: 15,
    adminPin: '1234',
    performanceCategories: ['연주', '정기공연'],
  };

  const allCategories = ['정기연습', '추가연습', '연주', '정기공연', '녹음'];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders available options with checkmarks for selected ones', () => {
    const html = renderToString(
      <PerformanceCategoriesSettingSection config={dummyConfig} allCategories={allCategories} />
    );

    expect(html).toContain('공연 인정 일정 구분 설정');
    expect(html).toContain('✓ 연주');
    expect(html).toContain('✓ 정기공연');
    expect(html).toContain('정기연습');
  });

  it('saves performanceCategories as JSON string and parser restores as array', async () => {
    const saveSpy = vi.spyOn(sheetsService, 'saveConfigConfirmed').mockResolvedValue(dummyConfig);

    const categoriesToSave = ['연주', '특별공연'];
    const serialized = JSON.stringify(categoriesToSave);

    await sheetsService.saveConfigConfirmed({ performanceCategories: serialized as any });
    expect(saveSpy).toHaveBeenCalledWith({ performanceCategories: serialized });

    // Verify parser restores JSON string to string[]
    const normalized = normalizeAppConfig({ performanceCategories: serialized });
    expect(normalized.performanceCategories).toEqual(categoriesToSave);
  });
});
