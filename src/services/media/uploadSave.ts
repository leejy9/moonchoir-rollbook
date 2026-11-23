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
  replaceTrackId?: string,
  durationSeconds?: number
): (key: string, size: number, dynamicDurationSeconds?: number) => Promise<void> {
  return async (key: string, size: number, dynamicDurationSeconds?: number) => {
    const effectiveDuration = dynamicDurationSeconds ?? durationSeconds;
    if (kind === 'score') {
      const currentCatalog = sheetsService.getPracticeCatalog();
      let existing = currentCatalog.pieces.find((p) => p.id === pieceId);
      if (!existing) {
        try {
          const refreshed = await sheetsService.refreshPracticeCatalog();
          existing = refreshed.pieces.find((p) => p.id === pieceId);
        } catch {
          // ignore refresh error
        }
      }
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
          durationSeconds: effectiveDuration ?? existingTrack.durationSeconds,
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
          durationSeconds: effectiveDuration,
        });
      }
    }
  };
}

export interface StagedItem {
  id: string;
  kind: 'audio' | 'youtube';
  file?: File;
  label: string;
  trackKind?: string;
  url?: string;
  durationSeconds?: number;
}

export async function saveNewPieceWithStagedMedia(params: {
  title: string;
  composer: string;
  arranger: string;
  stagedProgramIds?: string[];
  stagedPerformanceIds?: string[];
  stagedTracks: StagedItem[];
  stagedScore: { file: File; name: string } | null;
  baseUrl: string;
  catalogProgramPieces?: Array<{ programId: string; pieceId: string; orderIndex: number; isArchived?: boolean }>;
  catalogPerformancePieces?: Array<{ performanceId: string; pieceId: string; orderIndex: number; isArchived?: boolean }>;
  enqueueFn: (job: import('./uploadQueue').UploadJobRequest) => string;
}): Promise<import('../../types/rollbook').PracticePiece> {
  const created = await sheetsService.savePracticePiece({
    title: params.title,
    composer: params.composer,
    arranger: params.arranger,
  });

  // Staged performances (V3-15)
  if (params.stagedPerformanceIds && params.stagedPerformanceIds.length > 0) {
    for (const perfId of params.stagedPerformanceIds) {
      const currentList = (params.catalogPerformancePieces || [])
        .filter((pp) => pp.performanceId === perfId && !pp.isArchived)
        .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
        .map((pp) => pp.pieceId);
      if (!currentList.includes(created.id)) {
        await sheetsService.setPerformancePieces(perfId, [...currentList, created.id]);
      }
    }
  }

  // Legacy staged program cards fallback
  if (params.stagedProgramIds && params.stagedProgramIds.length > 0) {
    for (const progId of params.stagedProgramIds) {
      const currentList = (params.catalogProgramPieces || [])
        .filter((pp) => pp.programId === progId && !pp.isArchived)
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((pp) => pp.pieceId);
      if (!currentList.includes(created.id)) {
        await sheetsService.setProgramPieces(progId, [...currentList, created.id]);
      }
    }
  }

  const youtubeTracks = params.stagedTracks.filter((t) => t.kind === 'youtube');
  for (let i = 0; i < youtubeTracks.length; i++) {
    const yt = youtubeTracks[i];
    await sheetsService.savePracticeTrack({
      pieceId: created.id,
      label: yt.label,
      kind: '참고영상',
      source: 'youtube',
      url: yt.url,
      orderIndex: i,
    });
  }

  if (params.stagedScore) {
    params.enqueueFn({
      pieceId: created.id,
      kind: 'score',
      title: created.title,
      fileName: params.stagedScore.file.name,
      file: params.stagedScore.file,
      baseUrl: params.baseUrl,
      saveFn: createUploadSaveFn('score', created.id, created.title, ''),
    });
  }

  const audioTracks = params.stagedTracks.filter((t) => t.kind === 'audio');
  for (let i = 0; i < audioTracks.length; i++) {
    const at = audioTracks[i];
    if (at.file) {
      params.enqueueFn({
        pieceId: created.id,
        kind: 'audio',
        title: at.label,
        trackKind: at.trackKind || '가이드',
        fileName: at.file.name,
        file: at.file,
        baseUrl: params.baseUrl,
        saveFn: createUploadSaveFn('audio', created.id, at.label, at.trackKind || '가이드', undefined, at.durationSeconds),
      });
    }
  }

  return created;
}
