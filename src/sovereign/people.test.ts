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
import {
  AUTH_TABLES,
  LEGACY_AUTH_TABLES,
  openStoreBesideAuth,
  testTarget,
} from '../db/test-support';
import { vaultOf } from '../keys/server/vault';
import { RateLimiter } from '../limits/rate';
import { applyMutation } from '../server/entries/apply';
import { makeEntry, put } from '../server/entries/test-support';
import { keepRoot } from '../server/keyring';
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
  'keyring',
  'account_stream',
  'entry',
  'applied_mutation',
  'rate_bucket',
  'credential',
];
/** Tables that are about something else than a person. */
const NOT_A_PERSON: string[] = [];

/** The auth store's tables, `@sovereignfs/auth`'s since the move, and what deleting a person does to each. */
const DECIDED_AUTH: Record<string, string> = {
  users: 'deleted',
  sessions: 'deleted',
  accounts: 'deleted',
  verifications: 'deleted, found by the address',
  two_factors: 'deleted',
  passkeys: 'deleted',
  sv_key_secrets: 'a session’s, deleted with the account’s sessions',
  sv_core_sign_ins: 'a session’s, deleted with the account’s sessions',
  sv_legacy_passwords: 'deleted',
  rate_limits:
    'keyed by address or by a hash of it, not by person, and swept when its window is over: not an account’s',
  sv_core_notices: 'core’s notices by their jti, kept until they expire: no person’s',
  sv_sessions: 'sign-ins through core still pending, which run out: no account’s yet',
  sv_key_apps: 'a person’s keys for the app, wrapped: deleted by the vault’s `deleteAccount`',
  sv_key_settings: 'the vault’s settings, the instance’s vault id among them: no person’s',
  sv_key_accounts: 'a person’s keys, wrapped: deleted by the vault’s `deleteAccount`',
  sv_key_wraps: 'a person’s ways in, wrapped: deleted by the vault’s `deleteAccount`',
  sv_auth_adoption: 'the record of the move: no person’s',
  sv_auth_migrations: 'a migration history: no person’s',
  sv_core_sign_in_migrations: 'a migration history: no person’s',
  wallet_sdk_store_migrations: 'a migration history: no person’s',
  sv_key_migrations: 'a migration history: no person’s',
};

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
    // The app store's; the frozen auth schema in it is the store before the move, whose tables the package's replaced.
    const legacy = new Set(LEGACY_AUTH_TABLES);
    const names = Object.values(sqliteSchema)
      .filter((each) => is(each, SQLiteTable))
      .map((each) => getTableConfig(each as SQLiteTable).name)
      .filter((name) => !legacy.has(name));
    expect(names.length).toBeGreaterThan(5);
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

describe(`the auth store's tables (${leg})`, () => {
  it('are each decided', () => {
    expect([...AUTH_TABLES].sort()).toEqual(Object.keys(DECIDED_AUTH).sort());
  });
});

describe(`deleting a person (${leg})`, () => {
  it('leaves nothing of them, runs twice without harm, and leaves the other person whole', async () => {
    const [ada, grace] = [t.ada.id, t.grace.id];
    const ring = ringOf(entryOf(randomBytes(32)).key);
    if (!ring) throw new Error('no ring');
    for (const who of [ada, grace]) {
      // A password still to move (auth.md §8.1), which the package keeps by the account.
      await t.auth.store.run('INSERT INTO sv_legacy_passwords (user_id, until) VALUES (?, ?)', [
        who,
        NOW,
      ]);
      // Entries (one deleted: a tombstone), a credential and a rate counter.
      // The wrapped keyring root, and the suite's keys of the person: their keys, one way in and the app's key, in the vault of the auth store.
      await keepRoot(database, who, { epoch: 1, wrapped: randomBytes(60) }, NOW);
      const key = () => randomBytes(32).toString('base64url');
      await vaultOf(t.auth.store).setUp(
        who,
        { suite: 1, unlockSalt: key(), signingPublic: key(), signingPrivate: '{}' },
        [{ way: 'password', id: key(), record: '{}' }],
      );
      await vaultOf(t.auth.store).putApp(who, {
        clientId: 'wallet',
        appKey: '{}',
        identity: '{}',
        signature: randomBytes(64).toString('base64url'),
      });
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

    const first = await deletePerson({ database, authDatabase: t.auth.store, now: () => NOW }, ada);
    expect(first.entries).toBe(2);
    // Twice: a run that stopped part way is finished by running it again, and a finished one finds nothing.
    const second = await deletePerson(
      { database, authDatabase: t.auth.store, now: () => NOW },
      ada,
    );
    expect(second.entries).toBe(0);

    for (const table of ['entry', 'applied_mutation', 'keyring', 'account_stream', 'credential'])
      expect(await count(table, `account_id = '${ada}'`), table).toBe(0);
    expect(await count('rate_bucket', `"key" LIKE '%:${ada}'`)).toBe(0);
    expect(await authCount('users', `id = '${ada}'`)).toBe(0);
    expect(await authCount('sessions', `user_id = '${ada}'`)).toBe(0);
    expect(await authCount('accounts', `user_id = '${ada}'`)).toBe(0);
    expect(await authCount('sv_legacy_passwords', `user_id = '${ada}'`)).toBe(0);
    for (const table of ['sv_key_accounts', 'sv_key_wraps', 'sv_key_apps'])
      expect(await authCount(table, `user_id = '${ada}'`), table).toBe(0);

    // Grace has everything she had.
    expect(await count('entry', `account_id = '${grace}'`)).toBe(2);
    expect(await count('applied_mutation', `account_id = '${grace}'`)).toBe(2);
    expect(await count('keyring', `account_id = '${grace}'`)).toBe(1);
    expect(await count('account_stream', `account_id = '${grace}'`)).toBe(1);
    expect(await count('credential', `account_id = '${grace}'`)).toBe(1);
    expect(await count('rate_bucket', `"key" LIKE '%:${grace}'`)).toBe(1);
    expect(await authCount('users', `id = '${grace}'`)).toBe(1);
    expect(await authCount('sv_legacy_passwords', `user_id = '${grace}'`)).toBe(1);
    for (const table of ['sv_key_accounts', 'sv_key_wraps', 'sv_key_apps'])
      expect(await authCount(table, `user_id = '${grace}'`), table).toBe(1);
  });
});
