import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import type { Database } from './client';
import { dbAll, dbRun } from './exec';
import { migrationsFolder, runMigrations } from './migrate';
import { freshDatabase, testTarget } from './test-support';

/**
 * Upgrading a database of 0.6.0, which holds entries sealed under 0.1.x's keys, to 0.7.0 (RFC 0001): **the entries are let go,** since nothing can open them any
 * more, with the record of their mutations and the accounts' change counters; the vault table is gone, the keyring is there; and what is not a wallet's (the
 * server's own credentials) stays. The migrations are the committed ones, run on whichever database the leg is.
 */
const { leg } = testTarget();

const opened: Database[] = [];
const folders: string[] = [];
afterAll(async () => {
  await Promise.all(opened.map((database) => database.close()));
  for (const folder of folders) rmSync(folder, { recursive: true, force: true });
});

/** The migrations as 0.6.0 had them: the first alone, with a journal that names no other. */
function migrationsOf060(database: Database): string {
  const from = migrationsFolder(database.dialect, database.store);
  const folder = mkdtempSync(join(tmpdir(), 'wallet-migrations-060-'));
  folders.push(folder);
  mkdirSync(join(folder, 'meta'));
  const journal = JSON.parse(readFileSync(join(from, 'meta', '_journal.json'), 'utf8')) as {
    entries: { tag: string }[];
  };
  const first = journal.entries.slice(0, 1);
  expect(first[0]?.tag).toBe('0000_init');
  copyFileSync(join(from, '0000_init.sql'), join(folder, '0000_init.sql'));
  writeFileSync(
    join(folder, 'meta', '_journal.json'),
    JSON.stringify({ ...journal, entries: first }),
  );
  return folder;
}

const table = (database: Database, name: string) =>
  sql.raw(database.dialect === 'postgres' ? `wallet.${name}` : name);

const count = async (database: Database, name: string): Promise<number> =>
  Number(
    (
      await dbAll<{ n: number | string }>(
        database,
        sql`SELECT COUNT(*) AS n FROM ${table(database, name)}`,
      )
    )[0]?.n,
  );

describe(`upgrading from 0.6.0 (${leg})`, () => {
  it('starts clean: no entry of the old design survives, and what is not a wallet’s stays', async () => {
    const { database } = await freshDatabase('app');
    opened.push(database);
    await runMigrations(database, migrationsOf060(database));
    const bytes = Buffer.from('sealed under a key that is gone');
    await dbRun(
      database,
      sql`INSERT INTO ${table(database, 'vault')} (account_id, version, recipients, header, vault_key_id, state, created_at, updated_at)
          VALUES ('ada', 1, '[]', ${bytes}, 'k', 'active', 1, 1)`,
    );
    await dbRun(
      database,
      sql`INSERT INTO ${table(database, 'entry')} (id, account_id, tier, holder_device_id, version, seq, wrapped_key, shape, body, file_count, bytes, deleted_at, created_at, updated_at)
          VALUES ('e1', 'ada', 'synced', NULL, 1, 1, ${bytes}, ${bytes}, ${bytes}, 0, 10, NULL, 1, 1)`,
    );
    await dbRun(
      database,
      sql`INSERT INTO ${table(database, 'applied_mutation')} (account_id, id, seq, applied_at) VALUES ('ada', 'm1', 1, 1)`,
    );
    await dbRun(
      database,
      sql`INSERT INTO ${table(database, 'account_stream')} (account_id, seq, mode) VALUES ('ada', 1, 'normal')`,
    );
    await dbRun(
      database,
      sql`INSERT INTO ${table(database, 'rate_bucket')} ("key", window_start, "count") VALUES ('sync:ada', 1, 1)`,
    );

    await runMigrations(database);
    // Twice, as two starts would: the second changes nothing.
    await runMigrations(database);

    for (const name of ['entry', 'applied_mutation', 'account_stream', 'keyring'])
      expect(await count(database, name), name).toBe(0);
    await expect(count(database, 'vault')).rejects.toThrow();
    expect(await count(database, 'rate_bucket')).toBe(1);
    // The entry table takes what 0.7.0 writes, and no longer has the wrapped key.
    await dbRun(
      database,
      sql`INSERT INTO ${table(database, 'entry')} (id, account_id, tier, holder_device_id, version, seq, key_epoch, shape, body, file_count, bytes, deleted_at, created_at, updated_at)
          VALUES ('e2', 'ada', 'synced', NULL, 1, 1, 1, ${bytes}, NULL, 0, 10, NULL, 1, 1)`,
    );
    await expect(
      dbAll(database, sql`SELECT wrapped_key FROM ${table(database, 'entry')}`),
    ).rejects.toThrow();
  });
});
