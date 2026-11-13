'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { type Identity, readIdentity } from '../identity';
import { SignedInArea } from './SignedInArea';

/**
 * The wallet with no server document (DESIGN.md §26.6). The service worker answers an address of the signed-in area with the one page it keeps, `/shell`,
 * which holds nothing of a person and is the same for everyone; this is what that page is. It finds who is signed in on the device (`src/identity.ts`) and
 * makes the same composition the server's layout makes.
 */
export function OfflineApp() {
  // Not known until the page is in the browser: the server renders nothing of a person.
  const [who, setWho] = useState<Identity | null | undefined>(undefined);
  useEffect(() => setWho(readIdentity()), []);

  if (who === undefined) return null;
  if (who === null)
    return (
      <main style={{ padding: 'var(--sv-space-6)' }}>
        <p>Sign in to use Wallet. This needs a connection.</p>
        <p>
          <Link href="/sign-in">Sign in</Link>
        </p>
      </main>
    );
  return (
    <SignedInArea accountId={who.id} name={who.name} email={who.email}>
      <p style={{ padding: 'var(--sv-space-6)' }}>Your wallet is on this device.</p>
    </SignedInArea>
  );
}
