'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, FormField, Input } from '@sovereignfs/ui';
import { deriveInWorker } from '../keyring/derive';
import {
  type Attempt,
  unlockMethods,
  unlockWithPasscode,
  unlockWithPasskey,
} from '../keyring/wrappers';
import type { UnlockWrapper } from '../local/db';
import { useKeys } from '../keys/keys';
import styles from './Screens.module.css';
import { WalletMark } from '../ui/WalletMark';
import { accountProblem } from './accountProblem';
import { useWallet } from './WalletProvider';

/**
 * The lock screen (DESIGN.md §9, §26.2): it replaces everything while the wallet is locked. Unlocking is the daily way in and needs no connection: a passkey
 * (Face ID, a fingerprint) or a device passcode. **With neither on this device, or after five wrong passcodes, the suite's key opens it**: the password, for an
 * instance that runs alone, or Sovereign's release, hosted, which needs the network and brings the root back so that a way to unlock can be made again.
 */
export function LockScreen() {
  const { db, keyring, openWithAccount, unlockWith } = useWallet();
  const keys = useKeys();
  const [methods, setMethods] = useState<UnlockWrapper[] | null>(null);
  const [passcode, setPasscode] = useState('');
  const [password, setPassword] = useState('');
  const [useAccount, setUseAccount] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void unlockMethods(db).then((found) => {
      setMethods(found);
      // With neither a passkey nor a passcode, the suite's key is the way.
      if (found.length === 0) setUseAccount(true);
    });
  }, [db]);

  const hasPasskey = methods?.some((m) => m.kind === 'passkey') ?? false;
  const hasPasscode = methods?.some((m) => m.kind === 'passcode') ?? false;

  async function run(attempt: () => Promise<Attempt>, wrong: string) {
    setError(null);
    setBusy(true);
    try {
      const result = await attempt();
      if (result === 'wrong') setError(wrong);
      if (result === 'removed') {
        setError(
          'That was the fifth wrong passcode, so it was removed from this device. Use your passkey or your password.',
        );
        setMethods(await unlockMethods(db));
        setUseAccount(true);
      }
      if (result === 'ok') setPasscode('');
    } catch {
      setError('That did not work. Try again, or use your password.');
    } finally {
      setBusy(false);
    }
  }

  async function withAccount(typed?: string) {
    setError(null);
    setBusy(true);
    try {
      const result = await openWithAccount(typed);
      if (!result.ok) {
        // `away`: the page is leaving, for Sovereign's release or the recovery kit.
        if (result.reason !== 'away') setError(accountProblem(result.reason));
        return;
      }
      setPassword('');
      // With a way to unlock on this device, the root is what it opens with, and it goes straight in. With none, the key being open is what the wallet acts on: it
      // brings the root itself and asks, in setup, for a way to unlock this device while it has it (`WalletProvider`).
      if ((methods ?? []).length === 0) result.material.raw.fill(0);
      else await unlockWith(result.material);
    } catch {
      setError(accountProblem('unreadable'));
    } finally {
      setBusy(false);
    }
  }

  const core = keys.kind === 'core';
  return (
    <main className={styles.page} aria-labelledby="lock-heading">
      <div className={`${styles.column} ${styles.narrow}`}>
        <div className={styles.stack}>
          <WalletMark label="Wallet" className="" />
          <h1 id="lock-heading" className={styles.heading}>
            Your wallet is locked
          </h1>
          <p className={styles.lead}>
            {methods && methods.length > 0
              ? 'Unlock it here, with no connection.'
              : 'Unlock it with your account to open it on this device.'}
          </p>
        </div>
        {error ? (
          <Alert variant="error" id="lock-error">
            {error}
          </Alert>
        ) : null}
        {methods === null ? null : (
          <>
            {hasPasskey ? (
              <div>
                <Button
                  size="lg"
                  loading={busy}
                  onClick={() =>
                    void run(() => unlockWithPasskey(db, keyring), 'The passkey did not unlock it.')
                  }
                >
                  Unlock with passkey
                </Button>
              </div>
            ) : null}
            {hasPasscode ? (
              <form
                className={styles.stack}
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(
                    () => unlockWithPasscode(db, keyring, passcode, deriveInWorker),
                    'That passcode is not right.',
                  );
                }}
              >
                <FormField label="Passcode">
                  {(field) => (
                    <Input
                      {...field}
                      type="password"
                      autoComplete="off"
                      value={passcode}
                      onChange={(event) => setPasscode(event.target.value)}
                    />
                  )}
                </FormField>
                <div>
                  <Button type="submit" loading={busy} disabled={passcode === ''}>
                    Unlock
                  </Button>
                </div>
              </form>
            ) : null}
            {useAccount ? (
              core ? (
                <div>
                  <Button loading={busy} onClick={() => void withAccount()}>
                    Unlock through Sovereign
                  </Button>
                </div>
              ) : (
                <form
                  className={styles.stack}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void withAccount(password);
                  }}
                >
                  <FormField
                    label="Your password"
                    hint="It is checked on this device and never sent. Unlocking this way needs a connection."
                  >
                    {(field) => (
                      <Input
                        {...field}
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                      />
                    )}
                  </FormField>
                  <div>
                    <Button type="submit" loading={busy} disabled={password === ''}>
                      Unlock with my password
                    </Button>
                  </div>
                </form>
              )
            ) : (
              <div>
                <Button variant="ghost" onClick={() => setUseAccount(true)}>
                  {core ? 'Unlock through Sovereign' : 'Use my password'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
