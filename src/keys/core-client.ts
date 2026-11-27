'use client';

import { appKeys } from '@sovereignfs/sdk/keys';

/**
 * The app key from core (RFC 0001, sdk §9.3), for an instance hosted by Sovereign: `appKeys` with core's address, Wallet's client id at core and the key return
 * address as registered, all handed to the page by the server (`keySourceOf`), and Wallet's own route for the session's secret.
 */
export interface CoreKeySettings {
  readonly core: string;
  readonly clientId: string;
  readonly returnTo: string;
}

export function coreKeys(settings: CoreKeySettings) {
  return appKeys({ ...settings, secretPath: '/api/auth/sv/key-secret' });
}
