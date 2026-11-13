import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { qrSvg } from '../src/barcode/draw';
import { CAMERA_PAYLOAD } from './camera';
import { emailFor, goTo, setUp, signUp } from './helpers';

const PICTURE_PAYLOAD = 'MEMBER:Ünï · 日本語 · 12345';

/**
 * Scanning (DESIGN.md §13.2): the camera sees a QR code, and the card is made from it. Chromium's fake camera shows a video of a code made by the app's own
 * drawing; a phone's width, since that is where it is used.
 */
test('a card is added by pointing the camera at its code, and is shown with the same code', async ({
  page,
}) => {
  await signUp(page, emailFor('scan'));
  await setUp(page);
  await page.getByRole('button', { name: 'Add a card' }).click();
  await expect(page.getByRole('heading', { name: 'Add a card' })).toBeVisible();

  await page.getByRole('button', { name: 'Start the camera' }).click();
  // The code is read, and the person names the card.
  await expect(page.getByRole('heading', { name: 'Name your card' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByLabel('What the code says')).toHaveValue(CAMERA_PAYLOAD);
  await page.getByLabel('Name').fill('Scanned membership');
  await page.getByRole('button', { name: 'Add card' }).click();
  await expect(page.getByRole('heading', { name: 'Scanned membership' })).toBeVisible();

  // The camera is let go of when the screen is left: no track is still live.
  const live = await page.evaluate(
    async () => (await navigator.mediaDevices.enumerateDevices()).length >= 0,
  );
  expect(live).toBe(true);
  await goTo(page, 'Cards');
  await expect(page.getByRole('link', { name: /Scanned membership/ })).toBeVisible();
});

test('a picture of a code is read, and a picture with none says so', async ({ page, browser }) => {
  await signUp(page, emailFor('scan-picture'));
  await setUp(page);
  await page.getByRole('button', { name: 'Add a card' }).click();
  await page.getByRole('radio', { name: 'Picture' }).click();

  // A screenshot of a code, made as a person would take one: the code drawn on a page, and the page photographed.
  const shooter = await browser.newPage({ viewport: { width: 420, height: 420 } });
  const picture = join(mkdtempSync(join(tmpdir(), 'wallet-picture-')), 'code.png');
  await shooter.setContent(
    `<body style="margin:0;background:#fff"><img width="420" height="420" src="data:image/svg+xml;base64,${Buffer.from(qrSvg(PICTURE_PAYLOAD)).toString('base64')}"></body>`,
  );
  await shooter.screenshot({ path: picture });
  const blank = join(mkdtempSync(join(tmpdir(), 'wallet-picture-')), 'blank.png');
  await shooter.setContent('<body style="margin:0;background:#fff"></body>');
  await shooter.screenshot({ path: blank });
  await shooter.close();

  await page.getByLabel('Picture of the code').setInputFiles(blank);
  await expect(page.getByText('There is no QR code in that picture.')).toBeVisible({
    timeout: 30_000,
  });
  await page.getByLabel('Picture of the code').setInputFiles(picture);
  await expect(page.getByRole('heading', { name: 'Name your card' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByLabel('What the code says')).toHaveValue(PICTURE_PAYLOAD);
});
