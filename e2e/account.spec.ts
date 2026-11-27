import { expect, test } from '@playwright/test';
import {
  PASSWORD,
  addCardByTyping,
  emailFor,
  goTo,
  setUp,
  signIn,
  signUp,
  setUpNewDevice,
  waitForCard,
} from './helpers';

/**
 * The recovery kit and deleting an account (DESIGN.md §7.2, §28): an instance that runs alone shows the kit once, right after sign-up and before anything else,
 * and does not show it again; and deleting the account removes everything of it, on the server and on this device.
 */
test.setTimeout(120_000);

test('the recovery kit is shown once, after sign-up, and a second device needs only the password', async ({
  browser,
}) => {
  const email = emailFor('kit');
  const first = await browser.newContext();
  const a = await first.newPage();
  await signUp(a, email);
  // Before anything else, and the file it saves holds a kit.
  const { kit } = await setUp(a);
  expect(kit).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4})+$/);
  await a.getByRole('button', { name: 'See my cards' }).click();
  await addCardByTyping(a, 'Kept for later', 'KIT-1');

  // A second device signs in with the password and is not shown the kit again: the keys exist, and it brings the wallet's root.
  const second = await browser.newContext();
  const b = await second.newPage();
  await signIn(b, email);
  await expect(b.getByRole('heading', { name: 'Save your recovery kit' })).toHaveCount(0);
  await setUpNewDevice(b);
  await b.getByRole('button', { name: 'See my cards' }).click();
  await goTo(b, 'Cards');
  await waitForCard(b, /Kept for later/);
  await first.close();
  await second.close();
});

test('deleting the account does not wait for another tab, which lets the device’s store go and leaves', async ({
  page,
  context,
}) => {
  const email = emailFor('delete-tabs');
  await signUp(page, email);
  await setUp(page);
  await page.getByRole('button', { name: 'See my cards' }).click();
  const other = await context.newPage();
  await other.goto('/');
  await expect(other.getByRole('button', { name: 'Lock the wallet' })).toBeEnabled({
    timeout: 30_000,
  });

  await page.bringToFront();
  await goTo(page, 'Settings');
  await page.getByRole('tab', { name: 'Account' }).click();
  await page.getByRole('button', { name: 'Delete my account…' }).click();
  const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'));
  await dialog.getByLabel('Type delete to confirm').fill('delete');
  await dialog.getByLabel('Your password').fill(PASSWORD);
  await dialog.getByRole('button', { name: 'Delete everything' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your wallet, locked in your browser' }),
  ).toBeVisible({ timeout: 20_000 });

  const left = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
  expect(left.filter((name) => name?.startsWith('wallet-'))).toEqual([]);
  expect(await page.evaluate(() => window.localStorage.getItem('wallet.me'))).toBeNull();
  // The other tab is no longer in a wallet that is gone.
  await expect(other.getByRole('button', { name: 'User menu' })).toHaveCount(0, {
    timeout: 20_000,
  });
});

test('deleting the account removes the wallet from the server and from this device', async ({
  page,
  request,
}) => {
  const email = emailFor('delete');
  await signUp(page, email);
  await setUp(page);
  await page.getByRole('button', { name: 'See my cards' }).click();
  await addCardByTyping(page, 'Soon gone', 'GONE-1');
  await page.waitForTimeout(2500);
  const databases = await page.evaluate(async () =>
    (await indexedDB.databases()).map((d) => d.name),
  );
  expect(databases.some((name) => name?.startsWith('wallet-'))).toBe(true);

  await goTo(page, 'Settings');
  await page.getByRole('tab', { name: 'Account' }).click();
  await page.getByRole('button', { name: 'Delete my account…' }).click();
  const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'));
  await dialog.getByLabel('Type delete to confirm').fill('delete');
  await dialog.getByLabel('Your password').fill('not the password');
  await dialog.getByRole('button', { name: 'Delete everything' }).click();
  await expect(dialog.getByText('That password is not right.')).toBeVisible();
  await dialog.getByLabel('Your password').fill(PASSWORD);
  await dialog.getByRole('button', { name: 'Delete everything' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your wallet, locked in your browser' }),
  ).toBeVisible({
    timeout: 20_000,
  });

  // Nothing of it is left on this device, and the account cannot sign in.
  const left = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
  expect(left.filter((name) => name?.startsWith('wallet-'))).toEqual([]);
  expect(await page.evaluate(() => window.localStorage.getItem('wallet.me'))).toBeNull();
  const reply = await request.post('/api/auth/sign-in/email', {
    headers: { origin: new URL(page.url()).origin },
    data: { email, password: PASSWORD },
  });
  expect(reply.status()).not.toBe(200);
});
