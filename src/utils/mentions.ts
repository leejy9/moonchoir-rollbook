import type { Member } from '../types/rollbook';
import { resolveMemberIdentity } from './memberIdentity';

function normalizeSearchText(val: string): string {
  return val.replace(/\s+/g, '').toLowerCase();
}

function isBoundaryChar(ch: string | undefined): boolean {
  if (ch === undefined) return true;
  return /[\s.,!?;:)'"~…\]}>]/.test(ch);
}

/**
 * `@` 뒤 검색어로 활성 단원(병합·삭제·본인 제외)을 걸러 낸다.
 * 공백을 무시하고 앞부분 일치를 우선한다.
 */
export function filterMentionCandidates(
  members: Member[],
  query: string,
  excludeCanonicalId?: string
): Member[] {
  const q = normalizeSearchText(query);
  const active = members.filter(
    (m) =>
      m.status !== 'DELETED' &&
      m.status !== 'MERGED' &&
      !m.mergedIntoId &&
      m.id !== excludeCanonicalId
  );

  if (!q) return active;

  const prefixMatches: Member[] = [];
  const containsMatches: Member[] = [];
  for (const m of active) {
    const nameNorm = normalizeSearchText(m.name);
    if (nameNorm.startsWith(q)) {
      prefixMatches.push(m);
    } else if (nameNorm.includes(q)) {
      containsMatches.push(m);
    }
  }
  return [...prefixMatches, ...containsMatches];
}

/**
 * 보내기 직전 본문에 실제로 남아 있는 `@{이름}` 개수만큼만 언급 id를 앞에서부터 남긴다.
 * 긴 이름부터 경계 규칙(뒤가 끝·공백·문장부호)으로 맞춘다.
 */
export function pruneMentions(
  text: string,
  mentionIds: string[],
  members: Member[]
): string[] {
  if (mentionIds.length === 0 || !text) return [];
  const memberById = new Map(members.map((m) => [m.id, m]));

  // 언급 목록에 있는 단원들의 현재 이름(긴 이름 우선)
  const names = Array.from(
    new Set(
      mentionIds
        .map((id) => memberById.get(id)?.name)
        .filter((n): n is string => Boolean(n && n.length > 0))
    )
  ).sort((a, b) => b.length - a.length);

  if (names.length === 0) return [];

  const matchedNameCounts = new Map<string, number>();
  let i = 0;
  while (i < text.length) {
    if (text[i] === '@') {
      let matchedName: string | null = null;
      for (const name of names) {
        if (text.startsWith(name, i + 1) && isBoundaryChar(text[i + 1 + name.length])) {
          matchedName = name;
          break;
        }
      }
      if (matchedName) {
        matchedNameCounts.set(matchedName, (matchedNameCounts.get(matchedName) ?? 0) + 1);
        i += 1 + matchedName.length;
        continue;
      }
    }
    i += 1;
  }

  const remaining = new Map(matchedNameCounts);
  const kept: string[] = [];
  const seenIds = new Set<string>();
  for (const rawId of mentionIds) {
    const canonId = resolveMemberIdentity(rawId, members).canonicalId;
    if (seenIds.has(canonId)) continue;
    const name = memberById.get(canonId)?.name;
    if (!name) continue;
    const count = remaining.get(name) ?? 0;
    if (count > 0) {
      remaining.set(name, count - 1);
      seenIds.add(canonId);
      kept.push(canonId);
    }
  }
  return kept;
}

export interface MentionTextSegment {
  text: string;
  isMention: boolean;
}

/**
 * 댓글 글자 안의 `@{이름}` 중 언급 목록에 있는 단원의 현재 이름과 맞는 부분만 강조 조각으로 나눈다.
 */
export function splitMentionText(
  text: string,
  mentionIds: string[] | undefined,
  members: Member[]
): MentionTextSegment[] {
  if (!text) return [{ text: '', isMention: false }];
  if (!mentionIds || mentionIds.length === 0) {
    return [{ text, isMention: false }];
  }

  const memberById = new Map(members.map((m) => [m.id, m]));
  const names = Array.from(
    new Set(
      mentionIds
        .map((id) => {
          const canonId = resolveMemberIdentity(id, members).canonicalId;
          return memberById.get(canonId)?.name ?? memberById.get(id)?.name;
        })
        .filter((n): n is string => Boolean(n && n.length > 0))
    )
  ).sort((a, b) => b.length - a.length);

  if (names.length === 0) {
    return [{ text, isMention: false }];
  }

  const segments: MentionTextSegment[] = [];
  let buffer = '';
  let i = 0;

  while (i < text.length) {
    if (text[i] === '@') {
      let matchedName: string | null = null;
      for (const name of names) {
        if (text.startsWith(name, i + 1) && isBoundaryChar(text[i + 1 + name.length])) {
          matchedName = name;
          break;
        }
      }
      if (matchedName) {
        if (buffer) {
          segments.push({ text: buffer, isMention: false });
          buffer = '';
        }
        segments.push({ text: `@${matchedName}`, isMention: true });
        i += 1 + matchedName.length;
        continue;
      }
    }
    buffer += text[i];
    i += 1;
  }

  if (buffer) {
    segments.push({ text: buffer, isMention: false });
  }

  return segments.length > 0 ? segments : [{ text, isMention: false }];
}
