import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accountRoute } from '../../access/route';
import { type TwoAccounts, twoAccounts } from '../../access/two-accounts';
import { toBase64Url } from '../../core/encoding';
import { createIdentity, createVaultHeader } from '../../core/vault';
import type { Database } from '../../db/client';
import { openStoreBesideAuth } from '../../db/test-support';
import { RateLimiter } from '../../limits/rate';
import { getVaultResponse, postVaultResponse } from './handlers';
import { parseCreate } from './index';

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
const get = () => accountRoute(({ accountId }) => getVaultResponse(database, accountId), t.deps);
const post = () =>
  accountRoute(
    ({ request, accountId }) =>
      postVaultResponse(request, database, accountId, new RateLimiter(database), () => NOW),
    t.deps,
  );

async function newVault() {
  const wallet = await createIdentity();
  const recovery = await createIdentity();
  const { header, contents } = await createVaultHeader(
    [wallet.recipient, recovery.recipient],
    new Date(NOW),
  );
  return {
    wallet,
    recovery,
    body: {
      recipients: [
        { recipient: wallet.recipient, label: 'wallet' },
        { recipient: recovery.recipient, label: 'recovery' },
      ],
      header: toBase64Url(header),
      vaultKeyId: contents.id,
    },
  };
}

describe('parsing a request to make a vault', () => {
  it('accepts a wallet key alone, and a wallet key with a recovery key', async () => {
    const { body } = await newVault();
    expect(parseCreate(body, NOW).ok).toBe(true);
    expect(parseCreate({ ...body, recipients: body.recipients.slice(0, 1) }, NOW).ok).toBe(true);
  });

  it.each([
    ['no recipients', { recipients: [] }],
    [
      'no wallet key',
      (b: Awaited<ReturnType<typeof newVault>>['body']) => ({ recipients: [b.recipients[1]] }),
    ],
    [
      'two wallet keys',
      (b: Awaited<ReturnType<typeof newVault>>['body']) => ({
        recipients: [b.recipients[0], { ...b.recipients[1], label: 'wallet' }],
      }),
    ],
    ['a public key that is not one', { recipients: [{ recipient: 'age1nope', label: 'wallet' }] }],
    [
      'a secret key as a recipient',
      { recipients: [{ recipient: 'AGE-SECRET-KEY-1QQQ', label: 'wallet' }] },
    ],
    [
      'a header that is not age',
      { header: toBase64Url(new TextEncoder().encode('hello hello hello hello')) },
    ],
    ['a header that is too large', { header: toBase64Url(new Uint8Array(5000)) }],
    ['a key id of the wrong size', { vaultKeyId: 'AAAA' }],
  ])('refuses %s', async (_name, change) => {
    const { body } = await newVault();
    const bad = typeof change === 'function' ? change(body) : change;
    expect(parseCreate({ ...body, ...bad }, NOW).ok).toBe(false);
  });
});

describe('the vault of an account', () => {
  it('is made once, handed back to its owner, and is nothing to anyone else', async () => {
    const { body } = await newVault();
    expect(await (await get()(t.request(t.ada, '/api/vault'))).json()).toEqual({ vault: null });

    const made = await post()(t.request(t.ada, '/api/vault', { method: 'POST', body }));
    expect(made.status).toBe(201);
    const first = (await made.json()) as {
      vault: { version: number; header: string; recipients: unknown[] };
    };
    expect(first.vault.version).toBe(1);
    expect(first.vault.header).toBe(body.header);
    expect(first.vault.recipients).toHaveLength(2);

    // A second is refused, and the first is as it was.
    const second = await newVault();
    const again = await post()(
      t.request(t.ada, '/api/vault', { method: 'POST', body: second.body }),
    );
    expect(again.status).toBe(409);
    const kept = (await (await get()(t.request(t.ada, '/api/vault'))).json()) as typeof first;
    expect(kept.vault.header).toBe(body.header);

    // Grace has none, and Ada's is not hers.
    expect(await (await get()(t.request(t.grace, '/api/vault'))).json()).toEqual({ vault: null });
  });

  it('is refused to a request with no session, and to a write from another origin', async () => {
    const { body } = await newVault();
    expect((await post()(t.request(null, '/api/vault', { method: 'POST', body }))).status).toBe(
      401,
    );
    expect(
      (
        await post()(
          t.request(t.grace, '/api/vault', {
            method: 'POST',
            body,
            headers: { origin: 'https://evil.example' },
          }),
        )
      ).status,
    ).toBe(403);
    expect((await get()(t.request(null, '/api/vault'))).status).toBe(401);
  });

  it('is never given a secret key: the server stores recipients and a sealed header, and nothing in the request is a key', async () => {
    const { body, wallet, recovery } = await newVault();
    const text = JSON.stringify(body);
    expect(text).not.toContain(wallet.identity);
    expect(text).not.toContain(recovery.identity);
    expect(text).toContain(wallet.recipient);
  });

  it('refuses what is not a vault with 400, and too much with 413', async () => {
    const huge = { header: 'x'.repeat(40_000) };
    expect(
      (await post()(t.request(t.grace, '/api/vault', { method: 'POST', body: { recipients: [] } })))
        .status,
    ).toBe(400);
    expect(
      (await post()(t.request(t.grace, '/api/vault', { method: 'POST', body: huge }))).status,
    ).toBe(413);
  });
});
