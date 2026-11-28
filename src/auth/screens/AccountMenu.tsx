'use client';

import { useRouter } from '../../screens/nav';
import styles from '../../screens/Screens.module.css';
import { useState } from 'react';
import { Button, ConfirmDialog, UserMenu } from '@sovereignfs/ui';
import { authClient } from '../client';

/** What signing out does to this device, which the shell that holds the wallet knows how to do (`src/local/leave.ts`). */
export interface Leaving {
  /** Sends what waits, if the server takes it in a moment, and says how many changes it still has not taken. */
  unsent(): Promise<number>;
  /** Locks, before the session ends. */
  lock(): void;
  /** Takes the account off the device, once the session has ended. */
  leave(keepData: boolean): Promise<void>;
}

/**
 * The avatar menu at the right of the header: who the person is (name and address), Settings and *Sign out*. **Signing out erases this device's copy of the
 * wallet** and forgets who was signed in (DESIGN.md §11.8). With changes the server has not taken, the person says first whether to keep the encrypted copy,
 * which sends them after signing in again, or to erase it. Nothing is erased until the session has ended, so signing out with no connection loses nothing.
 */
export function AccountMenu({
  name,
  email,
  leaving,
}: {
  name: string;
  email: string;
  leaving: Leaving;
}) {
  const router = useRouter();
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);
  /** How many changes are unsent while the person is asked what to do with them, or `unknown` when the device could not say. */
  const [asking, setAsking] = useState<number | 'unknown' | null>(null);
  /** What the person chose, for a second try. */
  const [keep, setKeep] = useState(false);

  async function start() {
    setOffline(false);
    setBusy(true);
    // A device that cannot say is asked about, never erased unasked.
    const waiting = await leaving.unsent().catch(() => 'unknown' as const);
    if (waiting === 0) return signOut(false);
    setBusy(false);
    setAsking(waiting);
  }

  async function signOut(keepData: boolean) {
    setAsking(null);
    setOffline(false);
    setKeep(keepData);
    setBusy(true);
    leaving.lock();
    // Where to go afterwards, asked while the session is still there: core's sign-out for a session that came from core, which decides
    // whether it ends core's session too (auth.md §8).
    const throughCore = await fetch('/api/account/sign-out', { cache: 'no-store' })
      .then(async (reply) =>
        reply.ok ? ((await reply.json()) as { url: string | null }).url : null,
      )
      .catch(() => null);
    const { error } = await authClient.signOut();
    // A session that is already gone is as signed out as one that was just ended; only a failure to reach the server is a failure.
    if (error && error.status !== 401) {
      setBusy(false);
      setOffline(true);
      return;
    }
    await leaving.leave(keepData);
    window.location.assign(throughCore ?? '/');
  }

  const one = asking === 1;
  return (
    <>
      <UserMenu
        name={name}
        email={email}
        size="sm"
        aria-label="User menu"
        items={[
          { label: 'Settings', icon: 'settings', onSelect: () => router.push('/settings') },
          {
            label: busy ? 'Signing out…' : 'Sign out',
            icon: 'log-out',
            destructive: true,
            onSelect: () => void start(),
          },
        ]}
      />
      <ConfirmDialog
        open={asking !== null}
        onClose={() => setAsking(null)}
        onConfirm={() => void signOut(true)}
        title="Changes not yet sent"
        message={
          <div className={styles.stack}>
            <p>
              {typeof asking === 'number'
                ? `${asking} ${one ? 'change' : 'changes'} made on this device ${one ? 'has' : 'have'} not reached the server.`
                : 'Some changes made on this device may not have reached the server.'}{' '}
              Keep this device’s encrypted data, and what has not been sent is sent when you sign in
              again here. Erase it, and what has not been sent is lost.
            </p>
            <div>
              <Button variant="destructive" onClick={() => void signOut(false)}>
                Sign out and erase this device
              </Button>
            </div>
          </div>
        }
        confirmLabel="Sign out and keep this device’s data"
        cancelLabel="Cancel"
      />
      <ConfirmDialog
        open={offline}
        onClose={() => setOffline(false)}
        onConfirm={() => void signOut(keep)}
        title="You are offline"
        message="Signing out needs a connection, so that no one else can use your session. Your wallet is locked and stays on this device."
        confirmLabel="Try again"
        cancelLabel="Not now"
      />
    </>
  );
}
