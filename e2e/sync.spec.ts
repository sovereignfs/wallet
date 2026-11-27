import { expect, test } from '@playwright/test';
import { addCardByTyping, emailFor, goTo, setUp, signUp } from './helpers';

/** When an open wallet talks to its server (DESIGN.md §11.3): when there is something to do, and not by the clock. */
test.setTimeout(120_000);

test('an open wallet asks nothing while there is nothing to do, and once when it is returned to', async ({
  page,
}) => {
  await signUp(page, emailFor('quiet'));
  await setUp(page);
  await page.getByRole('button', { name: 'See my cards' }).click();
  await page.getByRole('button', { name: 'Add a card' }).first().click();
  await addCardByTyping(page, 'Quiet', 'QUIET-1');
  await goTo(page, 'Cards');
  await expect(page.getByRole('link', { name: /Quiet/ })).toBeVisible();
  // The card's own sync is let finish.
  await page.waitForTimeout(4_000);
  let asked = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/sync') asked++;
  });
  // Longer than the thirty seconds it used to ask by.
  await page.waitForTimeout(35_000);
  expect(asked).toBe(0);
  // Coming back to a tab says it twice.
  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
  await page.waitForTimeout(4_000);
  expect(asked).toBe(1);
});
