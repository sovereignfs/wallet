'use client';

import { useState } from 'react';
import { useRouter } from './nav';
import { Button } from '@sovereignfs/ui';
import styles from './Screens.module.css';
import { UnlockMethods } from './UnlockMethods';
import { useWallet } from './WalletProvider';

/**
 * Setup (DESIGN.md §26.3, §7): one step at a time, the first time a device opens the wallet, with the suite's key open and the keyring root in hand. **The keys
 * were made with the account** (the password's, and the recovery kit shown once after sign-up), so what is asked here is only how this device opens the wallet
 * the next time, with no connection: **a passkey or a passcode, at least one**, since without one a restart with no signal could not open it. The root's bytes
 * are in hand for this step only (`setupMaterial`), and are let go of when it ends.
 *
 *   welcome → unlocking this device → done
 */
type Step = 'welcome' | 'methods' | 'done';

export function Setup({ name }: { name: string }) {
  const { setupMaterial, finishSetup } = useWallet();
  const router = useRouter();
  const [step, setStep] = useState<Step>('welcome');

  function done(to: string) {
    // Keeping what is on this device matters: the browser is asked not to clear it (DESIGN.md §10.8).
    void navigator.storage?.persist?.().catch(() => undefined);
    finishSetup();
    router.replace(to);
  }

  if (!setupMaterial) return null;
  return (
    <main className={styles.page}>
      <div className={`${styles.column} ${styles.narrow}`}>
        {step === 'welcome' ? (
          <>
            <h1 className={styles.heading}>Welcome, {name}</h1>
            <p className={styles.lead}>
              What you keep in Wallet is encrypted in your browser before it leaves it. This device
              needs a way to open it with no connection: your face or fingerprint, or a passcode.
              Keep your recovery kit as well: it is the way back if you forget your password.
            </p>
            <div>
              <Button size="lg" onClick={() => setStep('methods')}>
                Get started
              </Button>
            </div>
          </>
        ) : null}

        {step === 'methods' ? (
          <>
            <h1 className={styles.heading}>Unlock this device</h1>
            <UnlockMethods material={setupMaterial} required onDone={() => setStep('done')} />
          </>
        ) : null}

        {step === 'done' ? (
          <>
            <h1 className={styles.heading}>Your wallet is ready</h1>
            <p className={styles.lead}>
              Add your first card. Everything you add is locked in your browser before it leaves it.
            </p>
            <div className={styles.row}>
              <Button onClick={() => done('/cards/new')}>Add a card</Button>
              <Button variant="secondary" onClick={() => done('/')}>
                Go to Home
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
