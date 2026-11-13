import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type TwoAccounts, twoAccounts } from '../src/access/two-accounts';
import { parseBody, parseShape } from '../src/core/entries';
import { importVaultKey, open, openHeader, parseIdentity, unwrapEntryKey } from '../src/core/vault';
import type { Database } from '../src/db/client';
import { dbAll } from '../src/db/exec';
import { openStoreBesideAuth, testTarget } from '../src/db/test-support';
import { readVault } from '../src/server/vault';
import { CARDS, SEED_EMAIL, derivedId, isLocalDatabase, main, removeSeed, runSeed } from './seed';

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
  dbAll<{ id: string; shape: unknown; body: unknown; wrapped_key: unknown }>(
    app,
    sql.raw(
      `SELECT id, shape, body, wrapped_key FROM ${app.dialect === 'postgres' ? 'wallet.entry' : 'entry'} WHERE account_id = '${accountId}'`,
    ),
  );
const bytes = (value: unknown) =>
  new Uint8Array(value instanceof ArrayBuffer ? value : (value as Uint8Array));

describe(`the seed (${leg})`, () => {
  it('makes an account, a vault, and cards that the key it writes opens, as a browser would', async () => {
    const stores = { app, auth: t.auth.database };
    const result = await runSeed(stores, t.auth.settings, { dir });
    expect(result.created).toBe(true);
    expect(result.cards).toBe(CARDS.length);

    const rows = await entries(result.accountId);
    expect(rows).toHaveLength(CARDS.length);

    // The key file opens the header; so does the recovery key; and the vault key opens each entry as the app does.
    const vaultRecord = await readVault(app, result.accountId);
    if (!vaultRecord) throw new Error('no vault');
    const header = new Uint8Array(vaultRecord.header);
    const wallet = await parseIdentity(readFileSync(result.keyFile, 'utf8'));
    const recovery = await parseIdentity(readFileSync(result.recoveryFile, 'utf8'));
    if (!wallet.ok || !recovery.ok) throw new Error('not keys');
    const opened = await openHeader(header, wallet.identity);
    expect((await openHeader(header, recovery.identity)).id).toBe(opened.id);
    const vault = await importVaultKey(opened.raw, opened.id);
    const titles: string[] = [];
    for (const row of rows) {
      const keys = await unwrapEntryKey(vault, result.accountId, row.id, bytes(row.wrapped_key));
      const shape = parseShape(
        await open(keys.aes, 'shape', result.accountId, row.id, bytes(row.shape)),
      );
      if (!shape.ok || shape.value.kind !== 'card') throw new Error('not a card');
      const body = parseBody(
        'card',
        await open(keys.aes, 'body', result.accountId, row.id, bytes(row.body)),
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
    const stores = { app, auth: t.auth.database };
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
    const stores = { app, auth: t.auth.database };
    const found = await dbAll<{ id: string }>(
      t.auth.database,
      sql.raw(
        `SELECT id FROM ${t.auth.database.dialect === 'postgres' ? '"wallet_auth"."user"' : '"user"'} WHERE email = '${SEED_EMAIL}'`,
      ),
    );
    const accountId = found[0]?.id ?? '';
    expect(await removeSeed(stores, dir)).toBe(true);
    expect(await entries(accountId)).toEqual([]);
    expect(await readVault(app, accountId)).toBeUndefined();
    expect(existsSync(join(dir, 'wallet-key.txt'))).toBe(false);
    expect(await removeSeed(stores, dir)).toBe(false);
    // Ada and Grace of the test's two accounts are still there.
    const left = await dbAll<{ n: number | string }>(
      t.auth.database,
      sql.raw(
        `SELECT COUNT(*) AS n FROM ${t.auth.database.dialect === 'postgres' ? '"wallet_auth"."user"' : '"user"'}`,
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
