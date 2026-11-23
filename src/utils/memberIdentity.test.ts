import { describe, expect, it, vi } from 'vitest';
import type { Member } from '../types/rollbook';
import { resolveMemberIdentity } from './memberIdentity';

function member(id: string, mergedIntoId?: string): Member {
  return {
    id,
    name: id,
    part: '알토',
    phoneLast4: '',
    role: 'MEMBER',
    status: mergedIntoId ? 'MERGED' : 'ACTIVE',
    createdAt: '',
    joinedAt: '',
    memberStatus: '정단원',
    note: '',
    ...(mergedIntoId ? { mergedIntoId } : {}),
  };
}

describe('resolveMemberIdentity', () => {
  it('resolves both a representative and an old ID to the same ordered alias set', () => {
    const members = [member('old', 'current'), member('current')];
    const fromOldId = resolveMemberIdentity('old', members);
    const fromCurrentId = resolveMemberIdentity('current', members);

    expect(fromOldId).toEqual({ canonicalId: 'current', aliasIds: ['current', 'old'] });
    expect(fromCurrentId).toEqual(fromOldId);
  });

  it('follows multi-level merges and sorts aliases after the representative', () => {
    const members = [member('b', 'z'), member('a', 'b'), member('z')];

    expect(resolveMemberIdentity('a', members)).toEqual({
      canonicalId: 'z',
      aliasIds: ['z', 'a', 'b'],
    });
  });

  it('uses the requested ID as canonical and warns when the merge chain is cyclic', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const members = [member('a', 'b'), member('b', 'a')];

    expect(resolveMemberIdentity('a', members)).toEqual({
      canonicalId: 'a',
      aliasIds: ['a', 'b'],
    });
    expect(warnSpy).toHaveBeenCalled();
  });

  it('keeps an unknown requested ID as its own identity', () => {
    expect(resolveMemberIdentity('missing', [])).toEqual({
      canonicalId: 'missing',
      aliasIds: ['missing'],
    });
  });
});
