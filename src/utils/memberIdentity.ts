import type { Member } from '../types/rollbook';

export interface MemberIdentity {
  canonicalId: string;
  aliasIds: string[];
}

export function resolveMemberIdentity(memberId: string, members: Member[]): MemberIdentity {
  const memberById = new Map(members.map((member) => [member.id, member]));
  const visited = new Set([memberId]);
  let canonicalId = memberId;
  let currentId = memberId;
  let hasCycle = false;

  while (true) {
    const parentId = memberById.get(currentId)?.mergedIntoId;
    if (!parentId) break;
    if (visited.has(parentId)) {
      canonicalId = memberId;
      hasCycle = true;
      break;
    }

    currentId = parentId;
    visited.add(currentId);
    canonicalId = currentId;
    if (!memberById.has(currentId)) break;
  }

  if (hasCycle) {
    console.warn(`[memberIdentity] Merge cycle found for ${memberId}; using it as canonical ID.`);
  }

  const aliases = new Set([canonicalId]);
  let addedAlias = true;
  while (addedAlias) {
    addedAlias = false;
    for (const member of members) {
      if (member.mergedIntoId && aliases.has(member.mergedIntoId) && !aliases.has(member.id)) {
        aliases.add(member.id);
        addedAlias = true;
      }
    }
  }

  return {
    canonicalId,
    aliasIds: [
      canonicalId,
      ...[...aliases].filter((id) => id !== canonicalId).sort((a, b) => a.localeCompare(b)),
    ],
  };
}
