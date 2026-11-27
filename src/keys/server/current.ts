import type { AppVault } from '@sovereignfs/sdk/vault';
import { getAuthStore } from '../../db/boot';
import { vaultOf } from './vault';

/** The server's vault: `vaultOf` the auth store the server opened. Kept apart from `vault.ts` so that what only needs the vault (deleting a person) does not start the server's store. */
export async function getVault(): Promise<AppVault> {
  return vaultOf(await getAuthStore());
}
