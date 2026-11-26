import { expect, test } from '@playwright/test';
import {
  PASSCODE,
  PASSWORD,
  addCardByTyping,
  emailFor,
  finishSetup,
  goTo,
  keepKit,
  setUp,
  signUp,
  unlockWithPasscode,
} from './helpers';

/**
 * The ways round a lock that is not opened the usual way (DESIGN.md §9): the recovery kit that comes before the wallet, a password asked for with no network, a
 * mistyped password for an account that has no keys yet, a device that has lost its passcode, which the account opens again and sets up anew, and one that never
 * had a way to unlock.
 */
test.setTimeout(120_000);

test('the recovery kit comes before the wallet: leaving it without keeping it brings it back', async ({
  page,
}) => {
  await signUp(page, emailFor('kit-first'));
  await page.goto('/');
  await expect(page).toHaveURL(/\/keys\/kit/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Save your recovery kit' })).toBeVisible();
});

test('with no network, the password cannot open the wallet and the screen says why', async ({
  page,
  context,
}) => {
  await signUp(page, emailFor('offline-password'));
  await setUp(page);
  await page.getByRole('button', { name: 'Go to Home' }).click();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.getByRole('button', { name: 'Lock the wallet' }).click();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Use my password' }).click();
  await page.getByLabel('Your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Unlock with my password' }).click();
  // Not "that password is wrong": it was never checked.
  await expect(page.getByText('Wallet could not reach the server.')).toBeVisible({
    timeout: 30_000,
  });
  // The passcode still opens it, with no network.
  await unlockWithPasscode(page);
  await context.setOffline(false);
});

test('five wrong passcodes delete the passcode, and the password opens the wallet and sets the device up again', async ({
  page,
}) => {
  await signUp(page, emailFor('five'));
  await setUp(page);
  await page.getByRole('button', { name: 'Go to Home' }).click();
  await addCardByTyping(page, 'Still here', 'STILL-1');
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'Lock the wallet' }).click();
  for (let attempt = 1; attempt <= 5; attempt++) {
    await page.getByLabel('Passcode').fill(`wrong passcode ${attempt}`);
    const unlock = page.getByRole('button', { name: 'Unlock', exact: true });
    await unlock.click();
    if (attempt < 5) {
      await expect(page.getByText('That passcode is not right.')).toBeVisible({ timeout: 30_000 });
      await expect(unlock).toBeEnabled();
      await page.getByLabel('Passcode').fill('');
    }
  }
  await expect(page.getByText(/fifth wrong passcode/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel('Passcode')).toHaveCount(0);
  await page.getByLabel('Your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Unlock with my password' }).click();
  // No way to unlock is left on this device, so it is set up again, with the root the account's keys brought back.
  await expect(page.getByRole('heading', { name: /^Welcome/ })).toBeVisible({ timeout: 30_000 });
  await finishSetup(page, { passcode: PASSCODE, passkey: false });
  await page.getByRole('button', { name: 'Go to Home' }).click();
  await goTo(page, 'Cards');
  await expect(page.getByRole('link', { name: /Still here/ })).toBeVisible({ timeout: 20_000 });
});

test('a mistyped password does not become the keys’ password, for an account that has none yet', async ({
  page,
}) => {
  // An account with a live session and no keys, as one older than 0.7.0 is after the upgrade: signed up while the vault could not be reached.
  await page.route('**/api/keys/vault**', (route) => route.abort());
  await signUp(
    page,
    emailFor('typo'),
    'Ada Lovelace',
    page.getByRole('heading', { name: 'Connect to open your wallet' }),
  );
  await page.unroute('**/api/keys/vault**');
  await page.reload();

  const keys = async () =>
    ((await (await page.request.get('/api/keys/vault')).json()) as { value: { account?: unknown } })
      .value.account;
  await expect(page.getByRole('heading', { name: 'Your wallet is locked' })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByLabel('Your password').fill('correct horse batery');
  await page.getByRole('button', { name: 'Unlock with my password' }).click();
  await expect(page.getByText(/does not open your wallet/)).toBeVisible({ timeout: 30_000 });
  expect(await keys(), 'no keys are made from a typo').toBeUndefined();

  // The right one makes them, and the recovery kit comes before the wallet.
  await page.getByLabel('Your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Unlock with my password' }).click();
  await keepKit(page);
  expect(await keys()).toBeDefined();
  await finishSetup(page, { passcode: PASSCODE, passkey: false });
});

test('a device with no passkey or passcode says so, with the mark at its size, and the password goes on to setup', async ({
  page,
}) => {
  await signUp(page, emailFor('no-way'));
  await keepKit(page);
  // Locked during setup, before a way to unlock this device was added: the password is the only way back.
  await expect(page.getByRole('heading', { name: /^Welcome/ })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Lock the wallet' }).click();
  await expect(page.getByRole('heading', { name: 'Your wallet is locked' })).toBeVisible();
  const mark = await page.getByRole('img', { name: 'Wallet' }).boundingBox();
  expect(mark?.height).toBeLessThanOrEqual(48);
  expect(mark?.width).toBeLessThanOrEqual(64);
  await expect(page.getByText(/This device has no passkey or passcode\./)).toBeVisible();
  // The password is checked by the server, by a value made from it: the hint says only what is true.
  await expect(page.getByText(/Your password is never sent\./)).toBeVisible();
  await page.getByLabel('Your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Unlock with my password' }).click();
  await expect(page.getByRole('heading', { name: /^Welcome/ })).toBeVisible({ timeout: 30_000 });
});
