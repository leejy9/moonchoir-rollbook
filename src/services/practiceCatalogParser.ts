import type {
  Performance,
  PracticeCatalog,
  PracticeMediaSource,
  PracticePerformancePiece,
  PracticePiece,
  PracticeProgramPiece,
  PracticeTrack,
  PracticeTrackKind,
} from '../types/rollbook';

export function parsePracticeCatalog(raw: unknown): PracticeCatalog {
  const emptyCatalog: PracticeCatalog = {
    pieces: [],
    tracks: [],
    programPieces: [],
    performances: [],
    performancePieces: [],
  };
  if (!raw || typeof raw !== 'object') {
    return emptyCatalog;
  }

  const container =
    'data' in raw && raw.data && typeof raw.data === 'object'
      ? (raw.data as Record<string, unknown>)
      : (raw as Record<string, unknown>);

  const rawPieces = Array.isArray(container.pieces) ? container.pieces : [];
  const rawTracks = Array.isArray(container.tracks) ? container.tracks : [];
  const rawProgramPieces = Array.isArray(container.programPieces)
    ? container.programPieces
    : Array.isArray(container.program_pieces)
      ? container.program_pieces
      : [];
  const rawPerformances = Array.isArray(container.performances) ? container.performances : [];
  const rawPerformancePieces = Array.isArray(container.performancePieces)
    ? container.performancePieces
    : Array.isArray(container.performance_pieces)
      ? container.performance_pieces
      : [];

  const pieces: PracticePiece[] = [];
  rawPieces.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const row = item as Record<string, unknown>;
    let id = row.id !== undefined && row.id !== null ? String(row.id).trim() : '';
    if (!id) {
      id = `orphan_piece_${index}`;
      console.warn(`[PracticeCatalog] Piece row at index ${index} missing id; assigned ${id}`);
    }

    const title = row.title !== undefined && row.title !== null ? String(row.title) : '';
    const composer = row.composer !== undefined && row.composer !== null ? String(row.composer) : undefined;
    const arranger = row.arranger !== undefined && row.arranger !== null ? String(row.arranger) : undefined;
    const scoreUrl =
      row.scoreUrl !== undefined && row.scoreUrl !== null
        ? String(row.scoreUrl)
        : row.score_url !== undefined && row.score_url !== null
          ? String(row.score_url)
          : undefined;
    const scoreStorageKey =
      row.scoreStorageKey !== undefined && row.scoreStorageKey !== null
        ? String(row.scoreStorageKey)
        : row.score_storage_key !== undefined && row.score_storage_key !== null
          ? String(row.score_storage_key)
          : undefined;
    const rawScoreSize = row.scoreSizeBytes ?? row.score_size_bytes;
    const scoreSizeBytes =
      typeof rawScoreSize === 'number' && !Number.isNaN(rawScoreSize)
        ? rawScoreSize
        : typeof rawScoreSize === 'string' && rawScoreSize.trim() !== '' && !Number.isNaN(Number(rawScoreSize))
          ? Number(rawScoreSize)
          : undefined;
    const notes = row.notes !== undefined && row.notes !== null ? String(row.notes) : undefined;
    const archivedAt =
      row.archivedAt !== undefined && row.archivedAt !== null
        ? String(row.archivedAt)
        : row.archived_at !== undefined && row.archived_at !== null
          ? String(row.archived_at)
          : undefined;
    const isArchived = Boolean(
      row.isArchived ?? row.is_archived ?? (archivedAt !== undefined && archivedAt !== '')
    );
    const createdAt =
      row.createdAt !== undefined && row.createdAt !== null
        ? String(row.createdAt)
        : row.created_at !== undefined && row.created_at !== null
          ? String(row.created_at)
          : new Date().toISOString();
    const updatedAt =
      row.updatedAt !== undefined && row.updatedAt !== null
        ? String(row.updatedAt)
        : row.updated_at !== undefined && row.updated_at !== null
          ? String(row.updated_at)
          : createdAt;

    pieces.push({
      id,
      title,
      composer,
      arranger,
      scoreUrl,
      scoreStorageKey,
      scoreSizeBytes,
      notes,
      isArchived,
      archivedAt,
      createdAt,
      updatedAt,
    });
  });

  const tracks: PracticeTrack[] = [];
  rawTracks.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const row = item as Record<string, unknown>;
    let id = row.id !== undefined && row.id !== null ? String(row.id).trim() : '';
    if (!id) {
      id = `orphan_track_${index}`;
      console.warn(`[PracticeCatalog] Track row at index ${index} missing id; assigned ${id}`);
    }

    const pieceId =
      row.pieceId !== undefined && row.pieceId !== null
        ? String(row.pieceId)
        : row.piece_id !== undefined && row.piece_id !== null
          ? String(row.piece_id)
          : '';
    const label = row.label !== undefined && row.label !== null ? String(row.label) : '';
    const kind = (row.kind !== undefined && row.kind !== null ? String(row.kind) : '가이드') as PracticeTrackKind;
    const source = (
      row.source !== undefined && row.source !== null
        ? String(row.source)
        : row.source_type !== undefined && row.source_type !== null
          ? String(row.source_type)
          : 'r2'
    ) as PracticeMediaSource;
    const url = row.url !== undefined && row.url !== null ? String(row.url) : undefined;
    const storageKey =
      row.storageKey !== undefined && row.storageKey !== null
        ? String(row.storageKey)
        : row.storage_key !== undefined && row.storage_key !== null
          ? String(row.storage_key)
          : undefined;
    const mimeType =
      row.mimeType !== undefined && row.mimeType !== null
        ? String(row.mimeType)
        : row.mime_type !== undefined && row.mime_type !== null
          ? String(row.mime_type)
          : undefined;
    const rawDuration = row.durationSeconds ?? row.duration_seconds;
    const durationSeconds =
      typeof rawDuration === 'number' && !Number.isNaN(rawDuration)
        ? rawDuration
        : typeof rawDuration === 'string' && rawDuration.trim() !== '' && !Number.isNaN(Number(rawDuration))
          ? Number(rawDuration)
          : undefined;
    const rawSize = row.sizeBytes ?? row.size_bytes;
    const sizeBytes =
      typeof rawSize === 'number' && !Number.isNaN(rawSize)
        ? rawSize
        : typeof rawSize === 'string' && rawSize.trim() !== '' && !Number.isNaN(Number(rawSize))
          ? Number(rawSize)
          : undefined;
    const rawOrder = row.orderIndex ?? row.order_index;
    const orderIndex =
      typeof rawOrder === 'number' && !Number.isNaN(rawOrder)
        ? rawOrder
        : typeof rawOrder === 'string' && rawOrder.trim() !== '' && !Number.isNaN(Number(rawOrder))
          ? Number(rawOrder)
          : index;
    const archivedAt =
      row.archivedAt !== undefined && row.archivedAt !== null
        ? String(row.archivedAt)
        : row.archived_at !== undefined && row.archived_at !== null
          ? String(row.archived_at)
          : undefined;
    const isArchived = Boolean(
      row.isArchived ?? row.is_archived ?? (archivedAt !== undefined && archivedAt !== '')
    );
    const createdAt =
      row.createdAt !== undefined && row.createdAt !== null
        ? String(row.createdAt)
        : row.created_at !== undefined && row.created_at !== null
          ? String(row.created_at)
          : new Date().toISOString();
    const updatedAt =
      row.updatedAt !== undefined && row.updatedAt !== null
        ? String(row.updatedAt)
        : row.updated_at !== undefined && row.updated_at !== null
          ? String(row.updated_at)
          : createdAt;

    tracks.push({
      id,
      pieceId,
      label,
      kind,
      source,
      url,
      storageKey,
      mimeType,
      durationSeconds,
      sizeBytes,
      orderIndex,
      isArchived,
      createdAt,
      updatedAt,
    });
  });

  const programPieces: PracticeProgramPiece[] = [];
  rawProgramPieces.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const row = item as Record<string, unknown>;
    const programId =
      row.programId !== undefined && row.programId !== null
        ? String(row.programId)
        : row.program_id !== undefined && row.program_id !== null
          ? String(row.program_id)
          : '';
    const pieceId =
      row.pieceId !== undefined && row.pieceId !== null
        ? String(row.pieceId)
        : row.piece_id !== undefined && row.piece_id !== null
          ? String(row.piece_id)
          : '';
    const rawOrder = row.orderIndex ?? row.order_index;
    const orderIndex =
      typeof rawOrder === 'number' && !Number.isNaN(rawOrder)
        ? rawOrder
        : typeof rawOrder === 'string' && rawOrder.trim() !== '' && !Number.isNaN(Number(rawOrder))
          ? Number(rawOrder)
          : index;
    const archivedAt =
      row.archivedAt !== undefined && row.archivedAt !== null
        ? String(row.archivedAt)
        : row.archived_at !== undefined && row.archived_at !== null
          ? String(row.archived_at)
          : undefined;
    const isArchived = Boolean(
      row.isArchived ?? row.is_archived ?? (archivedAt !== undefined && archivedAt !== '')
    );

    programPieces.push({
      programId,
      pieceId,
      orderIndex,
      isArchived,
    });
  });

  const performances: Performance[] = [];
  rawPerformances.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const row = item as Record<string, unknown>;
    const id = row.id !== undefined && row.id !== null ? String(row.id).trim() : `perf_${index}`;
    const title = row.title !== undefined && row.title !== null ? String(row.title) : '';
    const performanceDate =
      row.performanceDate !== undefined && row.performanceDate !== null
        ? String(row.performanceDate)
        : row.performance_date !== undefined && row.performance_date !== null
          ? String(row.performance_date)
          : '';
    const venue = row.venue !== undefined && row.venue !== null ? String(row.venue) : '';
    const archivedAt =
      row.archivedAt !== undefined && row.archivedAt !== null
        ? String(row.archivedAt)
        : row.archived_at !== undefined && row.archived_at !== null
          ? String(row.archived_at)
          : undefined;
    const isArchived = Boolean(
      row.isArchived ?? row.is_archived ?? (archivedAt !== undefined && archivedAt !== '')
    );
    const createdAt =
      row.createdAt !== undefined && row.createdAt !== null
        ? String(row.createdAt)
        : row.created_at !== undefined && row.created_at !== null
          ? String(row.created_at)
          : new Date().toISOString();
    const updatedAt =
      row.updatedAt !== undefined && row.updatedAt !== null
        ? String(row.updatedAt)
        : row.updated_at !== undefined && row.updated_at !== null
          ? String(row.updated_at)
          : createdAt;

    performances.push({
      id,
      title,
      performanceDate,
      venue,
      isArchived,
      createdAt,
      updatedAt,
    });
  });

  const performancePieces: PracticePerformancePiece[] = [];
  rawPerformancePieces.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const row = item as Record<string, unknown>;
    const performanceId =
      row.performanceId !== undefined && row.performanceId !== null
        ? String(row.performanceId)
        : row.performance_id !== undefined && row.performance_id !== null
          ? String(row.performance_id)
          : '';
    const pieceId =
      row.pieceId !== undefined && row.pieceId !== null
        ? String(row.pieceId)
        : row.piece_id !== undefined && row.piece_id !== null
          ? String(row.piece_id)
          : '';
    const rawOrder = row.orderIndex ?? row.order_index;
    const orderIndex =
      typeof rawOrder === 'number' && !Number.isNaN(rawOrder)
        ? rawOrder
        : typeof rawOrder === 'string' && rawOrder.trim() !== '' && !Number.isNaN(Number(rawOrder))
          ? Number(rawOrder)
          : index;
    const archivedAt =
      row.archivedAt !== undefined && row.archivedAt !== null
        ? String(row.archivedAt)
        : row.archived_at !== undefined && row.archived_at !== null
          ? String(row.archived_at)
          : undefined;
    const isArchived = Boolean(
      row.isArchived ?? row.is_archived ?? (archivedAt !== undefined && archivedAt !== '')
    );

    performancePieces.push({
      performanceId,
      pieceId,
      orderIndex,
      isArchived,
    });
  });

  return { pieces, tracks, programPieces, performances, performancePieces };
}
