import { AppVault } from '@sovereignfs/sdk/vault';
import type { Database } from '@sovereignfs/auth/database';

/**
 * Wallet's own vault, for an instance that runs alone (RFC 0001, DESIGN.md §7.4): the SDK's `AppVault` on the auth store, where `migrateAuthStore` made its
 * tables (`sv_key_*`). It keeps each person's keys, wrapped, and **opens none of them.** Its records are bound to the account's id (better-auth's user id), which
 * is the vault's `sub`, and to `CLIENT_ID`, the manifest's prefix. The instance's vault id, the salt of the sign-in value, is its too.
 */
export const CLIENT_ID = 'wallet';

const vaults = new WeakMap<Database, AppVault>();

export function vaultOf(store: Database): AppVault {
  let vault = vaults.get(store);
  if (!vault) vaults.set(store, (vault = new AppVault(store)));
  return vault;
}
