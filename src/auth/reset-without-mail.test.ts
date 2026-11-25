import { resetLink } from '@sovereignfs/auth/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testTarget } from '../db/test-support';
import { type TestAuth, type TestClient, makeAuth } from './test-support';

/**
 * Giving someone their account back on an instance that sends no mail (DESIGN.md §25.1): a reset link is made by an operator (`wallet-admin accounts
 * reset-link`, which is the package's `resetLink` and nothing else), and using it needs no mail: it is good once, for an hour, and ends every session. What does
 * need mail, asking for a link, is refused, in the package's words.
 */
const { leg } = testTarget();
const PASSWORD = 'correct horse battery';
const NEW_PASSWORD = 'another long password here';
const BASE = 'http://localhost:3000';

let t: TestAuth;
let addresses = 0;
let accounts = 0;
beforeAll(async () => {
  // No mailer: an instance with no SMTP, which is the case.
  t = await makeAuth({ signUp: 'open' });
});
afterAll(async () => t.close());

const visitor = (): TestClient =>
  t.client().from(`10.31.${Math.floor(addresses / 250)}.${(addresses++ % 250) + 1}`);

async function account() {
  const address = `nomail${++accounts}@example.com`;
  const client = visitor();
  const reply = await client.post('/api/auth/sign-up/email', {
    name: 'Ada',
    email: address,
    password: PASSWORD,
  });
  expect(reply.status).toBe(200);
  return { address, client };
}
const tokenOf = (link: string | undefined): string => {
  if (!link) throw new Error('no link was made');
  const token = new URL(link).searchParams.get('token');
  if (!token) throw new Error('the link has no token');
  return token;
};
const signIn = (address: string, password: string) =>
  visitor().post('/api/auth/sign-in/email', { email: address, password });

describe(`a reset link an operator makes, with no mail (${leg})`, () => {
  it('chooses a new password, once, and the old password no longer works', async () => {
    const { address } = await account();
    const link = await resetLink(t.auth, address, BASE);
    expect(link).toMatch(/^http:\/\/localhost:3000\/reset-password\?token=[A-Za-z0-9_-]+$/);
    const token = tokenOf(link);
    const client = visitor();
    expect(
      (await client.post('/api/auth/reset-password', { newPassword: NEW_PASSWORD, token })).status,
    ).toBe(200);
    expect((await signIn(address, PASSWORD)).status).toBe(401);
    expect((await signIn(address, NEW_PASSWORD)).status).toBe(200);
    // Used twice: refused, and the password is not changed again.
    const again = await client.post('/api/auth/reset-password', {
      newPassword: 'a third long password',
      token,
    });
    expect(again.status).toBeGreaterThanOrEqual(400);
    expect((await signIn(address, NEW_PASSWORD)).status).toBe(200);
  });

  it('ends every session of the account when it is used', async () => {
    const { address, client: first } = await account();
    const second = visitor();
    await second.post('/api/auth/sign-in/email', { email: address, password: PASSWORD });
    expect((await first.get('/api/auth/get-session')).body).not.toBeNull();
    const token = tokenOf(await resetLink(t.auth, address, BASE));
    expect(
      (await visitor().post('/api/auth/reset-password', { newPassword: NEW_PASSWORD, token }))
        .status,
    ).toBe(200);
    expect((await first.get('/api/auth/get-session')).body).toBeNull();
    expect((await second.get('/api/auth/get-session')).body).toBeNull();
  });

  it('is good for an hour and no longer, and leaves the password as it was', async () => {
    const { address } = await account();
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    const token = tokenOf(await resetLink(t.auth, address, BASE, { now: twoHoursAgo }));
    const reply = await visitor().post('/api/auth/reset-password', {
      newPassword: NEW_PASSWORD,
      token,
    });
    expect(reply.status).toBeGreaterThanOrEqual(400);
    expect((await signIn(address, PASSWORD)).status).toBe(200);
  });

  it('is made for an address however it is written, and for no address that has no account', async () => {
    const { address } = await account();
    expect(await resetLink(t.auth, `  ${address.toUpperCase()} `, BASE)).toMatch(
      /\/reset-password\?token=/,
    );
    expect(await resetLink(t.auth, 'nobody@example.com', BASE)).toBeUndefined();
  });

  it('does not make a link out of a guess: a token nobody was given changes nothing', async () => {
    const { address } = await account();
    const reply = await visitor().post('/api/auth/reset-password', {
      newPassword: NEW_PASSWORD,
      token: 'a-token-nobody-was-given-0123456789',
    });
    expect(reply.status).toBeGreaterThanOrEqual(400);
    expect((await signIn(address, PASSWORD)).status).toBe(200);
  });

  it('cannot be asked for: with no mail, sending one is refused, in the package’s words', async () => {
    const { address } = await account();
    const reply = await visitor().post('/api/auth/request-password-reset', {
      email: address,
      redirectTo: '/reset-password',
    });
    expect(reply.status).toBe(503);
    expect(reply.body).toMatchObject({ code: 'EMAIL_NOT_AVAILABLE' });
  });
});
