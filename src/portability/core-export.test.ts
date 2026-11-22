import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../db/client';
import { dbRun } from '../db/exec';
import { runMigrations } from '../db/migrate';
import * as postgresSchema from '../db/schema/postgres';
import * as sqliteSchema from '../db/schema/sqlite';
import { freshDatabase, testTarget } from '../db/test-support';
import { personRecords, toRecords } from './core-export';

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
