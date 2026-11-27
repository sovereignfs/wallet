import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type TwoAccounts, twoAccounts } from '../src/access/two-accounts';
import { parseBody, parseShape } from '../src/core/entries';
import { AppVault } from '@sovereignfs/sdk/vault';
import { FIRST_EPOCH, deriveEntryKey, open } from '../src/core/vault';
import { suiteCipher } from '../src/keys/cipher';
import type { Database } from '../src/db/client';
import { dbAll } from '../src/db/exec';
import { openStoreBesideAuth, testTarget } from '../src/db/test-support';
import { readRoots } from '../src/server/keyring';
import {
  CARDS,
  SEED_EMAIL,
  derivedId,
  isLocalDatabase,
  main,
  removeSeed,
  runSeed,
  seedRoot,
} from './seed';

const { leg } = testTarget();
let t: TwoAccounts;
let app: Database;
let close: () => Promise<void>;
let dir: string;
beforeAll(async () => {
  t = await twoAccounts();
  ({ database: app, close } = await openStoreBesideAuth());
  dir = mkdtempSync(join(tmpdir(), 'wallet-seed-'));
});
afterAll(async () => {
  await t.close();
  await close();
  rmSync(dir, { recursive: true, force: true });
});

const entries = async (accountId: string) =>
  dbAll<{ id: string; shape: unknown; body: unknown; key_epoch: unknown }>(
    app,
    sql.raw(
      `SELECT id, shape, body, key_epoch FROM ${app.dialect === 'postgres' ? 'wallet.entry' : 'entry'} WHERE account_id = '${accountId}'`,
    ),
  );
const bytes = (value: unknown) =>
  new Uint8Array(value instanceof ArrayBuffer ? value : (value as Uint8Array));

describe(`the seed (${leg})`, () => {
  it('makes an account, its keys, and cards that its root opens, as a browser would', async () => {
    const stores = { app, authStore: t.auth.store };
    const result = await runSeed(stores, t.auth.settings, { dir });
    expect(result.created).toBe(true);
    expect(result.cards).toBe(CARDS.length);

    const rows = await entries(result.accountId);
    expect(rows).toHaveLength(CARDS.length);

    // The account's keys are made, the recovery kit is written for the developer, and the root the server keeps (wrapped under the app key) opens each entry as the
    // app does: derived from the root, bound to the account, the entry and the part.
    expect(readFileSync(result.kitFile, 'utf8').trim().length).toBeGreaterThan(20);
    const keyring = await readRoots(app, result.accountId);
    expect(keyring.map((each) => each.epoch)).toEqual([FIRST_EPOCH]);
    const root = await seedRoot(stores, result.accountId, result.kitFile, 1);
    const titles: string[] = [];
    for (const row of rows) {
      expect(Number(row.key_epoch)).toBe(FIRST_EPOCH);
      const key = await deriveEntryKey(suiteCipher, root, result.accountId, row.id);
      const shape = parseShape(
        await open(
          suiteCipher,
          key,
          'shape',
          result.accountId,
          row.id,
          FIRST_EPOCH,
          bytes(row.shape),
        ),
      );
      if (!shape.ok || shape.value.kind !== 'card') throw new Error('not a card');
      const body = parseBody(
        'card',
        await open(
          suiteCipher,
          key,
          'body',
          result.accountId,
          row.id,
          FIRST_EPOCH,
          bytes(row.body),
        ),
      );
      expect(body.ok, shape.value.title).toBe(true);
      titles.push(shape.value.title);
    }
    expect(titles.sort()).toEqual(CARDS.map((c) => c.title).sort());

    // What the server holds shows none of it.
    const raw = rows
      .map(
        (r) =>
          Buffer.from(bytes(r.shape)).toString('latin1') +
          Buffer.from(bytes(r.body)).toString('latin1'),
      )
      .join('');
    for (const card of CARDS) expect(raw).not.toContain(card.title);
  });

  it('is done when run again, and changes nothing', async () => {
    const stores = { app, authStore: t.auth.store };
    const again = await runSeed(stores, t.auth.settings, { dir });
    expect(again.created).toBe(false);
    expect(again.cards).toBe(0);
    expect(await entries(again.accountId)).toHaveLength(CARDS.length);
  });

  it('derives the same id for the same name, and different ones for different names', () => {
    expect(derivedId('a', 'x')).toBe(derivedId('a', 'x'));
    expect(derivedId('a', 'x')).not.toBe(derivedId('b', 'x'));
    expect(derivedId('a', 'x')).not.toBe(derivedId('a', 'y'));
    expect(derivedId('a', 'x')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('is taken away whole, with its keys, and leaves another account alone', async () => {
    const stores = { app, authStore: t.auth.store };
    const found = await dbAll<{ id: string }>(
      t.auth.database,
      sql.raw(
        `SELECT id FROM ${t.auth.database.dialect === 'postgres' ? '"wallet_auth"."users"' : '"users"'} WHERE email = '${SEED_EMAIL}'`,
      ),
    );
    const accountId = found[0]?.id ?? '';
    expect(await removeSeed(stores, dir)).toBe(true);
    expect(await entries(accountId)).toEqual([]);
    expect(await readRoots(app, accountId)).toEqual([]);
    expect((await new AppVault(t.auth.store).read(accountId)).account).toBeUndefined();
    expect(existsSync(join(dir, 'recovery-kit.txt'))).toBe(false);
    expect(await removeSeed(stores, dir)).toBe(false);
    // Ada and Grace of the test's two accounts are still there.
    const left = await dbAll<{ n: number | string }>(
      t.auth.database,
      sql.raw(
        `SELECT COUNT(*) AS n FROM ${t.auth.database.dialect === 'postgres' ? '"wallet_auth"."users"' : '"users"'}`,
      ),
    );
    expect(Number(left[0]?.n)).toBeGreaterThanOrEqual(2);
  });
});

describe('where the seed will run', () => {
  it('refuses in production, before it reads anything else', async () => {
    const was = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = 'production';
    try {
      expect(await main([])).toBe(1);
    } finally {
      (process.env as Record<string, string>).NODE_ENV = was ?? 'test';
    }
  });

  it('knows what is on this machine: a file always, a service when its host is', () => {
    expect(isLocalDatabase({ dialect: 'sqlite', form: 'file', url: 'file:/x/y.db' } as never)).toBe(
      true,
    );
    expect(
      isLocalDatabase({
        dialect: 'sqlite',
        form: 'sqld',
        url: 'http://localhost:8080',
        adminUrl: 'http://localhost:8081',
      } as never),
    ).toBe(true);
    expect(
      isLocalDatabase({
        dialect: 'sqlite',
        form: 'sqld',
        url: 'http://db.example.com:8080',
        adminUrl: 'http://localhost:8081',
      } as never),
    ).toBe(false);
    expect(
      isLocalDatabase({ dialect: 'postgres', url: 'postgres://u:p@db.example.com/w' } as never),
    ).toBe(false);
    expect(
      isLocalDatabase({ dialect: 'postgres', url: 'postgres://u:p@127.0.0.1/w' } as never),
    ).toBe(true);
  });
});
