import type {
  PracticeCatalog,
  PracticePiece,
  PracticeTrack,
  ProgramCard,
  TrackPlayback,
} from '../types/rollbook';

export interface StudioViewPiece {
  piece: PracticePiece;
  tracks: PracticeTrack[];
  orderIndex: number;
}

export interface StudioViewSection {
  programCard: ProgramCard;
  pieces: StudioViewPiece[];
}

/**
 * 트랙의 재생/접근용 전체 URL을 생성합니다.
 * - r2 출처: storageKey가 있을 경우 mediaPublicBaseUrl과 합성 (한글 파일명은 각 경로 조각별 encodeURIComponent).
 * - 기타 출처(drive, youtube, external_url 등): track.url 반환 (https:// 로 시작해야 함).
 */
export function resolveTrackUrl(
  track: PracticeTrack,
  mediaPublicBaseUrl?: string
): string | undefined {
  const cleanBase = (mediaPublicBaseUrl || '').trim().replace(/\/+$/, '');
  const isR2 = track.source.toLowerCase() === 'r2';

  if (isR2) {
    const rawKey = (track.storageKey || '').trim();
    if (rawKey) {
      if (!cleanBase) {
        // base URL이 없더라도 track.url이 안전한 https URL이면 fallback
        const rawUrl = (track.url || '').trim();
        return rawUrl.startsWith('https://') ? rawUrl : undefined;
      }
      const cleanKey = rawKey.replace(/^\/+/, '');
      const encodedKey = cleanKey
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');
      return `${cleanBase}/${encodedKey}`;
    }

    const rawUrl = (track.url || '').trim();
    return rawUrl.startsWith('https://') ? rawUrl : undefined;
  }

  // drive, youtube, external_url, unknown
  const rawUrl = (track.url || '').trim();
  if (rawUrl.startsWith('https://')) {
    return rawUrl;
  }
  return undefined;
}

/**
 * 트랙의 출처와 주소를 검사하여 인앱 오디오 재생, 외부 링크, 재생 불가 상태를 판정합니다.
 * (MEMBER_UX_AUDIO_SPEC.md §3-3 준수)
 */
export function resolveTrackPlayback(
  track: PracticeTrack,
  config?: { mediaPublicBaseUrl?: string }
): TrackPlayback {
  const isR2 = track.source.toLowerCase() === 'r2';
  const cleanBase = (config?.mediaPublicBaseUrl || '').trim();

  // 보안 검사: javascript:, http: 등 위험한 URL 사전 차단
  const rawUrl = (track.url || '').trim();
  if (rawUrl && !rawUrl.startsWith('https://')) {
    return {
      mode: 'unavailable',
      canPrefetch: false,
      supportsBackground: false,
      reason: '보안을 위해 https:// 주소만 연결할 수 있습니다.',
    };
  }

  if (isR2) {
    const rawKey = (track.storageKey || '').trim();
    if (rawKey) {
      if (!cleanBase && !rawUrl) {
        return {
          mode: 'unavailable',
          canPrefetch: false,
          supportsBackground: false,
          reason: '음원 서버 주소(mediaPublicBaseUrl)가 설정되지 않았습니다.',
        };
      }
      const resolved = resolveTrackUrl(track, cleanBase);
      if (resolved && resolved.startsWith('https://')) {
        return {
          mode: 'audio',
          src: resolved,
          canPrefetch: true,
          supportsBackground: true,
        };
      }
      return {
        mode: 'unavailable',
        canPrefetch: false,
        supportsBackground: false,
        reason: '유효한 https 음원 주소를 생성할 수 없습니다.',
      };
    }

    if (rawUrl.startsWith('https://')) {
      return {
        mode: 'audio',
        src: rawUrl,
        canPrefetch: true,
        supportsBackground: true,
      };
    }

    return {
      mode: 'unavailable',
      canPrefetch: false,
      supportsBackground: false,
      reason: '음원 파일 경로 또는 주소가 없습니다.',
    };
  }

  // drive, youtube, external_url, or other unknown custom sources
  if (!rawUrl) {
    return {
      mode: 'unavailable',
      canPrefetch: false,
      supportsBackground: false,
      reason: '외부 링크 주소가 없습니다.',
    };
  }

  return {
    mode: 'external_link',
    src: rawUrl,
    canPrefetch: false,
    supportsBackground: false,
  };
}

/**
 * 활성 시즌 카드별로 활성 연습곡과 트랙을 그룹화합니다.
 * - 보관(isArchived)된 시즌 카드, 곡, 트랙은 제외합니다.
 * - 여러 시즌에 걸쳐 연결된 곡은 각 시즌 섹션에 독립적으로 노출됩니다.
 * - 시즌 카드는 전달된 순서(또는 기본 정렬)를 유지하며, 카드 내 곡은 orderIndex 순으로 정렬됩니다.
 */
export function buildStudioView(
  catalog: PracticeCatalog,
  programCards: ProgramCard[]
): StudioViewSection[] {
  const activeCards = programCards.filter((c) => !c.isArchived);
  const activePieceMap = new Map<string, PracticePiece>(
    catalog.pieces.filter((p) => !p.isArchived).map((p) => [p.id, p])
  );

  const activeTracksByPiece = new Map<string, PracticeTrack[]>();
  for (const t of catalog.tracks) {
    if (t.isArchived) continue;
    const list = activeTracksByPiece.get(t.pieceId) || [];
    list.push(t);
    activeTracksByPiece.set(t.pieceId, list);
  }

  // 트랙 정렬: orderIndex -> createdAt -> id
  activeTracksByPiece.forEach((list) => {
    list.sort(
      (a, b) =>
        a.orderIndex - b.orderIndex ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id)
    );
  });

  const activeLinksByProgram = new Map<string, typeof catalog.programPieces>();
  for (const pp of catalog.programPieces) {
    if (pp.isArchived) continue;
    const list = activeLinksByProgram.get(pp.programId) || [];
    list.push(pp);
    activeLinksByProgram.set(pp.programId, list);
  }

  const sections: StudioViewSection[] = [];

  for (const card of activeCards) {
    const links = activeLinksByProgram.get(card.id) || [];
    links.sort((a, b) => a.orderIndex - b.orderIndex || a.pieceId.localeCompare(b.pieceId));

    const pieces: StudioViewPiece[] = [];
    for (const link of links) {
      const piece = activePieceMap.get(link.pieceId);
      if (!piece) continue; // 삭제/보관된 곡이거나 미등록 곡 제외
      const tracks = activeTracksByPiece.get(piece.id) || [];
      pieces.push({
        piece,
        tracks,
        orderIndex: link.orderIndex,
      });
    }

    sections.push({
      programCard: card,
      pieces,
    });
  }

  return sections;
}
