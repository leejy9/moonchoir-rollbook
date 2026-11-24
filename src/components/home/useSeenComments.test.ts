import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PREFERENCE_KEYS, resetStorage } from '../../services/sheetsStorage';
import { readSeenCommentsState, recordSeenComments } from './useSeenComments';

describe('recordSeenComments (V3-22 R7 봄 처리)', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map<string, string>();
    const mock = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
    };
    vi.stubGlobal('window', { localStorage: mock });
    vi.stubGlobal('localStorage', mock);
    resetStorage();
  });
  afterEach(() => vi.unstubAllGlobals());

  const KEY = PREFERENCE_KEYS.SEEN_COMMENTS;

  it('ok면 보인 id를 더한다', () => {
    store.set(KEY, JSON.stringify(['c1']));
    recordSeenComments(['c1', 'c2', 'c3']);
    expect(JSON.parse(store.get(KEY) ?? 'null')).toEqual(['c1', 'c2', 'c3']);
  });

  it('missing이면 아무것도 쓰지 않는다(일부 목록이 기준값을 대신하면 안 됨)', () => {
    recordSeenComments(['c2']);
    expect(store.has(KEY)).toBe(false);
    expect(readSeenCommentsState()).toEqual({ kind: 'missing' });
  });

  it('invalid면 덮어쓰지 않는다', () => {
    store.set(KEY, '{broken');
    recordSeenComments(['c2']);
    expect(store.get(KEY)).toBe('{broken');
  });

  it('이미 다 본 것이면 다시 쓰지 않는다', () => {
    store.set(KEY, JSON.stringify(['c1', 'c2']));
    recordSeenComments(['c1']);
    expect(store.get(KEY)).toBe(JSON.stringify(['c1', 'c2']));
  });
});
