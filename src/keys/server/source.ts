import { authSettings } from '../../auth/server';
import { vaultOf } from './vault';
import { getAuthStore } from '../../db/boot';
import type { KeySource } from '../source';

/**
 * Where this instance's keys come from (RFC 0001, DESIGN.md §7.1): **one way for an instance, never both** (§25.1). An instance that runs alone keeps its own
 * vault, whose id (the salt of the sign-in value) is no secret; one hosted by Sovereign has core release the app key, at the address registered in the manifest.
 * Read for each request and never built into the page.
 */
export async function keySource(): Promise<KeySource | undefined> {
  const settings = authSettings();
  if (!settings) return undefined;
  if (settings.sovereign) {
    return {
      kind: 'core',
      core: settings.sovereign.issuer,
      clientId: settings.sovereign.clientId,
      returnTo: `${settings.url.replace(/\/+$/, '')}/keys/return`,
    };
  }
  return { kind: 'vault', vaultId: await vaultOf(await getAuthStore()).vaultId() };
}
