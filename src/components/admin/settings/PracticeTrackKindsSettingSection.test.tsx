import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { PracticeTrackKindsSettingSection } from './PracticeTrackKindsSettingSection';
import { sheetsService } from '../../../services/sheets';
import type { AppConfig } from '../../../types/rollbook';
import { normalizeAppConfig } from '../../../services/configNormalize';

describe('PracticeTrackKindsSettingSection (V3-16)', () => {
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
    practiceTrackKinds: ['가이드', '파트음원', 'MR', '참고영상'],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders configured track kinds in order', () => {
    const rawHtml = renderToString(<PracticeTrackKindsSettingSection config={dummyConfig} />);
    const html = rawHtml.replace(/<!-- -->/g, '');
    expect(html).toContain('연습곡 트랙 종류 관리');
    expect(html).toContain('1. 가이드');
    expect(html).toContain('2. 파트음원');
    expect(html).toContain('3. MR');
    expect(html).toContain('4. 참고영상');
  });

  it('saves practiceTrackKinds as JSON string and parser restores as array', async () => {
    const saveSpy = vi.spyOn(sheetsService, 'saveConfigConfirmed').mockResolvedValue(dummyConfig);

    const kindsToSave = ['소프라노', '알토', '테너', '베이스'];
    const serialized = JSON.stringify(kindsToSave);

    await sheetsService.saveConfigConfirmed({ practiceTrackKinds: serialized as any });
    expect(saveSpy).toHaveBeenCalledWith({ practiceTrackKinds: serialized });

    // Verify parser restores JSON string to string[]
    const normalized = normalizeAppConfig({ practiceTrackKinds: serialized });
    expect(normalized.practiceTrackKinds).toEqual(kindsToSave);
  });
});
