import { execFileSync } from 'node:child_process';
import { type Page, expect, test } from '@playwright/test';
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
import { localSettings } from './instance';

/**
 * The recovery kit and deleting an account (DESIGN.md §7.2, §28): an instance that runs alone shows the kit once, right after sign-up and before anything else,
 * and does not show it again; and deleting the account removes everything of it, on the server and on this device. It is done from Settings, or, where nothing
 * opens the wallet, from the lock screen.
 */
test.setTimeout(120_000);

const NEW_PASSWORD = 'a different long password';
const LANDING = 'Your wallet, locked in your browser';
/** What is said wherever deleting is offered: no other device is erased by it. */
const OTHERS_KEEP = /not from your other devices\. Each keeps its copy/;

/** A password reset link, as an operator makes one with no mail (`wallet-admin accounts reset-link`), for an account of this run's instance. */
function resetLinkFor(email: string): string {
  // The tool is bundled for the image, which a run of the browser tests need not have done.
  execFileSync(process.execPath, ['scripts/build-tools.mjs'], { stdio: 'pipe' });
  const printed = execFileSync(
    process.execPath,
    ['tools/wallet-admin.mjs', 'accounts', 'reset-link', email],
    {
      env: { ...process.env, ...localSettings(process.env.WALLET_E2E_DIR ?? '') },
      encoding: 'utf8',
    },
  );
  const link = printed.match(/https?:\/\/\S+\/reset-password\?token=\S+/)?.[0];
  expect(link, 'the tool prints a link').toBeTruthy();
  return link ?? '';
}

const databases = (page: Page) =>
  page.evaluate(async () =>
    (await indexedDB.databases())
      .map((db) => db.name)
      .filter((name) => name?.startsWith('wallet-')),
  );

/** How many of the suite's account keys this browser keeps (the SDK's own store, wrapped by the session's secret). */
const keptKeys = (page: Page) =>
  page.evaluate(async () => {
    let kept = 0;
    for (const { name } of await indexedDB.databases()) {
      if (!name) continue;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      if (db.objectStoreNames.contains('keys'))
        kept += await new Promise<number>((resolve, reject) => {
          const request = db.transaction('keys').objectStore('keys').count('account');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      db.close();
    }
    return kept;
  });

/** Signing in with it is refused, in the words a wrong password gets: there is no such account. */
async function expectNoAccount(page: Page, email: string, password: string) {
  await signIn(page, email, password, page.getByText('The email or password is incorrect.'));
}

/** From the lock screen's password form to the dialog that deletes the account. */
async function openDeletionFromLockScreen(page: Page) {
  await page.getByRole('button', { name: 'I’ve lost my keys' }).click();
  await page.getByRole('button', { name: 'Delete my account…' }).click();
  const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'));
  await dialog.getByLabel('Type delete to confirm').fill('delete');
  return dialog;
}

test('an account whose wallet nothing opens, a reset password and no recovery kit, is deleted from the lock screen', async ({
  page,
  browser,
  baseURL,
}) => {
  const email = emailFor('lost-keys');
  await signUp(page, email);
  // The kit is saved by the test and never used: as good as lost.
  await setUp(page);

  // A browser that has never opened this wallet: no device of theirs that unlocks.
  const context = await browser.newContext({ baseURL });
  const fresh = await context.newPage();
  await fresh.goto(resetLinkFor(email));
  await fresh.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
  await fresh.getByLabel('Confirm new password').fill(NEW_PASSWORD);
  await fresh.getByRole('button', { name: 'Set new password' }).click();
  await expect(fresh.getByText(/Your password is changed/)).toBeVisible({ timeout: 30_000 });

  // Signing in asks for the kit, and has a way on for someone without one.
  await signIn(fresh, email, NEW_PASSWORD, fresh.getByLabel('Recovery kit'));
  await fresh.getByRole('link', { name: 'I don’t have my recovery kit' }).click();
  await expect(fresh.getByRole('heading', { name: 'Your wallet is locked' })).toBeVisible({
    timeout: 30_000,
  });
  // The new password is the account's, and opens nothing.
  await fresh.getByLabel('Your password').fill(NEW_PASSWORD);
  await fresh.getByRole('button', { name: 'Unlock with my password' }).click();
  await expect(fresh.getByText(/does not open your wallet/)).toBeVisible({ timeout: 30_000 });

  const dialog = await openDeletionFromLockScreen(fresh);
  await dialog.getByLabel('Your password').fill(NEW_PASSWORD);
  await dialog.getByRole('button', { name: 'Delete everything' }).click();
  await expect(fresh.getByRole('heading', { name: LANDING })).toBeVisible({ timeout: 20_000 });

  expect(await databases(fresh)).toEqual([]);
  expect(await fresh.evaluate(() => window.localStorage.getItem('wallet.me'))).toBeNull();
  await expectNoAccount(fresh, email, NEW_PASSWORD);
  await context.close();
});

test('the lock screen offers deletion only beside the password, deletes nothing for a wrong one, and erases the device for the right one', async ({
  page,
  context,
}) => {
  const email = emailFor('delete-locked');
  await signUp(page, email);
  await setUp(page);
  await page.getByRole('button', { name: 'See my cards' }).click();
  await addCardByTyping(page, 'Locked away', 'LOCKED-1');
  const other = await context.newPage();
  await other.goto('/');
  await expect(other.getByRole('button', { name: 'Lock the wallet' })).toBeEnabled({
    timeout: 30_000,
  });

  await page.bringToFront();
  await page.getByRole('button', { name: 'Lock the wallet' }).click();
  await expect(page.getByLabel('Passcode')).toBeVisible();
  // With a passcode to unlock by, it is not in the way.
  await expect(page.getByRole('button', { name: 'I’ve lost my keys' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Use my password' }).click();

  const dialog = await openDeletionFromLockScreen(page);
  await expect(page.getByText(OTHERS_KEEP)).toBeVisible();
  await dialog.getByLabel('Your password').fill('not the password');
  await dialog.getByRole('button', { name: 'Delete everything' }).click();
  await expect(dialog.getByText('That password is not right.')).toBeVisible();
  expect(await databases(page)).toHaveLength(1);
  // A lock keeps the suite's key; deleting the account must not.
  expect(await keptKeys(page)).toBe(1);

  await dialog.getByLabel('Your password').fill(PASSWORD);
  await dialog.getByRole('button', { name: 'Delete everything' }).click();
  await expect(page.getByRole('heading', { name: LANDING })).toBeVisible({ timeout: 20_000 });

  expect(await databases(page)).toEqual([]);
  expect(await page.evaluate(() => window.localStorage.getItem('wallet.me'))).toBeNull();
  expect(await keptKeys(page)).toBe(0);
  await expect(other.getByRole('button', { name: 'User menu' })).toHaveCount(0, {
    timeout: 20_000,
  });
  await expectNoAccount(page, email, PASSWORD);
});

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
  await expect(page.getByText(OTHERS_KEEP)).toBeVisible();
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
  await expectNoAccount(page, email, PASSWORD);
});
