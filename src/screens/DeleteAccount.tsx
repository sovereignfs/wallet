'use client';

import { useRef, useState } from 'react';
import { ConfirmDialog, FormField, Input } from '@sovereignfs/ui';
import { authClient, signInValue } from '../auth/client';
import { useKeys } from '../keys/keys';
import { leaveDevice } from '../local/leave';
import styles from './Screens.module.css';
import { useWallet } from './WalletProvider';

/** **No deletion reaches another device's copy** (DESIGN.md §28): nothing erases it, so wherever deleting is offered this is said, with what does remove one. */
export const COPIES_LEFT =
  'Each keeps its copy, which its passkey or passcode can still open. To remove one, sign out on that device before you delete the account, or clear this site’s data in its browser.';

/** What deleting an account does on an instance that runs alone: said in Settings and on the lock screen. */
export const WHAT_DELETION_DOES = `This deletes your wallet and everything in it from the server, for good: nobody can bring it back. It erases it from this device too, but not from your other devices. ${COPIES_LEFT}`;

/**
 * Deleting an account of an instance that runs alone (DESIGN.md §28), asked for in Settings or, where nothing opens the wallet, on the lock screen: the password
 * and typing "delete", then the account goes from the server and the wallet from this device. **What the server asks for is the password, never an open wallet**,
 * so both places do the same. It is made when it is opened, and holds nothing once closed.
 */
export function DeleteAccountDialog({ email, onClose }: { email: string; onClose: () => void }) {
  const { accountId, keyring, db, loop } = useWallet();
  const keys = useKeys();
  // Read when the deletion is confirmed, since a password manager can fill the box without telling the page.
  const passwordBox = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setError(null);
    const password = passwordBox.current?.value ?? '';
    if (password === '') return setError('Type your password.');
    setBusy(true);
    try {
      // The password is never sent (auth.md §4, rule 1): what the server checks is the sign-in value the page makes from it.
      const value = await signInValue(password, email);
      const response = await fetch('/api/account/delete', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: value }),
      });
      if (response.status === 403) return setError('That password is not right.');
      if (response.status === 429)
        return setError('That was tried too many times. Wait a few minutes.');
      if (!response.ok) return setError('The account could not be deleted. Try again.');
      keyring.lock('sign-out');
      // The store cannot be deleted while this page holds it open, and nothing is to be sent for an account that is gone.
      loop.stop();
      db.close();
      await leaveDevice(accountId);
      // A wallet that was locked already heard nothing of the lock above, so what the browser keeps of the suite's key is let go here.
      await keys.forget();
      // The session's cookie is cleared as well: the account it was for is gone, but the browser still holds the cookie.
      await authClient.signOut().catch(() => undefined);
      window.location.assign('/');
    } catch {
      setError('Deleting needs a connection.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog
      open
      onClose={onClose}
      title="Delete your account?"
      message={
        <div className={styles.stack}>
          <p>Type “delete” to confirm.</p>
          <Input
            aria-label="Type delete to confirm"
            autoComplete="off"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
          <FormField label="Your password">
            {(field) => (
              <Input {...field} ref={passwordBox} type="password" autoComplete="current-password" />
            )}
          </FormField>
        </div>
      }
      confirmLabel={busy ? 'Deleting…' : 'Delete everything'}
      destructive
      pending={busy || typed.trim().toLowerCase() !== 'delete'}
      error={error}
      onConfirm={() => void remove()}
    />
  );
}
