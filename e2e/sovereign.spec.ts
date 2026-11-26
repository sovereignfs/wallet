import { type Page, expect, test } from '@playwright/test';
import { PORTS } from './ports';

/**
 * Signing in through Sovereign (DESIGN.md §25): an instance that takes only a core, a fake one that says who is at the keyboard. In suite mode `/sign-in` and
 * `/sign-up` send the browser to core at once, and the fake signs in whoever it was told to, so arriving at either is coming back signed in. The first sign-in
 * makes the account, and the wallet then needs the app's key, which core releases (DESIGN.md §7.1, §9.4). **The fake core has no key release,** so what is shown
 * here is the wallet locked, offering to unlock through Sovereign; the release itself, and the wallet it opens, are not exercised by these tests (the SDK's
 * fake core has none either), and are checked against a real instance.
 */
test.use({ baseURL: `http://localhost:${PORTS.sovereign}` });

/**
 * Signs in at Sovereign by opening `/sign-in` (or `path`), which in suite mode goes to core and back. Signing in is limited per address, and the tests reach
 * this instance from one, so it may be told to wait: it then does, as a person would.
 */
async function throughSovereign(page: Page, path = '/sign-in') {
  const arrived = page.getByRole('heading', { name: 'Your wallet is locked' });
  const limited = page.getByText(/Too many/i);
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto(path);
    await expect(limited.or(arrived)).toBeVisible({ timeout: 30_000 });
    if (!(await limited.isVisible())) return;
    await page.waitForTimeout(10_500);
  }
  await expect(arrived).toBeVisible({ timeout: 30_000 });
}

const control = `http://localhost:${PORTS.coreControl}`;
/** A person of the fake Sovereign that no earlier run of these tests has been. */
const person = (label: string) =>
  `${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

test('signing in through Sovereign makes an account, whose wallet waits for core to release its key', async ({
  page,
  request,
}) => {
  await request.post(`${control}/sign-in-as`, {
    data: {
      sub: person('core-1'),
      email: `${person('sov')}@example.com`,
      name: 'Sol Core',
      emailVerified: true,
    },
  });
  // The front page offers Sovereign, and signing in is opening `/sign-in`: there is no password form.
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Sign in with Sovereign' })).toBeVisible();
  await throughSovereign(page);
  await expect(page.getByLabel('Password')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Your wallet is locked' })).toBeVisible();
  await page.getByRole('button', { name: 'User menu' }).click();
  await expect(page.getByText(/^sov-.*@example\.com$/)).toBeVisible();
});

test('sign-up is core’s, and the rest of local sign-in is not here on an instance that takes only Sovereign', async ({
  page,
  request,
}) => {
  for (const path of ['/forgot-password', '/reset-password'])
    expect((await page.goto(path))?.status(), path).toBe(404);
  // Sign-up has no form of its own: it is core's, so the page sends the browser there and back, signed in.
  await request.post(`${control}/sign-in-as`, {
    data: {
      sub: person('core-up'),
      email: `${person('up')}@example.com`,
      name: 'Una Core',
      emailVerified: true,
    },
  });
  await throughSovereign(page, '/sign-up');
  await expect(page.getByLabel('Password')).toHaveCount(0);
  // No way is left to make or open an account with a password, and nobody is signed in by trying.
  for (const path of ['/api/auth/sign-in/email', '/api/auth/sign-up/email']) {
    const reply = await request.post(path, {
      headers: { origin: `http://localhost:${PORTS.sovereign}` },
      data: { name: 'X', email: 'x@example.com', password: 'whatever it is' },
    });
    expect([400, 404], path).toContain(reply.status());
    expect(reply.headers()['set-cookie'] ?? '', path).not.toContain('session_token');
  }
});

test('deleting the account is core’s: Wallet says where it is, and does not do it', async ({
  page,
}) => {
  await page.request.post(`${control}/sign-in-as`, {
    data: {
      sub: person('core-del'),
      email: `${person('del')}@example.com`,
      name: 'Dee Core',
      emailVerified: true,
    },
  });
  await throughSovereign(page);
  // No password to ask for, and core's address to go to.
  const preview = await page.request.get('/api/account/delete');
  expect(await preview.json()).toEqual({
    password: false,
    core: `http://localhost:${PORTS.coreAuth}`,
  });
  // A session, even one made a moment ago, deletes nothing from here: that is core's.
  const attempt = await page.request.post('/api/account/delete', {
    headers: { origin: `http://localhost:${PORTS.sovereign}` },
    data: { password: '' },
  });
  expect(attempt.status()).toBe(404);
  const session = await page.request.get('/api/auth/get-session');
  expect(await session.json()).not.toBeNull();

  // The wallet is locked until core releases its key, and offers to: there is no password to ask for here, and nothing to delete from here.
  await expect(page.getByRole('button', { name: 'Unlock through Sovereign' })).toBeVisible();
  await expect(page.getByLabel('Your password')).toHaveCount(0);
});

test('core’s notices end the session, and a deletion removes the account, before it answers', async ({
  page,
  request,
}) => {
  const sub = person('core-2');
  await request.post(`${control}/sign-in-as`, {
    data: { sub, email: `${person('gone')}@example.com`, name: 'Gone Soon', emailVerified: true },
  });
  await throughSovereign(page);
  // A notice that names the person, not one of their core sessions: one that names a core session ends only the sessions that came from
  // it (auth.md §8).
  const notice = async (kind: 'logout' | 'account-deleted', wrong?: string) =>
    (await request.post(`${control}/notice`, { data: { kind, sub, wrong } })).text();

  // A notice that is not signed by core is refused, and nothing happens: the person is still signed in.
  const forged = await page.request.post('/api/sovereign/account-deleted', {
    form: { account_deleted_token: await notice('account-deleted', 'signature') },
  });
  expect(forged.status()).toBe(400);
  // A logout token is not a deletion token.
  expect(
    (
      await page.request.post('/api/sovereign/account-deleted', {
        form: { account_deleted_token: await notice('logout') },
      })
    ).status(),
  ).toBe(400);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your wallet is locked' })).toBeVisible();

  // The real notice: answered 200, and the account is gone with its session.
  const token = await notice('account-deleted');
  const answered = await page.request.post('/api/sovereign/account-deleted', {
    form: { account_deleted_token: token },
  });
  expect(answered.status()).toBe(200);
  // No session is left. (Sent to sign in, suite mode would go straight to core, which the fake answers by signing the same person in again.)
  const session = await page.request.get('/api/auth/get-session');
  expect(await session.json()).toBeNull();
});
