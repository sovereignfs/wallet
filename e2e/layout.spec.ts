import { type Page, expect, test } from '@playwright/test';
import { PASSWORD, addCardByTyping, emailFor, goTo, setUp, signUp } from './helpers';

/**
 * The frame fits the window (DESIGN.md §26.2): what is taller than the window scrolls under the person's own wheel or finger, and the navigation runs to the
 * bottom of the window however little a page holds.
 */
test.setTimeout(120_000);

/** Scrolls as a person does, with the wheel over the middle of the page, and not by script, which would move even what a person cannot. */
async function wheelDown(page: Page) {
  const size = page.viewportSize();
  await page.mouse.move((size?.width ?? 800) / 2, (size?.height ?? 600) / 2);
  await page.mouse.wheel(0, 5_000);
}

test('a form taller than the window scrolls to its last button, and so does a card', async ({
  page,
}) => {
  await signUp(page, emailFor('tall'));
  await setUp(page);
  await page.getByRole('button', { name: 'Add a card' }).click();
  const width = page.viewportSize()?.width ?? 1280;
  await page.setViewportSize({ width, height: 480 });
  await page.getByRole('radio', { name: 'Type' }).click();
  await page.getByLabel('What the code says').fill('TALL-1');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Name').fill('Tall card');
  const save = page.getByRole('button', { name: 'Add card' });
  await expect(save).not.toBeInViewport();
  await wheelDown(page);
  await expect(save).toBeInViewport();
  await save.click();
  await expect(page.getByRole('heading', { name: 'Tall card' })).toBeVisible();
  const last = page.getByRole('main').getByRole('button').last();
  await expect(last).not.toBeInViewport();
  await wheelDown(page);
  await expect(last).toBeInViewport();
});

test('the navigation reaches the bottom of the window on a page with little on it', async ({
  page,
}) => {
  await signUp(page, emailFor('short'));
  await setUp(page);
  await page.getByRole('button', { name: 'Add a card' }).click();
  await addCardByTyping(page, 'Short', 'SHORT-1');
  await goTo(page, 'Cards');
  await expect(page.getByRole('link', { name: /Short/ })).toBeVisible();
  const box = await page.getByRole('navigation', { name: 'Wallet' }).boundingBox();
  // A rail beside the page, or a bar under it: either way its far edge is the window's.
  expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBe(page.viewportSize()?.height);
});

test('Wallet opens on the cards, and there is no home screen', async ({ page }) => {
  await signUp(page, emailFor('opens'));
  await setUp(page);
  await page.getByRole('button', { name: 'See my cards' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Cards', level: 1 })).toBeVisible();
  const links = page.getByRole('navigation', { name: 'Wallet' }).getByRole('link');
  await expect(links).toHaveText(['Cards', 'Settings']);
  await expect(links.first()).toHaveAttribute('aria-current', 'page');
});

test('a device with no quick way to unlock is told so where Wallet opens', async ({ page }) => {
  await signUp(page, emailFor('notice'));
  await setUp(page);
  await page.getByRole('button', { name: 'See my cards' }).click();
  const notice = page.getByText('Unlock faster on this device');
  await expect(page.getByRole('heading', { name: 'Cards', level: 1 })).toBeVisible();
  await expect(notice).toBeHidden();
  await goTo(page, 'Settings');
  await page.getByRole('button', { name: 'Change how this device unlocks' }).click();
  await page.getByLabel('Your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('button', { name: 'Not now' }).click();
  await goTo(page, 'Cards');
  await expect(notice).toBeVisible();
});

test('the front page, taller than the window, scrolls to its end', async ({ page }) => {
  await page.setViewportSize({ width: page.viewportSize()?.width ?? 1280, height: 320 });
  await page.goto('/');
  const last = page.getByRole('heading', { level: 2 }).last();
  await expect(last).not.toBeInViewport();
  await wheelDown(page);
  await expect(last).toBeInViewport();
});
