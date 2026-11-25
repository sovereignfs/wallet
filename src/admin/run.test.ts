import { resetLink } from '@sovereignfs/auth/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { testTarget } from '../db/test-support';
import type { AuthSettings } from '../auth/config';
import { type TestAuth, type TestClient, makeAuth } from '../auth/test-support';
import { type AdminDeps, run } from './run';

/**
 * `wallet-admin` (DESIGN.md §25.1) against a real auth store, with the package's own `resetLink` as `main.ts` gives it: what it says, to which stream, and that the
 * link it makes gives the account back. **The link is the only thing on `out`, and neither it nor the address is on `log`.**
 */
const { leg } = testTarget();
const PASSWORD = 'correct horse battery';
const NEW_PASSWORD = 'another long password here';

let t: TestAuth;
let addresses = 0;
let accounts = 0;
beforeAll(async () => {
  t = await makeAuth({ signUp: 'open' });
});
afterAll(async () => t.close());

const visitor = (): TestClient =>
  t.client().from(`10.41.${Math.floor(addresses / 250)}.${(addresses++ % 250) + 1}`);

async function account() {
  const address = `admin${++accounts}@example.com`;
  const client = visitor();
  expect(
    (
      await client.post('/api/auth/sign-up/email', {
        name: 'Ada',
        email: address,
        password: PASSWORD,
      })
    ).status,
  ).toBe(200);
  return { address, client };
}
const verifications = async () =>
  Number((await t.store.run('SELECT COUNT(*) AS n FROM verifications')).rows[0]?.n);

function world(over: Partial<AdminDeps> = {}) {
  const out: string[] = [];
  const log: string[] = [];
  const made = vi.fn((email: string) => resetLink(t.auth, email, t.settings.url));
  const deps: AdminDeps = {
    settings: t.settings,
    resetLink: made,
    out: (line) => out.push(line),
    log: (line) => log.push(line),
    ...over,
  };
  return { out, log, made, deps };
}

describe(`wallet-admin accounts reset-link (${leg})`, () => {
  it('prints a link that gives the account back, once, and says nothing about it that is not for the log', async () => {
    const { address, client: first } = await account();
    const { out, log, deps } = world();
    expect(await run(['accounts', 'reset-link', `  ${address.toUpperCase()} `], deps)).toBe(0);
    // The link is the answer, alone on the standard output; what is said of it is said elsewhere, without the link or the address.
    expect(out).toHaveLength(1);
    const link = out[0] ?? '';
    expect(link).toMatch(/^http:\/\/localhost:3000\/reset-password\?token=[A-Za-z0-9_-]+$/);
    expect(log).toHaveLength(1);
    const token = new URL(link).searchParams.get('token') ?? '';
    for (const said of log) {
      expect(said).not.toContain(token);
      expect(said.toLowerCase()).not.toContain(address.toLowerCase());
    }
    // And it gives the account back: a new password, the old one gone, the other sessions ended, and the link spent.
    expect((await first.get('/api/auth/get-session')).body).not.toBeNull();
    expect(
      (await visitor().post('/api/auth/reset-password', { newPassword: NEW_PASSWORD, token }))
        .status,
    ).toBe(200);
    expect(
      (await visitor().post('/api/auth/sign-in/email', { email: address, password: PASSWORD }))
        .status,
    ).toBe(401);
    expect(
      (await visitor().post('/api/auth/sign-in/email', { email: address, password: NEW_PASSWORD }))
        .status,
    ).toBe(200);
    expect((await first.get('/api/auth/get-session')).body).toBeNull();
    const again = await visitor().post('/api/auth/reset-password', {
      newPassword: 'a third long password',
      token,
    });
    expect(again.status).toBeGreaterThanOrEqual(400);
  });

  it('exits 1 and makes nothing for an address that has no account', async () => {
    await account();
    const before = await verifications();
    const { out, log, deps } = world();
    expect(await run(['accounts', 'reset-link', 'nobody@example.com'], deps)).toBe(1);
    expect(out).toEqual([]);
    expect(log.join(' ')).toContain('no account with that address');
    expect(await verifications()).toBe(before);
  });

  it('has nothing to do in suite mode or with sign-in off, says why, and does not even ask for a link', async () => {
    const suite: AuthSettings = {
      ...t.settings,
      local: false,
      sovereign: { issuer: 'https://sovereign.example.com', clientId: 'w', clientSecret: 's' },
    };
    for (const [settings, why] of [
      [suite, 'through Sovereign'],
      [undefined, 'sign-in is not set up'],
    ] as const) {
      const { out, log, made, deps } = world({ settings });
      expect(await run(['accounts', 'reset-link', 'ada@example.com'], deps)).toBe(1);
      expect(out).toEqual([]);
      expect(made).not.toHaveBeenCalled();
      expect(log).toHaveLength(1);
      expect(log.join(' ')).toContain(why);
    }
  });

  it('shows how to use it on the standard output, and refuses a request it does not understand with 2 and nothing on it', async () => {
    const help = world();
    expect(await run(['--help'], help.deps)).toBe(0);
    expect(help.out.join('\n')).toContain('accounts reset-link EMAIL');
    for (const argv of [
      [],
      ['accounts', 'reset-link'],
      ['accounts', 'reset-link', 'not-an-address'],
      ['accounts', 'forget', 'a@b.c'],
    ]) {
      const said = world();
      expect(await run(argv, said.deps), argv.join(' ')).toBe(2);
      expect(said.out).toEqual([]);
      expect(said.made).not.toHaveBeenCalled();
      expect(said.log.join('\n')).toContain('usage:');
    }
  });
});
