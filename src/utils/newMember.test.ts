import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildNewMember } from './newMember';

describe('buildNewMember', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the actual KST registration date as the join date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T15:30:00.000Z'));

    const member = buildNewMember('신규 단원', '소프라노', '010-1234-5678', '5678', 'device-1');

    expect(member.createdAt).toBe('2026-10-21 00:30:00');
    expect(member.joinedAt).toBe('2026-10-21');
  });
});
