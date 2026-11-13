import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { toBase64Url } from '../../core/encoding';
import { PAGE_ROWS } from '../../core/sync/protocol';
import type { Limits } from '../../config';
import type { Database } from '../../db/client';
import { dbAll, dbGet } from '../../db/exec';
import { makeStore, testTarget } from '../../db/test-support';
import { applyMutation, pullRows } from './apply';
import { makeEntry, put, remove, testVault, uuid } from './test-support';

const { leg } = testTarget();
const LIMITS: Limits = {
  storageBytes: 100 * 1024 * 1024,
  entryBodyBytes: 256 * 1024,
  entries: 50_000,
};
const NOW = 1_800_000_000_000;

let database: Database;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ database, close } = await makeStore());
});
afterAll(async () => close());

const account = () => crypto.randomUUID();
const apply = (accountId: string, m: Awaited<ReturnType<typeof put>>, limits = LIMITS, now = NOW) =>
  applyMutation(database, accountId, m, { now, limits });
const table = () => (database.dialect === 'postgres' ? sql.raw('wallet.entry') : sql.raw('entry'));
const seqOf = async (accountId: string) =>
  Number(
    (
      await dbGet<{ seq: number | string }>(
        database,
        sql`SELECT seq FROM ${database.dialect === 'postgres' ? sql.raw('wallet.account_stream') : sql.raw('account_stream')} WHERE account_id = ${accountId}`,
      )
    )?.seq ?? 0,
  );
const rowOf = (id: string) =>
  dbGet<{
    account_id: string;
    version: number | string;
    shape: unknown;
    body: unknown;
    deleted_at: unknown;
    seq: number | string;
  }>(
    database,
    sql`SELECT account_id, version, shape, body, deleted_at, seq FROM ${table()} WHERE id = ${id}`,
  );

describe(`applying a mutation (${leg})`, () => {
  it('stores a new entry as ciphertext, numbers it, and says so', async () => {
    const a = account();
    const made = await makeEntry(a);
    const result = await apply(a, await put(a, made));
    expect(result).toEqual({ status: 'applied', seq: 1, version: 1 });
    const row = await rowOf(made.entryId);
    expect(Number(row?.version)).toBe(1);
    expect(row?.account_id).toBe(a);
    // Nothing the server holds is the title or the payload: they are sealed.
    const stored = Buffer.from((row?.shape as ArrayBuffer) ?? new ArrayBuffer(0)).toString(
      'latin1',
    );
    expect(stored).not.toContain('Gym');
  });

  it('numbers each change in order, and an edit with the right base is version two', async () => {
    const a = account();
    const made = await makeEntry(a);
    await apply(a, await put(a, made));
    const second = await apply(a, await put(a, made, { baseVersion: 1, title: 'Gym 2' }));
    expect(second).toEqual({ status: 'applied', seq: 2, version: 2 });
    expect(await seqOf(a)).toBe(2);
  });

  it('writes nothing when a mutation is sent again, and answers as it did', async () => {
    const a = account();
    const made = await makeEntry(a);
    const m = await put(a, made);
    const first = await apply(a, m);
    const again = await apply(a, m);
    expect(again).toEqual(first);
    expect(await seqOf(a)).toBe(1);
    expect(Number((await rowOf(made.entryId))?.version)).toBe(1);
  });

  it('answers a stale edit with the current row, and changes nothing', async () => {
    const a = account();
    const made = await makeEntry(a);
    await apply(a, await put(a, made));
    await apply(a, await put(a, made, { baseVersion: 1, title: 'Gym 2' }));
    const stale = await apply(a, await put(a, made, { baseVersion: 1, title: 'Gym 3' }));
    expect(stale.status).toBe('refused');
    if (stale.status === 'refused') {
      expect(stale.code).toBe('stale');
      expect(stale.current?.version).toBe(2);
      expect(stale.current?.shape).toBeTruthy();
    }
    expect(await seqOf(a)).toBe(2);
  });

  it('takes no number for a refusal', async () => {
    const a = account();
    const made = await makeEntry(a);
    await apply(a, await put(a, made));
    await apply(a, await put(a, made, { baseVersion: 7 }));
    await apply(a, await put(a, await makeEntry(a), { tier: 'device' }));
    expect(await seqOf(a)).toBe(1);
  });

  it('turns a delete into a tombstone with no shape or body, and an edit with the right base restores it', async () => {
    const a = account();
    const made = await makeEntry(a);
    await apply(a, await put(a, made));
    expect(await apply(a, remove(made, 1))).toEqual({ status: 'applied', seq: 2, version: 2 });
    const gone = await rowOf(made.entryId);
    expect(gone?.shape).toBeNull();
    expect(gone?.body).toBeNull();
    expect(gone?.deleted_at).not.toBeNull();
    expect(await apply(a, await put(a, made, { baseVersion: 2 }))).toEqual({
      status: 'applied',
      seq: 3,
      version: 3,
    });
    expect((await rowOf(made.entryId))?.deleted_at).toBeNull();
  });

  it('refuses to delete what is not there', async () => {
    const a = account();
    expect(await apply(a, remove(await makeEntry(a), 1))).toEqual({
      status: 'refused',
      code: 'not_found',
    });
  });

  it('refuses a new entry that claims a version', async () => {
    const a = account();
    expect(await apply(a, await put(a, await makeEntry(a), { baseVersion: 3 }))).toEqual({
      status: 'refused',
      code: 'not_found',
    });
  });
});

describe(`one account cannot touch another’s entries (${leg})`, () => {
  it('refuses an id that belongs to another account as not found, says nothing about whose, and changes nothing', async () => {
    const ada = account();
    const grace = account();
    const made = await makeEntry(ada);
    await apply(ada, await put(ada, made));
    // Grace sends a put, an edit and a delete for Ada's entry id.
    for (const m of [
      await put(grace, made),
      await put(grace, made, { baseVersion: 1 }),
      remove(made, 1),
    ]) {
      const result = await apply(grace, m);
      expect(result).toEqual({ status: 'refused', code: 'not_found' });
    }
    const row = await rowOf(made.entryId);
    expect(row?.account_id).toBe(ada);
    expect(Number(row?.version)).toBe(1);
    expect(row?.deleted_at).toBeNull();
    expect(await seqOf(grace)).toBe(0);
  });

  it('answers a mutation id that another account used as a new mutation, not as an answer', async () => {
    const ada = account();
    const grace = account();
    const m = await put(ada, await makeEntry(ada));
    await apply(ada, m);
    const theirs = await makeEntry(grace);
    const result = await apply(grace, { ...(await put(grace, theirs)), id: m.id });
    expect(result.status).toBe('applied');
  });

  it('pulls only an account’s own rows', async () => {
    const ada = account();
    const grace = account();
    await apply(ada, await put(ada, await makeEntry(ada)));
    await apply(grace, await put(grace, await makeEntry(grace)));
    expect((await pullRows(database, ada, 0, PAGE_ROWS)).rows).toHaveLength(1);
    expect((await pullRows(database, uuid(), 0, PAGE_ROWS)).rows).toHaveLength(0);
  });
});

describe(`what the server checks of what it cannot read (${leg})`, () => {
  it('refuses a tier this version does not have, whatever else is right', async () => {
    const a = account();
    for (const tier of ['device', 'server'] as const)
      expect(await apply(a, await put(a, await makeEntry(a), { tier }))).toEqual({
        status: 'refused',
        code: 'tier_unavailable',
      });
  });

  it('refuses a shape that is not padded, a body that is not, and a wrapped key of the wrong size', async () => {
    const a = account();
    const made = await makeEntry(a);
    const m = await put(a, made);
    const bytes = (text: string | undefined) => Buffer.from(text ?? '', 'base64url');
    const short = (text: string | undefined) =>
      toBase64Url(bytes(text).subarray(0, bytes(text).length - 1));
    expect(await apply(a, { ...m, shape: short(m.shape) })).toEqual({
      status: 'refused',
      code: 'invalid',
    });
    expect(await apply(a, { ...m, body: short(m.body) })).toEqual({
      status: 'refused',
      code: 'invalid',
    });
    expect(await apply(a, { ...m, wrappedKey: short(m.wrappedKey) })).toEqual({
      status: 'refused',
      code: 'invalid',
    });
    expect(await apply(a, { ...m, shape: '' })).toEqual({ status: 'refused', code: 'invalid' });
  });

  it('refuses a version byte it does not know', async () => {
    const a = account();
    const m = await put(a, await makeEntry(a));
    const bytes = Buffer.from(m.shape ?? '', 'base64url');
    bytes[0] = 2;
    expect(await apply(a, { ...m, shape: toBase64Url(bytes) })).toEqual({
      status: 'refused',
      code: 'invalid',
    });
  });

  it('refuses a body over the limit, and a shape over 4 KB', async () => {
    const a = account();
    const made = await makeEntry(a);
    const small: Limits = { ...LIMITS, entryBodyBytes: 2048 };
    expect(
      await apply(a, await put(a, made, { body: { v: 1, payload: 'x'.repeat(3000) } }), small),
    ).toEqual({ status: 'refused', code: 'too_large' });
    expect(await apply(a, await put(a, made, { title: 'x'.repeat(5000) }))).toEqual({
      status: 'refused',
      code: 'too_large',
    });
  });

  it('refuses past the storage quota and the entry limit, and counts a restored entry once', async () => {
    const a = account();
    const first = await makeEntry(a);
    const m = await put(a, first);
    await apply(a, m);
    expect(
      await apply(a, await put(a, await makeEntry(a)), { ...LIMITS, storageBytes: 1000 }),
    ).toEqual({ status: 'refused', code: 'quota' });
    expect(await apply(a, await put(a, await makeEntry(a)), { ...LIMITS, entries: 1 })).toEqual({
      status: 'refused',
      code: 'limit',
    });
    // An edit of the entry it has is not a new one.
    expect(
      (await apply(a, await put(a, first, { baseVersion: 1 }), { ...LIMITS, entries: 1 })).status,
    ).toBe('applied');
  });

  it('refuses any body in a fully offline account', async () => {
    const a = account();
    await dbAll(
      database,
      sql`INSERT INTO ${database.dialect === 'postgres' ? sql.raw('wallet.account_stream') : sql.raw('account_stream')} (account_id, seq, mode) VALUES (${a}, 0, 'offline') RETURNING account_id`,
    );
    const made = await makeEntry(a);
    expect(await apply(a, await put(a, made))).toEqual({ status: 'refused', code: 'offline_mode' });
    expect((await apply(a, await put(a, made, { body: null }))).status).toBe('applied');
  });
});

describe(`pulling (${leg})`, () => {
  it('returns rows past the cursor in order, a page at a time, with the body of a synced entry', async () => {
    const a = account();
    const made = [] as Awaited<ReturnType<typeof makeEntry>>[];
    for (let i = 0; i < 5; i++) {
      made.push(await makeEntry(a));
      await apply(a, await put(a, made[i] as never));
    }
    const first = await pullRows(database, a, 0, 3);
    expect(first.rows.map((r) => r.seq)).toEqual([1, 2, 3]);
    expect(first.more).toBe(true);
    expect(first.rows[0]?.body).toBeTruthy();
    const rest = await pullRows(database, a, 3, 3);
    expect(rest.rows.map((r) => r.seq)).toEqual([4, 5]);
    expect(rest.more).toBe(false);
    expect((await pullRows(database, a, 5, 3)).rows).toEqual([]);
  });

  it('hands a device a tombstone with no shape and no body', async () => {
    const a = account();
    const made = await makeEntry(a);
    await apply(a, await put(a, made));
    await apply(a, remove(made, 1));
    const { rows } = await pullRows(database, a, 1, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ shape: null, body: null, version: 2 });
    expect(rows[0]?.deletedAt).not.toBeNull();
  });
});

describe(`two writers at once (${leg})`, () => {
  it('lets one of two edits of the same version win and tells the other it is stale', async () => {
    const a = account();
    const made = await makeEntry(a);
    await apply(a, await put(a, made));
    const results = await Promise.all([
      apply(a, await put(a, made, { baseVersion: 1, title: 'One' })),
      apply(a, await put(a, made, { baseVersion: 1, title: 'Two' })),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(['applied', 'refused']);
    expect(Number((await rowOf(made.entryId))?.version)).toBe(2);
    // No number was lost or used twice: the account's counter is the count of what applied.
    expect(await seqOf(a)).toBe(2);
    void testVault;
  });
});
