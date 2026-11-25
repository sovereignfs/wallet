import { expect, test } from '@playwright/test';

/** The front page, as a visitor sees it, at every width and in every browser; and the policy the browser enforces on it. */
test('the landing page says what Wallet is, and loads nothing from anywhere else', async ({
  page,
  baseURL,
}) => {
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));
  const response = await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Only you can read your wallet' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  // The browser talks only to its own server (AGENTS.md).
  const origin = new URL(baseURL ?? '').origin;
  expect(
    requested.filter(
      (url) => !url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:'),
    ),
  ).toEqual([]);

  const csp = response?.headers()['content-security-policy'] ?? '';
  expect(csp).toContain("default-src 'self'");
  expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic' 'wasm-unsafe-eval'/);
  expect(csp).toContain("connect-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
  expect(response?.headers()['x-content-type-options']).toBe('nosniff');
  expect(response?.headers()['referrer-policy']).toBe('no-referrer');
  expect(response?.headers()['permissions-policy']).toContain('camera=(self)');
});

test('markup that carries a script does not run it, and neither does an inline handler', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(
    () =>
      new Promise<{ ran: boolean; reported: number }>((resolve) => {
        let reported = 0;
        window.addEventListener('securitypolicyviolation', () => reported++);
        (window as unknown as { ranInline: boolean }).ranInline = false;
        // What an attacker who could put markup on the page would put there: a script the parser meets, and a handler on an element. (A script that
        // trusted code inserts is another matter: `'strict-dynamic'` lets what a nonced script loads run, which is how the app's own bundles load.)
        const frame = document.createElement('div');
        frame.innerHTML =
          '<img src="x" onerror="window.ranInline = true"><button id="b" onclick="window.ranInline = true">b</button>';
        document.body.appendChild(frame);
        (document.getElementById('b') as HTMLButtonElement).click();
        setTimeout(
          () => resolve({ ran: (window as unknown as { ranInline: boolean }).ranInline, reported }),
          400,
        );
      }),
  );
  expect(result.ran).toBe(false);
  expect(result.reported).toBeGreaterThan(0);
});

test('the manifest and icons are Wallet’s own, served here', async ({ request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ name: 'Wallet', display: 'standalone', start_url: '/' });
  for (const icon of manifest.icons as { src: string }[]) {
    const response = await request.get(icon.src);
    expect(response.status(), icon.src).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');
  }
  const health = await (await request.get('/api/health')).json();
  expect(health.status).toBe('ok');
});

test('an address of the signed-in area sends a visitor to sign in, and the API says no', async ({
  page,
  request,
}) => {
  await page.goto('/cards');
  await expect(page).toHaveURL(/\/sign-in/);
  expect((await request.post('/api/sync', { data: { v: 1 } })).status()).toBe(401);
  expect((await request.get('/api/vault')).status()).toBe(401);
});

test('an address that is nothing is a 404 for a visitor, and a card address that is not an id is too', async ({
  page,
}) => {
  for (const path of ['/zzz', '/cards/not-an-id', '/cards/new/more', '/settings/security'])
    expect((await page.goto(path))?.status(), path).toBe(404);
});

test('the page a reset link leads to is there with no mail, and says so for a link that is not good; asking for one still is not', async ({
  page,
}) => {
  // This instance sends no mail. A link an operator makes (`wallet-admin accounts reset-link`) needs the page; asking for one by mail does not exist.
  const response = await page.goto('/reset-password?token=not-a-token-anyone-was-given-0123456789');
  expect(response?.status()).toBe(200);
  await expect(page.getByText(/expired or was already used/)).toBeVisible();
  await expect(page.getByText(/Ask whoever runs this instance for a new one/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Request a new link' })).toHaveCount(0);
  expect((await page.goto('/forgot-password'))?.status()).toBe(404);
});
