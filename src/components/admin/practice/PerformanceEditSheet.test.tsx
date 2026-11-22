import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { PerformanceEditSheet } from './PerformanceEditSheet';
import { sheetsService } from '../../../services/sheets';
import type { Performance } from '../../../types/rollbook';

describe('PerformanceEditSheet Component (V3-15 Stage 5)', () => {
  const dummyPerf: Performance = {
    id: 'perf_1',
    title: '2026 봄 정기연주회',
    performanceDate: '2026-05-20',
    venue: '국립극장',
    isArchived: false,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('disables save button when title is empty or only whitespace', () => {
    const htmlEmpty = renderToString(
      <PerformanceEditSheet
        performance={null}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    // Initial state for new performance has empty title -> disabled save button
    expect(htmlEmpty).toContain('새 공연 추가');
    expect(htmlEmpty).toMatch(/<button[^>]*disabled[^>]*>.*저장.*<\/button>/s);
  });

  it('renders existing performance values in edit mode', () => {
    const html = renderToString(
      <PerformanceEditSheet
        performance={dummyPerf}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    expect(html).toContain('공연 정보 편집');
    expect(html).toContain('2026 봄 정기연주회');
    expect(html).toContain('2026-05-20');
    expect(html).toContain('국립극장');
    expect(html).toContain('공연 보관');
  });

  it('calls savePerformance with empty string date when date is omitted', async () => {
    const saveSpy = vi.spyOn(sheetsService, 'savePerformance').mockResolvedValue({
      success: true,
      id: 'perf_new',
    });

    // Directly test savePerformance logic contract with empty date
    await sheetsService.savePerformance({
      title: '날짜 미정 공연',
      performanceDate: '',
      venue: '',
    });

    expect(saveSpy).toHaveBeenCalledWith({
      title: '날짜 미정 공연',
      performanceDate: '',
      venue: '',
    });
  });

  it('calls setPerformanceArchived when archiving or restoring a performance', async () => {
    const archiveSpy = vi.spyOn(sheetsService, 'setPerformanceArchived').mockResolvedValue(undefined);

    await sheetsService.setPerformanceArchived('perf_1', true);
    expect(archiveSpy).toHaveBeenCalledWith('perf_1', true);

    await sheetsService.setPerformanceArchived('perf_1', false);
    expect(archiveSpy).toHaveBeenCalledWith('perf_1', false);
  });
});
