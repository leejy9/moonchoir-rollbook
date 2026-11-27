/**
 * Practice Catalog & Studio Models (MEMBER_UX_AUDIO_SPEC.md §4-4, MEMBER_UX_V3_SPEC.md §7-5)
 */

export type PracticeTrackKind = '가이드' | 'MR' | '참고영상' | (string & {});
export type PracticeMediaSource = 'r2' | 'drive' | 'youtube' | 'external_url' | (string & {});

export interface PracticePiece {
  id: string;
  title: string;
  composer?: string;
  arranger?: string;
  scoreUrl?: string;
  scoreStorageKey?: string;
  scoreSizeBytes?: number;
  notes?: string;
  isArchived: boolean;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PracticeTrack {
  id: string;
  pieceId: string;
  label: string;
  kind: PracticeTrackKind;
  source: PracticeMediaSource;
  url?: string;
  storageKey?: string;
  mimeType?: string;
  durationSeconds?: number;
  sizeBytes?: number;
  orderIndex: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PracticeProgramPiece { // v1의 자유 텍스트 season 대체 (레거시 보존)
  programId: string;
  pieceId: string;
  orderIndex: number;
  isArchived: boolean;
}

export interface Performance {
  id: string;
  title: string;
  performanceDate: string;
  venue: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PracticePerformancePiece {
  performanceId: string;
  pieceId: string;
  orderIndex: number;
  isArchived: boolean;
}

export interface PracticeCatalog {
  pieces: PracticePiece[];
  tracks: PracticeTrack[];
  programPieces: PracticeProgramPiece[];
  performances: Performance[];
  performancePieces: PracticePerformancePiece[];
}

export type TrackPlaybackMode = 'audio' | 'external_link' | 'unavailable';

export interface TrackPlayback {
  mode: TrackPlaybackMode;
  src?: string;
  canPrefetch: boolean;
  supportsBackground: boolean;
  reason?: string;
}

export interface MediaUsage {
  tracksBytes: number;
  scoresBytes: number;
  totalBytes: number;
}
