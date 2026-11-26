import { expect, test } from '@playwright/test';
import {
  addCardByTyping,
  emailFor,
  goTo,
  setUp,
  signIn,
  signUp,
  syncNow,
  setUpNewDevice,
  waitForCard,
} from './helpers';

/**
 * Two devices (DESIGN.md §11): a card written on one appears on the other, opened with the account's keys; each works with no connection, and what was written
 * offline goes when the connection comes back; and an edit on each of the same card merges without losing either.
 */
test.setTimeout(180_000);

test('a card written on one device appears on another, and offline work is sent when the connection returns', async ({
  browser,
}) => {
  const email = emailFor('devices');
  const first = await browser.newContext();
  const a = await first.newPage();
  await signUp(a, email);
  await setUp(a);
  await a.getByRole('button', { name: 'Go to Home' }).click();
  await addCardByTyping(a, 'Library card', 'LIB-0001');

  // A second browser, with a store of its own: signed in with the password, which brings the wallet's root, and set up as a device of its own.
  const second = await browser.newContext();
  const b = await second.newPage();
  await signIn(b, email);
  await setUpNewDevice(b);
  await b.getByRole('button', { name: 'Go to Home' }).click();
  await goTo(b, 'Cards');
  await waitForCard(b, /Library card/);
  await b.getByRole('link', { name: /Library card/ }).click();
  await expect(b.getByRole('img', { name: 'The code of Library card' })).toBeVisible();

  // B goes offline and adds a card: it is there at once, on its own device, and is not on A.
  await second.setOffline(true);
  await addCardByTyping(b, 'Gym', 'GYM-4242');
  await goTo(b, 'Cards');
  await expect(b.getByRole('link', { name: /Gym/ })).toBeVisible();
  await syncNow(a);
  await goTo(a, 'Cards');
  await expect(a.getByRole('link', { name: /Gym/ })).toHaveCount(0);

  // The connection returns, and it goes to A.
  await second.setOffline(false);
  await syncNow(b);
  await expect
    .poll(
      async () => {
        await syncNow(a);
        return a.getByRole('link', { name: /Gym/ }).count();
      },
      { timeout: 40_000 },
    )
    .toBe(1);
  await a.getByRole('link', { name: /Gym/ }).click();
  await expect(a.getByRole('img', { name: 'The code of Gym' })).toBeVisible();

  await first.close();
  await second.close();
});

test('an edit on each device of one card is merged, field by field', async ({ browser }) => {
  const email = emailFor('merge');
  const first = await browser.newContext();
  const a = await first.newPage();
  await signUp(a, email);
  await setUp(a);
  await a.getByRole('button', { name: 'Go to Home' }).click();
  await addCardByTyping(a, 'Transit', 'TRN-77');
  await goTo(a, 'Cards');
  await a.getByRole('link', { name: /Transit/ }).click();

  const second = await browser.newContext();
  const b = await second.newPage();
  await signIn(b, email);
  await setUpNewDevice(b);
  await b.getByRole('button', { name: 'Go to Home' }).click();
  await goTo(b, 'Cards');
  await waitForCard(b, /Transit/);
  await b.getByRole('link', { name: /Transit/ }).click();
  await expect(b.getByRole('heading', { name: 'Transit' })).toBeVisible();

  // A makes it a favourite while B, with no connection, archives it.
  await second.setOffline(true);
  await b.getByRole('button', { name: 'Archive' }).click();
  await expect(b.getByText(/Archived/)).toBeVisible();
  await a.getByRole('button', { name: 'Make a favourite' }).click();
  await expect(a.getByText(/Favourite/).first()).toBeVisible();
  await expect
    .poll(
      async () => {
        const raw = await a.request.post('/api/sync', {
          headers: { origin: new URL(a.url()).origin },
          data: { v: 2, deviceId: crypto.randomUUID(), cursor: 0, mutations: [] },
        });
        return ((await raw.json()) as { rows: { version: number }[] }).rows[0]?.version;
      },
      { timeout: 30_000 },
    )
    .toBe(2);

  await second.setOffline(false);
  await syncNow(b);
  // Both are kept, on both devices.
  for (const page of [a, b]) {
    await expect
      .poll(
        async () => {
          await syncNow(page);
          const text = await page.getByRole('main').innerText();
          return /Favourite/.test(text) && /Archived/.test(text);
        },
        { timeout: 40_000 },
      )
      .toBe(true);
  }
  await first.close();
  await second.close();
});
