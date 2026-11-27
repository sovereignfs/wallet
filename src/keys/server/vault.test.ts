import { randomBytes } from 'node:crypto';
import { vaultRoute } from '@sovereignfs/sdk/vault';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accountRoute } from '../../access/route';
import { type TwoAccounts, twoAccounts } from '../../access/two-accounts';
import { CLIENT_ID, vaultOf } from './vault';

/**
 * Wallet's own vault (DESIGN.md §7.4): the SDK's `AppVault` on the auth store, served by its `vaultRoute` for the session's account only, as the route under
 * `app/api/keys/vault` composes them. Two real accounts: what one has made is not there for the other, and a write from another origin is refused.
 */
let t: TwoAccounts;
beforeAll(async () => {
  t = await twoAccounts();
});
afterAll(async () => t.close());

const key = () => randomBytes(32).toString('base64url');
const vault = () => vaultOf(t.auth.store);
const handle = () =>
  accountRoute(
    ({ request, accountId }) =>
      vaultRoute(vault(), { origin: t.auth.settings.url })(request, accountId),
    t.deps,
  );

const setUp = {
  op: 'set-up',
  account: { suite: 1, unlockSalt: key(), signingPublic: key(), signingPrivate: '{"w":1}' },
  waysIn: [{ way: 'password', id: key(), record: '{"w":1}' }],
};

describe('the vault of an instance that runs alone', () => {
  it('has one vault id, made once and kept, in the shape the sign-in value is derived with', async () => {
    const first = await vault().vaultId();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await vault().vaultId()).toBe(first);
    expect(vaultOf(t.auth.store)).toBe(vault());
  });

  it('is the app “wallet”, as the manifest’s prefix says', () => {
    expect(CLIENT_ID).toBe('wallet');
  });

  it('gives a person their own keys, and another person none of them', async () => {
    const made = await handle()(
      t.request(t.ada, '/api/keys/vault', { method: 'POST', body: setUp }),
    );
    expect(made.status, await made.clone().text()).toBeLessThan(300);
    const ada = (await (await handle()(t.request(t.ada, '/api/keys/vault'))).json()).value;
    expect(ada.account?.unlockSalt).toBe(setUp.account.unlockSalt);
    expect(ada.waysIn).toHaveLength(1);
    // Grace asks for the same address and is given her own, which is nothing yet.
    const grace = (await (await handle()(t.request(t.grace, '/api/keys/vault'))).json()).value;
    expect(grace.account).toBeUndefined();
    expect(grace.waysIn).toEqual([]);
  });

  it('refuses a person who is not signed in, and a change that does not come from the app’s own address', async () => {
    expect((await handle()(t.request(null, '/api/keys/vault'))).status).toBe(401);
    const elsewhere = await handle()(
      t.request(t.grace, '/api/keys/vault', {
        method: 'POST',
        body: setUp,
        headers: { origin: 'https://evil.example' },
      }),
    );
    expect(elsewhere.status).toBe(403);
    expect((await vault().read(t.grace.id)).account).toBeUndefined();
  });

  it('deletes every record of a person, and no one else’s', async () => {
    await vault().setUp(t.grace.id, setUp.account, setUp.waysIn);
    await vault().deleteAccount(t.ada.id);
    expect((await vault().read(t.ada.id)).account).toBeUndefined();
    expect((await vault().read(t.grace.id)).account).toBeDefined();
    // Twice, as deleting a person is safe to run again.
    await vault().deleteAccount(t.ada.id);
  });
});
