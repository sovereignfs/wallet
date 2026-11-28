import { type Page, expect, test } from '@playwright/test';
import { addCardByTyping, emailFor, setUp, signIn, signUp, waitForCard } from './helpers';

/**
 * Signing out (DESIGN.md §11.8): the device forgets who was signed in and erases its copy of the wallet. With changes the server has not taken, the person
 * says first whether to keep the copy for them or erase it. Other tabs leave too.
 */
test.setTimeout(120_000);
// A sync is held back by the test, and a request that passes through a service worker is not the test's to hold back in every browser.
test.use({ serviceWorkers: 'block' });

/** An account with a passcode on this device, on the cards screen. */
async function aWallet(page: Page, label: string): Promise<string> {
  const email = emailFor(label);
  await signUp(page, email);
  await setUp(page);
  await page.getByRole('button', { name: 'See my cards' }).click();
  return email;
}

const stores = (page: Page) =>
  page.evaluate(async () =>
    (await indexedDB.databases())
      .map((db) => db.name)
      .filter((name) => name?.startsWith('wallet-')),
  );
const identity = (page: Page) => page.evaluate(() => window.localStorage.getItem('wallet.me'));

/** How many changes wait in this device's store. */
const waiting = (page: Page) =>
  page.evaluate(async () => {
    const name = (await indexedDB.databases()).find((db) => db.name?.startsWith('wallet-'))?.name;
    if (!name) return -1;
    return new Promise<number>((resolve, reject) => {
      const open = indexedDB.open(name);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const count = open.result.transaction('outbox').objectStore('outbox').count();
        count.onsuccess = () => {
          open.result.close();
          resolve(count.result);
        };
        count.onerror = () => reject(count.error);
      };
    });
  });

async function chooseSignOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'User menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
}
const signedOut = (page: Page) =>
  expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible({ timeout: 20_000 });

/** The page the app starts from with no server, which opens a wallet for whoever the device remembers. */
async function opensNothing(page: Page): Promise<void> {
  await page.goto('/shell');
  await expect(page.getByText('Sign in to use Wallet.')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'Your wallet is locked' })).toHaveCount(0);
}

test('signing out erases the device’s copy of the wallet and forgets who was signed in', async ({
  page,
}) => {
  await aWallet(page, 'out');
  await addCardByTyping(page, 'Soon off this device', 'OUT-1');
  await expect.poll(() => waiting(page), { timeout: 20_000 }).toBe(0);

  await chooseSignOut(page);
  await signedOut(page);

  expect(await stores(page)).toEqual([]);
  expect(await identity(page)).toBeNull();
  await opensNothing(page);
});

test('with a change the server has not taken, signing out asks, and a kept copy sends it after signing in again', async ({
  page,
}) => {
  const email = await aWallet(page, 'out-keep');
  await page.route('**/api/sync', (route) => route.abort());
  await addCardByTyping(page, 'Not yet sent', 'WAIT-1');

  const dialog = page.getByRole('dialog');
  await chooseSignOut(page);
  await expect(dialog.getByText(/not reached the server/)).toBeVisible({ timeout: 20_000 });
  // Nothing has happened yet: the person may stay.
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Lock the wallet' })).toBeEnabled();

  await chooseSignOut(page);
  await dialog.getByRole('button', { name: 'Sign out and keep this device’s data' }).click();
  await signedOut(page);
  expect(await stores(page)).toHaveLength(1);
  expect(await identity(page)).toBeNull();
  await opensNothing(page);

  await page.unroute('**/api/sync');
  await signIn(page, email);
  await waitForCard(page, /Not yet sent/);
  await expect.poll(() => waiting(page), { timeout: 30_000 }).toBe(0);
});

test('with a change not sent, erasing takes the copy and the change with it', async ({ page }) => {
  await aWallet(page, 'out-erase');
  await page.route('**/api/sync', (route) => route.abort());
  await addCardByTyping(page, 'Given up', 'WAIT-2');

  await chooseSignOut(page);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Sign out and erase this device' })
    .click();
  await signedOut(page);

  expect(await stores(page)).toEqual([]);
  expect(await identity(page)).toBeNull();
});

test('another tab leaves too, though the copy is kept', async ({ page, context }) => {
  await aWallet(page, 'out-tabs');
  await context.route('**/api/sync', (route) => route.abort());
  await addCardByTyping(page, 'Kept for later', 'WAIT-3');
  const other = await context.newPage();
  await other.goto('/');
  await expect(other.getByRole('button', { name: 'Lock the wallet' })).toBeEnabled({
    timeout: 30_000,
  });

  await page.bringToFront();
  await chooseSignOut(page);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Sign out and keep this device’s data' })
    .click();
  await signedOut(page);

  // It is not left in a wallet it could lock and open again with the passcode.
  await expect(other.getByRole('button', { name: 'User menu' })).toHaveCount(0, {
    timeout: 20_000,
  });
});
