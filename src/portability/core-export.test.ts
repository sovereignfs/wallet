import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Database } from '../db/client';
import { dbRun } from '../db/exec';
import { runMigrations } from '../db/migrate';
import * as postgresSchema from '../db/schema/postgres';
import * as sqliteSchema from '../db/schema/sqlite';
import { freshDatabase, testTarget } from '../db/test-support';
import type { Limiter } from '../limits/rate';
import { MAX_BODY_BYTES } from '../sovereign/notices';
import { EXPORT_RATE, answerCoreExport, personRecords, toRecords } from './core-export';

/**
 * A person's part of core's export (`signIn.export`): their vault and their entries, as the server stores them, sealed, and nothing of anyone else's or of
 * what was deleted.
 */
const { leg } = testTarget();

describe('rows as records', () => {
  it('write bytes as base64url and a time as ISO 8601 in UTC, and leave out the server’s own columns', () => {
    expect(
      toRecords([
        {
          id: 'e1',
          account_id: 'a',
          seq: 3,
          body: Buffer.from([0xfb, 0xff]),
          shape: new Uint8Array([0xfb, 0xff]).buffer,
          created_at: Date.UTC(2026, 0, 1),
        },
      ]),
    ).toEqual([{ id: 'e1', body: '-_8', shape: '-_8', created_at: '2026-01-01T00:00:00.000Z' }]);
  });
});

describe(`a person’s part (${leg})`, () => {
  let database: Database;
  const ada = crypto.randomUUID();
  const grace = crypto.randomUUID();

  async function entry(accountId: string, body: string, deletedAt: number | null = null) {
    const t = database.dialect === 'postgres' ? postgresSchema : sqliteSchema;
    await dbRun(
      database,
      sql`INSERT INTO ${t.entry} (id, account_id, tier, holder_device_id, version, seq, wrapped_key, shape, body, file_count, bytes, deleted_at, created_at, updated_at)
          VALUES (${crypto.randomUUID()}, ${accountId}, 'synced', NULL, 1, 1, ${Buffer.from('wrapped')}, ${Buffer.from('shape')}, ${Buffer.from(body)}, 0, 10, ${deletedAt}, 1, 1)`,
    );
  }

  beforeAll(async () => {
    ({ database } = await freshDatabase('app'));
    await runMigrations(database);
    const t = database.dialect === 'postgres' ? postgresSchema : sqliteSchema;
    await dbRun(
      database,
      sql`INSERT INTO ${t.vault} (account_id, version, recipients, header, vault_key_id, state, created_at, updated_at)
          VALUES (${ada}, 1, '[]', ${Buffer.from('age header')}, 'k1', 'active', 1, 1)`,
    );
    await entry(ada, 'ada’s card');
    await entry(ada, 'ada’s deleted card', 2);
    await entry(grace, 'grace’s card');
  });
  afterAll(async () => database.close());

  it('holds the vault and every entry that is not deleted, sealed as stored, marked end to end', async () => {
    const parts = await personRecords(database, ada);
    expect(parts.map((each) => [each.kind, each.records.length, each.endToEnd])).toEqual([
      ['vault', 1, true],
      ['entry', 1, true],
    ]);
    const body = parts.find((each) => each.kind === 'entry')?.records[0]?.body;
    expect(Buffer.from(String(body), 'base64url').toString()).toBe('ada’s card');
  });

  it('holds nothing of another person, and is empty for an account Wallet has nothing of', async () => {
    expect(JSON.stringify(await personRecords(database, ada))).not.toContain(
      Buffer.from('grace’s card').toString('base64url'),
    );
    expect(await personRecords(database, crypto.randomUUID())).toEqual([]);
  });
});

describe('core’s request for an export', () => {
  const asked: { key: string; limit: number }[] = [];
  const limiter: Limiter = {
    take: async (key, rule) => {
      asked.push({ key, limit: rule.limit });
      return key.endsWith(':203.0.113.9')
        ? { ok: false, retryAfterMs: 12_000 }
        : ({ ok: true } as const);
    },
  };
  const handleExportRequest = vi.fn(
    async (request: Request) => new Response(await request.text(), { status: 200 }),
  );
  const wiring = (over: { trustedProxies?: string[] } = {}) => ({
    client: { auth: { handleExportRequest } } as never,
    limiter,
    trustedProxies: over.trustedProxies ?? [],
  });
  const ask = (body: string, headers: Record<string, string> = {}) =>
    new Request('https://wallet.example.com/api/sovereign/export', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
      body,
    });

  it('is answered by the SDK, with the body as it was sent, for a caller within its limit', async () => {
    asked.length = 0;
    handleExportRequest.mockClear();
    const reply = await answerCoreExport(
      ask('export_request_token=a.b.c', { 'x-forwarded-for': '203.0.113.7' }),
      wiring(),
    );
    expect(reply?.status).toBe(200);
    expect(await reply?.text()).toBe('export_request_token=a.b.c');
    expect(handleExportRequest).toHaveBeenCalledTimes(1);
    // Counted by the caller's address, under a bucket of its own, at the export's rate.
    expect(asked).toEqual([{ key: 'sovereign-export:203.0.113.7', limit: EXPORT_RATE.limit }]);
  });

  it('is refused unread for a body that is too large, and for a caller over its limit, and neither reaches the SDK', async () => {
    handleExportRequest.mockClear();
    const big = await answerCoreExport(
      ask('x'.repeat(MAX_BODY_BYTES + 1), { 'x-forwarded-for': '203.0.113.7' }),
      wiring(),
    );
    expect(big?.status).toBe(413);
    const over = await answerCoreExport(
      ask('export_request_token=a.b.c', { 'x-forwarded-for': '203.0.113.9' }),
      wiring(),
    );
    expect(over?.status).toBe(429);
    expect(over?.headers.get('retry-after')).toBe('12');
    expect(handleExportRequest).not.toHaveBeenCalled();
  });

  it('counts a caller behind a proxy by its own address, whatever it wrote to the left', async () => {
    asked.length = 0;
    await answerCoreExport(
      ask('export_request_token=a.b.c', { 'x-forwarded-for': '6.6.6.6, 203.0.113.7, 10.0.0.9' }),
      wiring({ trustedProxies: ['10.0.0.0/8'] }),
    );
    expect(asked.map((each) => each.key)).toEqual(['sovereign-export:203.0.113.7']);
  });

  it('is not there where core is not set', async () => {
    // With no wiring given, the server's own is looked for, and with no sign-in through core there is none.
    expect(await answerCoreExport(ask('export_request_token=a.b.c'))).toBeUndefined();
  });
});
