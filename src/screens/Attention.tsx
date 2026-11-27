'use client';

import { useEffect, useState } from 'react';
import { Alert } from '@sovereignfs/ui';
import { unlockMethods } from '../keyring/wrappers';
import { Link } from './nav';
import { useEntries, useWallet } from './WalletProvider';

/**
 * What needs the person's attention, in words, at the top of the screen Wallet opens on (DESIGN.md §26.4): no quick way to unlock on this device, and changes the
 * server would not take. Nothing at all when there is neither.
 */
export function Attention() {
  const entries = useEntries();
  const { db, wallet } = useWallet();
  const [methods, setMethods] = useState<number | null>(null);
  const [couldnt, setCouldnt] = useState(0);
  useEffect(() => {
    void unlockMethods(db).then((found) => setMethods(found.length));
    void wallet.refusedChanges().then((found) => setCouldnt(found.length));
  }, [db, wallet, entries]);

  return (
    <>
      {methods === 0 ? (
        <Alert variant="info" heading="Unlock faster on this device">
          Set a passkey or a passcode, or this device needs a connection and your account after
          every lock. <Link href="/settings">Open Settings</Link>
        </Alert>
      ) : null}
      {couldnt > 0 ? (
        <Alert variant="warning" heading="Some changes could not be sent">
          {couldnt === 1 ? 'One change' : `${couldnt} changes`} could not be sent to the server, and
          are kept here. <Link href="/settings?tab=storage">See what</Link>
        </Alert>
      ) : null}
    </>
  );
}
