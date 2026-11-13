import { randomBytes } from 'node:crypto';
import { is, sql } from 'drizzle-orm';
import { SQLiteTable, getTableConfig } from 'drizzle-orm/sqlite-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type TwoAccounts, twoAccounts } from '../access/two-accounts';
import { entryOf, ringOf } from '../crypto/keys';
import { putCredential } from '../crypto/store';
import type { Database } from '../db/client';
import { dbAll } from '../db/exec';
import * as sqliteSchema from '../db/schema/sqlite';
import { openStoreBesideAuth, testTarget } from '../db/test-support';
import { RateLimiter } from '../limits/rate';
import { applyMutation } from '../server/entries/apply';
import { makeEntry, put } from '../server/entries/test-support';
import { createVault } from '../server/vault';
import { deletePerson } from './people';

/**
 * Deleting an account (DESIGN.md §28), on two real accounts and every table. **The test that keeps the routine whole:** it asks the schema for its tables,
 * and a table that is in neither list below fails it, so a new table that holds something of a person cannot be added without deciding what becomes of
 * it. Then it seeds a row of each table for the person and for a second person, runs the routine (twice), and finds nothing of the first and everything of
 * the second.
 */
const { leg } = testTarget();

/** Tables whose rows are the person's, and go with them. */
const GOES = [
  'vault',
  'account_stream',
  'entry',
  'applied_mutation',
  'rate_bucket',
  'credential',
  'user',
  'two_factor',
  'passkey',
  'session',
  'account',
  'verification',
];
/** Tables that are about something else than a person. */
const NOT_A_PERSON = ['rate_limit'];

let t: TwoAccounts;
let database: Database;
let close: () => Promise<void>;
beforeAll(async () => {
  t = await twoAccounts();
  ({ database, close } = await openStoreBesideAuth());
});
afterAll(async () => {
  await t.close();
  await close();
});

const NOW = 1_800_000_000_000;
const appTable = (name: string) => (database.dialect === 'postgres' ? `wallet.${name}` : name);
const authTable = (name: string): string =>
  t.auth.database.dialect === 'postgres' ? `"wallet_auth"."${name}"` : `"${name}"`;
const count = async (table: string, where: string): Promise<number> =>
  Number(
    (
      await dbAll<{ n: number | string }>(
        database,
        sql.raw(`SELECT COUNT(*) AS n FROM ${appTable(table)} WHERE ${where}`),
      )
    )[0]?.n ?? 0,
  );
const authCount = async (table: string, where: string): Promise<number> =>
  Number(
    (
      await dbAll<{ n: number | string }>(
        t.auth.database,
        sql.raw(`SELECT COUNT(*) AS n FROM ${authTable(table)} WHERE ${where}`),
      )
    )[0]?.n ?? 0,
  );

describe(`the tables (${leg})`, () => {
  it('are each decided: they go with the person, or they are not about a person', () => {
    const names = Object.values(sqliteSchema)
      .filter((each) => is(each, SQLiteTable))
      .map((each) => getTableConfig(each as SQLiteTable).name);
    expect(names.length).toBeGreaterThan(10);
    const decided = new Set([...GOES, ...NOT_A_PERSON]);
    expect(
      names.filter((name) => !decided.has(name)),
      'a table nobody decided about',
    ).toEqual([]);
    expect(
      [...decided].filter((name) => !names.includes(name)),
      'a table that is not there',
    ).toEqual([]);
  });
});

describe(`deleting a person (${leg})`, () => {
  it('leaves nothing of them, runs twice without harm, and leaves the other person whole', async () => {
    const [ada, grace] = [t.ada.id, t.grace.id];
    const ring = ringOf(entryOf(randomBytes(32)).key);
    if (!ring) throw new Error('no ring');
    for (const who of [ada, grace]) {
      // A vault, entries (one deleted: a tombstone), a credential and a rate counter.
      await createVault(
        database,
        who,
        {
          recipients: [{ recipient: `age1${'q'.repeat(58)}`, label: 'wallet', addedAt: NOW }],
          header: Buffer.from('age-encryption.org/v1\n'),
          vaultKeyId: 'AAAAAAAAAAAAAAAA',
        },
        NOW,
      );
      for (let i = 0; i < 2; i++) {
        const made = await makeEntry(who);
        await applyMutation(database, who, await put(who, made), {
          now: NOW,
          limits: { storageBytes: 1e9, entryBodyBytes: 262144, entries: 100 },
        });
      }
      await putCredential(
        database,
        ring,
        { id: `cred:${who}`, accountId: who, purpose: 'github-token' },
        'github_pat_PLANTED_TOKEN',
        NOW,
      );
      await new RateLimiter(database).take(`sync:${who}`, { limit: 10, windowMs: 60_000 });
    }
    expect(await count('entry', `account_id = '${ada}'`)).toBe(2);

    const first = await deletePerson(
      { database, authDatabase: t.auth.database, now: () => NOW },
      ada,
    );
    expect(first.entries).toBe(2);
    // Twice: a run that stopped part way is finished by running it again, and a finished one finds nothing.
    const second = await deletePerson(
      { database, authDatabase: t.auth.database, now: () => NOW },
      ada,
    );
    expect(second.entries).toBe(0);

    for (const table of ['entry', 'applied_mutation', 'vault', 'account_stream', 'credential'])
      expect(await count(table, `account_id = '${ada}'`), table).toBe(0);
    expect(await count('rate_bucket', `"key" LIKE '%:${ada}'`)).toBe(0);
    expect(await authCount('user', `id = '${ada}'`)).toBe(0);
    expect(await authCount('session', `user_id = '${ada}'`)).toBe(0);
    expect(await authCount('account', `user_id = '${ada}'`)).toBe(0);

    // Grace has everything she had.
    expect(await count('entry', `account_id = '${grace}'`)).toBe(2);
    expect(await count('applied_mutation', `account_id = '${grace}'`)).toBe(2);
    expect(await count('vault', `account_id = '${grace}'`)).toBe(1);
    expect(await count('account_stream', `account_id = '${grace}'`)).toBe(1);
    expect(await count('credential', `account_id = '${grace}'`)).toBe(1);
    expect(await count('rate_bucket', `"key" LIKE '%:${grace}'`)).toBe(1);
    expect(await authCount('user', `id = '${grace}'`)).toBe(1);
  });
});
