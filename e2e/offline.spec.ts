import { expect, test } from '@playwright/test';
import {
  PASSCODE,
  addCardByTyping,
  dumpBrowser,
  emailFor,
  goTo,
  setUp,
  signUp,
  unlockWithPasscode,
} from './helpers';

/**
 * Offline (DESIGN.md §10, §11.7, §26.6): the wallet opens with no connection. A reload finds the service worker's shell, which asks for the passcode (with a
 * connection a reload would have kept the wallet open, `reload.spec.ts`; without one it cannot), and then the cards come from the device's own copy. **The worker keeps the shell and the build's files, and nothing of a person.**
 */
test('a reload with no network opens the shell, unlocks, and shows the card', async ({
  page,
  context,
}) => {
  await signUp(page, emailFor('offline'));
  await setUp(page);
  await page.getByRole('button', { name: 'Go to Home' }).click();
  await addCardByTyping(page, 'Basement shop', 'BASEMENT-0001');
  // Reload online once, so that the page is controlled by the worker that was installed.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await expect(page.getByRole('button', { name: 'Lock the wallet' })).toBeEnabled({
    timeout: 30_000,
  });
  await goTo(page, 'Cards');
  await expect(page.getByRole('link', { name: /Basement shop/ })).toBeVisible();
  // Let it send, so that the server has it, and then take the network away.
  await page.waitForTimeout(2500);

  await context.setOffline(true);
  await page.reload();
  await unlockWithPasscode(page);
  await expect(page.getByRole('link', { name: /Basement shop/ })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('link', { name: /Basement shop/ }).click();
  await page.getByRole('link', { name: 'Show' }).click();
  await expect(page.getByRole('img', { name: 'The code of Basement shop' })).toBeVisible();
  await context.setOffline(false);

  // What the worker kept: the shell, the build's own files and the icons; no page of a person, no answer from the API.
  const kept = await page.evaluate(async () => {
    const out: string[] = [];
    for (const name of await caches.keys())
      for (const request of await (await caches.open(name)).keys())
        out.push(new URL(request.url).pathname);
    return out;
  });
  expect(kept.length).toBeGreaterThan(1);
  for (const path of kept)
    expect(path, path).toMatch(
      /^(\/shell|\/_next\/static\/.*|\/icon\.svg|\/favicon\.ico|\/manifest\.webmanifest|\/icons\/[a-z0-9._-]+)$/,
    );
  const dump = await dumpBrowser(page);
  for (const secret of ['Basement shop', 'BASEMENT-0001', PASSCODE])
    expect(dump, secret).not.toContain(secret);
});
