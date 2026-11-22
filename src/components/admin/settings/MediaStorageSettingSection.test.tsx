import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MediaStorageSettingSection } from './MediaStorageSettingSection';
import { sheetsService } from '../../../services/sheets';
import type { AppConfig } from '../../../types/rollbook';

describe('MediaStorageSettingSection (V3-16)', () => {
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
    mediaPublicBaseUrl: 'https://media.moonchoir.org',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders input with current mediaPublicBaseUrl', () => {
    const html = renderToString(<MediaStorageSettingSection config={dummyConfig} />);
    expect(html).toContain('파일 저장소 주소 설정');
    expect(html).toContain('https://media.moonchoir.org');
  });

  it('validates URL format and strips trailing slashes', async () => {
    const saveSpy = vi.spyOn(sheetsService, 'saveConfigConfirmed').mockResolvedValue(dummyConfig);

    const input = 'https://media.moonchoir.org///';
    const cleaned = input.trim().replace(/\/+$/, '');
    expect(cleaned).toBe('https://media.moonchoir.org');

    await sheetsService.saveConfigConfirmed({ mediaPublicBaseUrl: cleaned });
    expect(saveSpy).toHaveBeenCalledWith({ mediaPublicBaseUrl: 'https://media.moonchoir.org' });
  });

  it('rejects insecure http:// URLs', () => {
    const insecureUrl = 'http://media.moonchoir.org';
    expect(insecureUrl.startsWith('https://')).toBe(false);
  });
});
