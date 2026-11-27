import { confirmPassword } from '@sovereignfs/auth/server';
import { formatKit } from '@sovereignfs/sdk/keys';
import { vaultRoute } from '@sovereignfs/sdk/vault';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type TwoAccounts, twoAccounts } from '../access/two-accounts';
import { newRoot, unwrapRoot, wrapRoot } from '../core/vault';
import { type Confirmation, confirmWithServer, openWithPassword } from './access';
import { confirmResponse } from './server/confirm';
import { vaultOf } from './server/vault';
import { addressOf, walletVault } from './vault-client';

/**
 * The suite's keys opened with a password (DESIGN.md §7, §9.4), against **the SDK's own vault** in the page and on the server: `localVault` as a browser runs it,
 * `vaultRoute` over a real auth store, and only the network and the browser's storage given by the test. It is what shows that a root wrapped under the app key
 * is still opened after a password reset, by way of the recovery kit.
 */
const ORIGIN = 'http://vault.invalid';
const PASSWORD = 'the first password here';
const NEXT = 'the password after a reset';

let t: TwoAccounts;
beforeAll(async () => {
  t = await twoAccounts();
});
afterAll(async () => t.close());

let people = 0;

/** A person whose account was made as the sign-up page makes one: with the sign-in value derived from the password, never the password. */
async function person() {
  const n = ++people;
  const email = `keys${n}@example.com`;
  const vaultId = await vaultOf(t.auth.store).vaultId();
  const signIn = (password: string) =>
    walletVault(vaultId)
      .derive(password, addressOf(email))
      .then((derived) => derived.signIn);
  const reply = await t.auth
    .client()
    .from(`198.51.101.${n}`)
    .postRaw('/api/auth/sign-up/email', {
      name: 'Key Person',
      email,
      password: await signIn(PASSWORD),
    });
  if (reply.status !== 200) throw new Error(`could not make an account: ${reply.status}`);
  const id = reply.body.user.id as string;
  return {
    id,
    email,
    /** A reset, as the link does it: the stored sign-in value is the new password's. */
    async resetTo(password: string) {
      const context = await t.auth.auth.$context;
      await context.internalAdapter.updatePassword(
        id,
        await context.password.hash(await signIn(password)),
      );
    },
  };
}

/** One browser of one person: its own storage, and a network the test can cut. */
function browser(sub: string) {
  const state = { online: true };
  const kept = new Map<string, unknown>();
  const route = vaultRoute(vaultOf(t.auth.store), { origin: ORIGIN });
  // The session's secret, which the server keeps with the session: the same for as long as this browser's session lasts.
  const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  let vaultId = '';
  /** The browser's network: the vault, the session's secret and the password check, as the server answers them. */
  let network: typeof fetch;
  return {
    state,
    confirm: (signIn: string): Promise<Confirmation> => confirmWithServer(signIn, network),
    async vault() {
      vaultId ||= await vaultOf(t.auth.store).vaultId();
      return walletVault(vaultId, {
        backend: {
          get: async (key) => kept.get(key),
          set: async (key, value) => void kept.set(key, value),
          delete: async (key) => void kept.delete(key),
        },
        fetch: (network = async (input, init) => {
          if (!state.online) throw new TypeError('no network');
          const url = new URL(String(input), ORIGIN);
          if (url.pathname === '/api/auth/sv/key-secret') return Response.json({ sub, secret });
          if (url.pathname === '/api/keys/confirm')
            return confirmResponse(new Request(url, init), (password) =>
              confirmPassword(t.auth.store, t.auth.auth, sub, password),
            );
          const headers = new Headers(init?.headers);
          headers.set('origin', ORIGIN);
          return route(new Request(url, { ...init, headers }), sub);
        }),
      });
    },
  };
}

describe('opening the keys with a password', () => {
  it('does not make a person’s keys from a password that is not theirs', async () => {
    // An account with no keys yet: one made before the suite's keys, whose session is still alive, or a sign-up that could not reach the vault.
    const who = await person();
    const device = browser(who.id);
    const vault = await device.vault();
    expect(
      await openWithPassword(vault, 'a typo, not the password', who.email, device.confirm),
    ).toEqual({ outcome: 'wrong' });
    expect((await vaultOf(t.auth.store).read(who.id)).account).toBeUndefined();
    // With the right one they are made, and the typo did not cost the account its keys.
    expect(await openWithPassword(vault, PASSWORD, who.email, device.confirm)).toEqual({
      outcome: 'kit',
    });
  });

  it('stops checking after five wrong passwords, and makes nothing then either', async () => {
    const who = await person();
    const device = browser(who.id);
    const vault = await device.vault();
    for (let i = 0; i < 5; i++)
      await openWithPassword(vault, `wrong ${i}`, who.email, device.confirm);
    expect(await openWithPassword(vault, PASSWORD, who.email, device.confirm)).toEqual({
      outcome: 'limited',
    });
    expect((await vaultOf(t.auth.store).read(who.id)).account).toBeUndefined();
  });

  it('asks for the kit the first time, then opens, and says wrong or offline as it is', async () => {
    const who = await person();
    const device = browser(who.id);
    const vault = await device.vault();
    const open = (password: string, email = who.email) =>
      openWithPassword(vault, password, email, device.confirm);
    // The first time, the keys are made and the kit has not been kept.
    expect(await open(PASSWORD)).toEqual({ outcome: 'kit' });
    expect(await vault.keepKit(crypto.getRandomValues(new Uint8Array(32)))).toBe(true);
    expect((await open(PASSWORD, ` ${who.email.toUpperCase()} `)).outcome).toBe('open');
    expect(await open('not the password')).toEqual({ outcome: 'wrong' });
    device.state.online = false;
    expect(await open(PASSWORD)).toEqual({ outcome: 'offline' });
    // And back: the same keys.
    device.state.online = true;
    expect((await open(PASSWORD)).outcome).toBe('open');
  });

  it('after a reset, opens with the recovery kit, and the root wrapped before still opens', async () => {
    const who = await person();
    const old = browser(who.id);
    const first = await old.vault();
    expect((await openWithPassword(first, PASSWORD, who.email, old.confirm)).outcome).toBe('kit');
    const kit = crypto.getRandomValues(new Uint8Array(32));
    expect(await first.keepKit(kit)).toBe(true);
    const before = await openWithPassword(first, PASSWORD, who.email, old.confirm);
    if (before.outcome !== 'open') throw new Error('not open');
    const root = newRoot();
    const wrapped = await wrapRoot(before.key, who.id, 1, root);

    // The password is reset: the new one is the account's, and is not a way into the keys, on a browser that never held them.
    await who.resetTo(NEXT);
    const device = browser(who.id);
    const second = await device.vault();
    expect(await openWithPassword(second, NEXT, who.email, device.confirm)).toEqual({
      outcome: 'wrong',
    });
    const secret = (await second.derive(NEXT, addressOf(who.email))).secret;
    const other = await formatKit(crypto.getRandomValues(new Uint8Array(32)));
    expect(await second.unlockWithKit(other, secret)).toBe('locked');
    expect(await second.unlockWithKit(await formatKit(kit), secret)).toBe('unlocked');
    // From then on the new password opens them, and they are the same keys: the root comes back as it was.
    const after = await openWithPassword(second, NEXT, who.email, device.confirm);
    if (after.outcome !== 'open') throw new Error('not open after the kit');
    expect(await unwrapRoot(after.key, who.id, 1, wrapped)).toEqual(root);
  });
});
