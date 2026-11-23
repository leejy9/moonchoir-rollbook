import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Member, Schedule } from '../../types/rollbook';
import { resetStorage, SheetsService } from '../sheets';
import { SupabaseBackend } from './supabaseBackend';

const migrationDirectory = resolve(process.cwd(), 'supabase/migrations');
const backendSource = readFileSync(
  resolve(process.cwd(), 'src/services/backend/supabaseBackend.ts'),
  'utf8'
);

afterEach(() => {
  vi.restoreAllMocks();
});

function latestFunctionBody(functionName: string): string | undefined {
  const files = readdirSync(migrationDirectory)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  const definitionPattern = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+${functionName}\\s*\\([\\s\\S]*?\\bas\\s+\\$\\$([\\s\\S]*?)\\$\\$;`,
    'gi'
  );
  let latestBody: string | undefined;

  for (const file of files) {
    const sql = readFileSync(join(migrationDirectory, file), 'utf8');
    for (const match of sql.matchAll(definitionPattern)) {
      latestBody = match[1];
    }
  }

  return latestBody;
}

function payloadKeys(body: string): Set<string> {
  return new Set(
    [...body.matchAll(/p_payload\s*(?:->>|->|\?)\s*'([^']+)'/g)].map((match) => match[1])
  );
}

function mappedRpcFunctions(): Map<string, string> {
  const start = backendSource.indexOf('private mapActionToRpc');
  const end = backendSource.indexOf('private formatRpcBody', start);
  const mapperBody = backendSource.slice(start, end);
  const tokens = /case '([^']+)':|return '([^']+)'/g;
  const mappings = new Map<string, string>();
  let pendingActions: string[] = [];

  for (const match of mapperBody.matchAll(tokens)) {
    if (match[1]) {
      pendingActions.push(match[1]);
    } else if (match[2]) {
      for (const action of pendingActions) mappings.set(action, match[2]);
      pendingActions = [];
    }
  }

  return mappings;
}

const contracts = [
  {
    rpc: 'fn_merge_members__impl',
    clientKeys: ['canonicalId', 'secondaryId'],
    legacyKeys: ['representativeId', 'mergedMemberIds'],
  },
  {
    rpc: 'fn_batch_delete_schedules__impl',
    clientKeys: ['ids'],
    legacyKeys: ['scheduleIds'],
  },
] as const;

describe('Supabase RPC payload contracts', () => {
  it('has a latest SQL definition for every mapped action', () => {
    const mappings = mappedRpcFunctions();
    expect(mappings.size).toBeGreaterThan(0);

    for (const [action, rpc] of mappings) {
      const body = latestFunctionBody(`${rpc}__impl`) ?? latestFunctionBody(rpc);
      expect(body, `${action} maps to missing SQL function ${rpc}`).toBeDefined();
    }
  });

  it.each(contracts)(
    '$rpc accepts the screen payload and preserves legacy keys',
    ({ rpc, clientKeys, legacyKeys }) => {
      const body = latestFunctionBody(rpc) ?? latestFunctionBody(rpc.replace(/__impl$/, ''));
      expect(body, `SQL definition not found for ${rpc}`).toBeDefined();
      const acceptedKeys = payloadKeys(body!);

      for (const key of [...clientKeys, ...legacyKeys]) {
        expect(acceptedKeys, `${rpc} does not read p_payload.${key}`).toContain(key);
      }
    }
  );

  it('sends the actual merge and batch-delete payloads through SheetsService to their RPCs', async () => {
    resetStorage();
    const backend = new SupabaseBackend({
      url: 'https://test.supabase.co',
      anonKey: 'test-anon-key',
    });
    const service = new SheetsService(backend);
    const members: Member[] = ['representative', 'secondary'].map((id) => ({
      id,
      name: id,
      part: '알토',
      phoneLast4: '',
      role: 'MEMBER',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00+09:00',
      joinedAt: '2026-01-01',
      memberStatus: '정단원',
      note: '',
    }));
    const schedule: Schedule = {
      id: 'schedule-to-delete',
      title: '일괄 삭제 계약 테스트',
      date: '2026-01-02',
      startTime: '19:00',
      endTime: '21:00',
      locationName: '연습실',
      category: '정기연습',
    };
    service.seedTestData({ members, schedules: [schedule], logs: [], rsvpVotes: [] });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ success: true, message: 'ok' }), { status: 200 })
    );

    await service.mergeDuplicateMembers('representative', 'secondary');
    await service.deleteSchedules(['schedule-to-delete'], true);
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));

    const requests = fetchSpy.mock.calls.map(([url, init]) => ({
      url: String(url),
      body: JSON.parse(String(init?.body)) as { p_payload: Record<string, unknown> },
    }));
    expect(requests[0]).toMatchObject({
      url: 'https://test.supabase.co/rest/v1/rpc/fn_merge_members',
      body: { p_payload: { canonicalId: 'representative', secondaryId: 'secondary' } },
    });
    expect(requests[1]).toMatchObject({
      url: 'https://test.supabase.co/rest/v1/rpc/fn_batch_delete_schedules',
      body: { p_payload: { ids: ['schedule-to-delete'], forceHardDelete: true } },
    });
  });
});
