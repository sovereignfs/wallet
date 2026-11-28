import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { PORTS } from './ports.ts';

/**
 * The settings of the instance that takes local sign-in, as the browser tests run it: the server is started with them (`playwright.config.ts`), and a test that
 * asks the operator's tool about the same instance gives it the same ones. The secrets below are for this throwaway instance only.
 */
export const SECRET = 'e2e-only-secret-not-for-anything-real-0123456789';

/** A database file of an instance's own, under the run's directory. */
export function databaseFile(directory: string, instance: string): string {
  const folder = join(directory, instance);
  mkdirSync(folder, { recursive: true });
  return join(folder, 'wallet.db');
}

export function localSettings(directory: string): Record<string, string> {
  // A leg of CI names its database the way an operator would, and that is used as it is; with none it is a SQLite file.
  const database: Record<string, string> = process.env.WALLET_DB_DIALECT
    ? {}
    : { WALLET_DB_DIALECT: 'sqlite', WALLET_SQLITE_URL: `file:${databaseFile(directory, 'app')}` };
  return {
    ...database,
    WALLET_URL: `http://localhost:${PORTS.app}`,
    WALLET_AUTH_LOCAL: 'true',
    WALLET_AUTH_SECRET: SECRET,
    WALLET_AUTH_SIGNUP: 'open',
    WALLET_ENCRYPTION_KEY: 'e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0',
  };
}
