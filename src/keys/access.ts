import { type Vault, addressOf } from './vault-client';

/**
 * Opening the suite's keys with a password, for an instance that runs alone (RFC 0001, DESIGN.md §9.4): what the lock screen and Settings do when a passkey or a
 * passcode is not the way in. Kept apart from the React around it, so that it is tested against the SDK's own vault.
 */
export type Opening =
  | { readonly outcome: 'open'; readonly key: CryptoKey }
  /** The password is not the account's, or does not open the keys: mistyped, or reset since they were made (the recovery kit opens them, at sign-in). */
  | { readonly outcome: 'wrong' }
  /** Too many wrong passwords for this account: nothing is checked for a while. */
  | { readonly outcome: 'limited' }
  /** The session has ended: sign in again. */
  | { readonly outcome: 'signed-out' }
  /** The server could not be asked. */
  | { readonly outcome: 'offline' }
  /**
   * The keys open and **the recovery kit has not been kept**: made just now (an account older than the suite's keys, unlocking for the first time), or shown and
   * left. The page goes to it before anything else.
   */
  | { readonly outcome: 'kit' };

/** What the server said of a sign-in value: whether it is the signed-in account's. */
export type Confirmation = 'ok' | 'wrong' | 'limited' | 'signed-out' | 'offline';

export async function confirmWithServer(
  signIn: string,
  fetcher: typeof fetch = (...args) => fetch(...args),
): Promise<Confirmation> {
  try {
    const response = await fetcher('/api/keys/confirm', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: signIn }),
    });
    if (response.ok) return 'ok';
    if (response.status === 401) return 'signed-out';
    if (response.status === 403) return 'wrong';
    if (response.status === 429) return 'limited';
    return 'offline';
  } catch {
    return 'offline';
  }
}

export async function openWithPassword(
  vault: Vault,
  password: string,
  email: string,
  confirm: (signIn: string) => Promise<Confirmation> = confirmWithServer,
): Promise<Opening> {
  const derived = await vault.derive(password, addressOf(email));
  // **The server says it is the account's password before the vault sees anything made from it:** an account with no keys yet is given them from the first
  // secret `afterSignIn` is handed, and a typo would become the keys' password.
  const confirmed = await confirm(derived.signIn);
  if (confirmed !== 'ok') return { outcome: confirmed };
  const opened = await vault.afterSignIn(derived.secret).catch(() => 'locked' as const);
  if (opened === 'locked') return { outcome: vault.unreachable() ? 'offline' : 'wrong' };
  if (await vault.kitPending()) return { outcome: 'kit' };
  const app = await vault.open();
  // The keys opened a moment ago: what stops the app key now is the server not answering.
  return app.state === 'open' ? { outcome: 'open', key: app.key } : { outcome: 'offline' };
}
