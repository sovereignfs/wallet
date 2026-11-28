import { type Download, type Page, expect } from '@playwright/test';

/**
 * What the browser tests share. The instance takes any sign-up, so every test makes an account of its own and nothing one test does is seen by another.
 */
export const PASSWORD = 'correct horse battery';
export const PASSCODE = 'unlock me please';

let counter = 0;
export const emailFor = (label: string) =>
  `${label}-${Date.now().toString(36)}-${++counter}@example.com`;

/** Signs up, and lands on the recovery kit, which an instance that runs alone shows once, before anything else (RFC 0001). */
export async function signUp(
  page: Page,
  email: string,
  name = 'Ada Lovelace',
  arrived: ReturnType<Page['getByRole']> = page.getByRole('heading', {
    name: 'Save your recovery kit',
  }),
) {
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm password').fill(PASSWORD);
  await submitUntilThrough(page, 'Create account', arrived);
}

/**
 * Signing up and in are limited per address (a few in ten seconds), and every test reaches this instance from the same one, so an attempt may be told to
 * wait: it then does, once the window has passed, as a person would.
 */
async function submitUntilThrough(
  page: Page,
  button: string,
  arrived: ReturnType<Page['getByRole']>,
) {
  const submit = page.getByRole('button', { name: button, exact: true });
  await submit.click();
  const limited = page.getByText(/Too many (tries|attempts)/);
  await expect(limited.or(arrived)).toBeVisible({ timeout: 20_000 });
  if (await limited.isVisible()) {
    await page.waitForTimeout(10_500);
    await submit.click();
    await expect(arrived).toBeVisible({ timeout: 20_000 });
  }
}

export interface Keys {
  /** The recovery kit's text, as saved from the kit screen. */
  readonly kit: string;
}

/** The kit as the file the screen saves holds it: groups of four, joined by dashes. */
const KIT = /[0-9A-Z]{4}(?:-[0-9A-Z]{4}){3,}/;

/**
 * The recovery kit, as a person keeps it: saved as a file, and said to be kept. Returns what the file holds, which a test keeps to open the wallet again after a
 * reset.
 */
export async function keepKit(page: Page): Promise<string> {
  await expect(page.getByRole('heading', { name: 'Save your recovery kit' })).toBeVisible();
  const [saved] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save as a file' }).click(),
  ]);
  const kit = (await text(saved)).match(KIT)?.[0];
  expect(kit, 'the kit file holds the kit').toBeTruthy();
  await page.getByRole('checkbox', { name: /kept my recovery kit/ }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  return kit ?? '';
}

/**
 * Setup, as a person does it: the recovery kit kept, then how this device unlocks (a passcode, or a passkey): the suite's key has already opened the wallet, and
 * what is asked is only how the device opens it with no connection. Returns the kit, and leaves the wallet unlocked on the "ready" screen.
 */
export async function setUp(
  page: Page,
  options: { passcode?: string | null; passkey?: boolean; kit?: boolean } = {},
): Promise<Keys> {
  const { passkey = false } = options;
  const passcode = options.passcode === undefined ? (passkey ? null : PASSCODE) : options.passcode;
  const kit = options.kit === false ? '' : await keepKit(page);
  await finishSetup(page, { passcode, passkey });
  return { kit };
}

/** The steps of setup that every device meets: welcome, then a way to unlock the device, then ready. */
export async function finishSetup(
  page: Page,
  { passcode, passkey }: { passcode: string | null; passkey: boolean },
) {
  await page.getByRole('button', { name: 'Get started' }).click();
  await expect(page.getByRole('heading', { name: 'Unlock this device' })).toBeVisible({
    timeout: 30_000,
  });
  if (passkey) {
    await page.getByRole('button', { name: 'Use a passkey' }).click();
    await expect(page.getByRole('list', { name: 'Ways this device unlocks' })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole('button', { name: 'Continue' }).click();
  } else if (passcode) {
    await page.getByLabel('Passcode', { exact: true }).fill(passcode);
    await page.getByLabel('Passcode again').fill(passcode);
    await page.getByRole('button', { name: 'Set passcode' }).click();
    await expect(page.getByRole('list', { name: 'Ways this device unlocks' })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole('button', { name: 'Continue' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Your wallet is ready' })).toBeVisible();
}

async function text(download: Download): Promise<string> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

/** Goes where the navigation goes, as a person does: with no page load, which would drop the keys from memory (whether the wallet then comes back is `reload.spec.ts`'s). */
export async function goTo(page: Page, name: 'Cards' | 'Settings') {
  await page.getByRole('navigation', { name: 'Wallet' }).getByRole('link', { name }).click();
}

/** Unlocks with the device passcode, as after a lock, or a reload with no network. */
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

/**
 * Signs in with the password. The page that follows is the wallet's: set up, on a device that has never opened it (`setUpNewDevice`), or locked. After a password
 * reset it is the sign-in page's own, asking for the recovery kit, and the caller says what it expects.
 */
export async function signIn(
  page: Page,
  email: string,
  password = PASSWORD,
  arrived: ReturnType<Page['getByRole']> = page.getByRole('button', { name: 'User menu' }),
) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await submitUntilThrough(page, 'Sign in', arrived);
}

/**
 * A device that has never opened the wallet, signed in with the password: the suite's key brings the wallet's root, and the device is set up the way the first one
 * was (a passcode), which is what lets it open with no connection afterwards.
 */
export async function setUpNewDevice(page: Page, passcode = PASSCODE) {
  await expect(page.getByRole('heading', { name: /^Welcome/ })).toBeVisible({ timeout: 30_000 });
  await finishSetup(page, { passcode, passkey: false });
}

/** What the page says when a person comes back to it, which the sync loop syncs on. */
export async function syncNow(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
}

/** Waits for a card to be on the cards screen, asking the loop to sync meanwhile, as coming back to the page would. */
export async function waitForCard(page: Page, name: RegExp | string, timeout = 60_000) {
  const link = page.getByRole('link', { name });
  await expect
    .poll(
      async () => {
        await syncNow(page);
        return link.count();
      },
      { timeout },
    )
    .toBeGreaterThan(0);
}
