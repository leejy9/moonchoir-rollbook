import type {
  AppConfig,
  LocationPreset,
  Member,
  MemberStatusHistory,
  PartType,
  ProgramCard,
  RSVPVote,
  RawAttendanceLog,
  Schedule,
  ScheduleCommentEvent,
  ScheduleVisibility,
  TargetAudienceType,
  PracticeCatalog,
  PracticePiece,
  PracticeTrack,
  PracticeProgramPiece,
} from '../types/rollbook';
import { getKSTTimestampString, normalizeDateToYYYYMMDD } from '../utils/date';

export function resolveScheduleLocationFromPresets(
  schedule: Schedule,
  presets: LocationPreset[],
  config: AppConfig
): {
  targetLat: number;
  targetLon: number;
  radiusMeters: number;
  locationName: string;
  detailAddress?: string;
  entranceNote?: string;
} {
  const locName = schedule.locationName || '';

  const matched =
    (schedule.locationId ? presets.find((p) => p.id === schedule.locationId) : undefined) ||
    presets.find((p) => p.name.trim() === locName.trim()) ||
    presets.find((p) => locName.includes(p.name) || p.name.includes(locName)) ||
    presets.find((p) => p.isDefault) ||
    presets[0];

  const targetLat = matched?.latitude ?? schedule.targetLat ?? config.defaultLat ?? 37.5665;
  const targetLon = matched?.longitude ?? schedule.targetLon ?? config.defaultLon ?? 126.978;
  const radiusMeters = matched?.radiusMeters ?? schedule.radiusMeters ?? config.defaultRadius ?? 100;
  const finalLocationName = matched?.name || schedule.locationName || '연습실';

  return {
    targetLat,
    targetLon,
    radiusMeters,
    locationName: finalLocationName,
    detailAddress: schedule.detailAddress || matched?.detailAddress,
    entranceNote: schedule.entranceNote || matched?.entranceNote,
  };
}

export function serializeScheduleForSheet(schedule: Schedule): Record<string, unknown> {
  return {
    ...schedule,
    targetParts: Array.isArray(schedule.targetParts)
      ? schedule.targetParts.join(',')
      : schedule.targetParts || '',
    targetMemberIds: Array.isArray(schedule.targetMemberIds)
      ? schedule.targetMemberIds.join(',')
      : schedule.targetMemberIds || '',
  };
}

export function parseRemoteMembers(
  rawMembers: Member[],
  rawMemberHistory?: MemberStatusHistory[]
): Member[] {
  const historyByMember = new Map<string, MemberStatusHistory[]>();
  if (Array.isArray(rawMemberHistory)) {
    for (const h of rawMemberHistory) {
      if (!h.memberId) continue;
      const list = historyByMember.get(h.memberId) || [];
      list.push({
        id: h.id || `hist_${Math.random()}`,
        memberId: h.memberId,
        status: h.status,
        part: h.part,
        startDate: h.startDate,
        endDate: h.endDate || '2999-12-31',
        reason: h.reason || '',
        createdAt: h.createdAt || '',
      });
      historyByMember.set(h.memberId, list);
    }
  }

  return rawMembers.map((m) => {
    const rawPhone = m.phone ? String(m.phone).trim() : '';
    const rawLast4 = m.phoneLast4 !== undefined && m.phoneLast4 !== null ? String(m.phoneLast4).trim() : '';
    const phoneLast4 = rawLast4
      ? rawLast4.padStart(4, '0')
      : rawPhone
      ? rawPhone.replace(/\D/g, '').slice(-4)
      : '0000';
    const history = historyByMember.get(m.id) || m.statusHistory;

    return {
      ...m,
      name: String(m.name || ''),
      phone: rawPhone,
      phoneLast4,
      joinedAt: m.joinedAt ? String(m.joinedAt) : m.createdAt ? String(m.createdAt).slice(0, 10) : '',
      memberStatus:
        m.memberStatus || (m.role === 'ADMIN' ? '선생님' : m.role === 'GUEST' ? '객원' : '정단원'),
      note: m.note ? String(m.note) : '',
      boundDeviceId: m.boundDeviceId ? String(m.boundDeviceId) : undefined,
      boundDeviceAt: m.boundDeviceAt ? String(m.boundDeviceAt) : undefined,
      ...(history && history.length > 0 ? { statusHistory: history } : {}),
    };
  });
}

export function parseRemoteSchedules(rawSchedules: Schedule[]): Schedule[] {
  return rawSchedules.map((s) => {
    const normalizedDate = s.date ? normalizeDateToYYYYMMDD(s.date) : s.date;
    let startTime = s.startTime || '19:30';
    let endTime = s.endTime || '21:30';
    if (startTime.includes('T')) {
      const dt = new Date(startTime);
      if (!isNaN(dt.getTime())) {
        const kst = new Date(dt.getTime() + (9 * 60 + dt.getTimezoneOffset()) * 60 * 1000);
        startTime = kst.toISOString().slice(11, 16);
      }
    }
    if (endTime.includes('T')) {
      const dt = new Date(endTime);
      if (!isNaN(dt.getTime())) {
        const kst = new Date(dt.getTime() + (9 * 60 + dt.getTimezoneOffset()) * 60 * 1000);
        endTime = kst.toISOString().slice(11, 16);
      }
    }
    const rawParts = (s as unknown as Record<string, unknown>).targetParts;
    const targetParts =
      typeof rawParts === 'string'
        ? (rawParts.split(',').map((p: string) => p.trim()).filter(Boolean) as PartType[])
        : Array.isArray(rawParts)
        ? (rawParts as PartType[])
        : undefined;
    const rawMembers = (s as unknown as Record<string, unknown>).targetMemberIds;
    const targetMemberIds =
      typeof rawMembers === 'string'
        ? rawMembers.split(',').map((id: string) => id.trim()).filter(Boolean)
        : Array.isArray(rawMembers)
        ? (rawMembers as string[])
        : undefined;

    const targetAudienceType =
      (s.targetAudienceType as TargetAudienceType) ||
      (targetParts && targetParts.length > 0
        ? 'PARTS'
        : targetMemberIds && targetMemberIds.length > 0
        ? 'CUSTOM_MEMBERS'
        : 'ALL');

    const isCancelled =
      s.isCancelled === true ||
      String((s as unknown as Record<string, unknown>).isCancelled).toUpperCase() === 'TRUE';
    const isArchived =
      s.isArchived === true ||
      String((s as unknown as Record<string, unknown>).isArchived).toUpperCase() === 'TRUE';

    const rawVisibility = String((s as unknown as Record<string, unknown>).visibility ?? '').trim().toUpperCase();
    const visibility: ScheduleVisibility = rawVisibility === 'TARGETS_ONLY' ? 'TARGETS_ONLY' : 'ALL';

    return {
      ...s,
      date: normalizedDate,
      startTime,
      endTime,
      visibility,
      targetAudienceType,
      targetParts,
      targetMemberIds,
      isArchived,
      isCancelled,
    };
  });
}

export function parseRemoteRSVPVotes(rawVotes: RSVPVote[], memberIdSet: Set<string>): RSVPVote[] {
  const voteMap = new Map<string, RSVPVote>();
  rawVotes.forEach((v) => {
    if (!v.scheduleId) return;
    const memberId = String(v.memberId || '').trim();
    if (!memberIdSet.has(memberId)) return;

    const canonicalVote: RSVPVote = {
      ...v,
      memberId,
    };
    const key = `${String(v.scheduleId).trim()}_${memberId}`;
    const existing = voteMap.get(key);
    if (!existing || (v.timestamp && (!existing.timestamp || v.timestamp >= existing.timestamp))) {
      voteMap.set(key, canonicalVote);
    }
  });
  return Array.from(voteMap.values());
}

export function parseRemoteAttendanceLogs(
  rawLogs: RawAttendanceLog[],
  memberIdSet: Set<string>
): RawAttendanceLog[] {
  return rawLogs
    .filter((l: RawAttendanceLog) => {
      const memberId = String(l.memberId || '').trim();
      return memberIdSet.has(memberId);
    })
    .map((l: RawAttendanceLog) => ({
      ...l,
      memberId: String(l.memberId || '').trim(),
    }));
}

export function parseRemoteLocations(rawLocations: LocationPreset[]): LocationPreset[] {
  return rawLocations.map((l) => ({
    id: String(l.id || `loc_${Date.now()}`),
    name: String(l.name || ''),
    address: l.address ? String(l.address) : undefined,
    detailAddress: l.detailAddress ? String(l.detailAddress) : undefined,
    entranceNote: l.entranceNote ? String(l.entranceNote) : undefined,
    latitude: typeof l.latitude === 'number' ? l.latitude : parseFloat(String(l.latitude || 37.5665)),
    longitude: typeof l.longitude === 'number' ? l.longitude : parseFloat(String(l.longitude || 126.978)),
    radiusMeters:
      typeof l.radiusMeters === 'number' ? l.radiusMeters : parseInt(String(l.radiusMeters || 100), 10),
    isDefault: l.isDefault === true || String(l.isDefault).toUpperCase() === 'TRUE',
  }));
}

export function parseRemoteProgramCards(rawCards: ProgramCard[]): ProgramCard[] {
  return rawCards.map((c) => {
    const rawParts = (c as unknown as Record<string, unknown>).targetParts;
    const rawMembers = (c as unknown as Record<string, unknown>).targetMemberIds;
    return {
      id: String(c.id || `card_${Date.now()}`),
      title: String(c.title || ''),
      description: c.description ? String(c.description) : undefined,
      category: c.category || '정기연습',
      defaultLocationId: c.defaultLocationId ? String(c.defaultLocationId) : undefined,
      defaultStartTime: c.defaultStartTime ? String(c.defaultStartTime) : '19:30',
      defaultEndTime: c.defaultEndTime ? String(c.defaultEndTime) : '21:30',
      targetAudienceType: c.targetAudienceType || 'ALL',
      targetParts:
        typeof rawParts === 'string'
          ? (rawParts.split(',').map((p: string) => p.trim()).filter(Boolean) as PartType[])
          : Array.isArray(rawParts)
          ? (rawParts as PartType[])
          : undefined,
      targetMemberIds:
        typeof rawMembers === 'string'
          ? (rawMembers.split(',').map((id: string) => id.trim()).filter(Boolean) as string[])
          : Array.isArray(rawMembers)
          ? (rawMembers as string[])
          : undefined,
      isArchived: c.isArchived === true || String(c.isArchived).toUpperCase() === 'TRUE',
      createdAt: c.createdAt ? String(c.createdAt) : getKSTTimestampString(),
    };
  });
}

/**
 * 시트 `일정댓글` 탭의 원천 행을 이벤트로 정리한다.
 * 필드가 빠진 과거·수동 행은 안전한 기본값으로 읽고, 알아볼 수 없는 행동이나 id·일정·단원이 없는 행은 건너뛴다(원본 시트는 그대로).
 */
export function parseRemoteCommentEvents(rawEvents: unknown[]): ScheduleCommentEvent[] {
  const events: ScheduleCommentEvent[] = [];
  for (const raw of rawEvents) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const str = (value: unknown) => (value === undefined || value === null ? '' : String(value).trim());
    const action = str(row.action).toUpperCase();
    if (action !== 'CREATE' && action !== 'EDIT' && action !== 'DELETE') continue;
    const id = str(row.id);
    const scheduleId = str(row.scheduleId);
    const memberId = str(row.memberId);
    if (!id || !scheduleId || !memberId) continue;
    events.push({
      id,
      scheduleId,
      memberId,
      memberName: str(row.memberName) || '단원',
      part: (str(row.part) || '소프라노') as PartType,
      action,
      targetId: str(row.targetId) || undefined,
      text: row.text === undefined || row.text === null ? undefined : String(row.text),
      timestamp: str(row.timestamp),
      deviceId: str(row.deviceId) || undefined,
    });
  }
  return events;
}

export function parsePracticeCatalog(raw: unknown): PracticeCatalog {
  const emptyCatalog: PracticeCatalog = { pieces: [], tracks: [], programPieces: [] };
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
          : '';
    const updatedAt =
      row.updatedAt !== undefined && row.updatedAt !== null
        ? String(row.updatedAt)
        : row.updated_at !== undefined && row.updated_at !== null
          ? String(row.updated_at)
          : createdAt;

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
    const kind = row.kind !== undefined && row.kind !== null ? String(row.kind) : '';
    const source =
      row.source !== undefined && row.source !== null
        ? String(row.source)
        : row.source_type !== undefined && row.source_type !== null
          ? String(row.source_type)
          : '';
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
    const rawSizeBytes = row.sizeBytes ?? row.size_bytes;
    const sizeBytes =
      typeof rawSizeBytes === 'number' && !Number.isNaN(rawSizeBytes)
        ? rawSizeBytes
        : typeof rawSizeBytes === 'string' && rawSizeBytes.trim() !== '' && !Number.isNaN(Number(rawSizeBytes))
          ? Number(rawSizeBytes)
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
          : '';
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

  return { pieces, tracks, programPieces };
}

