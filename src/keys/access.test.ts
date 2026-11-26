import { formatKit } from '@sovereignfs/sdk/keys';
import { vaultRoute } from '@sovereignfs/sdk/vault';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type TwoAccounts, twoAccounts } from '../access/two-accounts';
import { newRoot, unwrapRoot, wrapRoot } from '../core/vault';
import { openWithPassword } from './access';
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

/** One browser of one person: its own storage, and a network the test can cut. */
function browser(sub: string) {
  const state = { online: true };
  const kept = new Map<string, unknown>();
  const route = vaultRoute(vaultOf(t.auth.store), { origin: ORIGIN });
  // The session's secret, which the server keeps with the session: the same for as long as this browser's session lasts.
  const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  let vaultId = '';
  return {
    state,
    async vault() {
      vaultId ||= await vaultOf(t.auth.store).vaultId();
      return walletVault(vaultId, {
        backend: {
          get: async (key) => kept.get(key),
          set: async (key, value) => void kept.set(key, value),
          delete: async (key) => void kept.delete(key),
        },
        fetch: async (input, init) => {
          if (!state.online) throw new TypeError('no network');
          const url = new URL(String(input), ORIGIN);
          if (url.pathname === '/api/auth/sv/key-secret') return Response.json({ sub, secret });
          const headers = new Headers(init?.headers);
          headers.set('origin', ORIGIN);
          return route(new Request(url, { ...init, headers }), sub);
        },
      });
    },
  };
}

describe('opening the keys with a password', () => {
  it('asks for the kit the first time, then opens, and says wrong or offline as it is', async () => {
    const device = browser(t.ada.id);
    const vault = await device.vault();
    // The first time, the keys are made and the kit has not been kept.
    expect(await openWithPassword(vault, PASSWORD, t.ada.email)).toEqual({ outcome: 'kit' });
    expect(await vault.keepKit(crypto.getRandomValues(new Uint8Array(32)))).toBe(true);
    const opened = await openWithPassword(vault, PASSWORD, ` ${t.ada.email.toUpperCase()} `);
    expect(opened.outcome).toBe('open');
    expect(await openWithPassword(vault, 'not the password', t.ada.email)).toEqual({
      outcome: 'wrong',
    });
    device.state.online = false;
    expect(await openWithPassword(vault, PASSWORD, t.ada.email)).toEqual({ outcome: 'offline' });
    // And back: the same keys.
    device.state.online = true;
    expect((await openWithPassword(vault, PASSWORD, t.ada.email)).outcome).toBe('open');
  });

  it('after a reset, opens with the recovery kit, and the root wrapped before still opens', async () => {
    const first = await browser(t.grace.id).vault();
    expect((await openWithPassword(first, PASSWORD, t.grace.email)).outcome).toBe('kit');
    const kit = crypto.getRandomValues(new Uint8Array(32));
    expect(await first.keepKit(kit)).toBe(true);
    const before = await openWithPassword(first, PASSWORD, t.grace.email);
    if (before.outcome !== 'open') throw new Error('not open');
    const root = newRoot();
    const wrapped = await wrapRoot(before.key, t.grace.id, 1, root);

    // The password is reset: the new one is not a way into the keys, on a browser that never held them.
    const second = await browser(t.grace.id).vault();
    expect(await openWithPassword(second, NEXT, t.grace.email)).toEqual({ outcome: 'wrong' });
    const secret = (await second.derive(NEXT, addressOf(t.grace.email))).secret;
    const other = await formatKit(crypto.getRandomValues(new Uint8Array(32)));
    expect(await second.unlockWithKit(other, secret)).toBe('locked');
    expect(await second.unlockWithKit(await formatKit(kit), secret)).toBe('unlocked');
    // From then on the new password opens them, and they are the same keys: the root comes back as it was.
    const after = await openWithPassword(second, NEXT, t.grace.email);
    if (after.outcome !== 'open') throw new Error('not open after the kit');
    expect(await unwrapRoot(after.key, t.grace.id, 1, wrapped)).toEqual(root);
  });
});
