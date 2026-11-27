'use client';

import { localVault } from '@sovereignfs/sdk/local-vault';

/**
 * Wallet's own vault in the page, for an instance that runs alone (RFC 0001, sdk §9.5): `localVault` over Wallet's own routes. The password is derived here and
 * never sent; what the server gets is the sign-in value, and the secret stays in the browser to open the suite's keys once the server has said yes.
 *
 * **The SDK answers "locked" both for a password that does not open the keys and for a server it could not ask,** so this watches its requests: `unreachable()`
 * says whether the last one did not get through, and a screen then says to connect, and not that the password is wrong.
 */
export const CLIENT_ID = 'wallet';

type Options = Parameters<typeof localVault>[0];

export type Vault = ReturnType<typeof localVault> & {
  /** Whether the last request to the server did not get through: no network, or the server failing. */
  unreachable(): boolean;
};

export function walletVault(
  vaultId: string,
  given: Pick<Options, 'backend' | 'fetch'> = {},
): Vault {
  const http = given.fetch ?? ((input, init) => globalThis.fetch(input, init));
  let failed = false;
  const vault = localVault({
    clientId: CLIENT_ID,
    vaultId,
    path: '/api/keys/vault',
    secretPath: '/api/auth/sv/key-secret',
    ...(given.backend ? { backend: given.backend } : {}),
    fetch: async (input, init) => {
      try {
        const response = await http(input, init);
        failed = response.status >= 500;
        return response;
      } catch (error) {
        failed = true;
        throw error;
      }
    },
  });
  return { ...vault, unreachable: () => failed };
}

/** The address a password is derived with: the one signed in with, as better-auth keeps it. The same at every sign-in, or the keys would not open. */
export const addressOf = (email: string): string => email.trim().toLowerCase();

/** Where a page goes once the keys are set up: the recovery kit first, if it is still to be kept. */
export const kitPath = (): string => '/keys/kit';
