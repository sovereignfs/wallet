import { expect, test } from '@playwright/test';
import { addCardByTyping, emailFor, goTo, setUp, signUp } from './helpers';

/**
 * Unlocking with a passkey (DESIGN.md §9.3), against Chromium's virtual authenticator with the PRF extension: set up with it, lock, and unlock by it, with
 * the network gone. The passkey for unlocking is not the one for signing in.
 */
test('a passkey unlocks the wallet, with no network', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      ctap2Version: 'ctap2_1',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      hasPrf: true,
      automaticPresenceSimulation: true,
    },
  });
  await signUp(page, emailFor('passkey'));
  await setUp(page, { passkey: true });
  await page.getByRole('button', { name: 'Go to Home' }).click();
  await addCardByTyping(page, 'Passkey card', 'PK-1');

  await context.setOffline(true);
  await page.getByRole('button', { name: 'Lock the wallet' }).click();
  await expect(page.getByRole('heading', { name: 'Your wallet is locked' })).toBeVisible();
  await page.getByRole('button', { name: 'Unlock with passkey' }).click();
  await expect(page.getByRole('heading', { name: 'Your wallet is locked' })).toHaveCount(0, {
    timeout: 20_000,
  });
  await goTo(page, 'Cards');
  await expect(page.getByRole('link', { name: /Passkey card/ })).toBeVisible();
  await context.setOffline(false);

  // Back online, a reload keeps open what the passkey opened.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Lock the wallet' })).toBeEnabled({
    timeout: 30_000,
  });
  await expect(page.getByRole('link', { name: /Passkey card/ })).toBeVisible();
});
