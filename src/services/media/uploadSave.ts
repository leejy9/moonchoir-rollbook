import { sheetsService } from '../sheets';

/**
 * Creates the save function for uploadQueue job.
 * Ensures existing piece fields (title, composer, arranger, scoreUrl, notes)
 * are preserved when uploading a score, and handles track replacement.
 */
export function createUploadSaveFn(
  kind: 'audio' | 'score',
  pieceId: string,
  finalTitle: string,
  finalKind: string,
  replaceTrackId?: string
): (key: string, size: number) => Promise<void> {
  return async (key: string, size: number) => {
    if (kind === 'score') {
      const currentCatalog = sheetsService.getPracticeCatalog();
      const existing = currentCatalog.pieces.find((p) => p.id === pieceId);
      if (!existing) {
        throw new Error(`Piece not found in catalog: ${pieceId}`);
      }
      await sheetsService.savePracticePiece({
        ...existing,
        scoreStorageKey: key,
        scoreSizeBytes: size,
      });
    } else {
      if (replaceTrackId) {
        const currentCatalog = sheetsService.getPracticeCatalog();
        const existingTrack = currentCatalog.tracks.find((t) => t.id === replaceTrackId);
        if (!existingTrack) {
          throw new Error(`Track not found in catalog: ${replaceTrackId}`);
        }
        await sheetsService.savePracticeTrack({
          ...existingTrack,
          id: replaceTrackId,
          pieceId,
          label: finalTitle || existingTrack.label,
          kind: finalKind || existingTrack.kind,
          source: 'r2',
          storageKey: key,
          sizeBytes: size,
        });
      } else {
        const currentCatalog = sheetsService.getPracticeCatalog();
        const activeTracks = currentCatalog.tracks.filter(
          (t) => t.pieceId === pieceId && !t.isArchived
        );
        const maxOrderIndex = activeTracks.reduce(
          (max, t) => (t.orderIndex !== undefined && t.orderIndex > max ? t.orderIndex : max),
          -1
        );
        const orderIndex = maxOrderIndex + 1;

        await sheetsService.savePracticeTrack({
          pieceId,
          label: finalTitle,
          kind: finalKind,
          source: 'r2',
          storageKey: key,
          sizeBytes: size,
          orderIndex,
        });
      }
    }
  };
}
