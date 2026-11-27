import { type Locator, type Page, expect, test } from '@playwright/test';
import { PASSCODE, PASSWORD, emailFor, goTo, setUp, signUp } from './helpers';

/**
 * A password manager can fill a box without telling the page (AutoFill on iOS, until a box is focused). **Wallet's own boxes send what is in them,** not a copy
 * of it kept by the page, and no button waits for a box the page never heard of. The forms of sign-in, sign-up and reset are `@sovereignfs/ui`'s, and are its
 * to test.
 */
test.setTimeout(120_000);

/** Fills a box as a password manager can: the value is there to see, and no event says so. The prototype's setter is used because React watches the element's own. */
async function fillUnannounced(box: Locator, value: string): Promise<void> {
  await box.evaluate((element, text) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(element, text);
  }, value);
}

/** Counts the requests the page makes to an address with a method, from now on. */
function requestsTo(page: Page, method: string, path: string): () => number {
  let count = 0;
  page.on('request', (request) => {
    if (request.method() === method && new URL(request.url()).pathname === path) count += 1;
  });
  return () => count;
}

const locked = (page: Page) => page.getByRole('heading', { name: 'Your wallet is locked' });
const missing = (box: Locator) =>
  box.evaluate((element: HTMLInputElement) => element.validity.valueMissing);

/** An account with a passcode on this device, on the cards screen. */
async function aWallet(page: Page, label: string): Promise<void> {
  await signUp(page, emailFor(label));
  await setUp(page);
  await page.getByRole('button', { name: 'See my cards' }).click();
}

test('a filled password opens the lock screen, and an empty box asks for it and sends nothing', async ({
  page,
}) => {
  await aWallet(page, 'fill-lock');
  await page.getByRole('button', { name: 'Lock the wallet' }).click();
  await page.getByRole('button', { name: 'Use my password' }).click();
  const box = page.getByLabel('Your password');
  const unlock = page.getByRole('button', { name: 'Unlock with my password' });
  const sent = requestsTo(page, 'POST', '/api/keys/confirm');

  await unlock.click({ timeout: 5_000 });
  expect(await missing(box)).toBe(true);
  expect(sent()).toBe(0);

  await fillUnannounced(box, PASSWORD);
  await unlock.click({ timeout: 5_000 });
  await expect(locked(page)).toHaveCount(0, { timeout: 30_000 });
  expect(sent()).toBe(1);
});

test('a filled passcode unlocks', async ({ page }) => {
  await aWallet(page, 'fill-passcode');
  await page.getByRole('button', { name: 'Lock the wallet' }).click();
  const box = page.getByLabel('Passcode');
  const unlock = page.getByRole('button', { name: 'Unlock', exact: true });

  await unlock.click({ timeout: 5_000 });
  expect(await missing(box)).toBe(true);

  await fillUnannounced(box, PASSCODE);
  await unlock.click({ timeout: 5_000 });
  await expect(locked(page)).toHaveCount(0, { timeout: 30_000 });
});

test('filled boxes change how the device unlocks, and an empty password sends nothing', async ({
  page,
}) => {
  await aWallet(page, 'fill-settings');
  await goTo(page, 'Settings');
  await page.getByRole('button', { name: 'Change how this device unlocks' }).click();
  const password = page.getByLabel('Your password');
  const go = page.getByRole('button', { name: 'Continue' });
  const sent = requestsTo(page, 'POST', '/api/keys/confirm');

  await go.click({ timeout: 5_000 });
  await expect(page.getByText('Type your password.')).toBeVisible();
  expect(sent()).toBe(0);

  await fillUnannounced(password, PASSWORD);
  await go.click({ timeout: 5_000 });
  const first = page.getByLabel('Passcode', { exact: true });
  await expect(first).toBeVisible({ timeout: 30_000 });

  const next = 'another way to unlock';
  await fillUnannounced(first, next);
  await fillUnannounced(page.getByLabel('Passcode again'), next);
  await page.getByRole('button', { name: 'Change passcode' }).click({ timeout: 5_000 });
  // The boxes are emptied once the passcode is set.
  await expect(first).toHaveValue('', { timeout: 30_000 });
  await expect(page.getByLabel('Passcode again')).toHaveValue('');
  await page.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'Lock the wallet' }).click();
  await page.getByLabel('Passcode').fill(next);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(locked(page)).toHaveCount(0, { timeout: 30_000 });
});

test('a filled password deletes the account, and an empty box sends nothing', async ({ page }) => {
  await aWallet(page, 'fill-delete');
  await goTo(page, 'Settings');
  await page.getByRole('tab', { name: 'Account' }).click();
  await page.getByRole('button', { name: 'Delete my account…' }).click();
  const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'));
  const confirm = dialog.getByRole('button', { name: 'Delete everything' });
  const sent = requestsTo(page, 'POST', '/api/account/delete');
  await dialog.getByLabel('Type delete to confirm').fill('delete');

  await confirm.click({ timeout: 5_000 });
  await expect(dialog.getByText('Type your password.')).toBeVisible();
  expect(sent()).toBe(0);

  await fillUnannounced(dialog.getByLabel('Your password'), PASSWORD);
  await confirm.click({ timeout: 5_000 });
  await expect(
    page.getByRole('heading', { name: 'Your wallet, locked in your browser' }),
  ).toBeVisible({ timeout: 20_000 });
  expect(sent()).toBe(1);
});
