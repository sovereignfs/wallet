import 'fake-indexeddb/auto';
import { randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { type CardBody, type CardShape, newCard } from '../core/entries';
import { PROTOCOL_VERSION, parseSyncResponse } from '../core/sync/protocol';
import { importVaultKey } from '../core/vault';
import type { Limits } from '../config';
import type { Database } from '../db/client';
import { makeStore } from '../db/test-support';
import { Keyring } from '../keyring/keyring';
import { RateLimiter } from '../limits/rate';
import { handleSync } from '../server/entries/sync';
import { type LocalDatabase, openLocal } from './db';
import type { Transport } from './transport';
import { type Merged, Wallet } from './wallet';

const LIMITS: Limits = { storageBytes: 1e9, entryBodyBytes: 256 * 1024, entries: 50_000 };

let database: Database;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ database, close } = await makeStore());
});
afterAll(async () => close());

/** The real server logic, called as a device would: the same `handleSync` the route runs, for this account. */
function serverFor(account: string, limits = LIMITS) {
  const state = { online: true, loseAnswers: false, requests: 0 };
  const transport: Transport = {
    async sync(request) {
      if (!state.online) return { kind: 'offline' };
      state.requests++;
      const response = await handleSync(
        new Request('http://wallet.test/api/sync', {
          method: 'POST',
          body: JSON.stringify(request),
        }),
        account,
        { database, limiter: new RateLimiter(database), limits, now: Date.now },
      );
      // A lost answer: the server applied it, and the device never heard.
      if (state.loseAnswers) return { kind: 'offline' };
      const answer = parseSyncResponse(await response.json());
      return answer ? { kind: 'ok', answer } : { kind: 'failed', status: response.status };
    },
    vault: async () => null,
    createVault: async () => 'created',
  };
  return { state, transport };
}

const open: { db: LocalDatabase; keyring: Keyring }[] = [];
afterEach(() => {
  for (const d of open.splice(0)) {
    d.keyring.close();
    d.db.close();
  }
});

/** One device: its own store, its own keyring, unlocked with the vault key every device of the account has. */
async function device(
  account: string,
  transport: Transport,
  vaultBytes: Uint8Array,
  options: { merged?: Merged[]; unlocked?: boolean } = {},
) {
  const db = await openLocal(account, `wallet-test-${randomBytes(6).toString('hex')}`);
  const keyring = new Keyring({ accountId: account, channel: null });
  open.push({ db, keyring });
  const wallet = new Wallet({
    accountId: account,
    db,
    keyring,
    transport,
    onMerged: (m) => options.merged?.push(m),
  });
  const unlock = async () => {
    keyring.unlock(await importVaultKey(vaultBytes, 'AAAAAAAAAAAAAAAA'));
    await wallet.load();
  };
  if (options.unlocked !== false) await unlock();
  return { wallet, db, keyring, unlock };
}

const card = (
  title: string,
  payload = 'https://example.com/member/1',
  extra: Partial<CardShape & CardBody> = {},
) => newCard({ title, payload, ...extra });
const titles = (w: Wallet) =>
  w
    .getSnapshot()
    .map((e) => (e.shape.kind === 'card' ? e.shape.title : ''))
    .sort();
const accountId = () => `acct-${randomBytes(6).toString('hex')}`;

describe('the wallet on one device', () => {
  it('writes to the device at once, with no network, and shows it', async () => {
    const account = accountId();
    const { transport, state } = serverFor(account);
    state.online = false;
    const { wallet } = await device(account, transport, randomBytes(32));
    const c = card('Gym');
    const id = await wallet.create(c.shape, c.body);
    expect(titles(wallet)).toEqual(['Gym']);
    expect(wallet.get(id)).toMatchObject({ pending: true, version: 0 });
    expect(await wallet.unsentCount()).toBe(1);
    expect((await wallet.sync()).status).toBe('offline');
    expect(await wallet.unsentCount()).toBe(1);
  });

  it('refuses a model the format does not take, with a sentence, and writes nothing', async () => {
    const account = accountId();
    const { wallet } = await device(account, serverFor(account).transport, randomBytes(32));
    const empty = card('');
    await expect(wallet.create(empty.shape, empty.body)).rejects.toThrow('A card needs a name.');
    const blank = card('x', '   ');
    await expect(wallet.create(blank.shape, blank.body)).rejects.toThrow(
      'A code needs something to carry.',
    );
    expect(await wallet.unsentCount()).toBe(0);
  });

  it('sends it, and the answer is the same entry at version one with nothing pending', async () => {
    const account = accountId();
    const { wallet } = await device(account, serverFor(account).transport, randomBytes(32));
    const c = card('Gym');
    const id = await wallet.create(c.shape, c.body);
    expect(await wallet.sync()).toMatchObject({ status: 'ok', applied: 1, refused: 0 });
    expect(wallet.get(id)).toMatchObject({ pending: false, version: 1 });
    expect(await wallet.unsentCount()).toBe(0);
  });

  it('chains several edits of one entry made before any is sent, and sends them in order', async () => {
    const account = accountId();
    const { wallet } = await device(account, serverFor(account).transport, randomBytes(32));
    const c = card('Gym');
    const id = await wallet.create(c.shape, c.body);
    for (const title of ['Gym 2', 'Gym 3', 'Gym 4']) {
      const e = wallet.get(id)!;
      await wallet.update(id, { ...e.shape, title } as CardShape, e.body);
    }
    expect(await wallet.unsentCount()).toBe(4);
    expect(await wallet.sync()).toMatchObject({ status: 'ok', applied: 4, refused: 0 });
    expect(wallet.get(id)).toMatchObject({ pending: false, version: 4 });
    expect(titles(wallet)).toEqual(['Gym 4']);
  });

  it('is gone from the list at once when deleted, and a tombstone after the sync', async () => {
    const account = accountId();
    const { wallet } = await device(account, serverFor(account).transport, randomBytes(32));
    const c = card('Gym');
    const id = await wallet.create(c.shape, c.body);
    await wallet.sync();
    await wallet.remove(id);
    expect(titles(wallet)).toEqual([]);
    await wallet.sync();
    expect(titles(wallet)).toEqual([]);
    expect(wallet.get(id)).toBeUndefined();
  });

  it('locks: the index is empty and the keys are gone, and the store still holds the entry, unreadable', async () => {
    const account = accountId();
    const { wallet, keyring, db } = await device(
      account,
      serverFor(account).transport,
      randomBytes(32),
    );
    const c = card('Gym');
    await wallet.create(c.shape, c.body);
    await wallet.sync();
    keyring.lock();
    expect(wallet.getSnapshot()).toEqual([]);
    expect((await db.getAll('entries')).length).toBe(1);
    await expect(wallet.create(c.shape, c.body)).rejects.toThrow('locked');
  });

  it('holds an entry it cannot open, says so, and does not lose it', async () => {
    const account = accountId();
    const { transport } = serverFor(account);
    const one = await device(account, transport, randomBytes(32));
    const c = card('Gym');
    await one.wallet.create(c.shape, c.body);
    await one.wallet.sync();
    // Another device whose vault key is a different one: what it pulls does not open.
    const other = await device(account, transport, randomBytes(32));
    await other.wallet.sync();
    expect(other.wallet.getSnapshot()).toEqual([]);
    expect(other.wallet.unopenedEntries()).toHaveLength(1);
    expect((await other.db.getAll('entries')).length).toBe(1);
  });
});

describe('two devices', () => {
  it('an entry written on one appears on the other, opened with the same key, and the server and both stores hold none of it in the clear', async () => {
    const account = accountId();
    const { transport } = serverFor(account);
    const vault = randomBytes(32);
    const a = await device(account, transport, vault);
    const b = await device(account, transport, vault);
    const c = card('Secret Gym Name', 'PLANTED-PAYLOAD-12345', { notes: 'PLANTED-NOTE' });
    const id = await a.wallet.create(c.shape, c.body);
    await a.wallet.sync();
    expect(titles(b.wallet)).toEqual([]);
    await b.wallet.sync();
    await b.wallet.loadBody(id);
    expect(b.wallet.get(id)?.shape).toMatchObject({ title: 'Secret Gym Name' });
    expect(b.wallet.get(id)?.body).toMatchObject({
      payload: 'PLANTED-PAYLOAD-12345',
      notes: 'PLANTED-NOTE',
    });

    // The raw-dump test: nothing planted is anywhere the server or a device stores it.
    const planted = ['Secret Gym Name', 'PLANTED-PAYLOAD-12345', 'PLANTED-NOTE', 'card'];
    const everything: string[] = [];
    for (const d of [a, b]) {
      for (const name of ['meta', 'unlock', 'entries', 'outbox', 'refused', 'local'] as const)
        for (const value of await d.db.getAll(name))
          everything.push(
            JSON.stringify(value, (_k, v) =>
              v instanceof Uint8Array ? Buffer.from(v).toString('latin1') : v,
            ),
          );
    }
    const server = await rawServer(database, account);
    for (const text of planted) {
      const base64 = Buffer.from(text).toString('base64').replace(/=+$/, '');
      for (const where of [...everything, server]) {
        expect(where).not.toContain(text);
        expect(where).not.toContain(base64);
      }
    }
  });

  it('merges two edits of different fields, and both are kept', async () => {
    const account = accountId();
    const { transport } = serverFor(account);
    const vault = randomBytes(32);
    const merged: Merged[] = [];
    const a = await device(account, transport, vault, { merged });
    const b = await device(account, transport, vault, { merged });
    const c = card('Gym');
    const id = await a.wallet.create(c.shape, c.body);
    await a.wallet.sync();
    await b.wallet.sync();
    // Both go offline-ish: each edits a different field from the same version.
    const ea = a.wallet.get(id)!;
    await a.wallet.update(id, { ...ea.shape, favourite: true } as CardShape, ea.body);
    await b.wallet.loadBody(id);
    const eb = b.wallet.get(id)!;
    await b.wallet.update(id, { ...eb.shape, color: 'red' } as CardShape, eb.body);
    await a.wallet.sync();
    await b.wallet.sync(); // stale: merged, and sent again
    await a.wallet.sync();
    for (const d of [a, b]) {
      expect(d.wallet.get(id)?.shape).toMatchObject({ favourite: true, color: 'red' });
      expect(d.wallet.get(id)?.pending).toBe(false);
    }
    expect(merged).toEqual([]);
  });

  it('keeps this device’s value when both changed one field, and says what the other was, for Undo', async () => {
    const account = accountId();
    const { transport } = serverFor(account);
    const vault = randomBytes(32);
    const merged: Merged[] = [];
    const a = await device(account, transport, vault);
    const b = await device(account, transport, vault, { merged });
    const c = card('Gym');
    const id = await a.wallet.create(c.shape, c.body);
    await a.wallet.sync();
    await b.wallet.sync();
    await b.wallet.loadBody(id);
    const ea = a.wallet.get(id)!;
    await a.wallet.update(id, { ...ea.shape, title: 'From A' } as CardShape, ea.body);
    const eb = b.wallet.get(id)!;
    await b.wallet.update(id, { ...eb.shape, title: 'From B' } as CardShape, eb.body);
    await a.wallet.sync();
    await b.wallet.sync();
    await a.wallet.sync();
    expect(merged).toHaveLength(1);
    expect(merged[0]?.clashes).toEqual([{ part: 'shape', field: 'title', theirs: 'From A' }]);
    for (const d of [a, b]) expect(d.wallet.get(id)?.shape).toMatchObject({ title: 'From B' });
  });

  it('lets an edit against a delete restore the entry, and a delete against an edit let go', async () => {
    const account = accountId();
    const { transport } = serverFor(account);
    const vault = randomBytes(32);
    const a = await device(account, transport, vault);
    const b = await device(account, transport, vault);
    const c = card('Gym');
    const id = await a.wallet.create(c.shape, c.body);
    await a.wallet.sync();
    await b.wallet.sync();
    await b.wallet.loadBody(id);

    // A deletes and syncs; B, unaware, edits. B's edit restores it.
    await a.wallet.remove(id);
    await a.wallet.sync();
    const eb = b.wallet.get(id)!;
    await b.wallet.update(id, { ...eb.shape, title: 'Edited on B' } as CardShape, eb.body);
    await b.wallet.sync();
    await a.wallet.sync();
    expect(a.wallet.get(id)?.shape).toMatchObject({ title: 'Edited on B' });
    await a.wallet.loadBody(id);

    // Now B edits and syncs first; A, unaware, deletes. The edit stands.
    const eb2 = b.wallet.get(id)!;
    await b.wallet.update(id, { ...eb2.shape, title: 'Edited again' } as CardShape, eb2.body);
    await a.wallet.remove(id);
    await b.wallet.sync();
    await a.wallet.sync();
    expect(a.wallet.get(id)?.shape).toMatchObject({ title: 'Edited again' });
    expect(await a.wallet.unsentCount()).toBe(0);
  });

  it('keeps a stale change waiting while locked, and merges it when the wallet is unlocked', async () => {
    const account = accountId();
    const { transport } = serverFor(account);
    const vault = randomBytes(32);
    const a = await device(account, transport, vault);
    const b = await device(account, transport, vault);
    const c = card('Gym');
    const id = await a.wallet.create(c.shape, c.body);
    await a.wallet.sync();
    await b.wallet.sync();
    await b.wallet.loadBody(id);
    const ea = a.wallet.get(id)!;
    await a.wallet.update(id, { ...ea.shape, favourite: true } as CardShape, ea.body);
    const eb = b.wallet.get(id)!;
    await b.wallet.update(id, { ...eb.shape, color: 'red' } as CardShape, eb.body);
    await a.wallet.sync();
    b.keyring.lock();
    // B syncs while locked: its change is refused as stale and cannot be merged without the keys.
    await b.wallet.sync();
    expect((await b.wallet.outbox()).some((i) => i.stale)).toBe(true);
    await b.unlock();
    expect(await b.wallet.mergeWaiting()).toBe(true);
    await b.wallet.sync();
    await a.wallet.sync();
    for (const d of [a, b])
      expect(d.wallet.get(id)?.shape).toMatchObject({ favourite: true, color: 'red' });
  });
});

describe('a connection that fails', () => {
  it('keeps the outbox when the answer is lost, and sending it again changes nothing on the server', async () => {
    const account = accountId();
    const { transport, state } = serverFor(account);
    const { wallet } = await device(account, transport, randomBytes(32));
    const c = card('Gym');
    const id = await wallet.create(c.shape, c.body);
    state.loseAnswers = true;
    expect((await wallet.sync()).status).toBe('offline');
    expect(await wallet.unsentCount()).toBe(1);
    state.loseAnswers = false;
    expect(await wallet.sync()).toMatchObject({ status: 'ok', applied: 1 });
    expect(wallet.get(id)).toMatchObject({ pending: false, version: 1 });
    // The server has one entry, at version one.
    const pulled = await (await device(account, transport, randomBytes(32))).wallet.sync();
    expect(pulled).toMatchObject({ status: 'ok', pulled: 1 });
  });

  it('keeps what the server refused in Couldn’t sync, whole, until it is retried or discarded', async () => {
    const account = accountId();
    const { transport } = serverFor(account, { ...LIMITS, entries: 1 });
    const { wallet } = await device(account, transport, randomBytes(32));
    const first = card('Gym');
    const second = card('Library');
    await wallet.create(first.shape, first.body);
    const id2 = await wallet.create(second.shape, second.body);
    expect(await wallet.sync()).toMatchObject({ status: 'ok', applied: 1, refused: 1 });
    const refused = await wallet.refusedChanges();
    expect(refused).toHaveLength(1);
    expect(refused[0]).toMatchObject({ entryId: id2, code: 'limit' });
    expect(wallet.get(id2)).toBeUndefined();
    // Retried, it is sent again (and refused again while the limit holds): nothing was lost.
    await wallet.retry(id2);
    expect(await wallet.unsentCount()).toBe(1);
    await wallet.sync();
    expect(await wallet.refusedChanges()).toHaveLength(1);
    await wallet.discard(id2);
    expect(await wallet.refusedChanges()).toEqual([]);
  });

  it('is told to update by a server that speaks another protocol, and keeps its outbox', async () => {
    const account = accountId();
    const transport: Transport = {
      sync: async () => ({ kind: 'update' }),
      vault: async () => null,
      createVault: async () => 'created',
    };
    const { wallet } = await device(account, transport, randomBytes(32));
    const c = card('Gym');
    await wallet.create(c.shape, c.body);
    expect((await wallet.sync()).status).toBe('update');
    expect(await wallet.unsentCount()).toBe(1);
    void PROTOCOL_VERSION;
  });
});

/** What the server holds for an account, as text, to look in. */
async function rawServer(db: Database, account: string): Promise<string> {
  const { dbAll } = await import('../db/exec');
  const { sql } = await import('drizzle-orm');
  const table = db.dialect === 'postgres' ? sql.raw('wallet.entry') : sql.raw('entry');
  const rows = await dbAll<Record<string, unknown>>(
    db,
    sql`SELECT * FROM ${table} WHERE account_id = ${account}`,
  );
  return JSON.stringify(rows, (_k, v) =>
    v instanceof ArrayBuffer || ArrayBuffer.isView(v)
      ? Buffer.from(v as ArrayBuffer).toString('latin1')
      : v,
  );
}
