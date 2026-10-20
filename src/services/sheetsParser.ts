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
  TargetAudienceType,
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

    return {
      ...s,
      date: normalizedDate,
      startTime,
      endTime,
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
