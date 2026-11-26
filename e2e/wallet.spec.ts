import { expect, test } from '@playwright/test';
import {
  PASSCODE,
  PASSWORD,
  addCardByTyping,
  dumpBrowser,
  emailFor,
  goTo,
  setUp,
  signUp,
} from './helpers';

/**
 * The journey of a person, in a real browser: sign up, keep the recovery kit, set up the wallet (a passcode), add a card, show it, lock, unlock, and use it with no
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
            data: { v: 2, deviceId: crypto.randomUUID(), cursor: 0, mutations: [] },
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
      data: { v: 2, deviceId: crypto.randomUUID(), cursor: 0, mutations: [] },
    })
  ).text();
  expect(raw).not.toContain(TITLE);
  expect(raw).not.toContain(PAYLOAD);
  // The suite's marker test (core-app §5.10.8): a marker is in no row, in plain text, base64 or hex.
  for (const marker of [TITLE, PAYLOAD]) {
    expect(Buffer.from(raw).toString('latin1')).not.toContain(marker);
    expect(Buffer.from(raw).toString('latin1')).not.toContain(
      Buffer.from(marker).toString('base64').slice(0, 20),
    );
    expect(Buffer.from(raw).toString('latin1')).not.toContain(Buffer.from(marker).toString('hex'));
  }

  // The raw dump of the browser: unlocked, and still nothing readable.
  const dump = await dumpBrowser(page);
  for (const secret of [TITLE, PAYLOAD, keys.kit, PASSCODE, PASSWORD])
    expect(dump, secret).not.toContain(secret);
  for (const marker of [TITLE, PAYLOAD]) {
    expect(dump).not.toContain(Buffer.from(marker).toString('base64').slice(0, 20));
    expect(dump).not.toContain(Buffer.from(marker).toString('hex'));
  }

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

  // And with the account's password, which opens the keys again: locked, then the password (it needs the server, and is checked on the device).
  await page.getByRole('button', { name: 'Lock the wallet' }).click();
  await page.getByRole('button', { name: 'Use my password' }).click();
  await page.getByLabel('Your password').fill('not the password');
  await page.getByRole('button', { name: 'Unlock with my password' }).click();
  await expect(page.getByText(/does not open your wallet/)).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Unlock with my password' }).click();
  await expect(page.getByRole('heading', { name: 'Your wallet is locked' })).toHaveCount(0, {
    timeout: 30_000,
  });
});
