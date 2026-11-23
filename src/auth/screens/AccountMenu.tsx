'use client';

import { useRouter } from '../../screens/nav';
import { useState } from 'react';
import { ConfirmDialog, UserMenu } from '@sovereignfs/ui';
import { authClient } from '../client';

/**
 * The avatar menu at the right of the header: who the person is (name and address), Settings and *Sign out*. Signing out ends the session and
 * locks the wallet (`onLeave`, given by the shell: it clears the keys and the in-memory index, and what the device keeps is ciphertext only, DESIGN.md
 * §11.8). Choosing to erase this device's store when signing out comes with devices, after 0.1.0.
 */
export function AccountMenu({
  name,
  email,
  onLeave,
}: {
  name: string;
  email: string;
  /** Called before the session ends, to lock the wallet. */
  onLeave?: () => void;
}) {
  const router = useRouter();
  const [offline, setOffline] = useState(false);
  const [leaving, setLeaving] = useState(false);

  async function signOut() {
    setOffline(false);
    setLeaving(true);
    onLeave?.();
    // Where to go afterwards, asked while the session is still there: core's sign-out for a session that came from core, which decides
    // whether it ends core's session too (auth.md §8).
    const throughCore = await fetch('/api/account/sign-out', { cache: 'no-store' })
      .then(async (reply) =>
        reply.ok ? ((await reply.json()) as { url: string | null }).url : null,
      )
      .catch(() => null);
    const { error } = await authClient.signOut();
    setLeaving(false);
    // A session that is already gone is as signed out as one that was just ended; only a failure to reach the server is a failure.
    if (error && error.status !== 401) {
      setOffline(true);
      return;
    }
    window.location.assign(throughCore ?? '/');
  }

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
            label: leaving ? 'Signing out…' : 'Sign out',
            icon: 'log-out',
            destructive: true,
            onSelect: () => void signOut(),
          },
        ]}
      />
      <ConfirmDialog
        open={offline}
        onClose={() => setOffline(false)}
        onConfirm={() => void signOut()}
        title="You are offline"
        message="Signing out needs a connection, so that no one else can use your session. Your wallet is locked and stays on this device."
        confirmLabel="Try again"
        cancelLabel="Not now"
      />
    </>
  );
}
