import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  executeDeletePracticePiece,
  executeDeletePracticeTrack,
  executeDeletePerformance,
} from './deleteFlow';
import { sheetsService } from '../sheets';
import * as workerClient from '../media/workerClient';

describe('deleteFlow (J4)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('곡 삭제 순서: DB RPC -> Worker deleteObject -> refreshPracticeCatalog', async () => {
    const callOrder: string[] = [];

    vi.spyOn(sheetsService, 'deletePracticePiece').mockImplementation(async (id: string) => {
      callOrder.push(`db_delete_piece_${id}`);
      return { success: true, storageKeys: ['2026/score/p1.pdf', '2026/audio/t1.m4a'] };
    });

    const deleteObjectSpy = vi.spyOn(workerClient, 'deleteObject').mockImplementation(async (key: string) => {
      callOrder.push(`r2_delete_${key}`);
    });

    vi.spyOn(sheetsService, 'refreshPracticeCatalog').mockImplementation(async () => {
      callOrder.push('refresh_catalog');
      return {} as any;
    });

    const onDone = vi.fn(() => {
      callOrder.push('onDone');
    });

    await executeDeletePracticePiece('piece_123', { baseUrl: 'https://media.test.com', onDone });

    expect(callOrder).toEqual([
      'db_delete_piece_piece_123',
      'r2_delete_2026/score/p1.pdf',
      'r2_delete_2026/audio/t1.m4a',
      'refresh_catalog',
      'onDone',
    ]);
    expect(deleteObjectSpy).toHaveBeenCalledTimes(2);
  });

  it('파일 삭제가 실패해도(Worker 에러) 성공 처리되고 카탈로그를 갱신한다', async () => {
    vi.spyOn(sheetsService, 'deletePracticePiece').mockResolvedValue({
      success: true,
      storageKeys: ['2026/score/failed.pdf'],
    });

    vi.spyOn(workerClient, 'deleteObject').mockRejectedValue(new Error('Worker 500 Internal Error'));
    const refreshSpy = vi.spyOn(sheetsService, 'refreshPracticeCatalog').mockResolvedValue({} as any);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(executeDeletePracticePiece('piece_fail')).resolves.not.toThrow();

    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[deleteFlow] Failed to delete storage object for piece:'),
      '2026/score/failed.pdf',
      expect.any(Error)
    );
  });

  it('트랙 삭제 순서: DB RPC -> Worker deleteObject -> refreshPracticeCatalog', async () => {
    vi.spyOn(sheetsService, 'deletePracticeTrack').mockResolvedValue({
      success: true,
      storageKeys: ['2026/audio/track_only.m4a'],
    });
    const deleteObjectSpy = vi.spyOn(workerClient, 'deleteObject').mockResolvedValue();
    const refreshSpy = vi.spyOn(sheetsService, 'refreshPracticeCatalog').mockResolvedValue({} as any);

    await executeDeletePracticeTrack('track_only_id');

    expect(deleteObjectSpy).toHaveBeenCalledWith('2026/audio/track_only.m4a', expect.any(String));
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });

  it('공연 삭제: DB RPC -> refreshPracticeCatalog', async () => {
    const dbSpy = vi.spyOn(sheetsService, 'deletePerformance').mockResolvedValue();
    const refreshSpy = vi.spyOn(sheetsService, 'refreshPracticeCatalog').mockResolvedValue({} as any);

    await executeDeletePerformance('perf_1');

    expect(dbSpy).toHaveBeenCalledWith('perf_1');
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });

  it('DB RPC가 재생 기록 거부 에러를 던지면 파일 삭제나 갱신 없이 예외를 전파한다', async () => {
    vi.spyOn(sheetsService, 'deletePracticePiece').mockRejectedValue(
      new Error('재생 기록이 있어 삭제할 수 없어요. 보관해 주세요.')
    );
    const deleteObjectSpy = vi.spyOn(workerClient, 'deleteObject');
    const refreshSpy = vi.spyOn(sheetsService, 'refreshPracticeCatalog');

    await expect(executeDeletePracticePiece('p_has_listen')).rejects.toThrow(
      '재생 기록이 있어 삭제할 수 없어요. 보관해 주세요.'
    );

    expect(deleteObjectSpy).not.toHaveBeenCalled();
    expect(refreshSpy).not.toHaveBeenCalled();
  });
});
