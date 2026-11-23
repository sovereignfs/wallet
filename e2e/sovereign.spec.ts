import { type Page, expect, test } from '@playwright/test';
import { PORTS } from './ports';

/**
 * Signing in through Sovereign (DESIGN.md §25): an instance that takes only a core, a fake one that says who is at the keyboard. The first sign-in makes the
 * account, and the wallet then needs a key of its own: **signing in through core never opens a wallet** (DESIGN.md §9.4).
 */
test.use({ baseURL: `http://localhost:${PORTS.sovereign}` });

/**
 * The button that takes a person to Sovereign. Signing in is limited per address, and the tests reach this instance from one, so it may be told to wait:
 * it then does, as a person would.
 */
async function throughSovereign(page: Page) {
  const arrived = page.getByRole('button', { name: 'Get started' });
  await page.getByRole('button', { name: 'Sign in with Sovereign' }).click();
  const limited = page.getByText(/Too many (tries|attempts)/);
  await expect(limited.or(arrived)).toBeVisible({ timeout: 30_000 });
  if (await limited.isVisible()) {
    await page.waitForTimeout(10_500);
    await page.getByRole('button', { name: 'Sign in with Sovereign' }).click();
    await expect(arrived).toBeVisible({ timeout: 30_000 });
  }
}

const control = `http://localhost:${PORTS.coreControl}`;
/** A person of the fake Sovereign that no earlier run of these tests has been. */
const person = (label: string) =>
  `${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

test('signing in through Sovereign makes an account, which sets up a wallet of its own', async ({
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
  await page.goto('/sign-in');
  // Only Sovereign is on: there is no password form.
  await expect(page.getByLabel('Password')).toHaveCount(0);
  await throughSovereign(page);
  await expect(page.getByRole('heading', { name: 'Set up your wallet' })).toBeVisible();
  await page.getByRole('button', { name: 'User menu' }).click();
  await expect(page.getByText(/^sov-.*@example\.com$/)).toBeVisible();
});

test('local sign-in is not here on an instance that takes only Sovereign', async ({
  page,
  request,
}) => {
  for (const path of ['/sign-up', '/forgot-password', '/reset-password'])
    expect((await page.goto(path))?.status(), path).toBe(404);
  const reply = await request.post('/api/auth/sign-in/email', {
    headers: { origin: `http://localhost:${PORTS.sovereign}` },
    data: { email: 'x@example.com', password: 'whatever it is' },
  });
  // Refused, and nobody is signed in by it.
  expect([400, 404]).toContain(reply.status());
  expect(reply.headers()['set-cookie'] ?? '').not.toContain('session_token');
});

test('core’s notices end the session, and a deletion removes the account, before it answers', async ({
  page,
  request,
}) => {
  const sub = person('core-2');
  await request.post(`${control}/sign-in-as`, {
    data: { sub, email: `${person('gone')}@example.com`, name: 'Gone Soon', emailVerified: true },
  });
  await page.goto('/sign-in');
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
  await expect(page.getByRole('button', { name: 'Get started' })).toBeVisible();

  // The real notice: answered 200, and the account is gone with its session.
  const token = await notice('account-deleted');
  const answered = await page.request.post('/api/sovereign/account-deleted', {
    form: { account_deleted_token: token },
  });
  expect(answered.status()).toBe(200);
  await page.goto('/cards');
  await expect(page).toHaveURL(/\/sign-in/);
});
