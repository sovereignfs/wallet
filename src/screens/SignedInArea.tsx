'use client';

import { type ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { openLocal } from '../local/db';
import { leaveDevice, unsentChanges } from '../local/leave';
import type { Wallet } from '../local/wallet';
import { Button } from '@sovereignfs/ui';
import { AccountMenu, type Leaving } from '../auth/screens/AccountMenu';
import { rememberIdentity } from '../identity';
import { KeysProvider, useKeys } from '../keys/keys';
import { forgetResume } from '../keyring/resume';
import type { KeySource } from '../keys/source';
import { site } from '../site';
import { AppShell } from '../ui/AppShell';
import { Frame } from './Frame';
import { LockScreen } from './LockScreen';
import { ServiceWorkerRegistration } from '@sovereignfs/pwa/client';
import { Setup } from './Setup';
import { UndoProvider, useUndo } from './Undo';
import { WalletProvider, useWallet } from './WalletProvider';
import type { Merged } from '../local/wallet';
import { restoreOther } from './merged';
import styles from './Screens.module.css';

/** Who is signed in, for the screens that say so: the name at setup, the address in Settings. */
export interface Identity {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}
const WhoContext = createContext<Identity | null>(null);
export function useIdentity(): Identity {
  const who = useContext(WhoContext);
  if (!who) throw new Error('nobody is signed in here');
  return who;
}

/**
 * The frame of everything for someone who is signed in (DESIGN.md §26.2). The server's layout makes it with who is signed in, and the offline shell makes
 * it with who the device remembers. It remembers the person on the device (`rememberIdentity`), so that the shell can open for them with no server to ask.
 *
 * **What it shows depends on where the wallet stands** (`useWallet().stand`): the lock screen while locked, setup while there is no wallet, and the page
 * only when unlocked. A page is never rendered locked, so no screen can show, or forget to hide, what it has not been given.
 */
export function SignedInArea({
  accountId,
  name,
  email,
  keys,
  children,
}: {
  accountId: string;
  name: string;
  email: string;
  /** Where the suite's key comes from (`src/keys/source.ts`): the server says, and the shell has it from the device. */
  keys: KeySource | undefined;
  children: ReactNode;
}) {
  useEffect(
    () => rememberIdentity({ id: accountId, name, email, ...(keys ? { keys } : {}) }),
    [accountId, name, email, keys],
  );
  return (
    <WhoContext.Provider value={{ id: accountId, name, email }}>
      <KeysProvider source={keys}>
        <UndoProvider>
          <WithUndo accountId={accountId} name={name} email={email}>
            {children}
          </WithUndo>
        </UndoProvider>
      </KeysProvider>
    </WhoContext.Provider>
  );
}

/** Where a merge that kept this device's value says so, with Undo (DESIGN.md §11.5). */
function WithUndo({
  accountId,
  name,
  email,
  children,
}: {
  accountId: string;
  name: string;
  email: string;
  children: ReactNode;
}) {
  const undo = useUndo();
  const [wallet, setWallet] = useState<{ current: Wallet | null }>({ current: null });
  void setWallet;
  return (
    <WalletProvider
      accountId={accountId}
      email={email}
      fallback={<Shell accountId={accountId} name={name} email={email} />}
      onMerged={(merged: Merged) =>
        undo({
          message: 'Also edited on another device: kept yours.',
          undo: () => restoreOther(wallet.current, merged),
        })
      }
    >
      <Gate name={name} email={email} registerWallet={(w) => (wallet.current = w)}>
        {children}
      </Gate>
    </WalletProvider>
  );
}

/** How long signing out waits for what is unsent to be taken before it asks about it. */
const SEND_WAIT_MS = 5_000;

/** Leaving while the wallet is not made yet: the store is opened only to be asked, and let go. */
const fromDevice = (accountId: string): Leaving => ({
  unsent: async () => {
    const db = await openLocal(accountId);
    try {
      return await unsentChanges(db);
    } finally {
      db.close();
    }
  },
  lock: () => forgetResume(accountId),
  leave: (keepData) => leaveDevice(accountId, { keepData }),
});

/** The header and nothing else, while the device's store is opening. */
function Shell({
  accountId,
  name,
  email,
  children,
}: {
  accountId: string;
  name: string;
  email: string;
  children?: ReactNode;
}) {
  return (
    <AppShell
      name={site.name}
      account={<AccountMenu name={name} email={email} leaving={fromDevice(accountId)} />}
    >
      {/* Registers the service worker in production, and says when a new version is ready (`@sovereignfs/pwa`). */}
      <ServiceWorkerRegistration appName={site.name} />
      {children}
    </AppShell>
  );
}

function Gate({
  name,
  email,
  children,
  registerWallet,
}: {
  name: string;
  email: string;
  children: ReactNode;
  registerWallet: (wallet: Wallet) => void;
}) {
  const { stand, keyring, wallet, db, loop, settingUp } = useWallet();
  const keys = useKeys();
  registerWallet(wallet);
  const leaving: Leaving = {
    unsent: async () => {
      // What was just written is sent first, if the server answers in a moment, so that only what cannot be sent is asked about.
      await Promise.race([
        wallet.sync().catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, SEND_WAIT_MS)),
      ]);
      return unsentChanges(db);
    },
    lock: () => {
      keyring.lock('sign-out');
      // Signing out from the lock screen locks nothing, so what a reload would go by is let go here too.
      forgetResume(wallet.accountId);
      // The suite's key goes with the session: what this browser kept of it opens nothing once it ends.
      void keys.forget();
    },
    leave: async (keepData) => {
      loop.stop();
      db.close();
      await leaveDevice(wallet.accountId, { keepData });
    },
  };
  const lock = (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => keyring.lock('manual')}
      disabled={stand !== 'unlocked'}
      aria-label="Lock the wallet"
    >
      Lock
    </Button>
  );
  return (
    <AppShell
      name={site.name}
      bell={stand === 'unlocked' ? lock : null}
      account={<AccountMenu name={name} email={email} leaving={leaving} />}
    >
      <ServiceWorkerRegistration appName={site.name} />
      {stand === 'starting' ? null : stand === 'needs-connection' ? (
        <main className={styles.page}>
          <div className={`${styles.column} ${styles.narrow}`}>
            <h1 className={styles.heading}>Connect to open your wallet</h1>
            <p className={styles.lead}>
              This device has not opened your wallet before, and the first time needs a connection.
              Once it has, it works with none.
            </p>
          </div>
        </main>
      ) : settingUp ? (
        <Setup name={name} />
      ) : stand === 'locked' ? (
        <LockScreen />
      ) : (
        <Frame>{children}</Frame>
      )}
    </AppShell>
  );
}
