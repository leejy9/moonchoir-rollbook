import { sheetsService } from '../sheets';
import { deleteObject } from '../media/workerClient';

export interface DeleteFlowOptions {
  baseUrl?: string;
  onDone?: () => void;
}

/**
 * 곡 삭제 흐름 (J4):
 * 1. Supabase RPC로 DB 행 삭제 (트랙·공연연결·시즌카드연결 포함) 및 연관 storageKeys 수집
 * 2. 반환된 storageKey들을 Worker DELETE로 삭제 (실패 시 console.warn만 남기고 계속 진행)
 * 3. 최신 연습 카탈로그 새로고침
 */
export async function executeDeletePracticePiece(
  pieceId: string,
  options?: DeleteFlowOptions
): Promise<void> {
  const res = await sheetsService.deletePracticePiece(pieceId);
  const baseUrl = options?.baseUrl || sheetsService.getConfig().mediaPublicBaseUrl || '';
  const storageKeys = res.storageKeys || [];

  for (const key of storageKeys) {
    if (!key) continue;
    try {
      await deleteObject(key, baseUrl);
    } catch (delErr) {
      console.warn('[deleteFlow] Failed to delete storage object for piece:', key, delErr);
    }
  }

  await sheetsService.refreshPracticeCatalog();
  options?.onDone?.();
}

/**
 * 트랙 삭제 흐름 (J4):
 * 1. Supabase RPC로 트랙 행 삭제 및 연관 storageKey 수집
 * 2. storageKey가 있으면 Worker DELETE로 삭제 (실패 시 console.warn)
 * 3. 카탈로그 새로고침
 */
export async function executeDeletePracticeTrack(
  trackId: string,
  options?: DeleteFlowOptions
): Promise<void> {
  const res = await sheetsService.deletePracticeTrack(trackId);
  const baseUrl = options?.baseUrl || sheetsService.getConfig().mediaPublicBaseUrl || '';
  const storageKeys = res.storageKeys || [];

  for (const key of storageKeys) {
    if (!key) continue;
    try {
      await deleteObject(key, baseUrl);
    } catch (delErr) {
      console.warn('[deleteFlow] Failed to delete storage object for track:', key, delErr);
    }
  }

  await sheetsService.refreshPracticeCatalog();
  options?.onDone?.();
}

/**
 * 공연 삭제 흐름 (J4):
 * 1. Supabase RPC로 공연 및 곡 연결 행 삭제 (곡 자체는 보존)
 * 2. 카탈로그 새로고침
 */
export async function executeDeletePerformance(
  performanceId: string,
  options?: { onDone?: () => void }
): Promise<void> {
  await sheetsService.deletePerformance(performanceId);
  await sheetsService.refreshPracticeCatalog();
  options?.onDone?.();
}
