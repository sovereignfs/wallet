import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accountRoute } from '../../access/route';
import { type TwoAccounts, twoAccounts } from '../../access/two-accounts';
import { toBase64Url } from '../../core/encoding';
import type { Database } from '../../db/client';
import { openStoreBesideAuth } from '../../db/test-support';
import { RateLimiter } from '../../limits/rate';
import { getRootsResponse, postRootResponse } from './handlers';
import { WRAPPED_ROOT_BYTES, parseMake } from './index';

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
const get = () => accountRoute(({ accountId }) => getRootsResponse(database, accountId), t.deps);
const post = () =>
  accountRoute(
    ({ request, accountId }) =>
      postRootResponse(request, database, accountId, new RateLimiter(database), () => NOW),
    t.deps,
  );

const wrapped = () => toBase64Url(randomBytes(WRAPPED_ROOT_BYTES));
const make = (body: unknown, who = t.ada) =>
  post()(t.request(who, '/api/keys/root', { method: 'POST', body }));
const roots = async (who = t.ada) =>
  ((await (await get()(t.request(who, '/api/keys/root'))).json()) as { roots: unknown[] }).roots;

describe('parsing a request to keep a wrapped root', () => {
  it('accepts the first epoch and exactly the bytes of a wrapped 32-byte key', () => {
    expect(parseMake({ epoch: 1, wrapped: wrapped() }).ok).toBe(true);
  });

  it.each([
    ['not an object', 'x'],
    ['no epoch', { wrapped: wrapped() }],
    ['an epoch that is not the first', { epoch: 2, wrapped: wrapped() }],
    ['an epoch that is text', { epoch: '1', wrapped: wrapped() }],
    ['bytes of another length', { epoch: 1, wrapped: toBase64Url(randomBytes(32)) }],
    ['bytes one too long', { epoch: 1, wrapped: toBase64Url(randomBytes(WRAPPED_ROOT_BYTES + 1)) }],
    ['text that is not base64url', { epoch: 1, wrapped: '!!!!' }],
    ['a huge value', { epoch: 1, wrapped: 'A'.repeat(100_000) }],
  ])('refuses %s', (_name, body) => {
    expect(parseMake(body).ok).toBe(false);
  });
});

describe('the account’s wrapped root', () => {
  it('is kept once, and a second device that raced is given the stored one', async () => {
    const first = wrapped();
    const second = wrapped();
    expect(await roots()).toEqual([]);
    const a = await make({ epoch: 1, wrapped: first });
    expect(a.status).toBe(201);
    // The other device made its own root at the same time, and lost: the answer is the stored one, not its own.
    const b = await make({ epoch: 1, wrapped: second });
    expect(b.status).toBe(200);
    expect(((await b.json()) as { roots: { wrapped: string }[] }).roots).toEqual([
      { epoch: 1, wrapped: first },
    ]);
    expect(await roots()).toEqual([{ epoch: 1, wrapped: first }]);
  });

  it('is the account’s alone: another account sees none, and makes its own without touching it', async () => {
    const ada = await roots();
    expect(ada).toHaveLength(1);
    expect(await roots(t.grace)).toEqual([]);
    const own = wrapped();
    expect((await make({ epoch: 1, wrapped: own }, t.grace)).status).toBe(201);
    expect(await roots(t.grace)).toEqual([{ epoch: 1, wrapped: own }]);
    expect(await roots()).toEqual(ada);
  });

  it('refuses a visitor with no session, and a write from another origin, and changes nothing', async () => {
    const before = await roots();
    const visitor = await post()(
      t.request(null, '/api/keys/root', { method: 'POST', body: { epoch: 1, wrapped: wrapped() } }),
    );
    expect(visitor.status).toBe(401);
    const elsewhere = await post()(
      t.request(t.ada, '/api/keys/root', {
        method: 'POST',
        body: { epoch: 1, wrapped: wrapped() },
        headers: { origin: 'https://evil.example' },
      }),
    );
    expect(elsewhere.status).toBe(403);
    expect(await get()(t.request(null, '/api/keys/root')).then((r) => r.status)).toBe(401);
    expect(await roots()).toEqual(before);
  });

  it('refuses what is not a wrapped root and what is too large, and keeps nothing of it', async () => {
    const before = await roots(t.grace);
    expect((await make({ epoch: 3, wrapped: wrapped() }, t.grace)).status).toBe(400);
    expect((await make({ epoch: 1, wrapped: 'short' }, t.grace)).status).toBe(400);
    const huge = await post()(
      t.request(t.grace, '/api/keys/root', {
        method: 'POST',
        body: { epoch: 1, wrapped: 'A'.repeat(5_000) },
      }),
    );
    expect(huge.status).toBe(413);
    expect(await roots(t.grace)).toEqual(before);
  });

  it('is rate limited per account', async () => {
    let last = 0;
    for (let i = 0; i < 25; i++)
      last = (await make({ epoch: 1, wrapped: wrapped() }, t.grace)).status;
    expect(last).toBe(429);
  });
});
