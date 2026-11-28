import { forgetIdentity } from '../identity';
import { forgetResume } from '../keyring/resume';
import { type LocalDatabase, eraseLocal } from './db';

/**
 * Taking an account off this device (DESIGN.md §11.8): at sign-out, and when the account is deleted.
 */

/** How long leaving waits for the device's store to go before it goes on all the same. */
export const ERASE_WAIT_MS = 5_000;

/** The changes made on this device that the server has not taken: waiting to be sent, or refused and waiting for the person. */
export async function unsentChanges(db: LocalDatabase): Promise<number> {
  const [waiting, refused] = await Promise.all([db.count('outbox'), db.getAll('refused')]);
  return refused.reduce((total, entry) => total + entry.items.length, waiting);
}

/**
 * Called once the session has ended, or the account is gone, with this page's own hold on the store let go. **Who was signed in goes first,** so that nothing
 * opens the store again for them, and the account's other tabs, which hear it go, leave (`WalletProvider`). Then what a reload would go by, and then, unless the
 * person keeps it for changes not yet sent, the store. A tab that has the store open lets it go when asked (`openLocal`); one that cannot answer, such as one
 * the browser has frozen, does not hold this up.
 */
export async function leaveDevice(
  accountId: string,
  options: { keepData?: boolean; name?: string } = {},
): Promise<void> {
  forgetIdentity();
  forgetResume(accountId);
  if (options.keepData) return;
  await Promise.race([
    eraseLocal(accountId, options.name).catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, ERASE_WAIT_MS)),
  ]);
}
