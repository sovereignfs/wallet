'use client';

import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, createContext, useContext, useEffect, useState } from 'react';
import type { Wallet } from '../local/wallet';
import { Button } from '@sovereignfs/ui';
import { AccountMenu } from '../auth/screens/AccountMenu';
import { rememberIdentity } from '../identity';
import { site } from '../site';
import { AppShell } from '../ui/AppShell';
import { Frame } from './Frame';
import { LockScreen } from './LockScreen';
import { RegisterWorker } from './RegisterWorker';
import { Setup } from './Setup';
import { UndoProvider, useUndo } from './Undo';
import { WalletProvider, useWallet } from './WalletProvider';
import type { Merged } from '../local/wallet';
import { restoreOther } from './merged';
import styles from './Screens.module.css';

/** Who is signed in, for the screens that say so: the name on Home, the address in Settings. */
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
  children,
}: {
  accountId: string;
  name: string;
  email: string;
  children: ReactNode;
}) {
  useEffect(() => rememberIdentity({ id: accountId, name, email }), [accountId, name, email]);
  return (
    <WhoContext.Provider value={{ id: accountId, name, email }}>
      <UndoProvider>
        <WithUndo accountId={accountId} name={name} email={email}>
          {children}
        </WithUndo>
      </UndoProvider>
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
      fallback={<Shell name={name} email={email} />}
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

/** The header and nothing else, while the device's store is opening. */
function Shell({ name, email, children }: { name: string; email: string; children?: ReactNode }) {
  return (
    <AppShell name={site.name} account={<AccountMenu name={name} email={email} />}>
      <RegisterWorker />
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
  const { stand, keyring, wallet, settingUp } = useWallet();
  registerWallet(wallet);
  const router = useRouter();
  const path = usePathname();

  // Setup is where a person with no wallet goes, and no one else.
  useEffect(() => {
    if (stand === 'no-vault' && path !== '/setup') router.replace('/setup');
    if (stand !== 'no-vault' && stand !== 'starting' && path === '/setup' && stand === 'locked')
      router.replace('/');
  }, [stand, path, router, settingUp]);

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
      account={<AccountMenu name={name} email={email} onLeave={() => keyring.lock('sign-out')} />}
    >
      <RegisterWorker />
      {stand === 'starting' ? null : stand === 'needs-connection' ? (
        <main className={styles.page}>
          <div className={`${styles.column} ${styles.narrow}`}>
            <h1 className={styles.heading}>Connect to open your wallet</h1>
            <p className={styles.lead}>
              This device has not opened your wallet before, and signing in the first time needs a
              connection. Once it has, it works with none.
            </p>
          </div>
        </main>
      ) : stand === 'no-vault' || settingUp ? (
        <Setup name={name} />
      ) : stand === 'locked' ? (
        <LockScreen />
      ) : (
        <Frame>{children}</Frame>
      )}
    </AppShell>
  );
}
