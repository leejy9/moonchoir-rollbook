import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackendActionResult, RemoteBackend, RemoteSnapshot } from './backend/types';
import { mapSnakeToCamelCommentEvent, mapSnakeToCamelReactionEvent } from './realtime/supabaseRealtime';
import { resetStorage, SheetsService } from './sheets';
import { parseRemoteCommentEvents, parseRemoteReactionEvents } from './sheetsParser';

class StubSupabaseBackend implements RemoteBackend {
  public readonly kind = 'supabase' as const;
  public calls: Array<{ action: string; payload: unknown }> = [];
  public nextResult: BackendActionResult = { success: true };
  public snapshot: RemoteSnapshot = {};

  async requestSnapshot(): Promise<RemoteSnapshot> {
    return this.snapshot;
  }

  async callAction(action: string, payload: unknown): Promise<BackendActionResult> {
    this.calls.push({ action, payload });
    return this.nextResult;
  }
}

describe('V3-24 adapter & realtime mappers', () => {
  beforeEach(() => {
    resetStorage();
    vi.useFakeTimers();
  });

  it('NON_MUTATING_ACTIONS (GET_SEEN_STATE, MARK_SEEN, ADD_REACTION) do not schedule refresh or bump writeEpoch', async () => {
    const backend = new StubSupabaseBackend();
    const service = new SheetsService(backend);
    const refreshSpy = vi.spyOn(service, 'refreshRemoteData').mockResolvedValue(true);

    await service.sendToGoogleSheet('GET_SEEN_STATE', { memberIds: ['m1'] });
    await service.sendToGoogleSheet('MARK_SEEN', { memberId: 'm1', items: [] });
    await service.sendToGoogleSheet('ADD_REACTION', { id: 'r1' });

    await vi.advanceTimersByTimeAsync(5000);
    expect(refreshSpy).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('parses legacy comment events without receivedAt/mentionMemberIds and new ones with both', () => {
    const events = parseRemoteCommentEvents([
      { id: 'c_old', scheduleId: 's1', memberId: 'm1', action: 'CREATE', text: 'old', timestamp: '2026-11-20 10:00:00' },
      {
        id: 'c_new',
        scheduleId: 's1',
        memberId: 'm2',
        action: 'CREATE',
        text: '@이하은',
        timestamp: '2026-11-27 10:00:00',
        receivedAt: '2026-11-27T01:00:00.000Z',
        mentionMemberIds: ['m1'],
      },
    ]);
    expect(events).toHaveLength(2);
    expect(events[0].receivedAt).toBeUndefined();
    expect(events[0].mentionMemberIds).toBeUndefined();
    expect(events[1].receivedAt).toBe('2026-11-27T01:00:00.000Z');
    expect(events[1].mentionMemberIds).toEqual(['m1']);
  });

  it('mapSnakeToCamelCommentEvent handles +00:00 microseconds and both array & {a,b} mention_member_ids', () => {
    const a = mapSnakeToCamelCommentEvent({
      id: 'c1',
      schedule_id: 's1',
      member_id: 'm2',
      action: 'CREATE',
      text: '@이하은',
      timestamp: '2026-11-27 10:00:00',
      received_at: '2026-11-27 01:00:00.123456+00:00',
      mention_member_ids: '{m1,m3}',
    });
    expect(a.receivedAt).toBe('2026-11-27 01:00:00.123456+00:00');
    expect(a.mentionMemberIds).toEqual(['m1', 'm3']);

    const b = mapSnakeToCamelCommentEvent({
      id: 'c2',
      schedule_id: 's1',
      member_id: 'm2',
      action: 'CREATE',
      text: '@민지',
      timestamp: '2026-11-27 10:05:00',
      received_at: '2026-11-27T01:05:00.000Z',
      mention_member_ids: ['m2'],
    });
    expect(b.mentionMemberIds).toEqual(['m2']);
  });

  it('mapSnakeToCamelReactionEvent & parseRemoteReactionEvents validate emojis and actions', () => {
    const rxn = mapSnakeToCamelReactionEvent({
      id: 'r1',
      comment_id: 'c1',
      schedule_id: 's1',
      member_id: 'm2',
      emoji: '👍',
      action: 'ADD',
      received_at: '2026-11-27 01:00:00.123456+00:00',
    });
    expect(rxn).not.toBeNull();
    expect(rxn!.emoji).toBe('👍');

    expect(
      parseRemoteReactionEvents([
        { id: 'r_bad', commentId: 'c1', scheduleId: 's1', memberId: 'm2', emoji: '👎', action: 'ADD' },
        { id: 'r_ok', commentId: 'c1', scheduleId: 's1', memberId: 'm2', emoji: '🎵', action: 'ADD' },
      ])
    ).toHaveLength(1);
  });

  it('toggleReaction performs optimistic update and reverts on failure', async () => {
    const backend = new StubSupabaseBackend();
    backend.nextResult = { success: false, message: 'err' };
    const service = new SheetsService(backend);

    const promise = service.toggleReaction({
      commentId: 'c1',
      scheduleId: 's1',
      memberId: 'm1',
      emoji: '👍',
    });

    // Optimistically present right away
    expect(service.getCommentReactions('c1').get('👍')?.memberAt.has('m1')).toBe(true);

    const ok = await promise;
    expect(ok).toBe(false);
    // Reverted on failure
    expect(service.getCommentReactions('c1').get('👍')).toBeUndefined();
    vi.useRealTimers();
  });
});
