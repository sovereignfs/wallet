import { expect, test } from '@playwright/test';
import { PASSCODE, addCardByTyping, dumpBrowser, emailFor, goTo, setUp, signUp } from './helpers';

/**
 * The journey of a person, in a real browser: sign up, set up the wallet (a key, a passcode), add a card, show it, lock, unlock, and use it with no
 * connection. **And a raw dump of everything the browser keeps, which holds none of what was typed.**
 */
const TITLE = 'Planted Gym Name';
const PAYLOAD = 'PLANTED-PAYLOAD-8675309';

test('sets up a wallet, keeps a card, shows it, locks and unlocks', async ({ page }) => {
  await signUp(page, emailFor('journey'));
  const keys = await setUp(page);

  await page.getByRole('button', { name: 'Add a card' }).click();
  await expect(page).toHaveURL(/\/cards\/new/);
  await addCardByTyping(page, TITLE, PAYLOAD);

  // It is on the cards screen, and its code is drawn.
  await goTo(page, 'Cards');
  await expect(page.getByRole('link', { name: new RegExp(TITLE) })).toBeVisible();
  await page.getByRole('link', { name: new RegExp(TITLE) }).click();
  await expect(page.getByRole('img', { name: `The code of ${TITLE}` })).toBeVisible();

  // Shown full screen, on white, with the code.
  await page.getByRole('link', { name: 'Show' }).click();
  await expect(page).toHaveURL(/\/show$/);
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible();
  await expect(page.getByText('Turn your brightness up if it doesn’t scan.')).toBeVisible();
  const svg = page.getByRole('img', { name: `The code of ${TITLE}` });
  await expect(svg).toBeVisible();
  const box = await svg.boundingBox();
  expect(box?.width).toBeGreaterThan(150);
  await page.getByRole('button', { name: 'Done' }).click();

  // The server has it, and cannot read it: the sync sends it.
  await expect
    .poll(
      async () =>
        (
          await page.request.post('/api/sync', {
            headers: { origin: new URL(page.url()).origin },
            data: { v: 1, deviceId: crypto.randomUUID(), cursor: 0, mutations: [] },
          })
        )
          .json()
          .then((b: { rows: unknown[] }) => b.rows.length),
      { timeout: 20_000 },
    )
    .toBe(1);
  const raw = await (
    await page.request.post('/api/sync', {
      headers: { origin: new URL(page.url()).origin },
      data: { v: 1, deviceId: crypto.randomUUID(), cursor: 0, mutations: [] },
    })
  ).text();
  expect(raw).not.toContain(TITLE);
  expect(raw).not.toContain(PAYLOAD);
  expect(Buffer.from(raw).toString('base64')).not.toContain(
    Buffer.from(PAYLOAD).toString('base64').slice(0, 20),
  );

  // The raw dump of the browser: unlocked, and still nothing readable.
  const dump = await dumpBrowser(page);
  for (const secret of [TITLE, PAYLOAD, keys.identity, PASSCODE])
    expect(dump, secret).not.toContain(secret);

  // Locked: nothing of the wallet is on the page, and the card is not reachable until it is unlocked.
  await page.getByRole('button', { name: 'Lock the wallet' }).click();
  await expect(page.getByRole('heading', { name: 'Your wallet is locked' })).toBeVisible();
  await expect(page.getByText(TITLE)).toHaveCount(0);

  // A wrong passcode is refused, the right one unlocks.
  await page.getByLabel('Passcode').fill('not the passcode');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.getByText('That passcode is not right.')).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Passcode').fill(PASSCODE);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your wallet is locked' })).toHaveCount(0, {
    timeout: 30_000,
  });
  await goTo(page, 'Cards');
  await expect(page.getByRole('link', { name: new RegExp(TITLE) })).toBeVisible();

  // And with the key, on a device that has been wiped of its unlock methods: locked, then the key.
  await page.getByRole('button', { name: 'Lock the wallet' }).click();
  await page.getByRole('button', { name: 'Use my wallet key or recovery key' }).click();
  await page.getByLabel('Wallet key or recovery key').fill(keys.file);
  await page.getByRole('button', { name: 'Unlock with key' }).click();
  await expect(page.getByRole('heading', { name: 'Your wallet is locked' })).toHaveCount(0, {
    timeout: 20_000,
  });
});
