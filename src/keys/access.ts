import { type Vault, addressOf } from './vault-client';

/**
 * Opening the suite's keys with a password, for an instance that runs alone (RFC 0001, DESIGN.md §9.4): what the lock screen and Settings do when a passkey or a
 * passcode is not the way in. Kept apart from the React around it, so that it is tested against the SDK's own vault.
 */
export type Opening =
  | { readonly outcome: 'open'; readonly key: CryptoKey }
  /** The password does not open the keys: mistyped, or reset since they were made (the recovery kit opens them, at sign-in). */
  | { readonly outcome: 'wrong' }
  /** The server could not be asked. */
  | { readonly outcome: 'offline' }
  /**
   * The keys open and **the recovery kit has not been kept**: made just now (an account older than the suite's keys, unlocking for the first time), or shown and
   * left. The page goes to it before anything else.
   */
  | { readonly outcome: 'kit' };

export async function openWithPassword(
  vault: Vault,
  password: string,
  email: string,
): Promise<Opening> {
  const derived = await vault.derive(password, addressOf(email));
  const opened = await vault.afterSignIn(derived.secret).catch(() => 'locked' as const);
  if (opened === 'locked') return { outcome: vault.unreachable() ? 'offline' : 'wrong' };
  if (await vault.kitPending()) return { outcome: 'kit' };
  const app = await vault.open();
  // The keys opened a moment ago: what stops the app key now is the server not answering.
  return app.state === 'open' ? { outcome: 'open', key: app.key } : { outcome: 'offline' };
}
