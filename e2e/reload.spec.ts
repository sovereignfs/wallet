import { type Page, expect, test } from '@playwright/test';
import { addCardByTyping, emailFor, goTo, setUp, signUp, unlockWithPasscode } from './helpers';

/**
 * Reloading (DESIGN.md §9.2): a reload keeps the wallet open, with a connection and within the lock times, with no lock screen in between, however the wallet was
 * opened. The Lock button, a lock time that ran out while the page was away, "as soon as it is hidden" and a new tab all ask again, and stay asking. (No network
 * asks too: `offline.spec.ts`.) Signing out lets the account's key go.
 */
test.setTimeout(120_000);

const locked = (page: Page) => page.getByRole('heading', { name: 'Your wallet is locked' });
const lockButton = (page: Page) => page.getByRole('button', { name: 'Lock the wallet' });

async function aWallet(page: Page, label: string) {
  await signUp(page, emailFor(label));
  await setUp(page);
  await page.getByRole('button', { name: 'See my cards' }).click();
  await addCardByTyping(page, 'Corner shop', 'CORNER-1');
}

/** The lock screen is there, and is still there once everything that happens on a load has happened. */
async function staysLocked(page: Page) {
  await expect(locked(page)).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2_000);
  await expect(locked(page)).toBeVisible();
  await expect(page.getByText('Corner shop')).toHaveCount(0);
}

/** Whether the browser still keeps the account's key for the session (the SDK's store, record `account`). */
const keepsKey = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<boolean>((resolve, reject) => {
        const request = indexedDB.open('sovereign-local-vault');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const store = db.objectStoreNames[0] as string;
          const keys = db.transaction(store).objectStore(store).getAllKeys();
          keys.onsuccess = () => {
            db.close();
            resolve(keys.result.includes('account'));
          };
          keys.onerror = () => reject(keys.error);
        };
      }),
  );

test('a reload keeps the wallet open, with no lock screen in between', async ({ page }) => {
  await aWallet(page, 'reload');
  // Notes whether the lock screen's heading is ever drawn, however briefly, after a reload. (The sign-out dialog, always in the page, speaks of a locked wallet.)
  await page.addInitScript(() => {
    new MutationObserver(() => {
      const headings = [...document.querySelectorAll('h1')];
      if (headings.some((h) => h.textContent === 'Your wallet is locked'))
        sessionStorage.setItem('test.sawLock', '1');
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  for (let i = 0; i < 2; i++) {
    await page.reload();
    await expect(lockButton(page)).toBeEnabled({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Corner shop' })).toBeVisible({
      timeout: 20_000,
    });
  }
  expect(await page.evaluate(() => sessionStorage.getItem('test.sawLock'))).toBeNull();
});

test('after a lock, unlocking with the code, a reload keeps the wallet open', async ({ page }) => {
  await aWallet(page, 'reload-code');
  // Twice round: a lock must leave what a later reload needs, every time.
  for (let i = 0; i < 2; i++) {
    await lockButton(page).click();
    await unlockWithPasscode(page);
    await page.reload();
    await expect(lockButton(page)).toBeEnabled({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Corner shop' })).toBeVisible({
      timeout: 20_000,
    });
  }
});

test('after the Lock button, a reload stays locked', async ({ page }) => {
  await aWallet(page, 'reload-locked');
  await lockButton(page).click();
  await expect(locked(page)).toBeVisible();
  await page.reload();
  await staysLocked(page);
  // Using the lock screen is not using the wallet: it earns nothing.
  await page.getByLabel('Passcode').click();
  await page.getByLabel('Passcode').fill('half typed');
  await page.reload();
  await staysLocked(page);
});

test('a lock time that ran out while the page was away locks it', async ({ page }) => {
  await aWallet(page, 'reload-late');
  // Away from the wallet, on an address of this instance, so that the tab's own record can be made two minutes old: past the hidden minute.
  await page.goto('/api/health');
  await page.evaluate(() => {
    for (const key of Object.keys(sessionStorage).filter((k) => k.startsWith('wallet.open.')))
      sessionStorage.setItem(
        key,
        JSON.stringify({ used: Date.now() - 120_000, left: Date.now() - 120_000 }),
      );
  });
  await page.goto('/');
  await staysLocked(page);
  await page.getByLabel('Passcode').click();
  await page.reload();
  await staysLocked(page);
  // And from the code on, a reload keeps it open again.
  await unlockWithPasscode(page);
  await page.reload();
  await expect(lockButton(page)).toBeEnabled({ timeout: 30_000 });
});

test('with “as soon as it is hidden”, a reload locks', async ({ page }) => {
  await aWallet(page, 'reload-now');
  await goTo(page, 'Settings');
  await page.getByLabel('Lock when Wallet is hidden').selectOption('now');
  await page.waitForTimeout(500);
  await page.reload();
  await staysLocked(page);
});

test('a new tab asks again, and once opened keeps open across its own reloads', async ({
  page,
  context,
}) => {
  await aWallet(page, 'reload-closed');
  await page.close();
  const next = await context.newPage();
  await next.goto('/');
  await staysLocked(next);
  await unlockWithPasscode(next);
  await next.reload();
  await expect(lockButton(next)).toBeEnabled({ timeout: 30_000 });
});

test('signing out lets the account’s key go', async ({ page }) => {
  await aWallet(page, 'reload-out');
  expect(await keepsKey(page)).toBe(true);
  await page.getByRole('button', { name: 'User menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  expect(await keepsKey(page)).toBe(false);
});
