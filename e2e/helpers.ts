import { type Download, type Page, expect } from '@playwright/test';

/**
 * What the browser tests share. The instance takes any sign-up, so every test makes an account of its own and nothing one test does is seen by another.
 */
export const PASSWORD = 'correct horse battery';
export const PASSCODE = 'unlock me please';

let counter = 0;
export const emailFor = (label: string) =>
  `${label}-${Date.now().toString(36)}-${++counter}@example.com`;

/** Signs up, and lands on setup. */
export async function signUp(page: Page, email: string, name = 'Ada Lovelace') {
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('button', { name: 'Get started' })).toBeVisible({ timeout: 20_000 });
}

export interface Keys {
  /** The wallet key's text, as shown once. */
  readonly identity: string;
  /** The key file, as downloaded. */
  readonly file: string;
}

/**
 * Setup, as a person does it: a new key, saved and confirmed, no recovery key (said so), and a passcode. Returns the key, which the test keeps to unlock
 * with the key, and leaves the wallet unlocked on the "ready" screen.
 */
export async function setUp(
  page: Page,
  options: { passcode?: string | null; recovery?: 'skip' | 'make' } = {},
): Promise<Keys & { recovery?: string }> {
  const { passcode = PASSCODE, recovery = 'skip' } = options;
  await page.getByRole('button', { name: 'Get started' }).click();
  await expect(page.getByRole('heading', { name: 'Your wallet key' })).toBeVisible();

  const key = page.getByLabel('Your wallet key');
  await expect(key).toBeVisible();
  const identity = ((await key.textContent()) ?? '').trim();
  expect(identity).toMatch(/^AGE-SECRET-KEY-1[A-Z0-9]+$/);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download the key file' }).click(),
  ]);
  const file = await text(download);
  expect(file).toContain(identity);
  await page.getByLabel(/last six characters/).fill(identity.slice(-6).toLowerCase());
  await page.getByRole('button', { name: 'I have saved my key' }).click();

  await expect(page.getByRole('heading', { name: 'Your recovery key' })).toBeVisible();
  let recoveryKey: string | undefined;
  if (recovery === 'skip') {
    await page.getByRole('checkbox', { name: /nobody can recover my wallet/ }).check();
    await page.getByRole('button', { name: 'Continue without a recovery key' }).click();
  } else {
    const sheet = page.getByRole('article', { name: 'Recovery sheet' });
    await expect(sheet).toBeVisible();
    const [saved] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download it instead' }).click(),
    ]);
    recoveryKey = (await text(saved)).match(/AGE-SECRET-KEY-1[A-Z0-9]+/)?.[0];
    expect(recoveryKey).toBeTruthy();
    await page.getByLabel(/last six characters/).fill((recoveryKey ?? '').slice(-6));
    await page.getByRole('button', { name: 'I have kept my recovery key' }).click();
  }

  await expect(page.getByRole('heading', { name: 'Unlock this device' })).toBeVisible({
    timeout: 30_000,
  });
  if (passcode) {
    await page.getByLabel('Passcode', { exact: true }).fill(passcode);
    await page.getByLabel('Passcode again').fill(passcode);
    await page.getByRole('button', { name: 'Set passcode' }).click();
    await expect(page.getByRole('list', { name: 'Ways this device unlocks' })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole('button', { name: 'Continue' }).click();
  } else {
    await page.getByRole('button', { name: 'Not now' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Your wallet is ready' })).toBeVisible();
  return { identity, file, ...(recoveryKey ? { recovery: recoveryKey } : {}) };
}

async function text(download: Download): Promise<string> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

/** Goes where the navigation goes, as a person does: a page load would lock the wallet, since its keys are in memory only. */
export async function goTo(page: Page, name: 'Home' | 'Cards' | 'Settings') {
  await page.getByRole('navigation', { name: 'Wallet' }).getByRole('link', { name }).click();
}

/** Unlocks with the device passcode, as after a reload. */
export async function unlockWithPasscode(page: Page, passcode = PASSCODE) {
  await expect(page.getByRole('heading', { name: 'Your wallet is locked' })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByLabel('Passcode').fill(passcode);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your wallet is locked' })).toHaveCount(0, {
    timeout: 30_000,
  });
}

/** From anywhere in the signed-in area to the form that adds a card by typing, and through it. Names the card and saves it. */
export async function addCardByTyping(page: Page, title: string, payload: string) {
  if (!/\/cards\/new$/.test(page.url())) {
    await goTo(page, 'Cards');
    await page.getByRole('link', { name: 'Add a card' }).first().click();
  }
  await page.getByRole('radio', { name: 'Type' }).click();
  await page.getByLabel('What the code says').fill(payload);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Name').fill(title);
  await page.getByRole('button', { name: 'Add card' }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
}

/** Everything the browser keeps of a site, as text: IndexedDB (every store), Cache Storage, local and session storage. */
export async function dumpBrowser(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const parts: string[] = [];
    const toText = (value: unknown): string =>
      JSON.stringify(value, (_key, v) => {
        if (v instanceof ArrayBuffer)
          return Array.from(new Uint8Array(v))
            .map((b) => String.fromCharCode(b))
            .join('');
        if (ArrayBuffer.isView(v))
          return Array.from(new Uint8Array(v.buffer, v.byteOffset, v.byteLength))
            .map((b) => String.fromCharCode(b))
            .join('');
        if (typeof CryptoKey !== 'undefined' && v instanceof CryptoKey) return '[CryptoKey]';
        return v;
      });
    for (const info of (await indexedDB.databases?.()) ?? []) {
      if (!info.name) continue;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(info.name as string);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      for (const name of Array.from(db.objectStoreNames)) {
        const rows = await new Promise<unknown[]>((resolve, reject) => {
          const request = db.transaction(name).objectStore(name).getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        parts.push(`${info.name}/${name}: ${toText(rows)}`);
      }
      db.close();
    }
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        parts.push(`cache ${name} ${request.url}: ${await (await cache.match(request))?.text()}`);
      }
    }
    parts.push(`local: ${JSON.stringify({ ...localStorage })}`);
    parts.push(`session: ${JSON.stringify({ ...sessionStorage })}`);
    return parts.join('\n');
  });
}
