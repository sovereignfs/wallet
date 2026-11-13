import { expect, test } from '@playwright/test';
import {
  PASSWORD,
  addCardByTyping,
  emailFor,
  goTo,
  setUp,
  signIn,
  signUp,
  unlockNewDevice,
  waitForCard,
} from './helpers';

/**
 * The recovery key and deleting an account (DESIGN.md §7.3, §28): the key on the printed sheet opens the wallet as the wallet key does, and deleting the
 * account removes everything of it, on the server and on this device.
 */
test.setTimeout(120_000);

test('the recovery key opens a wallet on a new device, as the wallet key does', async ({
  browser,
}) => {
  const email = emailFor('recovery');
  const first = await browser.newContext();
  const a = await first.newPage();
  await signUp(a, email);
  const keys = await setUp(a, { recovery: 'make' });
  expect(keys.recovery).toMatch(/^AGE-SECRET-KEY-1/);
  expect(keys.recovery).not.toBe(keys.identity);
  await a.getByRole('button', { name: 'Go to Home' }).click();
  await addCardByTyping(a, 'Kept for recovery', 'REC-1');

  const second = await browser.newContext();
  const b = await second.newPage();
  await signIn(b, email);
  // A key that is not one of the wallet's is refused, and the recovery key opens it.
  await expect(b.getByRole('heading', { name: 'Your wallet is locked' })).toBeVisible({
    timeout: 20_000,
  });
  await b
    .getByLabel('Wallet key or recovery key')
    .fill('AGE-SECRET-KEY-1QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ');
  await b.getByRole('button', { name: 'Unlock with key' }).click();
  await expect(b.getByText(/not a key|does not open this wallet/)).toBeVisible();
  await unlockNewDevice(b, keys.recovery ?? '');
  await goTo(b, 'Cards');
  await waitForCard(b, /Kept for recovery/);
  await first.close();
  await second.close();
});

test('deleting the account removes the wallet from the server and from this device', async ({
  page,
  request,
}) => {
  const email = emailFor('delete');
  await signUp(page, email);
  await setUp(page);
  await page.getByRole('button', { name: 'Go to Home' }).click();
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
  await expect(page.getByRole('heading', { name: 'Only you can read your wallet' })).toBeVisible({
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
