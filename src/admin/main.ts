import { resetLink } from '@sovereignfs/auth/server';
import { createAuth } from '../auth/auth';
import { openAuthStore } from '../auth/store';
import { loadConfig } from '../config';
import { processEnv } from '../config/env';
import { site } from '../site';
import { run } from './run';

/**
 * `wallet-admin`, bundled into one file by `scripts/build-tools.mjs` and run in Wallet's container (`docker compose exec web node tools/wallet-admin.mjs …`). It reads the
 * settings as the server does and opens the auth store beside the server; it **runs no migration, opens no app store and writes nothing but the one record the
 * package's `resetLink` makes**, so it is safe to run while the server is up.
 */
const loaded = loadConfig(processEnv());
if (!loaded.ok) {
  console.error(
    "wallet-admin: Wallet's settings are wrong, and it reads the ones the server does:",
  );
  for (const problem of loaded.problems) console.error(`  - ${problem}`);
  process.exit(1);
}
const { config } = loaded;

const code = await run(process.argv.slice(2), {
  settings: config.auth,
  async resetLink(email) {
    const settings = config.auth;
    if (!settings) return undefined;
    const store = await openAuthStore(config.database.database);
    try {
      return await resetLink(
        createAuth({ settings, name: site.name, database: store }),
        email,
        settings.url,
      );
    } finally {
      await store.close();
    }
  },
  out: (line) => console.log(line),
  log: (line) => console.error(line),
});
process.exit(code);
