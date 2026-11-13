import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { writeCameraVideo } from './e2e/camera.ts';
import { PORTS } from './e2e/ports.ts';

/**
 * Browser tests (`pnpm build && pnpm e2e`): the real app, built, in a real browser. They are where the things a unit test cannot show are shown: a page as
 * a visitor sees it, a policy a browser enforces, a service worker, a network that goes away, a camera, a passkey, and a phone's width.
 *
 * Two instances run: one that takes local sign-in, on the database form the environment names (a leg of CI sets the variables an operator would set and this
 * uses them as they are; with none it is a SQLite file in a directory of its own), and one that takes only Sovereign, through a fake one
 * (`e2e/fake-sovereign-server.ts`) whose control port says who signs in next.
 *
 * Browsers: Chromium at a desktop's width and a phone's, and WebKit (Safari's engine) at a desktop's. WebKit here has no virtual authenticator with PRF, so
 * the passkey journey runs in Chromium only, and says so.
 *
 * The secret below is for this throwaway instance only.
 */
const SECRET = 'e2e-only-secret-not-for-anything-real-0123456789';
// Playwright loads this file again in every worker: the first load makes the directory and the others, which inherit the variable, use it.
const directory = process.env.WALLET_E2E_DIR ?? mkdtempSync(join(tmpdir(), 'wallet-e2e-'));
process.env.WALLET_E2E_DIR = directory;

// A video of a QR code for Chromium's fake camera, made once per run.
const cameraVideo = join(directory, 'qr.y4m');
writeCameraVideo(cameraVideo);

const CORE = {
  WALLET_CORE_URL: `http://localhost:${PORTS.coreAuth}/api/auth`,
  WALLET_CORE_CLIENT_ID: 'wallet-e2e-client',
  WALLET_CORE_CLIENT_SECRET: 'wallet-e2e-secret',
};

// Next reads `.env.local` and does not override what is already set, so a developer's own settings there would reach these instances. Setting a name, even to
// nothing, keeps it out: an empty value is "not set" to the app.
const BLANK = Object.fromEntries(
  [
    'WALLET_URL',
    'WALLET_AUTH_LOCAL',
    'WALLET_AUTH_SECRET',
    'WALLET_AUTH_SIGNUP',
    'WALLET_CORE_URL',
    'WALLET_CORE_CLIENT_ID',
    'WALLET_CORE_CLIENT_SECRET',
    'WALLET_CORE_CLIENT_SECRET_FILE',
    'WALLET_SMTP_HOST',
    'WALLET_WORKER',
    'WALLET_ENCRYPTION_KEY',
  ].map((name) => [name, '']),
);

const own = (name: string): string => {
  const folder = join(directory, name);
  mkdirSync(folder, { recursive: true });
  return join(folder, 'wallet.db');
};

const database = process.env.WALLET_DB_DIALECT
  ? {}
  : { WALLET_DB_DIALECT: 'sqlite', WALLET_SQLITE_URL: `file:${own('app')}` };

export default defineConfig({
  testDir: 'e2e',
  // One at a time: the instance shares one database, and the tests are quick.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://localhost:${PORTS.app}`, trace: 'retain-on-failure' },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /(scan|passkey)\.spec\.ts/,
    },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testIgnore: /(scan|passkey)\.spec\.ts/ },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testIgnore: /(scan|passkey)\.spec\.ts/,
    },
    // A fake camera that shows a QR code, and a virtual authenticator (set up by the test): Chromium only, since WebKit has neither.
    {
      name: 'camera',
      testMatch: /(scan|passkey)\.spec\.ts/,
      use: {
        ...devices['Pixel 7'],
        permissions: ['camera'],
        launchOptions: {
          args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            `--use-file-for-fake-video-capture=${cameraVideo}`,
          ],
        },
      },
    },
  ],
  webServer: [
    {
      command: 'node e2e/fake-sovereign-server.ts',
      url: `http://localhost:${PORTS.coreControl}/health`,
      timeout: 30_000,
      reuseExistingServer: false,
    },
    {
      command: `node scripts/serve-standalone.mjs ${PORTS.app}`,
      url: `http://localhost:${PORTS.app}/api/health`,
      timeout: 90_000,
      reuseExistingServer: false,
      env: {
        ...BLANK,
        ...database,
        WALLET_URL: `http://localhost:${PORTS.app}`,
        WALLET_AUTH_LOCAL: '1',
        WALLET_AUTH_SECRET: SECRET,
        WALLET_AUTH_SIGNUP: 'open',
        WALLET_ENCRYPTION_KEY: 'e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0',
      } as Record<string, string>,
    },
    {
      command: `node scripts/serve-standalone.mjs ${PORTS.sovereign}`,
      url: `http://localhost:${PORTS.sovereign}/api/health`,
      timeout: 90_000,
      reuseExistingServer: false,
      env: {
        ...BLANK,
        WALLET_DB_DIALECT: 'sqlite',
        WALLET_SQLITE_URL: `file:${own('sovereign')}`,
        WALLET_URL: `http://localhost:${PORTS.sovereign}`,
        WALLET_AUTH_SECRET: SECRET,
        ...CORE,
      } as Record<string, string>,
    },
  ],
});
