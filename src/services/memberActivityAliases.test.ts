import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Member } from '../types/rollbook';
import { resetStorage, SheetsService } from './sheets';
import { SupabaseBackend } from './backend/supabaseBackend';

afterEach(() => {
  vi.restoreAllMocks();
  resetStorage();
});

describe('member activity aliases', () => {
  it('sends the representative first and caps a 21-alias identity at 20 IDs', async () => {
    resetStorage();
    const service = new SheetsService(
      new SupabaseBackend({
        url: 'https://test.supabase.co',
        anonKey: 'test-anon-key',
      })
    );
    const members: Member[] = [
      {
        id: 'canonical',
        name: '대표',
        part: '알토',
        phoneLast4: '',
        role: 'MEMBER',
        status: 'ACTIVE',
        createdAt: '',
        joinedAt: '',
        memberStatus: '정단원',
        note: '',
      },
      ...Array.from({ length: 21 }, (_, index) => ({
        id: `alias-${String(index + 1).padStart(2, '0')}`,
        name: `별칭 ${index + 1}`,
        part: '알토' as const,
        phoneLast4: '',
        role: 'MEMBER' as const,
        status: 'MERGED' as const,
        createdAt: '',
        joinedAt: '',
        memberStatus: '정단원',
        note: '',
        mergedIntoId: 'canonical',
      })),
    ];
    service.seedTestData({ members });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            rsvpEvents: [],
            listen: { totalSeconds: 0, firstAt: null, daily: [], perPiece: [] },
          },
        }),
        { status: 200 }
      )
    );

    await service.getMemberActivity('alias-21');

    const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body)) as {
      p_member_ids: string[];
    };
    expect(body.p_member_ids).toHaveLength(20);
    expect(body.p_member_ids[0]).toBe('canonical');
    expect(body.p_member_ids[1]).toBe('alias-01');
    expect(body.p_member_ids[19]).toBe('alias-19');
    expect(warnSpy).toHaveBeenCalled();
  });
});
