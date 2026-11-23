import type {
  Performance,
  PracticeCatalog,
  PracticePerformancePiece,
  PracticePiece,
  PracticeProgramPiece,
  ProgramCard,
} from '../types/rollbook';

export interface ProgramScopeItem {
  id: string; // 'ALL' | performanceId | 'UNASSIGNED' | `DIVIDER_${number}`
  title: string;
  dateStr?: string; // e.g. '12월 14일'
  pieceCount: number;
  isPast?: boolean;
  isDivider?: boolean;
}

export type PerformanceScopeItem = ProgramScopeItem;

export interface ScopedPieceItem {
  piece: PracticePiece;
  orderNumber?: number; // 1-based index if viewing a specific performance scope
}

/**
 * Format YYYY-MM-DD date string to 'M월 D일'
 */
function formatMonthDay(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  return `${m}월 ${d}일`;
}

/**
 * Build structured performance scope dropdown items (MEMBER_UX_V3_SPEC §3-1, V18).
 * Order:
 * 1. 전체 곡
 * 2. 구분선
 * 3. 다가오는 공연 (날짜 오름차순, 날짜 미정은 맨 뒤)
 * 4. 공연 미정 (0개면 생략)
 * 5. 구분선 (지난 공연이 있을 때만)
 * 6. 지난 공연 (날짜 내림차순, 흐리게)
 *
 * Rule:
 * - 날짜는 performanceDate만 쓰고, 일정·시즌 카드·performanceCategories는 이 계산에 쓰지 않는다.
 * - 공연 미정 = 보관되지 않은 공연 연결이 없는 곡.
 * - 시즌 카드는 연습실 범위에 나오지 않는다.
 */
export function buildPerformanceScopes(
  catalog: PracticeCatalog,
  todayStr: string
): ProgramScopeItem[] {
  const activePieces = catalog.pieces.filter((p) => !p.isArchived);
  const activePiecesMap = new Map(activePieces.map((p) => [p.id, p]));
  const unarchivedLinks = (catalog.performancePieces || []).filter(
    (pp) => !pp.isArchived && activePiecesMap.has(pp.pieceId)
  );

  // Group unarchived links by performanceId
  const linksByPerfId = new Map<string, PracticePerformancePiece[]>();
  const piecesWithLinks = new Set<string>();

  for (const link of unarchivedLinks) {
    piecesWithLinks.add(link.pieceId);
    const existing = linksByPerfId.get(link.performanceId);
    if (existing) {
      existing.push(link);
    } else {
      linksByPerfId.set(link.performanceId, [link]);
    }
  }

  // Active unarchived performances
  const unarchivedPerfs = (catalog.performances || []).filter((p) => !p.isArchived);

  interface PerfWithMeta {
    perf: Performance;
    rawDate?: string;
    dateStr?: string;
    pieceCount: number;
    isPast: boolean;
  }

  const upcomingPerfs: PerfWithMeta[] = [];
  const pastPerfs: PerfWithMeta[] = [];

  for (const perf of unarchivedPerfs) {
    const perfLinks = linksByPerfId.get(perf.id) || [];
    const distinctPieceIds = new Set(perfLinks.map((l) => l.pieceId));
    const pieceCount = distinctPieceIds.size;

    // "곡이 하나도 연결되지 않은 공연은 메뉴에 넣지 않는다."
    if (pieceCount === 0) continue;

    const rawDate =
      perf.performanceDate && perf.performanceDate.trim() !== '' ? perf.performanceDate : undefined;
    const isPast = rawDate !== undefined && rawDate < todayStr;
    const dateStr = rawDate ? formatMonthDay(rawDate) : undefined;

    const meta: PerfWithMeta = {
      perf,
      rawDate,
      dateStr,
      pieceCount,
      isPast,
    };

    if (isPast) {
      pastPerfs.push(meta);
    } else {
      upcomingPerfs.push(meta);
    }
  }

  // Sort upcoming: ascending by date. Undefined rawDate goes to the end.
  upcomingPerfs.sort((a, b) => {
    if (!a.rawDate && !b.rawDate) return a.perf.title.localeCompare(b.perf.title);
    if (!a.rawDate) return 1;
    if (!b.rawDate) return -1;
    return a.rawDate.localeCompare(b.rawDate) || a.perf.title.localeCompare(b.perf.title);
  });

  // Sort past: descending by date
  pastPerfs.sort((a, b) => {
    if (!a.rawDate && !b.rawDate) return a.perf.title.localeCompare(b.perf.title);
    if (!a.rawDate) return 1;
    if (!b.rawDate) return -1;
    return b.rawDate.localeCompare(a.rawDate) || a.perf.title.localeCompare(b.perf.title);
  });

  // Unassigned pieces: active pieces with 0 unarchived performance links
  const unassignedPieces = activePieces.filter((p) => !piecesWithLinks.has(p.id));
  const unassignedCount = unassignedPieces.length;

  const result: ProgramScopeItem[] = [];

  // 1. 전체 곡
  result.push({
    id: 'ALL',
    title: '전체 곡',
    pieceCount: activePieces.length,
  });

  // 2. 구분선
  result.push({
    id: 'DIVIDER_1',
    title: '',
    pieceCount: 0,
    isDivider: true,
  });

  // 3. 다가오는 공연
  for (const item of upcomingPerfs) {
    result.push({
      id: item.perf.id,
      title: item.perf.title,
      dateStr: item.dateStr,
      pieceCount: item.pieceCount,
      isPast: false,
    });
  }

  // 4. 공연 미정 (0개면 생략)
  if (unassignedCount > 0) {
    result.push({
      id: 'UNASSIGNED',
      title: '공연 미정',
      pieceCount: unassignedCount,
    });
  }

  // 5. 구분선 & 지난 공연 (있을 때만)
  if (pastPerfs.length > 0) {
    result.push({
      id: 'DIVIDER_2',
      title: '',
      pieceCount: 0,
      isDivider: true,
    });

    for (const item of pastPerfs) {
      result.push({
        id: item.perf.id,
        title: item.perf.title,
        dateStr: item.dateStr,
        pieceCount: item.pieceCount,
        isPast: true,
      });
    }
  }

  return result;
}

/**
 * Backward compatibility alias for buildPerformanceScopes
 */
export function buildProgramScopes(
  catalog: PracticeCatalog,
  _programCards?: unknown,
  _schedules?: unknown,
  _config?: unknown,
  todayStr: string = ''
): ProgramScopeItem[] {
  return buildPerformanceScopes(catalog, todayStr);
}

/**
 * Filter and sort pieces according to selected scope (MEMBER_UX_V3_SPEC §3-1).
 */
export function filterPiecesByScope(
  pieces: PracticePiece[],
  links: (PracticePerformancePiece | PracticeProgramPiece)[],
  selectedScopeId: string
): ScopedPieceItem[] {
  const activePieces = pieces.filter((p) => !p.isArchived);
  const activePiecesMap = new Map(activePieces.map((p) => [p.id, p]));

  if (selectedScopeId === 'ALL') {
    return [...activePieces]
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .map((piece) => ({ piece }));
  }

  if (selectedScopeId === 'UNASSIGNED') {
    const piecesWithLinks = new Set(
      links
        .filter((l) => !l.isArchived && activePiecesMap.has(l.pieceId))
        .map((l) => l.pieceId)
    );

    return activePieces
      .filter((p) => !piecesWithLinks.has(p.id))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .map((piece) => ({ piece }));
  }

  // Filter links for this performance/program that are not archived and point to active pieces
  const matchedLinks = links
    .filter((l) => {
      if (l.isArchived || !activePiecesMap.has(l.pieceId)) return false;
      const targetId = 'performanceId' in l ? l.performanceId : l.programId;
      return targetId === selectedScopeId;
    })
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

  return matchedLinks.map((link, idx) => ({
    piece: activePiecesMap.get(link.pieceId)!,
    orderNumber: idx + 1,
  }));
}

/**
 * Search pieces by title, composer, arranger, or connected performance/program title.
 */
export function searchPieces(
  items: ScopedPieceItem[],
  containers: (Performance | ProgramCard)[],
  links: (PracticePerformancePiece | PracticeProgramPiece)[],
  query: string
): ScopedPieceItem[] {
  const normalizedQuery = query.trim().toLowerCase().replace(/\s+/g, '');
  if (!normalizedQuery) return items;

  const containerMap = new Map(containers.map((c) => [c.id, c.title]));
  const pieceContainerTitlesMap = new Map<string, string[]>();

  for (const l of links) {
    if (l.isArchived) continue;
    const targetId = 'performanceId' in l ? l.performanceId : l.programId;
    const containerTitle = containerMap.get(targetId);
    if (!containerTitle) continue;
    const existing = pieceContainerTitlesMap.get(l.pieceId);
    if (existing) {
      existing.push(containerTitle);
    } else {
      pieceContainerTitlesMap.set(l.pieceId, [containerTitle]);
    }
  }

  return items.filter(({ piece }) => {
    const title = piece.title.toLowerCase().replace(/\s+/g, '');
    if (title.includes(normalizedQuery)) return true;

    const composer = (piece.composer || '').toLowerCase().replace(/\s+/g, '');
    if (composer.includes(normalizedQuery)) return true;

    const arranger = (piece.arranger || '').toLowerCase().replace(/\s+/g, '');
    if (arranger.includes(normalizedQuery)) return true;

    const containerTitles = pieceContainerTitlesMap.get(piece.id) || [];
    for (const ct of containerTitles) {
      if (ct.toLowerCase().replace(/\s+/g, '').includes(normalizedQuery)) {
        return true;
      }
    }

    return false;
  });
}
