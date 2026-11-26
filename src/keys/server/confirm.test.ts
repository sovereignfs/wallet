import { confirmPassword } from '@sovereignfs/auth/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accountRoute } from '../../access/route';
import { type TwoAccounts, twoAccounts } from '../../access/two-accounts';
import { derivedFor } from '../../auth/test-support';
import { confirmResponse } from './confirm';

/** `/api/keys/confirm` as the route under `app/api/keys/confirm` composes it: the sign-in package's own check, for the session's account and no other. */
let t: TwoAccounts;
const theirs = new Map<string, string>();
beforeAll(async () => {
  t = await twoAccounts();
  // Each has a sign-in value of their own, set as a reset would set it.
  const context = await t.auth.auth.$context;
  for (const who of [t.ada, t.grace]) {
    const value = derivedFor(`the password of ${who.email}`);
    theirs.set(who.id, value);
    await context.internalAdapter.updatePassword(who.id, await context.password.hash(value));
  }
});
afterAll(async () => t.close());

const handle = () =>
  accountRoute(
    ({ request, accountId }) =>
      confirmResponse(request, (password) =>
        confirmPassword(t.auth.store, t.auth.auth, accountId, password),
      ),
    t.deps,
  );
const ask = (who: typeof t.ada | null, body: unknown, headers: Record<string, string> = {}) =>
  handle()(t.request(who, '/api/keys/confirm', { method: 'POST', body, headers }));

describe('asking whether a sign-in value is the signed-in account’s', () => {
  it('says yes to the account’s own and no to another’s', async () => {
    expect((await ask(t.ada, { password: theirs.get(t.ada.id) })).status).toBe(200);
    const other = await ask(t.ada, { password: theirs.get(t.grace.id) });
    expect(other.status).toBe(403);
    expect(await other.json()).toEqual({ code: 'WRONG_PASSWORD' });
    expect((await ask(t.grace, { password: theirs.get(t.grace.id) })).status).toBe(200);
  });

  it('refuses a visitor, another origin, and what is not a sign-in value', async () => {
    const value = { password: theirs.get(t.ada.id) };
    expect((await ask(null, value)).status).toBe(401);
    expect((await ask(t.ada, value, { origin: 'https://evil.example' })).status).toBe(403);
    for (const bad of [{}, { password: 5 }, { password: '' }, 'text'])
      expect((await ask(t.ada, bad)).status, JSON.stringify(bad)).toBe(400);
    expect((await ask(t.ada, { password: 'x'.repeat(2_000) })).status).toBe(413);
  });

  it('stops answering after five wrong ones, the right one included, for that account alone', async () => {
    for (let i = 0; i < 5; i++) await ask(t.grace, { password: derivedFor(`wrong ${i}`) });
    expect((await ask(t.grace, { password: theirs.get(t.grace.id) })).status).toBe(429);
    expect((await ask(t.ada, { password: theirs.get(t.ada.id) })).status).toBe(200);
  });
});
