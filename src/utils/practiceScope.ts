import type {
  AppConfig,
  PracticeCatalog,
  PracticePiece,
  PracticeProgramPiece,
  ProgramCard,
  Schedule,
} from '../types/rollbook';

export interface ProgramScopeItem {
  id: string; // 'ALL' | cardId | 'UNASSIGNED' | `DIVIDER_${number}`
  title: string;
  dateStr?: string; // e.g. '12월 14일'
  pieceCount: number;
  isPast?: boolean;
  isDivider?: boolean;
}

export interface ScopedPieceItem {
  piece: PracticePiece;
  orderNumber?: number; // 1-based index if viewing a specific program scope
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
 * Build structured program scope dropdown items (MEMBER_UX_V3_SPEC §3-1).
 * Order:
 * 1. 전체 곡
 * 2. 구분선
 * 3. 다가오는 공연 (날짜 오름차순, 날짜 미정은 맨 뒤)
 * 4. 공연 미정 (0개면 생략)
 * 5. 구분선 (지난 공연이 있을 때만)
 * 6. 지난 공연 (날짜 내림차순, 흐리게)
 */
export function buildProgramScopes(
  catalog: PracticeCatalog,
  programCards: ProgramCard[],
  schedules: Schedule[],
  config: AppConfig,
  todayStr: string
): ProgramScopeItem[] {
  const activePieces = catalog.pieces.filter((p) => !p.isArchived);
  const activePiecesMap = new Map(activePieces.map((p) => [p.id, p]));
  const unarchivedLinks = catalog.programPieces.filter(
    (pp) => !pp.isArchived && activePiecesMap.has(pp.pieceId)
  );

  // Group unarchived links by cardId
  const linksByCardId = new Map<string, PracticeProgramPiece[]>();
  const piecesWithLinks = new Set<string>();

  for (const link of unarchivedLinks) {
    piecesWithLinks.add(link.pieceId);
    const existing = linksByCardId.get(link.programId);
    if (existing) {
      existing.push(link);
    } else {
      linksByCardId.set(link.programId, [link]);
    }
  }

  const performanceCategories = new Set(config.performanceCategories || ['연주']);

  // Compute date for each card
  const unarchivedCards = programCards.filter((c) => !c.isArchived);

  interface CardWithMeta {
    card: ProgramCard;
    rawDate?: string;
    dateStr?: string;
    pieceCount: number;
    isPast: boolean;
  }

  const upcomingCards: CardWithMeta[] = [];
  const pastCards: CardWithMeta[] = [];

  for (const card of unarchivedCards) {
    const cardLinks = linksByCardId.get(card.id) || [];
    // Distinct active piece count
    const distinctPieceIds = new Set(cardLinks.map((l) => l.pieceId));
    const pieceCount = distinctPieceIds.size;

    // "곡이 하나도 연결되지 않은 공연은 메뉴에 넣지 않는다."
    if (pieceCount === 0) continue;

    // Find card schedules
    const cardSchedules = schedules.filter(
      (s) => s.programId === card.id && !s.isCancelled && !s.isArchived
    );

    // Performance category schedules
    const perfSchedules = cardSchedules.filter((s) => performanceCategories.has(s.category));

    let rawDate: string | undefined;
    if (perfSchedules.length > 0) {
      rawDate = perfSchedules.reduce((max, s) => (s.date > max ? s.date : max), perfSchedules[0].date);
    } else if (cardSchedules.length > 0) {
      rawDate = cardSchedules.reduce((max, s) => (s.date > max ? s.date : max), cardSchedules[0].date);
    }

    const isPast = rawDate !== undefined && rawDate < todayStr;
    const dateStr = rawDate ? formatMonthDay(rawDate) : undefined;

    const meta: CardWithMeta = {
      card,
      rawDate,
      dateStr,
      pieceCount,
      isPast,
    };

    if (isPast) {
      pastCards.push(meta);
    } else {
      upcomingCards.push(meta);
    }
  }

  // Sort upcoming: ascending by date. Undefined rawDate goes to the end.
  upcomingCards.sort((a, b) => {
    if (!a.rawDate && !b.rawDate) return a.card.title.localeCompare(b.card.title);
    if (!a.rawDate) return 1;
    if (!b.rawDate) return -1;
    return a.rawDate.localeCompare(b.rawDate) || a.card.title.localeCompare(b.card.title);
  });

  // Sort past: descending by date
  pastCards.sort((a, b) => {
    if (!a.rawDate && !b.rawDate) return a.card.title.localeCompare(b.card.title);
    if (!a.rawDate) return 1;
    if (!b.rawDate) return -1;
    return b.rawDate.localeCompare(a.rawDate) || a.card.title.localeCompare(b.card.title);
  });

  // Unassigned pieces: active pieces with 0 unarchived links
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
  for (const item of upcomingCards) {
    result.push({
      id: item.card.id,
      title: item.card.title,
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
  if (pastCards.length > 0) {
    result.push({
      id: 'DIVIDER_2',
      title: '',
      pieceCount: 0,
      isDivider: true,
    });

    for (const item of pastCards) {
      result.push({
        id: item.card.id,
        title: item.card.title,
        dateStr: item.dateStr,
        pieceCount: item.pieceCount,
        isPast: true,
      });
    }
  }

  return result;
}

/**
 * Filter and sort pieces according to selected program scope (MEMBER_UX_V3_SPEC §3-1).
 */
export function filterPiecesByScope(
  pieces: PracticePiece[],
  programPieces: PracticeProgramPiece[],
  selectedScopeId: string
): ScopedPieceItem[] {
  const activePieces = pieces.filter((p) => !p.isArchived);
  const activePiecesMap = new Map(activePieces.map((p) => [p.id, p]));

  if (selectedScopeId === 'ALL') {
    // Sorted by created_at descending
    return [...activePieces]
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .map((piece) => ({ piece }));
  }

  if (selectedScopeId === 'UNASSIGNED') {
    const piecesWithLinks = new Set(
      programPieces
        .filter((pp) => !pp.isArchived && activePiecesMap.has(pp.pieceId))
        .map((pp) => pp.pieceId)
    );

    return activePieces
      .filter((p) => !piecesWithLinks.has(p.id))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .map((piece) => ({ piece }));
  }

  // Specific program card ID:
  // Filter links for this card that are not archived and point to active pieces
  const cardLinks = programPieces
    .filter((pp) => !pp.isArchived && pp.programId === selectedScopeId && activePiecesMap.has(pp.pieceId))
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

  return cardLinks.map((link, idx) => ({
    piece: activePiecesMap.get(link.pieceId)!,
    orderNumber: idx + 1,
  }));
}

/**
 * Search pieces by title, composer, arranger, or connected program card title (case & space insensitive).
 */
export function searchPieces(
  items: ScopedPieceItem[],
  programCards: ProgramCard[],
  programPieces: PracticeProgramPiece[],
  query: string
): ScopedPieceItem[] {
  const normalizedQuery = query.trim().toLowerCase().replace(/\s+/g, '');
  if (!normalizedQuery) return items;

  const cardMap = new Map(programCards.map((c) => [c.id, c.title]));
  const pieceCardTitlesMap = new Map<string, string[]>();

  for (const pp of programPieces) {
    if (pp.isArchived) continue;
    const cardTitle = cardMap.get(pp.programId);
    if (!cardTitle) continue;
    const existing = pieceCardTitlesMap.get(pp.pieceId);
    if (existing) {
      existing.push(cardTitle);
    } else {
      pieceCardTitlesMap.set(pp.pieceId, [cardTitle]);
    }
  }

  return items.filter(({ piece }) => {
    const title = piece.title.toLowerCase().replace(/\s+/g, '');
    if (title.includes(normalizedQuery)) return true;

    const composer = (piece.composer || '').toLowerCase().replace(/\s+/g, '');
    if (composer.includes(normalizedQuery)) return true;

    const arranger = (piece.arranger || '').toLowerCase().replace(/\s+/g, '');
    if (arranger.includes(normalizedQuery)) return true;

    const cardTitles = pieceCardTitlesMap.get(piece.id) || [];
    for (const ct of cardTitles) {
      if (ct.toLowerCase().replace(/\s+/g, '').includes(normalizedQuery)) {
        return true;
      }
    }

    return false;
  });
}
