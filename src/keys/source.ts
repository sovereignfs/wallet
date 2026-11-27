import type { CoreKeySettings } from './core-client';

/**
 * Where the page gets the suite's app key (RFC 0001, DESIGN.md §7.1), decided by how the instance signs people in and never by the viewport: an instance that
 * runs alone has its own vault, and one hosted by Sovereign has core's release. The server hands it to the page, and the page remembers it on the device so that
 * the offline shell has it (`src/identity.ts`); **it holds no secret**: an address, an id and the salt of a derivation.
 */
export type KeySource =
  | { readonly kind: 'vault'; readonly vaultId: string }
  | ({ readonly kind: 'core' } & CoreKeySettings);

/** A key source read back from a stored value, if it has the shape of one; anything else is none. */
export function parseKeySource(value: unknown): KeySource | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const v = value as Record<string, unknown>;
  if (v.kind === 'vault' && typeof v.vaultId === 'string' && v.vaultId !== '')
    return { kind: 'vault', vaultId: v.vaultId };
  if (
    v.kind === 'core' &&
    typeof v.core === 'string' &&
    typeof v.clientId === 'string' &&
    typeof v.returnTo === 'string'
  )
    return { kind: 'core', core: v.core, clientId: v.clientId, returnTo: v.returnTo };
  return undefined;
}
