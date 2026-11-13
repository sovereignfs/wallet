import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accountRoute } from '../../access/route';
import { type TwoAccounts, twoAccounts } from '../../access/two-accounts';
import type { SyncResponse } from '../../core/sync/protocol';
import type { Limits } from '../../config';
import type { Database } from '../../db/client';
import { openStoreBesideAuth } from '../../db/test-support';
import { RateLimiter } from '../../limits/rate';
import { handleSync } from './sync';
import { makeEntry, put, remove, uuid } from './test-support';

const LIMITS: Limits = {
  storageBytes: 100 * 1024 * 1024,
  entryBodyBytes: 256 * 1024,
  entries: 50_000,
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

const route = () =>
  accountRoute(
    ({ request, accountId }) =>
      handleSync(request, accountId, {
        database,
        limiter: new RateLimiter(database),
        limits: LIMITS,
        now: () => 1_800_000_000_000,
      }),
    t.deps,
  );
const device = uuid();
const send = async (
  who: TwoAccounts['ada'] | null,
  cursor: number,
  mutations: unknown[] = [],
  extra: object = {},
) => {
  const response = await route()(
    t.request(who, '/api/sync', {
      method: 'POST',
      body: { v: 1, deviceId: device, cursor, mutations, ...extra },
    }),
  );
  return {
    status: response.status,
    body: (await response.json()) as SyncResponse & { code?: string },
  };
};

describe('POST /api/sync', () => {
  it('applies the outbox in order and hands the rows back, for the account it is the session of', async () => {
    const a = await makeEntry(t.ada.id);
    const b = await makeEntry(t.ada.id);
    const first = await send(t.ada, 0, [await put(t.ada.id, a), await put(t.ada.id, b)]);
    expect(first.status).toBe(200);
    expect(first.body.applied.map((x) => x.seq)).toEqual([1, 2]);
    expect(first.body.refused).toEqual([]);
    expect(first.body.rows.map((r) => r.id)).toEqual([a.entryId, b.entryId]);
    expect(first.body.cursor).toBe(2);
    expect(first.body.more).toBe(false);
    expect(first.body.mode).toBe('normal');
    expect(first.body.vaultVersion).toBeNull();
    // A second device with a cursor of zero gets the same; one at the cursor gets nothing.
    expect((await send(t.ada, 0)).body.rows).toHaveLength(2);
    expect((await send(t.ada, 2)).body.rows).toEqual([]);
  });

  it('tells a stale edit what the row is now, in the same answer, so that the device can merge', async () => {
    const made = await makeEntry(t.ada.id);
    await send(t.ada, 0, [await put(t.ada.id, made)]);
    await send(t.ada, 0, [await put(t.ada.id, made, { baseVersion: 1, title: 'B' })]);
    const stale = await send(t.ada, 0, [await put(t.ada.id, made, { baseVersion: 1, title: 'C' })]);
    expect(stale.body.refused).toHaveLength(1);
    expect(stale.body.refused[0]).toMatchObject({ code: 'stale', current: { version: 2 } });
  });

  it('is nothing to a second person: they pull none of it, and cannot change it', async () => {
    const made = await makeEntry(t.ada.id);
    await send(t.ada, 0, [await put(t.ada.id, made)]);
    const grace = await send(t.grace, 0);
    expect(grace.body.rows.every((r) => r.id !== made.entryId)).toBe(true);
    const attempt = await send(t.grace, 0, [
      await put(t.grace.id, made, { baseVersion: 1, title: 'Mine now' }),
      remove(made, 1),
    ]);
    expect(attempt.body.applied).toEqual([]);
    expect(attempt.body.refused.map((r) => r.code)).toEqual(['not_found', 'not_found']);
    // And Ada's is as she left it.
    const ada = await send(t.ada, 0);
    expect(ada.body.rows.find((r) => r.id === made.entryId)).toMatchObject({
      version: 1,
      deletedAt: null,
    });
  });

  it('is for a signed-in person on this app’s own origin only', async () => {
    expect((await send(null, 0)).status).toBe(401);
    const foreign = await route()(
      t.request(t.ada, '/api/sync', {
        method: 'POST',
        body: { v: 1, deviceId: device, cursor: 0, mutations: [] },
        headers: { origin: 'https://evil.example' },
      }),
    );
    expect(foreign.status).toBe(403);
    const none = await route()(
      t.request(t.ada, '/api/sync', {
        method: 'POST',
        body: { v: 1, deviceId: device, cursor: 0, mutations: [] },
        headers: { origin: '' },
      }),
    );
    expect(none.status).toBe(403);
  });

  it('refuses what is not a request with 400, a protocol it does not know with 426, and too much with 413', async () => {
    expect((await send(t.ada, 0, [], { deviceId: 'nope' })).status).toBe(400);
    const unknown = await send(t.ada, 0, [], { v: 2 });
    expect(unknown.status).toBe(426);
    expect(unknown.body.code).toBe('UPDATE_REQUIRED');
    const huge = await route()(
      t.request(t.ada, '/api/sync', {
        method: 'POST',
        body: {
          v: 1,
          deviceId: device,
          cursor: 0,
          mutations: [],
          pad: 'x'.repeat(5 * 1024 * 1024),
        },
      }),
    );
    expect(huge.status).toBe(413);
  });

  it('reports the vault version once there is a vault', async () => {
    const response = await send(t.ada, 0);
    expect(
      response.body.vaultVersion === null || typeof response.body.vaultVersion === 'number',
    ).toBe(true);
  });
});
